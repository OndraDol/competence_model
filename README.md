# Competence Model Dashboard

Webový dashboard pro kompetenční modely z Datacruit API. Zobrazuje výsledky hodnocení
kandidátů (manažerovo skóre) a umožňuje HR konzultantovi vyplnit paralelní hodnocení.
Dashboard počítá rozdíly, filtruje, a poskytuje sadu HR analytik.

Inspirováno architekturou a vizuálem [AURES Vacancies](https://github.com/OndraDol/vacancies)
— stejný design system, stejní uživatelé.

## Klíčové vlastnosti

- Kandidátský list s inline editací HR skóre 1–10 pro každou kompetenci
- Přepínač zemí CZ / SK / PL / **All**; v režimu All lze filtrovat podle země
- Filtry: pozice (`form_name`), katalog, pobočka, manažer, stav HR hodnocení
- Globální hledání podle jména kandidáta, manažera, pobočky
- Vizualizace rozdílu manažer ↔ HR (barevné badge, graf průměrné odchylky per kompetence)
- Sekce statistik: 6 KPI + 11 grafů/tabulek (TOP/BOTTOM kandidáti, průměry per pozice/pobočka/manažer/klient, distribuce bodů per kompetence, trend v čase, srovnání zemí, contested kandidáti)
- Firebase Auth (email/password) — identita je logována u každého HR zápisu
- Automatický denní sync z Datacruit API v 07:00 UTC (GitHub Actions)
- Historie zálohování + cleanup starých snapshotů

## Stack

| Vrstva | Technologie |
|---|---|
| Frontend | Static HTML + vanilla JS, Tailwind CDN, Chart.js 4.4, Lucide icons, Inter font |
| Auth + DB | Firebase Auth (email/password) + Firebase Realtime Database |
| Sync | Python 3.10 + `requests`, vzor z Vacancies `ats_sync.py` |
| Automatizace | GitHub Actions (`datacruit_sync`, `firebase_backup`, `firebase_cleanup`) |
| Testy | pytest/unittest (Python), Playwright (browser) |

## Struktura repa

```
.
├── index.html                        # main dashboard shell
├── assets/
│   ├── styles/app.css                # design system
│   └── js/
│       ├── core.js                   # state, Firebase config, country switch
│       ├── auth.js                   # Firebase Auth handlers
│       ├── dashboard.js              # candidate list + HR scoring UI
│       └── stats.js                  # statistics views (KPIs + 11 charts)
├── ats_sync.py                       # Datacruit → Firebase sync
├── scripts/
│   ├── firebase_backup.py            # weekly RTDB export
│   └── firebase_cleanup_old_snapshots.py
├── .github/workflows/
│   ├── datacruit_sync.yml            # 07:00 UTC denně
│   ├── firebase_backup.yml           # týdně
│   └── firebase_cleanup.yml          # týdně
├── tests/
│   ├── test_ats_sync.py              # unittest
│   └── browser/smoke.spec.js         # Playwright
├── docs/
│   ├── firebase-setup.md             # guide pro Chrome Claude agenta
│   ├── security-rules.md             # RTDB rules
│   └── data-model.md                 # schéma RTDB
├── requirements.txt                  # requests
├── requirements-dev.txt              # + pytest
└── package.json                      # Playwright devDependency
```

## Setup — první spuštění

### 1) Založit Firebase projekt

Otevři `docs/firebase-setup.md` a projdi kroky (určeno i jako instrukce pro
samostatného Claude agenta v Google Chrome). Výstup:

- `FIREBASE_DATABASE_URL`
- `FIREBASE_SECRET` (legacy database secret)
- `firebaseConfig` pro frontend

### 2) Uložit GitHub secrets

`Settings → Secrets and variables → Actions → New repository secret`:

- `DATACRUIT_USERNAME`
- `DATACRUIT_PASSWORD`
- `FIREBASE_DATABASE_URL`
- `FIREBASE_SECRET`

### 3) Vložit `firebaseConfig` do frontendu

V `assets/js/core.js` nahraď konstantu `FIREBASE_CONFIG` hodnotami z Firebase console
(Step 5 v `docs/firebase-setup.md`).

### 4) První sync

V záložce **Actions** spusť workflow `Datacruit competence_models to Firebase Sync`
manuálně. Po doběhnutí by v **Summary** měl být `SYNC_STATUS: success` s `recordCount ≈ 800+`.

### 5) Lokální vývoj

```bash
# Frontend
python -m http.server 4173
# http://127.0.0.1:4173/index.html

# Python sync lokálně (po exportu secretů do .env)
pip install -r requirements-dev.txt
python ats_sync.py

# Testy
python -m unittest tests.test_ats_sync -v
npx playwright test
```

## Uživatelská role

- Všichni přihlášení uživatelé mají stejná práva — mohou číst data a psát HR hodnocení.
- U každého HR zápisu se loguje `updatedBy` (email) a `updatedAt`. Historie změn se
  drží v `/hrScoreHistory`.
- Rozlišení rolí (manažer vs. HR konzultant) v této verzi není — přidá se až bude potřeba.

## Licence

Interní nástroj AURES Holding.
