"""Delete /syncSnapshots/* older than N days (default 14).

Pattern from Vacancies/scripts/firebase_cleanup_old_reports.py. Guards:
- Never deletes the most recent snapshot (whatever its age).
- Dry-run mode (`--dry-run`) prints what would be deleted.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timedelta, timezone

import requests

FIREBASE_URL = (os.environ.get("FIREBASE_DATABASE_URL") or "").strip().rstrip("/")
FIREBASE_SECRET = os.environ.get("FIREBASE_SECRET")
HTTP_TIMEOUT_SECONDS = 60


def firebase_params() -> dict:
    params = {}
    if FIREBASE_SECRET:
        params["auth"] = FIREBASE_SECRET
    return params


def list_snapshots() -> list[str]:
    url = f"{FIREBASE_URL}/syncSnapshots.json"
    response = requests.get(url, params={**firebase_params(), "shallow": "true"}, timeout=HTTP_TIMEOUT_SECONDS)
    if response.status_code == 404:
        return []
    response.raise_for_status()
    data = response.json() or {}
    return list(data.keys())


def parse_upload_id(key: str) -> datetime | None:
    try:
        return datetime.strptime(key, "%Y%m%dT%H%M%SZ").replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def delete_snapshot(key: str) -> None:
    url = f"{FIREBASE_URL}/syncSnapshots/{key}.json"
    response = requests.delete(url, params=firebase_params(), timeout=HTTP_TIMEOUT_SECONDS)
    response.raise_for_status()


def main() -> int:
    parser = argparse.ArgumentParser(description="Clean up old /syncSnapshots from Firebase RTDB")
    parser.add_argument("--max-age-days", type=int, default=14)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    if not FIREBASE_URL:
        print("CLEANUP_ERROR:", json.dumps({"error": "FIREBASE_DATABASE_URL missing"}))
        return 1

    cutoff = datetime.now(timezone.utc) - timedelta(days=args.max_age_days)

    keys = list_snapshots()
    keys_with_dates = [(k, parse_upload_id(k)) for k in keys]
    keys_with_dates = [kd for kd in keys_with_dates if kd[1] is not None]
    keys_with_dates.sort(key=lambda kd: kd[1])

    # Protect the single most recent snapshot unconditionally.
    latest_key = keys_with_dates[-1][0] if keys_with_dates else None

    to_delete = [k for k, d in keys_with_dates if d < cutoff and k != latest_key]

    print("CLEANUP_PLAN:", json.dumps({
        "total": len(keys_with_dates),
        "cutoff": cutoff.isoformat(timespec="seconds").replace("+00:00", "Z"),
        "latestProtected": latest_key,
        "toDeleteCount": len(to_delete),
        "dryRun": args.dry_run,
    }))

    if args.dry_run:
        for k in to_delete:
            print(f"DRY_DELETE: syncSnapshots/{k}")
        return 0

    for k in to_delete:
        delete_snapshot(k)
        print(f"DELETED: syncSnapshots/{k}")

    print("CLEANUP_OK:", json.dumps({"deleted": len(to_delete)}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
