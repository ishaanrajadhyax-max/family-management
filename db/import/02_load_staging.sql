-- =============================================================================
-- PREPARED, NOT EXECUTED.
--
-- Loads the extracted Excel data (staging_blood_readings.csv, 425 rows,
-- one per Date+Status slot, 19-Jun-2026 through 11-Sep-2026) into the
-- staging table. Run from psql with this file's directory as the working
-- directory, or adjust the path below to an absolute path.
--
-- \copy runs client-side (via psql), unlike COPY, so it works without the
-- server process needing filesystem access to this machine — appropriate
-- for a local install like this one.
-- =============================================================================

\copy staging_blood_readings (reading_date, status, sugar_time, sugar_value, bp_time, bp_value, comments) FROM 'staging_blood_readings.csv' WITH (FORMAT csv, HEADER true);

-- Sanity check immediately after load — expect exactly 425.
SELECT count(*) AS loaded_row_count FROM staging_blood_readings;
