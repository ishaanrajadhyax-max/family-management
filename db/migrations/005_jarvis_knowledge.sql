-- =============================================================================
-- Migration 005: Jarvis Knowledge Notebook storage + token-usage tracking.
--
-- Additive, with ONE deliberate exception (below). Does not touch
-- family_members, any health table (blood_sugar_readings,
-- blood_pressure_readings, heart_rate_readings, walk_run_activities,
-- gym_activities), or any existing row in jarvis_conversations /
-- jarvis_messages / jarvis_memory.
--
-- jarvis_knowledge holds an IMPORTED SNAPSHOT of the user's Notebook. The
-- Notebook itself remains the source of truth; this table is a read-only
-- copy for retrieval and is written only by the (future) import script —
-- there is no application route or tool that writes to it. No Notebook
-- content is in this file: the migration creates structure only.
--
--   kind: rules  - the user's instructions (always included in prompts)
--         core   - small always-on reference facts
--         entry  - reference entries retrieved per request by full-text
--                  search
--   area/section have no CHECK on purpose: valid values are defined by the
--   area registry in server/jarvis/areas.js, so adding a future area
--   (Study, Tasks) needs no migration.
--
-- `search` is a generated tsvector: title (weight A), keywords (B), body
-- (C), using an explicit 'english' config (which keeps the expression
-- IMMUTABLE, as generated columns require). `keywords` is a plain text
-- column — space-joined aliases/tags — rather than deriving it from the
-- aliases array, because array_to_string() is only STABLE and can't be
-- used in a generated column. `aliases` stays a real array for exact
-- matching (tickers, nicknames).
--
-- Column is named owner_user_id (referencing family_members) — other
-- Jarvis tables call the same thing family_member_id; the difference is
-- naming only.
--
-- jarvis_usage stores COUNTS ONLY, so budgets can be tuned from what the
-- provider actually reports. It deliberately has no column that could hold
-- prompt text, Notebook text, memory text, or any other conversation
-- content.
-- =============================================================================

CREATE TABLE jarvis_knowledge (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id   UUID NOT NULL REFERENCES family_members(id) ON DELETE CASCADE,
  area            TEXT NOT NULL,
  section         TEXT NOT NULL,
  kind            TEXT NOT NULL CHECK (kind IN ('rules', 'core', 'entry')),
  entry_key       TEXT NOT NULL,
  title           TEXT NOT NULL DEFAULT '',
  body            TEXT NOT NULL,
  aliases         TEXT[] NOT NULL DEFAULT '{}',
  keywords        TEXT NOT NULL DEFAULT '',
  entry_date      DATE,
  source_ref      TEXT,
  snapshot_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  token_estimate  INTEGER NOT NULL CHECK (token_estimate >= 0),
  search          TSVECTOR GENERATED ALWAYS AS (
                    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
                    setweight(to_tsvector('english', coalesce(keywords, '')), 'B') ||
                    setweight(to_tsvector('english', coalesce(body, '')), 'C')
                  ) STORED,
  CONSTRAINT jarvis_knowledge_unique_entry UNIQUE (owner_user_id, area, section, entry_key)
);

CREATE INDEX idx_jarvis_knowledge_search
  ON jarvis_knowledge USING GIN (search);

CREATE INDEX idx_jarvis_knowledge_aliases
  ON jarvis_knowledge USING GIN (aliases);

CREATE INDEX idx_jarvis_knowledge_owner_area_kind
  ON jarvis_knowledge (owner_user_id, area, kind);

CREATE INDEX idx_jarvis_knowledge_owner_area_section_date
  ON jarvis_knowledge (owner_user_id, area, section, entry_date DESC);

CREATE TABLE jarvis_usage (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id             UUID NOT NULL REFERENCES family_members(id) ON DELETE CASCADE,
  conversation_id           UUID REFERENCES jarvis_conversations(id) ON DELETE SET NULL,
  provider                  TEXT NOT NULL,
  model                     TEXT NOT NULL,
  area                      TEXT NOT NULL,
  estimated_prompt_tokens   INTEGER,
  actual_prompt_tokens      INTEGER,
  actual_completion_tokens  INTEGER,
  actual_total_tokens       INTEGER,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_jarvis_usage_owner_created
  ON jarvis_usage (owner_user_id, created_at DESC);

-- The one change to an existing object: drop the CHECK that limited
-- jarvis_conversations.mode to ('general','news','style'). Constraint name
-- confirmed against the live catalog (pg_constraint) before writing this —
-- not guessed. Valid modes are now defined by the area registry
-- (server/jarvis/areas.js) and validated by the routes, so adding an area
-- later doesn't need a schema change. No rows are modified.
ALTER TABLE jarvis_conversations DROP CONSTRAINT IF EXISTS jarvis_conversations_mode_check;
