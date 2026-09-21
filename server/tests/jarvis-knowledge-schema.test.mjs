// Schema tests for migration 005 (jarvis_knowledge + jarvis_usage + the
// dropped mode constraint), run against the LOCAL database. Requires
// migration 005 to have been applied locally; needs Postgres reachable,
// not the API server. Synthetic data only, cleaned up via a fixture
// family member (ON DELETE CASCADE).
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { pool } from '../db.js'
import { recordUsage } from '../jarvis/usage.js'

const RUN_ID = Date.now().toString(36)
let ownerId

before(async () => {
  const r = await pool.query(
    `INSERT INTO family_members (name, username, role, is_active)
     VALUES ($1, $2, 'dad', true) RETURNING id`,
    ['Test knowledge', `test_knowledge_${RUN_ID}`],
  )
  ownerId = r.rows[0].id
})

after(async () => {
  await pool.query('DELETE FROM family_members WHERE id = $1', [ownerId])
  await pool.end()
})

function row(overrides = {}) {
  return {
    area: 'style',
    section: 'wardrobe',
    kind: 'entry',
    entry_key: 'k1',
    title: 'Synthetic title',
    body: 'Synthetic body text about umbrellas.',
    aliases: [],
    keywords: '',
    token_estimate: 10,
    ...overrides,
  }
}

async function insertKnowledge(overrides = {}) {
  const v = row(overrides)
  return pool.query(
    `INSERT INTO jarvis_knowledge
       (owner_user_id, area, section, kind, entry_key, title, body, aliases, keywords, token_estimate)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
    [ownerId, v.area, v.section, v.kind, v.entry_key, v.title, v.body, v.aliases, v.keywords, v.token_estimate],
  )
}

test('jarvis_knowledge has the specified columns, with a generated full-text vector', async () => {
  const cols = await pool.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'jarvis_knowledge'`,
  )
  const names = cols.rows.map((c) => c.column_name)
  for (const expected of [
    'id', 'owner_user_id', 'area', 'section', 'kind', 'entry_key', 'title', 'body',
    'aliases', 'keywords', 'entry_date', 'source_ref', 'snapshot_at', 'token_estimate', 'search',
  ]) {
    assert.ok(names.includes(expected), `missing column ${expected}`)
  }
  const gen = await pool.query(
    `SELECT attgenerated FROM pg_attribute WHERE attrelid = 'jarvis_knowledge'::regclass AND attname = 'search'`,
  )
  assert.equal(gen.rows[0].attgenerated, 's', 'search must be a STORED generated column')
})

test('required indexes exist: GIN on search and aliases, plus the two btrees', async () => {
  const idx = await pool.query(`SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'jarvis_knowledge'`)
  const defs = Object.fromEntries(idx.rows.map((r) => [r.indexname, r.indexdef]))
  assert.match(defs.idx_jarvis_knowledge_search, /USING gin \(search\)/)
  assert.match(defs.idx_jarvis_knowledge_aliases, /USING gin \(aliases\)/)
  assert.match(defs.idx_jarvis_knowledge_owner_area_kind, /\(owner_user_id, area, kind\)/)
  assert.match(
    defs.idx_jarvis_knowledge_owner_area_section_date,
    /\(owner_user_id, area, section, entry_date DESC\)/,
  )
})

test('the unique constraint (owner, area, section, entry_key) rejects duplicates', async () => {
  await insertKnowledge({ entry_key: 'dup' })
  await assert.rejects(() => insertKnowledge({ entry_key: 'dup' }), (err) => err.code === '23505')
  // Same key in a different section is a different entry.
  await assert.doesNotReject(() => insertKnowledge({ section: 'wishlist', entry_key: 'dup' }))
})

test('kind is restricted to rules | core | entry', async () => {
  await assert.rejects(() => insertKnowledge({ entry_key: 'bad-kind', kind: 'bogus' }), (err) => err.code === '23514')
  for (const kind of ['rules', 'core', 'entry']) {
    await assert.doesNotReject(() => insertKnowledge({ entry_key: `kind-${kind}`, kind }))
  }
})

test('full-text search matches title, keywords and body, and ranks a title hit above a body-only hit', async () => {
  await insertKnowledge({ entry_key: 'fts-title', title: 'Zephyr overview', body: 'nothing relevant here' })
  await insertKnowledge({ entry_key: 'fts-body', title: 'Other', body: 'a long note that mentions zephyr once' })
  await insertKnowledge({ entry_key: 'fts-kw', title: 'Third', body: 'unrelated', keywords: 'zephyr nickname' })

  const res = await pool.query(
    `SELECT entry_key, ts_rank_cd(search, q) AS rank
       FROM jarvis_knowledge, to_tsquery('english', 'zephyr | nonexistentterm') q
      WHERE owner_user_id = $1 AND search @@ q
      ORDER BY rank DESC`,
    [ownerId],
  )
  const order = res.rows.map((r) => r.entry_key)
  assert.deepEqual([...order].sort(), ['fts-body', 'fts-kw', 'fts-title'])
  assert.equal(order[0], 'fts-title', 'title (weight A) outranks keywords (B) and body (C)')
  assert.equal(order.at(-1), 'fts-body')
})

test('aliases support exact matching through the GIN index', async () => {
  await insertKnowledge({ entry_key: 'alias', aliases: ['tkr-x', 'nick-y'] })
  const hit = await pool.query(
    `SELECT entry_key FROM jarvis_knowledge WHERE owner_user_id = $1 AND aliases && $2::text[]`,
    [ownerId, ['nick-y']],
  )
  assert.deepEqual(hit.rows.map((r) => r.entry_key), ['alias'])
})

test('jarvis_usage stores counts only — no column can hold conversation content', async () => {
  const cols = await pool.query(
    `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'jarvis_usage' ORDER BY column_name`,
  )
  assert.deepEqual(
    cols.rows.map((c) => c.column_name).sort(),
    [
      'actual_completion_tokens', 'actual_prompt_tokens', 'actual_total_tokens', 'area', 'conversation_id',
      'created_at', 'estimated_prompt_tokens', 'id', 'model', 'owner_user_id', 'provider',
    ],
  )
  const textCols = cols.rows.filter((c) => c.data_type === 'text').map((c) => c.column_name).sort()
  assert.deepEqual(textCols, ['area', 'model', 'provider'], 'only short labels are text')
})

test('recordUsage writes counts, and a recording failure never throws into the chat path', async () => {
  await recordUsage({
    ownerId,
    conversationId: null,
    provider: 'groq',
    model: 'test-model',
    area: 'general',
    estimatedPromptTokens: 500,
    usage: { promptTokens: 480, completionTokens: 40, totalTokens: 520 },
  })
  const stored = await pool.query(`SELECT * FROM jarvis_usage WHERE owner_user_id = $1 AND model = 'test-model'`, [ownerId])
  assert.equal(stored.rowCount, 1)
  assert.equal(stored.rows[0].actual_total_tokens, 520)
  assert.equal(stored.rows[0].estimated_prompt_tokens, 500)

  // Nonexistent owner violates the foreign key; must be swallowed.
  await assert.doesNotReject(() =>
    recordUsage({
      ownerId: '00000000-0000-0000-0000-000000000000',
      conversationId: null,
      provider: 'groq',
      model: 'x',
      area: 'general',
      estimatedPromptTokens: 1,
      usage: { promptTokens: null, completionTokens: null, totalTokens: null },
    }),
  )
})

test('the mode CHECK on jarvis_conversations is gone, so new areas need no migration', async () => {
  const checks = await pool.query(
    `SELECT conname FROM pg_constraint WHERE conrelid = 'jarvis_conversations'::regclass AND contype = 'c'`,
  )
  assert.equal(checks.rowCount, 0)
  const c = await pool.query(
    `INSERT INTO jarvis_conversations (family_member_id, mode) VALUES ($1, 'study') RETURNING id`,
    [ownerId],
  )
  assert.equal(c.rowCount, 1)
})

test('deleting the owner cascades to their knowledge and usage rows', async () => {
  const temp = await pool.query(
    `INSERT INTO family_members (name, username, role, is_active) VALUES ('Test cascade', $1, 'mom', true) RETURNING id`,
    [`test_cascade_${RUN_ID}`],
  )
  const id = temp.rows[0].id
  await pool.query(
    `INSERT INTO jarvis_knowledge (owner_user_id, area, section, kind, entry_key, body, token_estimate)
     VALUES ($1, 'news', 'threads', 'entry', 'c1', 'body', 1)`,
    [id],
  )
  await recordUsage({
    ownerId: id, conversationId: null, provider: 'groq', model: 'm', area: 'news',
    estimatedPromptTokens: 1, usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
  })
  await pool.query('DELETE FROM family_members WHERE id = $1', [id])
  const k = await pool.query('SELECT 1 FROM jarvis_knowledge WHERE owner_user_id = $1', [id])
  const u = await pool.query('SELECT 1 FROM jarvis_usage WHERE owner_user_id = $1', [id])
  assert.equal(k.rowCount + u.rowCount, 0)
})
