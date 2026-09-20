-- =============================================================================
-- Migration 004: Jarvis (personal AI assistant) conversations and memory.
--
-- Additive only. Does not touch family_members, blood_sugar_readings,
-- blood_pressure_readings, heart_rate_readings, walk_run_activities, or
-- gym_activities — no existing table, column, or row is affected. Three
-- brand-new tables, all scoped to family_member_id so Jarvis reuses the
-- exact same identity/session system the health tracker already has —
-- each logged-in person gets their own conversations and memory, the same
-- way they already only see their own health data.
--
-- jarvis_conversations: one row per chat thread. `mode` mirrors the
-- General/News/Style specialist modes; CHECK keeps bad values out at the
-- database level, same pattern as reading_context / family_members.role.
--
-- jarvis_messages: one row per turn in a conversation. `role` distinguishes
-- what the person said from what Jarvis replied, same shape the Anthropic
-- Messages API itself uses, so building a request from stored history is a
-- direct mapping.
--
-- jarvis_memory: a small persisted fact store, deliberately separate from
-- raw message history — this is "things Jarvis has learned and should
-- keep using," not a transcript. Kept intentionally simple (freeform text
-- rows, not a schema of typed facts) since the MVP's memory feature is a
-- short list injected into the system prompt, not a retrieval/RAG system.
-- =============================================================================

CREATE TABLE jarvis_conversations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_member_id  UUID NOT NULL REFERENCES family_members(id) ON DELETE CASCADE,
  mode              TEXT NOT NULL CHECK (mode IN ('general', 'news', 'style')),
  title             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_jarvis_conversations_member
  ON jarvis_conversations (family_member_id, updated_at DESC);

CREATE TABLE jarvis_messages (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id  UUID NOT NULL REFERENCES jarvis_conversations(id) ON DELETE CASCADE,
  role             TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content          TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_jarvis_messages_conversation
  ON jarvis_messages (conversation_id, created_at);

CREATE TABLE jarvis_memory (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_member_id  UUID NOT NULL REFERENCES family_members(id) ON DELETE CASCADE,
  content           TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_jarvis_memory_member
  ON jarvis_memory (family_member_id, updated_at DESC);
