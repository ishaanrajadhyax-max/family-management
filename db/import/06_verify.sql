-- =============================================================================
-- PREPARED, NOT EXECUTED.
--
-- Sanity checks to run after 03/04/05. Every query below has an expected
-- result noted in its comment — if any don't match, stop and investigate
-- before trusting the import.
-- =============================================================================

-- Expect exactly 1 row (Dad only, per this task's scope).
SELECT id, name, role FROM family_members;

-- Expect 384 and 309 respectively (see 04/05's post-load checks).
SELECT
  (SELECT count(*) FROM blood_sugar_readings WHERE source = 'historical_import') AS sugar_rows,
  (SELECT count(*) FROM blood_pressure_readings WHERE source = 'historical_import') AS bp_rows;

-- Expect 0 rows: the 1575 record must NOT be present.
SELECT * FROM blood_sugar_readings
WHERE recorded_at::date = '2026-08-06' AND reading_context = 'Before Lunch';

-- Expect exactly these 5 values, nothing else, for both tables.
SELECT DISTINCT reading_context FROM blood_sugar_readings ORDER BY 1;
SELECT DISTINCT reading_context FROM blood_pressure_readings ORDER BY 1;

-- Spot check: 19-Jun-2026 Fasting sugar should be 234 mg/dL at 07:30 IST.
SELECT recorded_at, reading_context, value, unit
FROM blood_sugar_readings
WHERE recorded_at::date = '2026-06-19' AND reading_context = 'Fasting';

-- Spot check: 20-Jun-2026 Fasting BP should be 157/90, timestamped 06:30 IST
-- (the *original* crossed-out time — BP kept its own time independent of
-- the sugar reading's corrected 07:45, per db/import-strategy.md §D item 9).
SELECT recorded_at, reading_context, systolic, diastolic, comments
FROM blood_pressure_readings
WHERE recorded_at::date = '2026-06-20' AND reading_context = 'Fasting';

-- Earliest and latest recorded_at in each table should fall within
-- 2026-06-19 and 2026-09-11 (IST) — confirms the Asia/Kolkata conversion
-- didn't shift any row to the wrong calendar day.
SELECT min(recorded_at) AS earliest, max(recorded_at) AS latest FROM blood_sugar_readings;
SELECT min(recorded_at) AS earliest, max(recorded_at) AS latest FROM blood_pressure_readings;
