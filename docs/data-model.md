# Datový model — `data.enc.json`

Šifrovaný JSON blob obsahuje celý snapshot datasetu `competence_models` z Datacruitu.
Zapisuje ho `ats_sync.py` při každém běhu do `public/d-<slug>/data.enc.json` a frontend
ho při loginu dešifruje pomocí WebCrypto (`assets/js/crypto.js`).

## Struktura blobu

```json
{
  "v": 1,
  "algo": "AES-256-GCM-PBKDF2-SHA256",
  "iter": 250000,
  "salt": "<base64 32B>",
  "iv": "<base64 12B>",
  "ciphertext": "<base64>",
  "syncedAt": "2026-04-21T07:00:03Z",
  "datacruitFetchedAt": "2026-04-21T07:00:01Z",
  "recordCount": 818,
  "jsonRepairApplied": false
}
```

### Nezašifrovaná pole (meta)

Jsou viditelná každému, kdo si stáhne blob:

| Pole | Účel |
|---|---|
| `v` | Verze formátu blobu (aktuálně `1`) |
| `algo` | Identifikace šifrovacího schématu |
| `iter` | PBKDF2 iterací — musí odpovídat frontend konstantě |
| `salt` | Náhodný salt pro PBKDF2 (unique per sync) |
| `iv` | Náhodný IV pro AES-GCM (unique per sync) |
| `syncedAt` | Kdy byl sync dokončen (UI „Poslední sync" badge) |
| `datacruitFetchedAt` | Kdy se stáhl dataset z Datacruitu |
| `recordCount` | Počet záznamů (pro degradation guard příštího syncu) |
| `jsonRepairApplied` | Jestli `fetch_data()` musel opravit Datacruit odpověď |

Tato meta záměrně unencryped, protože:
- UI potřebuje „Poslední sync" zobrazit i před dešifrováním
- Další sync potřebuje `recordCount` ke kontrole degradace bez dešifrování

### Zašifrovaná část (`ciphertext`)

Po dešifrování:

```json
{
  "records": [
    {
      "result_id": 1,
      "interview_id": 5359982,
      "interview_uuid": "d6770adf-0c81-4744-ba38-6abfdd49e02c",
      "candidate_fullname": "Kotouček Tomáš",
      "manager_name": "Jan Chadt",
      "form_name": "Salesman",
      "catalog_position": "Salesman - Senior",
      "country": "Czech Republic",
      "branch_name": "Česká Republika",
      "client_branch_name": "Praha",
      "system_company_branch_id": 10956,
      "system_company_branch_name": "Česká Republika",
      "date_filled": "2025-06-07",
      "commentary": "...",
      "total_points": 58,
      "competences": [
        { "competence_id": 1, "competence_name": "komunikační dovednosti", "points": 8 }
      ]
    }
  ],
  "meta": {
    "syncedAt": "2026-04-21T07:00:03Z",
    "datacruitFetchedAt": "2026-04-21T07:00:01Z",
    "recordCount": 818,
    "jsonRepairApplied": false
  }
}
```

`records` je 1:1 kopie struktury z Datacruit API bez transformací.

## Šifrování (Python → JS round-trip)

### Python (`ats_sync.py`)

1. `salt = secrets.token_bytes(32)` — random 32 bajtů
2. `iv = secrets.token_bytes(12)` — random 12 bajtů (AES-GCM standard)
3. `key = PBKDF2HMAC(SHA256, 250_000 iter, salt).derive(password.encode())` → 32 bajtů
4. `ciphertext = AESGCM(key).encrypt(iv, json.dumps({records, meta}).encode(), aad=None)`
5. Výstup jako base64 trojice (`salt`, `iv`, `ciphertext`) v JSON blobu

### JavaScript (`assets/js/crypto.js`)

Zrcadlově používá WebCrypto SubtleCrypto API:

```js
const baseKey = await crypto.subtle.importKey("raw", encoder.encode(password),
    { name: "PBKDF2" }, false, ["deriveKey"]);
const aesKey = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 250000, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false, ["decrypt"]);
const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, aesKey, ciphertext);
```

AES-GCM má built-in autentikaci — špatné heslo nebo upravený ciphertext → throw.

## Integritní záruky

- **Tamper-evident:** AES-GCM tag = 128 bitů MAC nad ciphertextem. Jakákoli modifikace
  (včetně `ciphertext` i `iv`) způsobí selhání decryptu.
- **Unique IV per sync:** random 12B IV zaručuje, že dvě identické datasety po dvou
  syncích mají úplně jiný ciphertext. Rovněž chrání proti replay útokům.
- **Unique salt per sync:** PBKDF2 klíč se odvozuje pokaždé z jiného saltu, takže kompromitace
  jednoho klíče neovlivňuje ostatní syncy.

## Limitace

- **Data jsou veřejně stažitelná** (public repo + GH Pages). Obrana je pouze na úrovni
  šifrování — pokud unikne `DASHBOARD_PASSWORD`, úniknou i všechna data.
- **Šifrování neřeší per-user přístup.** Každý uživatel s heslem má přístup ke všem datům.
- **Kontrola přístupu neexistuje v čase:** jakmile stáhneš blob, můžeš ho uchovat
  lokálně a dešifrovat kdykoli později (dokud platí heslo).

Pro silnější model použij Firebase Auth nebo Auth0 + read-only API.
