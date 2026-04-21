# Dashboard Password Setup

Dashboard používá **jednu sdílenou přístupovou frázi** (`DASHBOARD_PASSWORD`), se kterou
se v cloudu šifrují data a v prohlížeči dešifrují. Bez hesla je `data.enc.json` nečitelný.

## Vygenerovat heslo

Silné heslo (min. 20 znaků, doporučeno ~24):

```bash
# macOS / Linux
openssl rand -base64 24

# Windows PowerShell
[Convert]::ToBase64String((1..24 | ForEach-Object { Get-Random -Minimum 0 -Maximum 256 }))
```

Příklad výstupu: `Ke8hY3xQ+kJ9Z2M8rL7vN1pZ4Qw/uU6A`

## Uložit jako GitHub secret

1. Otevři <https://github.com/OndraDol/competence_model/settings/secrets/actions>
2. **New repository secret**
3. **Name:** `DASHBOARD_PASSWORD`
4. **Secret:** vlož vygenerovanou hodnotu
5. **Add secret**

GitHub Actions (`.github/workflows/datacruit_sync.yml`) ho použije při každém syncu
pro zašifrování `data.enc.json`.

## Sdílet s týmem

Přes bezpečný kanál:
- 1Password shared vault
- Bitwarden Collection
- Signal s disappearing messages
- **Nikdy:** Slack, e-mail, Teams bez end-to-end šifrování

Předej URL dashboardu + heslo. Uživatel si ho bookmarkne:

```
URL: https://ondradol.github.io/competence_model/d-<slug>/
Heslo: Ke8hY3xQ+kJ9Z2M8rL7vN1pZ4Qw/uU6A
```

## Rotace hesla

Rotovat doporučuji:
- Po odchodu někoho z týmu
- Minimálně 1× za rok
- Když existuje podezření na únik

Postup:
1. Vygeneruj nové heslo (viz výše)
2. Aktualizuj GitHub secret `DASHBOARD_PASSWORD`
3. Triggerni workflow **„Datacruit competence_models sync"** manuálně
   (Actions → vybrat workflow → **Run workflow**)
4. Po doběhnutí (~30 s) obsahuje `public/d-<slug>/data.enc.json` data šifrovaná novým heslem
5. Deploy workflow se spustí automaticky, Pages se obnoví za ~30 s
6. Rozešli nové heslo týmu přes bezpečný kanál
7. Staré URL bude nadále fungovat, ale staré heslo už ne

## Limitace

- **Shared secret model:** kdo vyzradí heslo, umožní přístup všem, kdo URL znají.
  Pro per-user audit/revokaci potřebuješ backend auth (Firebase, Auth0, …).
- **Session-only cache:** dekódovaná data se drží jen v paměti tabu, při zavření tabu
  jsou pryč. Žádný persistentní cache.
- **PBKDF2 iter = 250 000:** derivace klíče trvá v prohlížeči ~300 ms. Brute-force útok
  je nepraktický pro silná hesla, ale slabé heslo (< 8 znaků) by nevydrželo dlouho.
