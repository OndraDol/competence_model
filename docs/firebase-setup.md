# Firebase Setup — Competence Model Dashboard

Tento dokument je průvodce pro **Claude agenta v Google Chrome**, který má nastavit
nový Firebase projekt pro Competence Model Dashboard. Uživatel ho předá Chrome
agentovi a ten projde kroky v Firebase Console.

Všechny kroky se dělají přímo ve webovém UI. Žádná CLI, žádný `firebase-tools`.

## Výstup, který potřebujeme zpět

1. `FIREBASE_DATABASE_URL` — např. `https://aures-competence-model-default-rtdb.europe-west1.firebasedatabase.app`
2. `FIREBASE_SECRET` — legacy database secret (pro Python sync skript)
3. Potvrzení, že je nahozený **Authentication Email/Password** + seznam HR konzultantských účtů, které jsou vytvořené

Tyto hodnoty pak uživatel uloží jako GitHub repo secrets:
`Settings → Secrets and variables → Actions → New repository secret`.

---

## Krok 1: Založit Firebase projekt

1. Otevři <https://console.firebase.google.com>
2. Klikni **„Add project"** (Přidat projekt)
3. **Název projektu:** `aures-competence-model`
   - Google ti nabídne ID jako `aures-competence-model-XXXXX` — nech jak je
4. **Google Analytics:** **DISABLE** (pro tento use-case není potřeba, zjednoduší setup)
5. Potvrď a počkej, dokud se projekt nezřídí (~30 s)

## Krok 2: Realtime Database

1. V levé navigaci: **Build → Realtime Database**
2. Klikni **„Create Database"**
3. **Region:** `europe-west1` (Belgie) — stejný jako Vacancies, nejbližší latency
4. **Rules:** vyber **„Start in locked mode"** — za chvíli to přepíšeme
5. Po vytvoření v záložce **Rules** klikni **Edit** a vlož JSON z `docs/security-rules.md`
   (viz sousední soubor v tomto repu). **Publish**.
6. V záložce **Data** zkopíruj URL z horní lišty, např.:
   ```
   https://aures-competence-model-default-rtdb.europe-west1.firebasedatabase.app
   ```
   → to je `FIREBASE_DATABASE_URL`

## Krok 3: Authentication

1. V levé navigaci: **Build → Authentication**
2. Klikni **„Get started"**
3. Záložka **Sign-in method** → **Email/Password** → **Enable** (první toggle, ne magic link)
   → **Save**
4. Záložka **Users** → **Add user** pro každého HR konzultanta:
   - Seznam účtů vezmi stejný jako v Vacancies projektu (stejní lidé to budou používat)
   - Pro každého: email + dočasné heslo (min. 6 znaků) — user si pak změní
5. Pozn.: V této fázi žádné custom claims (admin role) neřešíme — security rules rozlišují
   jen „přihlášený vs. nepřihlášený".

## Krok 4: Database Secret pro Python sync

Firebase modern SDK preferuje Service Account JSON, ale `ats_sync.py` je vzor z Vacancies
a používá **legacy database secret** přes URL query param `?auth=<secret>`. Je to jednodušší.

1. V horním rohu: ozubené kolečko ⚙ → **Project settings**
2. Záložka **Service accounts**
3. V postranním panelu: **Database secrets** → **Show**
4. Když tam žádný není: klikni **Add secret** (nebo je tam defaultní, který Firebase vygeneroval)
5. Zkopíruj hodnotu → to je `FIREBASE_SECRET`

> **Pozn.:** Firebase postupně deprecates legacy secrets. Když to Google jednou vypne,
> migrujeme sync na ADC se service-account JSON. Dokud to funguje, zůstáváme u vzoru z Vacancies.

## Krok 5: Web App registrace (pro frontend)

1. **Project settings** → záložka **General** → posuň dolů do **„Your apps"**
2. Klikni ikonu `</>` **Web**
3. **App nickname:** `competence-model-web`
4. **Firebase Hosting:** NECHAT ODŠKRTNUTÉ (hostujeme z GitHub)
5. **Register app** → ukáže se blok s config objektem:
   ```js
   const firebaseConfig = {
     apiKey: "AIza…",
     authDomain: "aures-competence-model.firebaseapp.com",
     databaseURL: "https://aures-competence-model-default-rtdb.europe-west1.firebasedatabase.app",
     projectId: "aures-competence-model",
     storageBucket: "aures-competence-model.appspot.com",
     messagingSenderId: "…",
     appId: "…"
   };
   ```
6. **Zkopíruj celý `firebaseConfig` objekt** — patří do `assets/js/core.js` ve frontendu.

## Krok 6: Authorized domains

1. **Authentication → Settings → Authorized domains**
2. Ověř, že tam je `localhost` (pro lokální vývoj)
3. Přidej doménu, ze které se bude dashboard hostit (pokud už víš — např. GitHub Pages
   `ondradol.github.io`). Když nevíš, nech být a doplní se později.

---

## Co poslat uživateli zpět

```
FIREBASE_DATABASE_URL: https://aures-competence-model-default-rtdb.europe-west1.firebasedatabase.app
FIREBASE_SECRET: <hodnota z Database secrets>

firebaseConfig (pro frontend):
{
  apiKey: "...",
  authDomain: "...",
  databaseURL: "...",
  projectId: "...",
  storageBucket: "...",
  messagingSenderId: "...",
  appId: "..."
}

Authentication: Email/Password enabled
Users vytvoření: <seznam emailů>
Security rules: aplikovány (z docs/security-rules.md)
```

Uživatel pak:
- Uloží `FIREBASE_DATABASE_URL` a `FIREBASE_SECRET` jako GitHub secrets
- Vloží `firebaseConfig` do `assets/js/core.js` do konstanty `FIREBASE_CONFIG`
