-- =============================================================================
-- Migration 002: login credentials for family_members.
--
-- Additive only. Does not touch blood_sugar_readings, blood_pressure_readings,
-- heart_rate_readings, walk_run_activities, gym_activities, or any existing
-- column/constraint on family_members — no historical data is affected.
--
-- family_members had no way to log in before this (id, name, role,
-- created_at only). This adds:
--   - username, password_hash: nullable, so a family member with no
--     credentials yet simply can't log in (checked in application code),
--     rather than requiring a value be invented for the existing Dad row.
--   - the Mom and Ishaan (admin) rows, which never existed until now —
--     only Dad was created back in the historical import (Milestone 2).
--
-- Passwords themselves are set afterwards via server/scripts/set-password.mjs,
-- run locally by a human — never through this file, never through chat.
-- =============================================================================

ALTER TABLE family_members ADD COLUMN IF NOT EXISTS username TEXT UNIQUE;
ALTER TABLE family_members ADD COLUMN IF NOT EXISTS password_hash TEXT;

INSERT INTO family_members (name, role)
SELECT 'Mom', 'mom'
WHERE NOT EXISTS (SELECT 1 FROM family_members WHERE role = 'mom');

INSERT INTO family_members (name, role)
SELECT 'Ishaan', 'admin'
WHERE NOT EXISTS (SELECT 1 FROM family_members WHERE role = 'admin');
