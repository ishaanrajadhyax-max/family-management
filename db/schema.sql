-- =============================================================================
-- DESIGN ONLY — NOT EXECUTED, NOT CONNECTED.
--
-- This file documents the intended PostgreSQL schema for the Family
-- Management System. No database is provisioned yet, no backend exists yet,
-- and this file is not run against anything. It exists so the schema can be
-- reviewed and finalized before real implementation (backend + DB
-- connection + historical import) begins.
--
-- Field names intentionally mirror src/features/dad/types.ts so the future
-- API layer can map rows to those TypeScript shapes with minimal friction.
--
-- Revision 2: incorporates a real inspection of
-- data/Father_Health_Readings_19Jun_to_11Sep_2026 (1).xlsx (85 days,
-- 19-Jun-2026 through 11-Sep-2026, confirmed year 2026). See
-- db/import-strategy.md for the full mapping and the data-quality findings
-- that drove these changes.
--
-- Revision 3: final decisions locked in ahead of real execution —
-- Asia/Kolkata timezone handling, `reading_context` added to blood
-- pressure too, and the remaining open questions from Revision 2 resolved.
-- Still design only; nothing in this file has been run.
--
-- TIMEZONE — this app is used by a family in India, so every `recorded_at`
-- represents the actual India-local (Asia/Kolkata, UTC+05:30, no DST) wall
-- clock moment the reading was taken. TIMESTAMPTZ always stores an absolute
-- instant (internally normalized to UTC) regardless of session settings, so
-- storage itself doesn't need a "timezone column" — the decision that
-- matters is at write time:
--   * Historical import: each Excel row's Date + Time (24h) is a naive
--     local time with no timezone attached. It must be interpreted as
--     Asia/Kolkata before being combined into `recorded_at`, e.g.
--     `'2026-06-19 07:30'::timestamp AT TIME ZONE 'Asia/Kolkata'`, not a
--     bare cast (which would use the connecting session's timezone and can
--     silently produce the wrong instant).
--   * App entry: the frontend's Date + Time inputs are the same kind of
--     naive local values and must go through the same conversion once a
--     backend exists.
-- Reading the data back out (dashboards, exports) can `SET timezone =
-- 'Asia/Kolkata'` for the session, or convert explicitly, so displayed
-- values match what Dad actually wrote down.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- family_members
-- One row per person using the system (Dad, Mom, Ishaan). `role` drives the
-- role-based access described in the product spec: 'dad' and 'mom' can only
-- see their own rows, 'admin' (Ishaan) can see everyone's.
-- ---------------------------------------------------------------------------
CREATE TABLE family_members (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  role       TEXT NOT NULL CHECK (role IN ('dad', 'mom', 'admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- blood_sugar_readings
-- Maps to BloodSugarReading in types.ts.
--
-- `reading_context` preserves the Excel's Status column (F / BL / AL / BD /
-- AD — see the sheet's "Legend & Notes" tab), so a reading is never just a
-- bare number: it's always "fasting" or "after lunch" etc., same as the
-- original notebook. This did not exist in the frontend form yet — see
-- import-strategy.md for the follow-up needed there.
-- ---------------------------------------------------------------------------
CREATE TABLE blood_sugar_readings (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_member_id  UUID NOT NULL REFERENCES family_members(id) ON DELETE CASCADE,
  recorded_at       TIMESTAMPTZ NOT NULL,
  reading_context   TEXT NOT NULL CHECK (
                       reading_context IN (
                         'Fasting', 'Before Lunch', 'After Lunch',
                         'Before Dinner', 'After Dinner'
                       )
                     ),
  value             NUMERIC(6,1) NOT NULL CHECK (value > 0),
  unit              TEXT NOT NULL CHECK (unit IN ('mg/dL', 'mmol/L')),
  source            TEXT NOT NULL CHECK (source IN ('historical_import', 'app')),
  comments          TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_blood_sugar_member_time
  ON blood_sugar_readings (family_member_id, recorded_at DESC);

-- ---------------------------------------------------------------------------
-- blood_pressure_readings
-- Maps to BloodPressureReading in types.ts. Systolic/diastolic kept as
-- separate integer columns (not "157/90" text) so they can be trended and
-- validated individually.
--
-- `reading_context` mirrors blood_sugar_readings' — the source Excel labels
-- BP with the same daily slot as sugar, and preserving it enables filtering
-- and comparison later (e.g. "fasting BP trend"). `recorded_at` stays fully
-- independent from blood_sugar_readings.recorded_at: the sheet's own data
-- shows sugar and BP within the same labeled slot were often captured a
-- few minutes apart, never assumed simultaneous.
-- ---------------------------------------------------------------------------
CREATE TABLE blood_pressure_readings (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_member_id  UUID NOT NULL REFERENCES family_members(id) ON DELETE CASCADE,
  recorded_at       TIMESTAMPTZ NOT NULL,
  reading_context   TEXT NOT NULL CHECK (
                       reading_context IN (
                         'Fasting', 'Before Lunch', 'After Lunch',
                         'Before Dinner', 'After Dinner'
                       )
                     ),
  systolic          SMALLINT NOT NULL CHECK (systolic > 0),
  diastolic         SMALLINT NOT NULL CHECK (diastolic > 0),
  pulse             SMALLINT CHECK (pulse IS NULL OR pulse > 0),
  source            TEXT NOT NULL CHECK (source IN ('historical_import', 'app')),
  comments          TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_blood_pressure_member_time
  ON blood_pressure_readings (family_member_id, recorded_at DESC);

-- ---------------------------------------------------------------------------
-- heart_rate_readings
-- Maps to HeartRateReading in types.ts. Standalone BPM readings (not tied
-- to a blood pressure check — those keep their own optional `pulse` field).
-- The inspected Excel sheet has no heart-rate column at all, so this table
-- currently has nothing to backfill — it exists for readings Dad enters
-- through the app going forward.
-- ---------------------------------------------------------------------------
CREATE TABLE heart_rate_readings (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_member_id  UUID NOT NULL REFERENCES family_members(id) ON DELETE CASCADE,
  recorded_at       TIMESTAMPTZ NOT NULL,
  value             SMALLINT NOT NULL CHECK (value > 0),
  source            TEXT NOT NULL CHECK (source IN ('historical_import', 'app')),
  comments          TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_heart_rate_member_time
  ON heart_rate_readings (family_member_id, recorded_at DESC);

-- ---------------------------------------------------------------------------
-- walk_run_activities
-- Maps to WalkRunActivity in types.ts. Not present in the inspected Excel
-- sheet (health readings only) — exists for future app entries/backfill.
-- ---------------------------------------------------------------------------
CREATE TABLE walk_run_activities (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_member_id   UUID NOT NULL REFERENCES family_members(id) ON DELETE CASCADE,
  activity_type      TEXT NOT NULL CHECK (activity_type IN ('Walking', 'Running')),
  recorded_at        TIMESTAMPTZ NOT NULL,
  duration_minutes   SMALLINT NOT NULL CHECK (duration_minutes > 0),
  distance           NUMERIC(5,2) NOT NULL CHECK (distance > 0),
  distance_unit      TEXT NOT NULL CHECK (distance_unit IN ('km', 'mi')),
  source             TEXT NOT NULL CHECK (source IN ('historical_import', 'app')),
  comments           TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_walk_run_member_time
  ON walk_run_activities (family_member_id, recorded_at DESC);

-- ---------------------------------------------------------------------------
-- gym_activities
-- Maps to GymActivity in types.ts. Not present in the inspected Excel sheet
-- (health readings only) — exists for future app entries/backfill.
-- ---------------------------------------------------------------------------
CREATE TABLE gym_activities (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_member_id   UUID NOT NULL REFERENCES family_members(id) ON DELETE CASCADE,
  recorded_at        TIMESTAMPTZ NOT NULL,
  focus              TEXT NOT NULL CHECK (
                        focus IN ('Chest','Back','Shoulders','Legs','Arms','Full Body','Other')
                      ),
  exercises          TEXT,
  duration_minutes   SMALLINT CHECK (duration_minutes IS NULL OR duration_minutes > 0),
  source             TEXT NOT NULL CHECK (source IN ('historical_import', 'app')),
  comments           TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_gym_member_time
  ON gym_activities (family_member_id, recorded_at DESC);

-- ---------------------------------------------------------------------------
-- Final design decisions (locked in, Revision 3):
--
-- 1. Timezone: Asia/Kolkata at write time for every recorded_at (see the
--    TIMEZONE note at the top of this file) — not a schema-level setting,
--    a conversion rule the import script and future backend must both
--    follow.
-- 2. reading_context: present on both blood_sugar_readings and
--    blood_pressure_readings, same 5 allowed values, independent
--    recorded_at per table.
-- 3. Unit normalization: blood sugar stored as-entered (mg/dL throughout
--    the source sheet; the frontend form's mg/dL/mmol/L choice is
--    preserved as the `unit` column, not silently converted).
-- 4. `source` stays a plain CHECK constraint — a lookup table with audit
--    metadata would be overkill for a small family app. Revisit only if a
--    third source type is ever needed.
-- 5. The 6-Aug-2026 `1575` blood sugar row stays out of the import until
--    the real time is confirmed from the original notebook — see
--    import-strategy.md §E. Not a schema concern (recorded_at stays
--    NOT NULL — no placeholder/sentinel value is introduced for it).
-- ---------------------------------------------------------------------------
