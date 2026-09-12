# Historical Data Import Strategy (Design Only)

Status: **not implemented**. No backend, no database connection, no import
script exists yet, and nothing from the Excel file has been imported. This
document plans how the historical readings will be loaded into PostgreSQL
once the schema in [schema.sql](schema.sql) is finalized and a backend
exists.

This revision is based on an actual inspection of
`data/Father_Health_Readings_19Jun_to_11Sep_2026 (1).xlsx` (not the earlier
pasted snippet) — 426 rows across two sheets, "Readings" and "Legend &
Notes".

**Final decisions locked in for this revision:** timezone is Asia/Kolkata
(§B), `reading_context` is captured for blood pressure as well as blood
sugar (§B, §C), the `1575` row stays excluded until confirmed (§E,
unchanged), `source` and `recorded_at` design stay as previously decided.
See `schema.sql`'s Revision 3 notes for the schema side of these.

## A. Source format

One row per (date, time-of-day slot), 5 slots/day, 85 days
(19-Jun-2026 → 11-Sep-2026, **year confirmed as 2026**):

| Column | Meaning |
|---|---|
| Date | `D-Mon-YYYY`, e.g. `19-Jun-2026` |
| Status | `Fasting (Morning)` / `Before Lunch` / `After Lunch` / `Before Dinner` / `After Dinner` |
| Time (24h) *(1st)* | Blood sugar reading time, `HHMM` |
| Sugar Level | mg/dL (per the sheet's own Legend tab: *"unit not specified in original notebook"* — mg/dL was the family's own interpretation when digitizing, not something literally written next to each number) |
| Time (24h) *(2nd)* | Blood pressure reading time, `HHMM` — a separate column from the sugar time; the two are sometimes a few minutes apart (see §D) |
| Blood Pressure | `systolic/diastolic`, e.g. `157/90`, mmHg |
| Comments | Free text — provenance notes, corrections, dietary notes, "not recorded" markers |

The sheet has no heart-rate, walking/running, or gym columns — this
historical file only covers blood sugar and blood pressure.

## B. Excel → PostgreSQL mapping

**`blood_sugar_readings`** — one row per Excel row where **Sugar Level is
non-empty**:

| Excel | Column | Notes |
|---|---|---|
| Date + Time (24h) *(1st)* | `recorded_at` | Combine into a single `TIMESTAMPTZ`, interpreted as Asia/Kolkata local time (confirmed) — e.g. `'2026-06-19 07:30'::timestamp AT TIME ZONE 'Asia/Kolkata'`, not a bare cast. |
| Status | `reading_context` | `"Fasting (Morning)"` → `'Fasting'`; the other four values already match the schema's `CHECK` list verbatim. |
| Sugar Level | `value` | As-is, mg/dL. |
| — | `unit` | Always `'mg/dL'` (the sheet uses one unit throughout). |
| Comments | `comments` | Copied verbatim — never reworded or dropped. |
| — | `source` | `'historical_import'` |

**`blood_pressure_readings`** — one row per Excel row where **Blood
Pressure is non-empty**:

| Excel | Column | Notes |
|---|---|---|
| Date + Time (24h) *(2nd)* | `recorded_at` | Uses the *second* time column, not the sugar one — they can differ (see §D). Same Asia/Kolkata conversion rule as blood sugar. |
| Status | `reading_context` | Same row, same mapping as blood sugar (§C) — the Excel labels BP with the same daily slot even though it's one shared Status column per row. |
| Blood Pressure, split on `/` | `systolic`, `diastolic` | e.g. `157/90` → `157`, `90`. |
| — | `pulse` | Not present in this sheet — left `NULL`. |
| Comments | `comments` | Same row's comment, copied verbatim (may describe the sugar reading instead of the BP one, since one Comments cell covers the whole row — needs a human read-through, not blind copy, where a comment clearly refers to the other metric). |
| — | `source` | `'historical_import'` |

A single Excel row can produce **zero, one, or two** database rows
(sugar-only, BP-only, both, or neither if the slot is entirely blank) — the
two target tables are populated independently.

## C. Reading-context legend (from the sheet's own "Legend & Notes" tab)

Applies to both `blood_sugar_readings.reading_context` and
`blood_pressure_readings.reading_context` — one Status value per Excel row
covers both metrics.

| Excel abbreviation (legend) | Excel Status text (actual data) | `reading_context` |
|---|---|---|
| F | Fasting (Morning) | `Fasting` |
| BL | Before Lunch | `Before Lunch` |
| AL | After Lunch | `After Lunch` |
| BD | Before Dinner | `Before Dinner` |
| AD | After Dinner | `After Dinner` |

Confirmed: exactly these 5 values appear in the Status column, no
variants, no typos, 0 duplicate (date, status) pairs.

## D. Data-quality issues found (full inspection, 425 data rows)

1. **Invalid time value — the only one in the whole file.**
   `6-Aug-2026, Before Lunch`: sugar time is `1575`. `75` is not a valid
   minute value; this cannot become a `TIME`/`TIMESTAMPTZ`. See §E — this
   is the one record that actually blocks import.

2. **"BP not recorded" (and equivalent phrasings) — 75 rows** (sugar
   present, BP slot blank). The single most common gap; corrected from an
   earlier pass that undercounted this as 68 by only matching the exact
   phrase "BP not recorded" — a precise recount of all 116 blank-BP rows by
   exact comment text found 9 more with the same meaning but different
   wording: *"No time/BP recorded"* (30-Jul-2026 Before Dinner), and 8 more
   with a qualifier appended ("(no time either)", "(only a stray mark in
   original)", "(stray marks in original)" ×2, "written in noticeably
   bolder pen in original", "sugar value confirmed with user" ×2,
   "confirmed with user"). These import as: no `blood_pressure_readings`
   row, with the sugar row's own comment (if any) preserved as-is.

3. **19-Jun-2026 — all 5 slots have a blank BP with *no* comment at
   all.** The only date in the sheet where BP is missing without any
   explanatory note (every other blank-BP row elsewhere has one — see #2).
   Most likely: BP tracking simply hadn't started on day one (the very
   first tracked day) and the notebook was clean rather than illegible.
   Not a blocker — imports the same as any other "no BP this slot" row —
   but flagged here since it's the one place blank BP isn't self-explaining
   from the sheet alone.

4. **3 rows have a blank BP with only a dietary note as the comment**
   ("Dosa upma" ×2 on 25-Aug and 26-Aug Before Lunch, "Dosa" on 28-Aug
   Before Lunch) — BP simply wasn't recorded that slot; the comment is
   about the sugar spike, not the missing BP. Functionally the same as #2,
   just easy to miss with a keyword search (as an earlier pass of this
   document did) since the comment never says "not recorded".

5. **"Sugar not recorded" — 7 rows** (BP present, sugar slot blank). Mirror
   case of #2 — no `blood_sugar_readings` row for that slot.

6. **"No <slot> row exists in original for this date" — 28 rows.** The
   notebook simply has no entry at all for that date+slot (neither sugar
   nor BP) — not a data-entry gap, a genuine absence. Imports as: no row in
   either table for that slot.

7. **"Entire row blank in original" (4 rows) / "Marked as dash (—) in
   original — reading skipped" (1 row, 23-Jun-2026 After Lunch).**
   Functionally the same as #6 — nothing to import — but the comment
   phrasing differs, so both are preserved verbatim rather than normalized
   to one message, per requirement #4 (don't reinterpret comments).

8. **Sugar time vs. BP time mismatch — 7 rows**, e.g. *"Sugar time 2156 vs
   BP time 2144 (slight mismatch in original)"*. Not a blocker — this is
   exactly why the two tables have independent `recorded_at` values (§B) —
   but worth knowing the two readings in a "slot" were rarely simultaneous
   to the minute.

9. **Corrected / re-confirmed values — 9 rows**, e.g. *"Value corrected in
   original (135 confirmed with user)"*, *"Sugar value confirmed with user
   (was ink-stained/illegible in original)"*, *"BP written twice (122/76)
   in original"*, *"Original time 0630 crossed out, replaced with 0745"*
   (20-Jun-2026 Fasting — the sugar row uses the corrected `0745`; the
   crossed-out `0630` only survives as the *BP* row's own time, which is a
   separate, valid value, not an error). These already have a resolved
   value in the sheet — they import normally, with the comment preserved
   so the correction history isn't lost.

10. **Row relabeled during transcription — 2 rows.** *"Row was mislabeled BL
    in original; confirmed with user this is AL"* (3-Sep-2026) and
    *"confirmed with user this unlabeled entry belongs to AD"* (6-Jul-2026).
    Already resolved to a specific `reading_context` in the data — import
    using the corrected label.

11. **Dietary comments — 8 rows** (e.g. `Dosa upma`, `Dhokla`, `Sabudana
    khichdi`), mostly from 25-Aug-2026 onward alongside high sugar values.
    Not a data-quality problem — preserve verbatim in `comments`, exactly as
    requirement #4 asks. (3 of these 8 overlap with #4 above — blank BP
    with only a food note; the other 5 have a BP value present alongside
    the food note.)

12. **Unit provenance** (not row-specific): the sheet's Legend tab states
    the mg/dL unit "was not specified in the original notebook" — i.e. it's
    the family's own interpretation, applied uniformly. Not a blocker, but
    worth recording as a caveat on the import batch as a whole rather than
    per-row.

## E. Exact records requiring manual confirmation before import

**Only one record is a true blocker** — everything else above already has
a resolved value in the sheet:

> **6-Aug-2026, Before Lunch, Sugar = 84, Sugar time = `1575`**
> `75` is not a valid minute. No `recorded_at` can be computed for this row
> as-is.
>
> The sheet's own Legend tab claims this was "confirmed with the family" as
> literally what's written in the notebook — but "confirmed this is what's
> written" is not the same as "confirmed what time it actually was". Per
> the instruction for this task, this row is **not** auto-corrected and
> **not** guessed. It must be held out of the import batch until someone
> checks the original notebook (or asks Dad directly) for the actual time,
> then it can be imported like any other row.

No other row in the 425-row sheet has an unresolved value — confirmed by
validating every time field (`HHMM`, hour 00–23, minute 00–59) and every
blood pressure field (`digits/digits`) across the full sheet; `1575` was
the only failure.

## F. Status

- ✅ PostgreSQL database `family_manager` provisioned; `schema.sql` (all 6
  tables) executed via pgAdmin.
- ✅ **Historical import complete**, run 2026-09-12: `family_members` has
  one `Dad` row (`role='dad'`); `blood_sugar_readings` has 384 rows;
  `blood_pressure_readings` has 309 rows. All from `db/import/` — see that
  directory for the scripts. `06_verify.sql`'s checks all matched their
  documented expected values: row counts, the 5 `reading_context` values
  and no others in either table, the `1575` row confirmed absent, spot
  checks on 19-Jun (234 mg/dL fasting) and 20-Jun (157/90 fasting, keeping
  its original pre-correction 06:30 time per item 9 in §D) both correct,
  and the full date range (19-Jun through 11-Sep-2026, Asia/Kolkata)
  landed on the right calendar days in both tables.
- ⏳ **6-Aug-2026 `1575` row** — still excluded, still needs the original
  notebook (or Dad directly) to resolve the actual time. Once known, it's
  a single extra `INSERT` (see `db/import/README.md`), not a re-import.
- ⏳ **Frontend forms** — `BloodSugarForm.tsx` and `BloodPressureForm.tsx`
  still need a `reading_context` selector added so readings entered
  through the app (not just the historical import) capture it too. Not
  done — frontend is out of scope for this task.
- ⏳ **Backend/API layer** — still doesn't exist; the frontend is not yet
  connected to `family_manager` in any way. The historical data lives in
  Postgres only — nothing was hard-coded into React.
