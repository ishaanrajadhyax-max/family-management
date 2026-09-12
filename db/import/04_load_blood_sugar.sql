-- =============================================================================
-- PREPARED, NOT EXECUTED.
--
-- Loads blood_sugar_readings from staging_blood_readings. Requires
-- 01_staging_table.sql, 02_load_staging.sql, and 03_insert_dad.sql to have
-- run first (needs exactly one 'dad' row in family_members).
-- =============================================================================

-- --- Pre-flight: surface any row with an unparseable sugar_time BEFORE
-- --- inserting anything, rather than silently skipping or crashing mid-load.
-- --- Expected result: exactly one row — 2026-08-06 / Before Lunch / 1575 —
-- --- the known, deliberately-excluded record (see db/import-strategy.md §E).
-- --- If this returns anything else, STOP: that's a new issue, not the known one.
SELECT reading_date, status, sugar_time, sugar_value, comments
FROM staging_blood_readings
WHERE sugar_value IS NOT NULL
  AND sugar_time IS NOT NULL
  AND NOT (
    sugar_time ~ '^\d{4}$'
    AND substring(sugar_time, 1, 2)::int BETWEEN 0 AND 23
    AND substring(sugar_time, 3, 2)::int BETWEEN 0 AND 59
  );

-- --- Load. Explicitly excludes the confirmed-invalid 2026-08-06 Before
-- --- Lunch / 1575 row by identity (not a silent general time-validity
-- --- filter) so the exclusion is reviewable and intentional, not hidden.
-- --- Do not remove this WHERE clause until that time is confirmed from
-- --- the original notebook (db/import-strategy.md §E).
INSERT INTO blood_sugar_readings
  (family_member_id, recorded_at, reading_context, value, unit, source, comments)
SELECT
  (SELECT id FROM family_members WHERE role = 'dad'),
  (s.reading_date + make_time(
     substring(s.sugar_time, 1, 2)::int,
     substring(s.sugar_time, 3, 2)::int,
     0
   )) AT TIME ZONE 'Asia/Kolkata',
  CASE WHEN s.status = 'Fasting (Morning)' THEN 'Fasting' ELSE s.status END,
  s.sugar_value,
  'mg/dL',
  'historical_import',
  NULLIF(s.comments, '')
FROM staging_blood_readings s
WHERE s.sugar_value IS NOT NULL
  AND s.sugar_time IS NOT NULL
  AND NOT (s.reading_date = '2026-08-06' AND s.status = 'Before Lunch' AND s.sugar_time = '1575');

-- --- Post-load check. Expected: 384 (385 slots have a non-blank Sugar
-- --- Level across the 425-row sheet, minus the 1 excluded 1575 row).
SELECT count(*) AS blood_sugar_rows_loaded FROM blood_sugar_readings WHERE source = 'historical_import';
