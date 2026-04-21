"""Datacruit competence_models -> encrypted JSON blob.

Fetches the competence_models dataset from Datacruit and writes it to
`public/d-<slug>/data.enc.json` in AES-256-GCM ciphertext keyed by PBKDF2(DASHBOARD_PASSWORD).
The static frontend on GH Pages decrypts the blob with the same password in the browser.

Design pattern adapted from Vacancies/ats_sync.py:
- fetch_data() incl. JSON repair
- SyncAbort exception + exit codes (0 success, 20 degraded, 1 hard fail)
- emit_sync_status() log tag for GitHub Actions summary
- get_retry_delay_minutes() schedule-based retry policy
"""

from __future__ import annotations

import argparse
import base64
import glob
import json
import os
import secrets
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from requests.auth import HTTPBasicAuth

# --- Configuration ---------------------------------------------------------

DATACRUIT_URL = "https://app.datacruit.com/public/export_json"
DATASET_NAME = "competence_models"

DC_USER = os.environ.get("DATACRUIT_USERNAME")
DC_PASS = os.environ.get("DATACRUIT_PASSWORD")
DASHBOARD_PASSWORD = os.environ.get("DASHBOARD_PASSWORD")

DASHBOARD_BLOB_GLOB = "public/d-*/data.enc.json"

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

# Encryption parameters — must match frontend assets/js/crypto.js constants.
PBKDF2_ITERATIONS = 250_000
PBKDF2_SALT_BYTES = 32
AES_GCM_IV_BYTES = 12
BLOB_VERSION = 1
BLOB_ALGO = "AES-256-GCM-PBKDF2-SHA256"


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


# --- Encryption ------------------------------------------------------------


def derive_key(password: str, salt: bytes) -> bytes:
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=PBKDF2_ITERATIONS,
    )
    return kdf.derive(password.encode("utf-8"))


def encrypt_payload(password: str, records: list[dict], meta: dict) -> dict:
    plaintext = json.dumps({"records": records, "meta": meta}, ensure_ascii=False).encode("utf-8")
    salt = secrets.token_bytes(PBKDF2_SALT_BYTES)
    iv = secrets.token_bytes(AES_GCM_IV_BYTES)
    key = derive_key(password, salt)
    aesgcm = AESGCM(key)
    ciphertext = aesgcm.encrypt(iv, plaintext, associated_data=None)

    return {
        "v": BLOB_VERSION,
        "algo": BLOB_ALGO,
        "iter": PBKDF2_ITERATIONS,
        "salt": base64.b64encode(salt).decode("ascii"),
        "iv": base64.b64encode(iv).decode("ascii"),
        "ciphertext": base64.b64encode(ciphertext).decode("ascii"),
        # Unencrypted metadata — safe to reveal, useful for UI "last sync" badge.
        "syncedAt": meta.get("syncedAt"),
        "datacruitFetchedAt": meta.get("datacruitFetchedAt"),
        "recordCount": meta.get("recordCount"),
        "jsonRepairApplied": meta.get("jsonRepairApplied", False),
    }


def decrypt_payload(password: str, blob: dict) -> dict:
    """Round-trip helper used by tests. Frontend does the same thing in WebCrypto."""
    salt = base64.b64decode(blob["salt"])
    iv = base64.b64decode(blob["iv"])
    ciphertext = base64.b64decode(blob["ciphertext"])
    key = derive_key(password, salt)
    aesgcm = AESGCM(key)
    plaintext = aesgcm.decrypt(iv, ciphertext, associated_data=None)
    return json.loads(plaintext.decode("utf-8"))


# --- Validation + file IO ------------------------------------------------


def validate_runtime_configuration() -> None:
    missing = []
    if not DC_USER:
        missing.append("DATACRUIT_USERNAME")
    if not DC_PASS:
        missing.append("DATACRUIT_PASSWORD")
    if not DASHBOARD_PASSWORD:
        missing.append("DASHBOARD_PASSWORD")
    if missing:
        raise SyncAbort(
            SYNC_STATUS_HARD_FAILURE,
            reasons=[f"Missing env variable: {name}" for name in missing],
            error=f"Missing required environment: {', '.join(missing)}",
        )


def find_blob_path() -> Path:
    matches = sorted(glob.glob(DASHBOARD_BLOB_GLOB))
    if not matches:
        raise SyncAbort(
            SYNC_STATUS_HARD_FAILURE,
            reasons=[f"No dashboard directory matches {DASHBOARD_BLOB_GLOB}"],
            error="Dashboard directory (public/d-<slug>/) not found",
        )
    if len(matches) > 1:
        raise SyncAbort(
            SYNC_STATUS_HARD_FAILURE,
            reasons=[f"Multiple dashboard directories match {DASHBOARD_BLOB_GLOB}: {matches}"],
            error="Expected exactly one public/d-<slug>/ directory",
        )
    return Path(matches[0])


def read_previous_meta(path: Path) -> dict | None:
    """Reads unencrypted meta from a previous blob; returns None if missing/corrupt."""
    if not path.exists():
        return None
    try:
        with open(path, "r", encoding="utf-8") as fh:
            existing = json.load(fh)
        return {
            "recordCount": existing.get("recordCount"),
            "syncedAt": existing.get("syncedAt"),
        }
    except (OSError, ValueError):
        return None


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
                f"record count dropped from {previous_count} to {count} "
                f"({drop_ratio:.0%} drop exceeds {MAX_DROP_RATIO:.0%} threshold)"
            )
    diagnostics = FETCH_DIAGNOSTICS.get(DATASET_NAME) or {}
    if diagnostics.get("jsonRepairApplied"):
        reasons.append("Datacruit JSON repair was required for competence_models dataset")
    return reasons


# --- Main sync flow --------------------------------------------------------


def build_meta(record_count: int, fetched_at: str, synced_at: str) -> dict:
    return {
        "syncedAt": synced_at,
        "datacruitFetchedAt": fetched_at,
        "recordCount": record_count,
        "jsonRepairApplied": bool(FETCH_DIAGNOSTICS.get(DATASET_NAME, {}).get("jsonRepairApplied")),
    }


def main() -> int:
    print("--- Start Datacruit competence_models -> encrypted blob ---")
    validate_runtime_configuration()

    blob_path = find_blob_path()
    prev = read_previous_meta(blob_path)
    previous_count = prev.get("recordCount") if prev else None
    print(
        "DASHBOARD_BLOB:",
        json.dumps({"path": str(blob_path), "previousRecordCount": previous_count}, ensure_ascii=False),
    )

    fetched_at = datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
    records = fetch_data(DATASET_NAME)
    print(
        "DATACRUIT_DATASET_SUMMARY:",
        json.dumps({"dataset": DATASET_NAME, "recordCount": len(records)}, ensure_ascii=False),
    )

    reasons = get_degradation_reasons(records, previous_count)
    if reasons:
        print("SUSPICIOUS_SYNC_ABORT:", json.dumps({"reasons": reasons}, ensure_ascii=False))
        raise SyncAbort(
            SYNC_STATUS_DEGRADED_UPSTREAM,
            reasons=reasons,
            exit_code=SYNC_EXIT_CODE_DEGRADED_UPSTREAM,
            error="; ".join(reasons),
        )

    synced_at = datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
    meta = build_meta(len(records), fetched_at, synced_at)
    blob = encrypt_payload(DASHBOARD_PASSWORD, records, meta)

    blob_path.parent.mkdir(parents=True, exist_ok=True)
    with open(blob_path, "w", encoding="utf-8") as fh:
        json.dump(blob, fh, ensure_ascii=False, indent=2)

    emit_sync_status(
        SYNC_STATUS_SUCCESS,
        exitCode=SYNC_EXIT_CODE_SUCCESS,
        recordCount=len(records),
        previousCount=previous_count,
        blobPath=str(blob_path),
        syncedAt=synced_at,
    )
    return SYNC_EXIT_CODE_SUCCESS


# --- CLI entry -------------------------------------------------------------


def parse_cli_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Datacruit competence_models -> encrypted blob")
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
