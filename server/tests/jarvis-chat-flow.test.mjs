// End-to-end test of the chat route (routes/jarvis.js) run IN-PROCESS: the
// router is mounted in a tiny Express app with a fake logged-in user, and
// global fetch is stubbed for Groq only, so the whole path — history
// window -> knowledge seam -> prompt builder -> Groq adapter -> usage
// recording — runs for real without an API key or the dev server. Needs
// local Postgres (with migration 005 applied); synthetic data only.
import { test, before, after, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { pool } from '../db.js'
import jarvisRouter from '../routes/jarvis.js'
import { AREAS } from '../jarvis/areas.js'
import { DEFAULT_BUDGETS, estimateTokens } from '../jarvis/budgets.js'

const RUN_ID = Date.now().toString(36)
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'

let ownerId
let server
let baseUrl
let realFetch
let groqCalls
const saved = {}

before(async () => {
  const r = await pool.query(
    `INSERT INTO family_members (name, username, role, is_active)
     VALUES ('Test chatflow', $1, 'dad', true) RETURNING id`,
    [`test_chatflow_${RUN_ID}`],
  )
  ownerId = r.rows[0].id

  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => {
    req.user = { id: ownerId, role: 'dad' }
    next()
  })
  app.use('/api/jarvis', jarvisRouter)
  app.use((err, _req, res, _next) => res.status(500).json({ error: String(err.message) }))
  await new Promise((resolve) => {
    server = app.listen(0, resolve)
  })
  baseUrl = `http://127.0.0.1:${server.address().port}`
  realFetch = globalThis.fetch
})

after(async () => {
  await new Promise((resolve) => server.close(resolve))
  await pool.query('DELETE FROM family_members WHERE id = $1', [ownerId])
  await pool.end()
})

beforeEach(() => {
  for (const key of ['LLM_PROVIDER', 'GROQ_API_KEY']) saved[key] = process.env[key]
  process.env.LLM_PROVIDER = 'groq'
  process.env.GROQ_API_KEY = 'test-key'
  groqCalls = []
  // Only Groq is stubbed; the test's own calls to the local app pass through.
  globalThis.fetch = async (url, options) => {
    if (String(url) !== GROQ_URL) return realFetch(url, options)
    groqCalls.push(JSON.parse(options.body))
    return {
      ok: true,
      status: 200,
      json: async () => ({
        usage: { prompt_tokens: 111, completion_tokens: 22, total_tokens: 133 },
        choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: 'Stub reply' } }],
      }),
    }
  }
})

afterEach(() => {
  globalThis.fetch = realFetch
  for (const key of ['LLM_PROVIDER', 'GROQ_API_KEY']) {
    if (saved[key] === undefined) delete process.env[key]
    else process.env[key] = saved[key]
  }
})

async function call(path, { method = 'GET', body } = {}) {
  const res = await realFetch(`${baseUrl}/api/jarvis${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  return { status: res.status, body: await res.json().catch(() => null) }
}

async function newConversation(mode = 'general') {
  const r = await call('/conversations', { method: 'POST', body: { mode } })
  assert.equal(r.status, 201)
  return r.body.id
}

const send = (id, content, extra = {}) =>
  call(`/conversations/${id}/messages`, { method: 'POST', body: { content, ...extra } })

test('chat works with ZERO Notebook rows: prompt is just the persona, reply and usage are stored', async () => {
  const noRows = await pool.query('SELECT count(*) FROM jarvis_knowledge WHERE owner_user_id = $1', [ownerId])
  assert.equal(noRows.rows[0].count, '0')

  const id = await newConversation('general')
  const res = await send(id, 'hello there')

  assert.equal(res.status, 201)
  assert.equal(res.body.assistantMessage.content, 'Stub reply')
  assert.equal(groqCalls.length, 1)
  assert.equal(groqCalls[0].messages[0].role, 'system')
  assert.equal(groqCalls[0].messages[0].content, AREAS.general.persona)
  assert.equal(groqCalls[0].messages.at(-1).content, 'hello there')
})

test('existing memory behaviour is intact: remembered facts are injected, oldest first, in the legacy format', async () => {
  await pool.query(
    `INSERT INTO jarvis_memory (family_member_id, content, updated_at)
     VALUES ($1, 'Fact from long ago', now() - interval '2 days'),
            ($1, 'Fact from yesterday', now() - interval '1 day')`,
    [ownerId],
  )
  const id = await newConversation('general')
  await send(id, 'hi')

  assert.equal(
    groqCalls[0].messages[0].content,
    `${AREAS.general.persona}\n\nWhat you remember about this person from past conversations:\n- Fact from long ago\n- Fact from yesterday`,
  )
  // remember_fact is still offered as a tool.
  assert.equal(groqCalls[0].tools[0].function.name, 'remember_fact')
  await pool.query('DELETE FROM jarvis_memory WHERE family_member_id = $1', [ownerId])
})

test('each area gets its own persona', async () => {
  for (const mode of ['news', 'style']) {
    groqCalls.length = 0
    const id = await newConversation(mode)
    await send(id, 'hi')
    assert.equal(groqCalls[0].messages[0].content, AREAS[mode].persona)
  }
})

test('News web search: routes/jarvis.js wires Groq browser_search + the gpt-oss-20b model through end to end, and it is recorded in jarvis_usage', async () => {
  const id = await newConversation('news')
  const res = await send(id, "what's happening right now")
  assert.equal(res.status, 201)

  assert.equal(groqCalls[0].model, 'openai/gpt-oss-20b')
  const types = groqCalls[0].tools.map((t) => t.type)
  assert.ok(types.includes('browser_search'), 'browser_search reached the actual Groq request')
  assert.ok(types.includes('function') && groqCalls[0].tools.find((t) => t.type === 'function').function.name === 'remember_fact', 'remember_fact is still offered alongside it')

  const usageRow = (await pool.query('SELECT provider, model, area FROM jarvis_usage WHERE conversation_id = $1', [id])).rows[0]
  assert.equal(usageRow.provider, 'groq')
  assert.equal(usageRow.model, 'openai/gpt-oss-20b', 'the model actually used is recorded, not the provider default')
  assert.equal(usageRow.area, 'news')
})

test('General and Style also get browser_search end to end, but on the DEFAULT model (News alone stays on gpt-oss-20b)', async () => {
  for (const mode of ['general', 'style']) {
    groqCalls.length = 0
    const id = await newConversation(mode)
    const res = await send(id, 'hi')
    assert.equal(res.status, 201)

    assert.notEqual(groqCalls[0].model, 'openai/gpt-oss-20b', `${mode} must not switch to News's model`)
    assert.ok(groqCalls[0].tools.some((t) => t.type === 'browser_search'), `${mode} must offer browser_search`)
    assert.ok(groqCalls[0].tools.some((t) => t.type === 'function' && t.function.name === 'remember_fact'), `${mode} still offers remember_fact`)

    const usageRow = (await pool.query('SELECT model FROM jarvis_usage WHERE conversation_id = $1', [id])).rows[0]
    assert.notEqual(usageRow.model, 'openai/gpt-oss-20b', mode)
  }
})

test('Style Notebook context still reaches Style prompts, and is still invisible to General/News, even though all three now share the search tool', async () => {
  await pool.query(
    `INSERT INTO jarvis_knowledge (owner_user_id, area, section, kind, entry_key, title, body, token_estimate, source_ref)
     VALUES ($1, 'style', 'physical-profile', 'core', 'test-marker', 'Physical profile', 'STYLEMARKER synthetic test fact', 10, 'test')`,
    [ownerId],
  )
  try {
    for (const [mode, shouldSee] of [['style', true], ['general', false], ['news', false]]) {
      groqCalls.length = 0
      const id = await newConversation(mode)
      await send(id, 'hi')
      const sawIt = groqCalls[0].messages[0].content.includes('STYLEMARKER')
      assert.equal(sawIt, shouldSee, mode)
    }
  } finally {
    await pool.query(`DELETE FROM jarvis_knowledge WHERE owner_user_id = $1 AND entry_key = 'test-marker'`, [ownerId])
  }
})

test('usage is recorded as counts only, with no conversation content', async () => {
  const id = await newConversation('general')
  await send(id, 'a message whose text must never be stored in usage')

  const rows = await pool.query('SELECT * FROM jarvis_usage WHERE conversation_id = $1', [id])
  assert.equal(rows.rowCount, 1)
  const u = rows.rows[0]
  assert.equal(u.provider, 'groq')
  assert.equal(u.area, 'general')
  assert.equal(u.actual_prompt_tokens, 111)
  assert.equal(u.actual_completion_tokens, 22)
  assert.equal(u.actual_total_tokens, 133)
  assert.ok(u.estimated_prompt_tokens > 0)
  assert.doesNotMatch(JSON.stringify(u), /must never be stored/)
  assert.doesNotMatch(JSON.stringify(u), /Stub reply/)
})

test('history sent to the model is bounded, starts with a user turn, and ends with the new message', async () => {
  const id = await newConversation('general')
  // 80 stored messages (alternating), oldest first, each fairly long.
  await pool.query(
    `INSERT INTO jarvis_messages (conversation_id, role, content, created_at)
     SELECT $1, CASE WHEN g % 2 = 1 THEN 'user' ELSE 'assistant' END,
            'message ' || g || ' ' || repeat('w', 400),
            now() - ((100 - g) || ' minutes')::interval
       FROM generate_series(1, 80) g`,
    [id],
  )
  const res = await send(id, 'the newest question')
  assert.equal(res.status, 201)

  const sent = groqCalls[0].messages
  const history = sent.slice(1) // after the system prompt
  assert.ok(history.length < 81, 'nowhere near all 81 stored messages are sent')
  assert.ok(history.length <= DEFAULT_BUDGETS.maxHistoryMessages)
  assert.equal(history[0].role, 'user')
  assert.equal(history.at(-1).content, 'the newest question')
  const historyTokens = history.reduce((n, m) => n + estimateTokens(m.content), 0)
  assert.ok(historyTokens <= DEFAULT_BUDGETS.historyTokens + estimateTokens('the newest question'))

  // Everything is still stored and visible.
  const all = await call(`/conversations/${id}/messages`)
  assert.equal(all.body.length, 82)
})

test('an over-long message is rejected with a clear error and nothing is stored', async () => {
  const id = await newConversation('general')
  const res = await send(id, 'x'.repeat(DEFAULT_BUDGETS.maxUserMessageChars + 1))
  assert.equal(res.status, 400)
  assert.match(res.body.error, /too long/)
  assert.equal(groqCalls.length, 0)
  const stored = await pool.query('SELECT count(*) FROM jarvis_messages WHERE conversation_id = $1', [id])
  assert.equal(stored.rows[0].count, '0')

  // Exactly at the cap is fine.
  const ok = await send(id, 'x'.repeat(DEFAULT_BUDGETS.maxUserMessageChars))
  assert.equal(ok.status, 201)
})

test('channel must be text or voice (default text)', async () => {
  const id = await newConversation('general')
  assert.equal((await send(id, 'hi', { channel: 'carrier-pigeon' })).status, 400)
  assert.equal((await send(id, 'hi', { channel: 'voice' })).status, 201)
  assert.equal((await send(id, 'hi again')).status, 201)
})

test('a conversation whose mode is no longer in the registry fails cleanly instead of crashing', async () => {
  const c = await pool.query(
    `INSERT INTO jarvis_conversations (family_member_id, mode) VALUES ($1, 'retired-area') RETURNING id`,
    [ownerId],
  )
  const res = await send(c.rows[0].id, 'hello')
  assert.equal(res.status, 400)
  assert.match(res.body.error, /no longer available/)
})

test('creating a conversation still validates the mode against the registry', async () => {
  const res = await call('/conversations', { method: 'POST', body: { mode: 'not-an-area' } })
  assert.equal(res.status, 400)
  assert.match(res.body.error, /mode must be one of: general, news, style/)
})

test('the Notebook is read-only through the API: there is no route that writes or reads knowledge', async () => {
  for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) {
    for (const path of ['/knowledge', '/knowledge/abc', '/notebook', '/usage']) {
      const res = await realFetch(`${baseUrl}/api/jarvis${path}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: method === 'GET' ? undefined : '{}',
      })
      assert.equal(res.status, 404, `${method} ${path}`)
    }
  }
})

test('missing provider key still degrades to a 503 after validation, and stores nothing', async () => {
  delete process.env.GROQ_API_KEY
  const id = await newConversation('general')
  const res = await send(id, 'hello')
  assert.equal(res.status, 503)
  assert.match(res.body.error, /not configured/)
  const stored = await pool.query('SELECT count(*) FROM jarvis_messages WHERE conversation_id = $1', [id])
  assert.equal(stored.rows[0].count, '0')
})
