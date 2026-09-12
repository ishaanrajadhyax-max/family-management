-- =============================================================================
-- PREPARED, NOT EXECUTED.
--
-- Creates the initial family_members record for Dad. Per current task
-- scope, Mom and Ishaan (admin) are NOT created here — only Dad, since he's
-- the only one with historical data to import right now.
--
-- Idempotent: safe to run once. If run twice, the WHERE NOT EXISTS guard
-- prevents a duplicate Dad row (the schema has no UNIQUE constraint on
-- name/role, so without this guard a re-run would silently create a
-- second "Dad").
-- =============================================================================

INSERT INTO family_members (name, role)
SELECT 'Dad', 'dad'
WHERE NOT EXISTS (
  SELECT 1 FROM family_members WHERE role = 'dad'
);

-- Confirm exactly one Dad exists after this runs.
SELECT id, name, role, created_at FROM family_members WHERE role = 'dad';
