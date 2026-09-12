-- =============================================================================
-- PREPARED, NOT EXECUTED.
--
-- Staging table for the historical Excel import, per db/import-strategy.md
-- §B ("Stage"). This is scratch/import tooling, not part of the approved
-- production schema in db/schema.sql — nothing here touches the 6 approved
-- tables until 03_insert_dad.sql / 04_load_blood_sugar.sql /
-- 05_load_blood_pressure.sql explicitly do so.
--
-- Adjustment vs. the original import-strategy.md sketch: this real Excel
-- file (data/Father_Health_Readings_19Jun_to_11Sep_2026 (1).xlsx) has no
-- "Person" column — it's a Dad-only file, confirmed by its filename and
-- content — so the staging table doesn't carry one. Every row in this
-- batch resolves to the family_members row created in 03_insert_dad.sql.
--
-- `reading_date` is a real DATE (not TEXT) because the year ambiguity from
-- the original design doc is resolved: 2026, confirmed by the user.
-- `sugar_time` / `bp_time` stay TEXT: one value (`1575`) is not a valid
-- time and must be loadable without erroring, so it can be explicitly
-- excluded in the transform step rather than rejected at load time.
-- =============================================================================

CREATE TABLE staging_blood_readings (
  reading_date  DATE NOT NULL,
  status        TEXT NOT NULL,
  sugar_time    TEXT,
  sugar_value   NUMERIC(6,1),
  bp_time       TEXT,
  bp_value      TEXT,
  comments      TEXT
);
