-- =============================================================================
-- PREPARED, NOT EXECUTED.
--
-- Loads blood_pressure_readings from staging_blood_readings. Requires
-- 01_staging_table.sql, 02_load_staging.sql, and 03_insert_dad.sql to have
-- run first (needs exactly one 'dad' row in family_members).
--
-- No row is excluded here: the one known data-quality blocker (the 1575
-- time) only affects the sugar reading in that row — its BP columns are
-- already blank in the source (see db/import-strategy.md §D item 1), so
-- this table needs no special-case filter.
-- =============================================================================

-- --- Pre-flight: surface any row with an unparseable bp_time or malformed
-- --- bp_value BEFORE inserting anything. Expected result: no rows — every
-- --- BP time and value in the sheet was validated as well-formed.
SELECT reading_date, status, bp_time, bp_value, comments
FROM staging_blood_readings
WHERE bp_value IS NOT NULL
  AND (
    bp_time IS NULL
    OR NOT (
      bp_time ~ '^\d{4}$'
      AND substring(bp_time, 1, 2)::int BETWEEN 0 AND 23
      AND substring(bp_time, 3, 2)::int BETWEEN 0 AND 59
    )
    OR bp_value !~ '^\d{2,3}/\d{2,3}$'
  );

-- --- Load.
INSERT INTO blood_pressure_readings
  (family_member_id, recorded_at, reading_context, systolic, diastolic, source, comments)
SELECT
  (SELECT id FROM family_members WHERE role = 'dad'),
  (s.reading_date + make_time(
     substring(s.bp_time, 1, 2)::int,
     substring(s.bp_time, 3, 2)::int,
     0
   )) AT TIME ZONE 'Asia/Kolkata',
  CASE WHEN s.status = 'Fasting (Morning)' THEN 'Fasting' ELSE s.status END,
  split_part(s.bp_value, '/', 1)::smallint,
  split_part(s.bp_value, '/', 2)::smallint,
  'historical_import',
  NULLIF(s.comments, '')
FROM staging_blood_readings s
WHERE s.bp_value IS NOT NULL
  AND s.bp_time IS NOT NULL;

-- --- Post-load check. Expected: 309 (rows with a non-blank Blood Pressure
-- --- value across the 425-row sheet — no exclusions apply to this table).
SELECT count(*) AS blood_pressure_rows_loaded FROM blood_pressure_readings WHERE source = 'historical_import';
