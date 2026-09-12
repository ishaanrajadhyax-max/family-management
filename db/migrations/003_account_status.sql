-- =============================================================================
-- Migration 003: account enable/disable status for family_members.
--
-- Additive only. Does not touch blood_sugar_readings, blood_pressure_readings,
-- heart_rate_readings, walk_run_activities, gym_activities, or any existing
-- row/column on family_members — no historical health data is affected.
--
-- Inspected first: family_members had no status-like column before this
-- (id, name, role, created_at, username, password_hash only) — there was
-- nothing to reuse, so this adds exactly one column.
--
-- Defaults to true so every existing account (Dad, Mom, Ishaan) stays
-- active with no behavior change the moment this runs.
--
-- No "last login" column is added — there's no existing field for it and
-- none was requested strongly enough to justify a schema addition solely
-- for display; the User Management page simply omits that column.
-- =============================================================================

ALTER TABLE family_members ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
