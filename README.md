# Competence Model Dashboard

Webový read-only dashboard pro kompetenční modely z Datacruit API. Zobrazuje výsledky
hodnocení kandidátů (manažerovo skóre) s bohatou sekcí statistik. Data jsou denně
syncovaná, zašifrovaná AES-256-GCM a hostovaná staticky na GitHub Pages. Přístup
chrání sdílené heslo — frontend dešifruje blob v prohlížeči přes WebCrypto.

Design a stack inspirovaný [AURES Vacancies](https://github.com/OndraDol/vacancies).

## Klíčové vlastnosti

- Kandidátský list seřazený od nejnovějšího data, s rozbalovacím detailem
- Přepínač zemí CZ / SK / PL / **All** (v All módu lze filtrovat podle země)
- Filtry: pozice (`form_name`), katalog, pobočka, manažer
- Globální hledání (kandidát / manažer / pobočka / ...)
- Sekce statistik: 6 KPI + 11 vizualizací (TOP/BOTTOM kandidáti, průměry per pozice /
  pobočka / manažer / klient, distribuce bodů per kompetence, trend v čase, srovnání zemí,
  histogram total_points, quartily per pozice)
- Automatický denní sync z Datacruit API v 07:00 UTC (GitHub Actions)
- **Password gate + AES-256-GCM šifrování** — žádný backend, žádná Firebase

## Stack

| Vrstva | Technologie |
|---|---|
| Frontend | Static HTML + vanilla JS, Tailwind CDN, Chart.js 4.4, Lucide icons, Inter font |
| Šifrování | AES-256-GCM + PBKDF2 SHA-256 (250 000 iter). Python `cryptography`, browser WebCrypto |
| Sync | Python 3.10 + `requests`, pattern z Vacancies `ats_sync.py` |
| Deploy | GitHub Actions (`datacruit_sync` denně, `deploy_pages` při změně `public/**`) |
| Testy | unittest (Python), Playwright (browser) |

## Struktura repa

```
.
├── public/                               # vše, co se publikuje na GH Pages
│   ├── 404.html                          # minimalistický Not Found (žádný hint k projektu)
│   ├── robots.txt                        # Disallow all
│   └── d-87a28b2d/                       # obskurní slug pro dashboard
│       ├── index.html                    # dashboard shell s noindex meta
│       ├── data.enc.json                 # šifrovaný blob (commituje workflow)
│       └── assets/
│           ├── favicon.svg
│           ├── styles/app.css
│           └── js/{crypto,core,dashboard,stats}.js
├── ats_sync.py                           # Datacruit → šifrovaný blob
├── requirements.txt                      # requests + cryptography
├── requirements-dev.txt                  # + pytest
├── tests/
│   ├── test_ats_sync.py                  # 14 unit testů (fetch, guards, encrypt round-trip)
│   └── browser/smoke.spec.js             # Playwright smoke
├── .github/workflows/
│   ├── datacruit_sync.yml                # 07:00 UTC denně + commit blobu
│   └── deploy_pages.yml                  # deploy public/
└── docs/
    ├── data-model.md                     # schéma data.enc.json
    └── password-setup.md                 # generování + rotace hesla
```

## Setup — první spuštění

### 1) Vygenerovat a uložit `DASHBOARD_PASSWORD`

Projdi `docs/password-setup.md`:

```bash
openssl rand -base64 24
```

Ulož hodnotu jako GitHub secret:
- Název: `DASHBOARD_PASSWORD`
- Umístění: *Settings → Secrets and variables → Actions*

### 2) Uložit Datacruit kredenciály

- `DATACRUIT_USERNAME`
- `DATACRUIT_PASSWORD`

(Totéž jako v Vacancies projektu — stejné API.)

### 3) První sync

Actions → **„Datacruit competence_models sync"** → **Run workflow**. Po úspěchu workflow:
- Zašifruje dataset a zapíše `public/d-87a28b2d/data.enc.json`
- Commitne changes a pushne zpět na `main`
- Trigeruje `deploy_pages` workflow

### 4) Aktivovat GH Pages (pokud ještě nebylo)

- *Settings → Pages → Source: GitHub Actions*
- Po doběhnutí deploy workflow bude dashboard dostupný na:
  **`https://ondradol.github.io/competence_model/d-87a28b2d/`**

### 5) Sdílet s týmem

- Přes bezpečný kanál (1Password / Bitwarden / Signal) rozešli URL dashboardu + heslo
- Root URL (`https://ondradol.github.io/competence_model/`) vrací 404 — neodhaluje existenci dashboardu
- Dashboard má v HTML `noindex, nofollow, noarchive, nosnippet` + `referrer: no-referrer`
- `robots.txt` blokuje všechny crawlery

## Lokální vývoj

```bash
pip install -r requirements-dev.txt

# Unit testy
python -m unittest tests.test_ats_sync -v

# Sync proti Datacruitu (vyžaduje všechny env proměnné)
export DATACRUIT_USERNAME=... DATACRUIT_PASSWORD=... DASHBOARD_PASSWORD=...
python ats_sync.py

# Náhled dashboardu
python -m http.server 4173
# http://127.0.0.1:4173/public/d-87a28b2d/
```

## Bezpečnostní model — limitace

Tento dashboard je **šifrovaný static soubor + sdílené heslo**, nikoliv plnohodnotný
backend s identitami. Důsledky:

- **Kdo zná heslo, vidí všechno.** Per-user permisse nejsou.
- **Únik hesla = únik dat.** Řešení: rotace (viz `docs/password-setup.md`).
- **Nelze zjistit, kdo se přihlásil.** Žádný audit log.
- **Data jsou veřejně stažitelná** (public repo + Pages), ale dešifrovatelná pouze s heslem.

Pro silnější model (per-user auth, audit, revokace) je nutné přejít na Firebase Auth,
Auth0 nebo podobnou identity vrstvu + read-only API.

## Licence

Interní nástroj AURES Holding.
