# Competence Model Dashboard

Webový dashboard pro ukládání a vyhodnocování výsledků kompetenčního modelu z Datacruit API
a jejich crosscheck s kompetenčním modelem konzultantů. Data se ukládají do Firebase Realtime
Database, čelní strana je statický HTML/JS dashboard hostovaný přímo z repa.

## Stack

- **Frontend:** statické HTML + vanilla JS (`index.html`, `assets/`)
- **Backend sync:** Python skripty (Datacruit REST API → Firebase RTDB)
- **Databáze:** Firebase Realtime Database
- **Automatizace:** GitHub Actions (pravidelný sync, zálohy)
- **Testy:** Playwright (browser smoke), pytest (Python)

## Lokální spuštění

```bash
# Frontend
python -m http.server 4173
# otevři http://127.0.0.1:4173/index.html

# Python sync (vyžaduje .env s credentials, viz .env.example)
pip install -r requirements.txt
python ats_sync.py
```

## Struktura

```
.
├── index.html                 # hlavní dashboard
├── assets/
│   ├── styles/app.css
│   └── js/                    # core.js, dashboard.js, views.js, auth.js
├── ats_sync.py                # Datacruit → Firebase sync (main)
├── firebase_backup.py         # zálohy RTDB
├── scripts/                   # podpůrné skripty (cleanup, restore)
├── tests/
│   ├── browser/               # Playwright smoke testy
│   └── test_ats_sync.py       # pytest unit testy
├── .github/workflows/         # scheduled syncs, backups
└── docs/                      # dokumentace k handoffům
```

## Secrets (GitHub Actions / .env)

- `DATACRUIT_USERNAME`, `DATACRUIT_PASSWORD` — Datacruit API auth
- `FIREBASE_DATABASE_URL` — URL Firebase RTDB
- `FIREBASE_SECRET` — Firebase legacy token / service account

## Status

Projekt je ve fázi inicializace — skeleton podle vzoru `Vacancies` repo.
