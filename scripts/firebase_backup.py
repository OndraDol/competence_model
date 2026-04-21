"""Periodic Firebase RTDB backup to dated JSON artifact.

Exports /results, /hrScores, /hrScoreHistory, /meta to a single JSON file.
Runs weekly from GitHub Actions, uploads artifact for retention.
"""

from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

import requests

FIREBASE_URL = (os.environ.get("FIREBASE_DATABASE_URL") or "").strip().rstrip("/")
FIREBASE_SECRET = os.environ.get("FIREBASE_SECRET")
HTTP_TIMEOUT_SECONDS = 120

BACKUP_PATHS = ("results", "hrScores", "hrScoreHistory", "meta")


def firebase_params() -> dict:
    params = {}
    if FIREBASE_SECRET:
        params["auth"] = FIREBASE_SECRET
    return params


def fetch_path(path: str):
    url = f"{FIREBASE_URL}/{path}.json"
    response = requests.get(url, params=firebase_params(), timeout=HTTP_TIMEOUT_SECONDS)
    if response.status_code == 404:
        return None
    response.raise_for_status()
    return response.json()


def main() -> int:
    if not FIREBASE_URL:
        print("BACKUP_ERROR:", json.dumps({"error": "FIREBASE_DATABASE_URL missing"}))
        return 1

    started = datetime.now(timezone.utc)
    snapshot = {"backupStartedAt": started.isoformat(timespec="seconds").replace("+00:00", "Z")}

    for path in BACKUP_PATHS:
        try:
            snapshot[path] = fetch_path(path)
            size_kb = len(json.dumps(snapshot[path], ensure_ascii=False)) / 1024 if snapshot[path] else 0
            print(f"BACKUP_PATH: {path} ok ({size_kb:.1f} KB)")
        except Exception as exc:  # noqa: BLE001
            print("BACKUP_PATH_ERROR:", json.dumps({"path": path, "error": str(exc)}))
            return 1

    out_dir = Path(os.environ.get("BACKUP_OUTPUT_DIR") or ".backup-output")
    out_dir.mkdir(parents=True, exist_ok=True)
    filename = out_dir / f"firebase-backup-{started.strftime('%Y%m%dT%H%M%SZ')}.json"
    with open(filename, "w", encoding="utf-8") as fh:
        json.dump(snapshot, fh, ensure_ascii=False, indent=2)

    print("BACKUP_OK:", json.dumps({
        "file": str(filename),
        "sizeBytes": filename.stat().st_size,
    }))
    return 0


if __name__ == "__main__":
    sys.exit(main())
