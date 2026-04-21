"""Datacruit competence_models -> Firebase RTDB sync.

Pattern převzatý z Vacancies/ats_sync.py (fetch_data, JSON repair, SYNC_STATUS,
Firebase helpers, auth probe, retry delays, SyncAbort).
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlparse

import requests
from requests.auth import HTTPBasicAuth

# --- Configuration ---------------------------------------------------------

DATACRUIT_URL = "https://app.datacruit.com/public/export_json"
DATASET_NAME = "competence_models"

DC_USER = os.environ.get("DATACRUIT_USERNAME")
DC_PASS = os.environ.get("DATACRUIT_PASSWORD")
FIREBASE_URL = (os.environ.get("FIREBASE_DATABASE_URL") or "").strip().rstrip("/")
FIREBASE_SECRET = os.environ.get("FIREBASE_SECRET")

HTTP_TIMEOUT_SECONDS = 60

SYNC_EXIT_CODE_SUCCESS = 0
SYNC_EXIT_CODE_HARD_FAILURE = 1
SYNC_EXIT_CODE_DEGRADED_UPSTREAM = 20

SYNC_STATUS_SUCCESS = "success"
SYNC_STATUS_DEGRADED_UPSTREAM = "degraded_upstream"
SYNC_STATUS_HARD_FAILURE = "hard_failure"

SYNC_RETRY_DELAYS_MINUTES = (0, 30, 60)

# Guards — minimum acceptable dataset health
MIN_RECORD_COUNT = 100
MAX_DROP_RATIO = 0.5  # abort if new count < 50% of previous


FETCH_DIAGNOSTICS: dict[str, dict[str, Any]] = {}


# --- SyncAbort exception ---------------------------------------------------


class SyncAbort(Exception):
    def __init__(
        self,
        status: str,
        *,
        reasons: list[str] | None = None,
        exit_code: int = SYNC_EXIT_CODE_HARD_FAILURE,
        error: str | None = None,
    ) -> None:
        super().__init__(error or status)
        self.status = status
        self.reasons = reasons or []
        self.exit_code = exit_code
        self.error = error


# --- Logging helpers -------------------------------------------------------


def _compact_log_text(text: str, limit: int = 400) -> str:
    if not text:
        return ""
    text = text.replace("\n", " ").replace("\r", " ").strip()
    if len(text) > limit:
        return text[:limit] + f"…[{len(text) - limit} more]"
    return text


def emit_sync_status(status: str, **details: Any) -> None:
    payload: dict[str, Any] = {"status": status}
    payload.update({k: v for k, v in details.items() if v is not None})
    print("SYNC_STATUS:", json.dumps(payload, ensure_ascii=False))


def get_retry_delay_minutes(event_name: str | None) -> tuple[int, ...]:
    """For scheduled/manual triggers use retry schedule, otherwise single attempt."""
    if str(event_name or "").strip() in ("schedule", "workflow_dispatch"):
        return SYNC_RETRY_DELAYS_MINUTES
    return (0,)


# --- Datacruit fetch -------------------------------------------------------


def _ensure_list_payload(data: Any) -> list:
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        for key in ("data", "items", "results"):
            value = data.get(key)
            if isinstance(value, list):
                return value
    raise ValueError("Datacruit payload is not a list")


def fetch_data(dataset: str) -> list[dict]:
    """Fetch a Datacruit public export dataset. Handles JSON repair like Vacancies."""
    FETCH_DIAGNOSTICS[dataset] = {"jsonRepairApplied": False}
    response = requests.get(
        DATACRUIT_URL,
        params={"dataset": dataset},
        auth=HTTPBasicAuth(DC_USER, DC_PASS),
        timeout=HTTP_TIMEOUT_SECONDS,
        allow_redirects=True,
    )
    if not response.ok:
        print(
            "DATACRUIT_HTTP_ERROR:",
            json.dumps(
                {
                    "dataset": dataset,
                    "status": response.status_code,
                    "reason": response.reason,
                    "url": response.url,
                    "contentType": response.headers.get("Content-Type", ""),
                    "bodySnippet": _compact_log_text(response.text),
                },
                ensure_ascii=False,
            ),
        )
    response.raise_for_status()
    try:
        return _ensure_list_payload(response.json())
    except ValueError:
        original_text = response.text or ""
        text = original_text.strip()
        if not text:
            return []

        used_trailing_trim = False
        last_obj_end = max(text.rfind("}"), text.rfind("]"))
        if last_obj_end != -1:
            text = text[: last_obj_end + 1]
            used_trailing_trim = True

        appended_closing_bracket = False
        if text.startswith("[") and not text.endswith("]"):
            text = f"{text}]"
            appended_closing_bracket = True

        FETCH_DIAGNOSTICS[dataset] = {
            "jsonRepairApplied": True,
            "usedTrailingTrim": used_trailing_trim,
            "appendedClosingBracket": appended_closing_bracket,
            "originalLength": len(original_text),
            "repairedLength": len(text),
        }
        print(
            "DATACRUIT_JSON_REPAIR:",
            json.dumps({"dataset": dataset, **FETCH_DIAGNOSTICS[dataset]}, ensure_ascii=False),
        )
        return _ensure_list_payload(json.loads(text))


# --- Firebase helpers ------------------------------------------------------


def firebase_params(extra: dict | None = None) -> dict:
    params: dict[str, Any] = {}
    if FIREBASE_SECRET:
        params["auth"] = FIREBASE_SECRET
    if extra:
        params.update(extra)
    return params


def firebase_put(path: str, payload: Any, *, params_extra: dict | None = None) -> requests.Response:
    url = f"{FIREBASE_URL}/{path.lstrip('/')}.json"
    response = requests.put(
        url,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={"Content-Type": "application/json; charset=utf-8"},
        params=firebase_params(params_extra),
        timeout=HTTP_TIMEOUT_SECONDS,
    )
    if not response.ok:
        print(
            "FIREBASE_HTTP_ERROR:",
            json.dumps(
                {
                    "method": "PUT",
                    "path": path,
                    "status": response.status_code,
                    "reason": response.reason,
                    "bodySnippet": _compact_log_text(response.text),
                },
                ensure_ascii=False,
            ),
        )
    response.raise_for_status()
    return response


def firebase_patch(path: str, payload: dict, *, params_extra: dict | None = None) -> requests.Response:
    url = f"{FIREBASE_URL}/{path.lstrip('/')}.json"
    response = requests.patch(
        url,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={"Content-Type": "application/json; charset=utf-8"},
        params=firebase_params(params_extra),
        timeout=HTTP_TIMEOUT_SECONDS,
    )
    if not response.ok:
        print(
            "FIREBASE_HTTP_ERROR:",
            json.dumps(
                {
                    "method": "PATCH",
                    "path": path,
                    "status": response.status_code,
                    "reason": response.reason,
                    "bodySnippet": _compact_log_text(response.text),
                },
                ensure_ascii=False,
            ),
        )
    response.raise_for_status()
    return response


def firebase_get(path: str) -> Any:
    url = f"{FIREBASE_URL}/{path.lstrip('/')}.json"
    response = requests.get(url, params=firebase_params(), timeout=HTTP_TIMEOUT_SECONDS)
    if response.status_code == 404:
        return None
    response.raise_for_status()
    return response.json()


def verify_firebase_write_access() -> None:
    """Preflight PUT to a sentinel path. Fails fast if secret is missing/invalid."""
    url = f"{FIREBASE_URL}/__sync_auth_probe__.json"
    response = requests.put(
        url,
        data="null",
        headers={"Content-Type": "application/json"},
        params=firebase_params({"print": "silent"}),
        timeout=HTTP_TIMEOUT_SECONDS,
    )
    if not response.ok:
        print(
            "FIREBASE_AUTH_PRECHECK_ERROR:",
            json.dumps(
                {
                    "status": response.status_code,
                    "reason": response.reason,
                    "hasFirebaseSecret": bool(FIREBASE_SECRET),
                    "bodySnippet": _compact_log_text(response.text),
                },
                ensure_ascii=False,
            ),
        )
    response.raise_for_status()


def warn_if_suspicious_firebase_url() -> None:
    if not FIREBASE_URL:
        return
    parsed = urlparse(FIREBASE_URL)
    if FIREBASE_URL.endswith(".json") or "firebaseio" not in parsed.netloc and "firebasedatabase" not in parsed.netloc:
        print(
            "FIREBASE_URL_WARNING:",
            json.dumps({"url": FIREBASE_URL, "warning": "URL does not look like a Firebase RTDB root"}, ensure_ascii=False),
        )


# --- Validation ------------------------------------------------------------


def validate_runtime_configuration() -> None:
    missing = []
    if not DC_USER:
        missing.append("DATACRUIT_USERNAME")
    if not DC_PASS:
        missing.append("DATACRUIT_PASSWORD")
    if not FIREBASE_URL:
        missing.append("FIREBASE_DATABASE_URL")
    if missing:
        raise SyncAbort(
            SYNC_STATUS_HARD_FAILURE,
            reasons=[f"Missing env variable: {name}" for name in missing],
            error=f"Missing required environment: {', '.join(missing)}",
        )
    print(
        "FIREBASE_AUTH_MODE:",
        json.dumps(
            {
                "mode": "secret" if FIREBASE_SECRET else "unauthenticated",
                "host": urlparse(FIREBASE_URL).netloc,
            },
            ensure_ascii=False,
        ),
    )


def get_degradation_reasons(records: list[dict], previous_count: int | None) -> list[str]:
    reasons: list[str] = []
    count = len(records)
    if count == 0:
        reasons.append("Datacruit competence_models dataset is empty")
        return reasons
    if count < MIN_RECORD_COUNT:
        reasons.append(f"record count {count} below minimum {MIN_RECORD_COUNT}")
    if previous_count and previous_count > 0:
        drop_ratio = 1 - (count / previous_count)
        if drop_ratio > MAX_DROP_RATIO:
            reasons.append(
                f"record count dropped from {previous_count} to {count} ({drop_ratio:.0%} drop exceeds {MAX_DROP_RATIO:.0%} threshold)"
            )
    diagnostics = FETCH_DIAGNOSTICS.get(DATASET_NAME) or {}
    if diagnostics.get("jsonRepairApplied"):
        reasons.append("Datacruit JSON repair was required for competence_models dataset")
    return reasons


# --- Main sync flow --------------------------------------------------------


def normalize_result(record: dict) -> tuple[str, dict]:
    """Return (firebase_key, sanitized_record). Firebase keys cannot contain . $ # [ ] /."""
    rid = record.get("result_id")
    if rid is None:
        raise SyncAbort(
            SYNC_STATUS_HARD_FAILURE,
            reasons=["record without result_id"],
            error="Encountered Datacruit record without result_id",
        )
    firebase_key = str(rid)
    return firebase_key, record


def upload_results(records: list[dict], upload_id: str) -> dict:
    """Upload all records to /results and a snapshot to /syncSnapshots/{uploadId}."""
    payload = {}
    for record in records:
        key, normalized = normalize_result(record)
        payload[key] = normalized

    # PUT /results (overwrite) — HR scores live at /hrScores so they are not touched.
    firebase_put("results", payload)

    # Snapshot the full set (includes meta for rollback).
    snapshot_meta = {
        "uploadedAt": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "recordCount": len(records),
    }
    firebase_put(f"syncSnapshots/{upload_id}", {"results": payload, "meta": snapshot_meta})

    return snapshot_meta


def publish_meta(upload_id: str, record_count: int, fetched_at: str) -> None:
    meta_payload = {
        "lastSync": {
            "uploadId": upload_id,
            "uploadedAt": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
            "source": f"datacruit:{DATASET_NAME}",
            "datacruitFetchedAt": fetched_at,
            "recordCount": record_count,
            "jsonRepairApplied": bool(FETCH_DIAGNOSTICS.get(DATASET_NAME, {}).get("jsonRepairApplied")),
        },
        "version": "1",
    }
    firebase_patch("meta", meta_payload)


def get_previous_record_count() -> int | None:
    meta = firebase_get("meta/lastSync")
    if isinstance(meta, dict):
        count = meta.get("recordCount")
        if isinstance(count, int):
            return count
    return None


def main() -> int:
    print("--- Start Datacruit competence_models -> Firebase Sync ---")
    validate_runtime_configuration()
    warn_if_suspicious_firebase_url()
    verify_firebase_write_access()

    fetched_at = datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
    records = fetch_data(DATASET_NAME)
    print(
        "DATACRUIT_DATASET_SUMMARY:",
        json.dumps({"dataset": DATASET_NAME, "recordCount": len(records)}, ensure_ascii=False),
    )

    previous_count = get_previous_record_count()
    reasons = get_degradation_reasons(records, previous_count)
    if reasons:
        print("SUSPICIOUS_SYNC_ABORT:", json.dumps({"reasons": reasons}, ensure_ascii=False))
        raise SyncAbort(
            SYNC_STATUS_DEGRADED_UPSTREAM,
            reasons=reasons,
            exit_code=SYNC_EXIT_CODE_DEGRADED_UPSTREAM,
            error="; ".join(reasons),
        )

    upload_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    snapshot_meta = upload_results(records, upload_id)
    publish_meta(upload_id, len(records), fetched_at)

    emit_sync_status(
        SYNC_STATUS_SUCCESS,
        exitCode=SYNC_EXIT_CODE_SUCCESS,
        recordCount=len(records),
        previousCount=previous_count,
        uploadId=upload_id,
        snapshotUploadedAt=snapshot_meta["uploadedAt"],
    )
    return SYNC_EXIT_CODE_SUCCESS


# --- CLI entry -------------------------------------------------------------


def parse_cli_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Datacruit competence_models -> Firebase sync")
    return parser.parse_args(argv)


def cli_main(argv: list[str] | None = None) -> int:
    parse_cli_args(argv)
    try:
        return main()
    except SyncAbort as exc:
        emit_sync_status(
            exc.status,
            exitCode=exc.exit_code,
            reasons=exc.reasons or None,
            error=exc.error,
        )
        return exc.exit_code
    except Exception as exc:  # noqa: BLE001
        emit_sync_status(
            SYNC_STATUS_HARD_FAILURE,
            exitCode=SYNC_EXIT_CODE_HARD_FAILURE,
            error=f"{type(exc).__name__}: {exc}",
        )
        return SYNC_EXIT_CODE_HARD_FAILURE


if __name__ == "__main__":
    sys.exit(cli_main(sys.argv[1:]))
