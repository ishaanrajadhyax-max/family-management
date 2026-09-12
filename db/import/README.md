# Historical import — prepared, not executed

Everything in this folder is ready to run against the `family_manager`
database but **has not been run yet**. Nothing here has touched the live
database. See `../import-strategy.md` for the full design/data-quality
writeup this was built from.

## What's here

| File | Does what |
|---|---|
| `staging_blood_readings.csv` | The Excel file's data, extracted and cleaned: 425 rows, dates converted to ISO (`YYYY-MM-DD`), verified against the source `.xlsx` byte-for-byte on every field. |
| `01_staging_table.sql` | Creates a throwaway `staging_blood_readings` table to load the CSV into. |
| `02_load_staging.sql` | `\copy`'s the CSV into that staging table. |
| `03_insert_dad.sql` | Creates the one `family_members` row (Dad only — no Mom/Ishaan, per this task's scope). Idempotent. |
| `04_load_blood_sugar.sql` | Transforms + loads `blood_sugar_readings`. Excludes the 6-Aug-2026 `1575` row **by identity**, with a pre-flight check that fails loudly if any *other* row also turns out to be unparseable. |
| `05_load_blood_pressure.sql` | Transforms + loads `blood_pressure_readings`. No exclusions needed (see the file's own comment). |
| `06_verify.sql` | Post-load sanity checks with expected results noted inline. |

## Run order

```
01_staging_table.sql
02_load_staging.sql   (run psql from this directory, or fix the CSV path inside it)
03_insert_dad.sql
04_load_blood_sugar.sql
05_load_blood_pressure.sql
06_verify.sql
```

Example, once credentials are available:

```
psql -h <host> -p 5432 -U <username> -d family_manager -f 01_staging_table.sql
psql -h <host> -p 5432 -U <username> -d family_manager -f 02_load_staging.sql
psql -h <host> -p 5432 -U <username> -d family_manager -f 03_insert_dad.sql
psql -h <host> -p 5432 -U <username> -d family_manager -f 04_load_blood_sugar.sql
psql -h <host> -p 5432 -U <username> -d family_manager -f 05_load_blood_pressure.sql
psql -h <host> -p 5432 -U <username> -d family_manager -f 06_verify.sql
```

`\copy` in step 2 resolves its file path relative to wherever `psql` was
launched from, not the `.sql` file's location — run these from inside
`db/import/`, or edit the path in `02_load_staging.sql`.

## Before running for real

1. Confirm DB connection details (see the chat response this was prepared
   in for exactly what's needed).
2. Review `04_load_blood_sugar.sql` and `05_load_blood_pressure.sql`
   yourself — especially the pre-flight checks and the explicit 1575
   exclusion — since this writes ~693 rows of real health data.
3. The 6-Aug-2026 `1575` row stays out until the real time is confirmed
   from the original notebook. When it is, add one more `INSERT` for that
   single row rather than re-running the whole batch.
