# Datový model — Firebase Realtime Database

Schéma RTDB pro Competence Model Dashboard.

## Top-level struktura

```
/meta
/results/{result_id}
/hrScores/{result_id}
/hrScoreHistory/{result_id}/{autoId}
/syncSnapshots/{uploadId}
```

## `/meta`

Globální metadata. Zapisuje Python sync skript.

```json
{
  "lastSync": {
    "uploadId": "20260421T070003Z",
    "uploadedAt": "2026-04-21T07:00:03Z",
    "source": "datacruit:competence_models",
    "datacruitFetchedAt": "2026-04-21T07:00:01Z",
    "recordCount": 818,
    "jsonRepairApplied": false
  },
  "version": "1"
}
```

## `/results/{result_id}`

Jeden záznam = jedno kompetenční hodnocení z Datacruitu. Klíč = `result_id` (int z Datacruitu).
Read-only pro frontend, přepisuje sync skript při každém běhu.

```json
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
  "commentary": "Komentář: mzda OK...",
  "total_points": 58,
  "competences": [
    { "competence_id": 1, "competence_name": "komunikační dovednosti", "points": 8 },
    { "competence_id": 2, "competence_name": "orientace na zákazníka", "points": 8 }
  ]
}
```

Pole `competences` je manažerovo hodnocení (zdrojem je Datacruit).

## `/hrScores/{result_id}`

Paralelní hodnocení HR konzultanta k existujícímu kandidátovi. Klíč odpovídá `result_id`.
Zapisuje frontend přímo.

```json
{
  "perCompetence": { "1": 7, "2": 8, "3": 6, "4": 9, "5": 7, "6": 8, "7": 8 },
  "commentary": "Souhlasím s managerem, ale komunikaci bych dal níž.",
  "totalPoints": 53,
  "updatedBy": "jan.novak@aures.cz",
  "updatedAt": "2026-04-21T08:12:33.512Z"
}
```

- **Klíče `perCompetence`** jsou string verze `competence_id` (RTDB neumí numerické klíče).
- **`totalPoints`** je odvozené — klient ho vypočítá a zapíše jako součást zápisu.
- Záznam chybí = HR ještě neohodnotil.

## `/hrScoreHistory/{result_id}/{autoId}`

Append-only audit log. Každá úprava `hrScores/{result_id}` vytvoří nový `autoId`
(Firebase `push()` key) se snapshotem před změnou.

```json
{
  "perCompetence": { "1": 6, "2": 8, ... },
  "commentary": "...",
  "totalPoints": 52,
  "updatedBy": "jan.novak@aures.cz",
  "updatedAt": "2026-04-21T08:11:02.113Z"
}
```

Nezapisuje se pro první vytvoření (prázdný → nová hodnota) — jen pro přepisy existujícího
záznamu.

## `/syncSnapshots/{uploadId}`

Historické snapshoty celého datasetu pro rollback. Klíč = `uploadId` ve formátu
`YYYYMMDDTHHmmssZ`.

```json
{
  "results": { "1": { ... }, "2": { ... } },
  "meta": {
    "uploadedAt": "2026-04-21T07:00:03Z",
    "recordCount": 818
  }
}
```

Cleanup skript maže snapshoty starší než 14 dní (kromě posledního).

## Indexy

V `/results` doporučené `.indexOn` (v security-rules.md):
- `date_filled` — default sort, filtr období
- `country` — country switch
- `form_name` — filtr pozice
- `manager_name` — filtr manažera
- `system_company_branch_name` — filtr pobočky

## Velikostní odhad

- 818 záznamů × ~1,5 KB = ~1,2 MB `/results`
- HR scores: 818 × ~0,5 KB = ~400 KB při 100% pokrytí
- History: ~1 KB per zápis, při 10 úpravách per kandidát = ~8 MB
- Snapshoty: 1,2 MB per snapshot × 14 dní (denní cron) = ~17 MB

Celkový footprint při plném využití: ~30 MB, hluboko pod 10 GB free tier limit Spark planu.
