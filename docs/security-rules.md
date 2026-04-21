# Firebase Realtime Database — Security Rules

Zkopíruj tento JSON do Firebase Console → Realtime Database → Rules → Edit → Publish.

## Rules

```json
{
  "rules": {
    "results": {
      ".read": "auth != null",
      ".write": false,
      ".indexOn": ["date_filled", "country", "form_name", "manager_name", "system_company_branch_name"]
    },
    "meta": {
      ".read": "auth != null",
      ".write": false
    },
    "syncSnapshots": {
      ".read": false,
      ".write": false
    },
    "hrScores": {
      ".read": "auth != null",
      "$resultId": {
        ".write": "auth != null && (!newData.exists() || newData.child('updatedBy').val() === auth.token.email)",
        ".validate": "newData.hasChildren(['perCompetence', 'updatedBy', 'updatedAt'])",
        "perCompetence": {
          "$competenceId": {
            ".validate": "newData.isNumber() && newData.val() >= 1 && newData.val() <= 10"
          }
        },
        "updatedBy": { ".validate": "newData.isString() && newData.val() === auth.token.email" },
        "updatedAt": { ".validate": "newData.isString()" },
        "totalPoints": { ".validate": "newData.isNumber() && newData.val() >= 0 && newData.val() <= 110" },
        "commentary": { ".validate": "newData.isString()" }
      }
    },
    "hrScoreHistory": {
      ".read": "auth != null",
      "$resultId": {
        "$entryId": {
          ".write": "auth != null && (!data.exists())",
          ".validate": "newData.hasChildren(['perCompetence', 'updatedBy', 'updatedAt'])"
        }
      }
    }
  }
}
```

## Co pravidla dělají

- **`results`, `meta`, `syncSnapshots`** — pouze pro čtení přihlášeným uživatelům. Zápis
  je vyhrazený pro Python sync skript, který autentikuje přes `?auth=<FIREBASE_SECRET>`
  (legacy secret obchází tato pravidla).
- **`hrScores/{resultId}`** — přihlášený uživatel může zapsat jen záznam, kde
  `updatedBy` odpovídá jeho vlastnímu emailu. Brání podvržení cizí identity.
  Validace: body 1–10 na kompetenci, povinná metadata.
- **`hrScoreHistory`** — append-only (nový `entryId` smí vzniknout, ale už existující
  záznam se nesmí přepsat ani smazat). Drží audit trail.

## Aplikace

1. Firebase Console → Realtime Database → záložka **Rules**
2. **Edit rules**
3. Smaž obsah, vlož celý JSON výše
4. **Publish**
5. Ověř, že vlevo nahoře svítí „Published" a nejsou warningy

## Edge cases

- Legacy secret `?auth=<FIREBASE_SECRET>` **obchází všechna pravidla** (má plná admin práva).
  Proto sync skript nemusí řešit `auth != null` pro `results/` — zapisuje admin.
- Když se v budoucnu přejde z legacy secretu na service account, bude se muset přidat
  custom claim `admin: true` a rule pro `.write` změnit na `auth.token.admin === true`.
- `hrScoreHistory` nemá pravidlo pro delete — takže jakmile se záznam napíše, zůstává
  navždy. Cleanup musí dělat admin přes secret.
