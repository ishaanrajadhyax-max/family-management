// Notebook retrieval + chat integration. Synthetic rows only. Covers owner
// and area isolation (enforced in SQL), always-on layers, FTS relevance and
// ranking, budgets, graceful degradation, and the memory/Notebook split.
// Needs local Postgres with migration 005; Groq is stubbed (no real API).
import { test, before, after, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import express from 'express'
import { fileURLToPath } from 'node:url'
import { pool } from '../db.js'
import jarvisRouter from '../routes/jarvis.js'
import { loadKnowledge } from '../jarvis/knowledge/loadKnowledge.js'
import { extractTerms, aliasCandidates } from '../jarvis/knowledge/retrieve.js'
import { executeTool } from '../jarvis/toolExecutor.js'
import { DEFAULT_BUDGETS, resolveBudgets, estimateTokens } from '../jarvis/budgets.js'
import { AREAS } from '../jarvis/areas.js'

const RUN_ID = Date.now().toString(36)
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
const HERE = path.dirname(fileURLToPath(import.meta.url))

let owner
let other
let server
let baseUrl
let realFetch
let groqCalls
const saved = {}

async function put(ownerId, area, section, kind, key, body, { title = '', aliases = [], keywords = '', date = null, tokens } = {}) {
  await pool.query(
    `INSERT INTO jarvis_knowledge
       (owner_user_id, area, section, kind, entry_key, title, body, aliases, keywords, entry_date, source_ref, token_estimate)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [ownerId, area, section, kind, key, title, body, aliases, keywords, date, `fixture#${key}`, tokens ?? estimateTokens(`${title}: ${body}`)],
  )
}
const clear = () => pool.query('DELETE FROM jarvis_knowledge WHERE owner_user_id = ANY($1)', [[owner, other]])
const allText = (layers) => JSON.stringify(layers)

before(async () => {
  const mk = async (tag) =>
    (
      await pool.query(
        `INSERT INTO family_members (name, username, role, is_active) VALUES ($1, $2, 'dad', true) RETURNING id`,
        [`Test retrieval ${tag}`, `test_retr_${tag}_${RUN_ID}`],
      )
    ).rows[0].id
  owner = await mk('a')
  other = await mk('b')

  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => {
    req.user = { id: owner, role: 'dad' }
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
  await pool.query('DELETE FROM family_members WHERE id = ANY($1)', [[owner, other]])
  await pool.end()
})

beforeEach(async () => {
  await clear()
  for (const key of ['LLM_PROVIDER', 'GROQ_API_KEY']) saved[key] = process.env[key]
  process.env.LLM_PROVIDER = 'groq'
  process.env.GROQ_API_KEY = 'test-key'
  groqCalls = []
  globalThis.fetch = async (url, options) => {
    if (String(url) !== GROQ_URL) return realFetch(url, options)
    groqCalls.push(JSON.parse(options.body))
    return {
      ok: true,
      status: 200,
      json: async () => ({
        usage: { prompt_tokens: 50, completion_tokens: 5, total_tokens: 55 },
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

async function chat(mode, content) {
  const c = await realFetch(`${baseUrl}/api/jarvis/conversations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode }),
  }).then((r) => r.json())
  const res = await realFetch(`${baseUrl}/api/jarvis/conversations/${c.id}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  })
  return { status: res.status, conversationId: c.id, body: await res.json() }
}

test('term extraction drops filler words; alias candidates are lowercase words and phrases', () => {
  assert.deepEqual(extractTerms('What is the price of Zorblax jackets?'), ['price', 'zorblax', 'jackets'])
  assert.deepEqual(extractTerms('the and of'), [])
  assert.ok(aliasCandidates('Quux Jacket now').includes('quux jacket'))
})

test('empty Notebook: every layer is empty and nothing throws', async () => {
  const k = await loadKnowledge({ ownerId: owner, areaId: 'style', queryText: 'what jacket should I wear' })
  for (const layer of Object.values(k)) assert.deepEqual(layer, [])
})

test('always-on: global rules, voice rules, global core, and the area\'s own rules + core are loaded without any query match', async () => {
  await put(owner, 'global', 'rules', 'rules', 'g-rule', 'GLOBALRULE text')
  await put(owner, 'global', 'voice', 'rules', 'g-voice', 'VOICERULE text')
  await put(owner, 'global', 'core', 'core', 'g-core', 'GLOBALCORE text')
  await put(owner, 'style', 'rules', 'rules', 's-rule', 'STYLERULE text')
  await put(owner, 'style', 'budget', 'core', 's-core', 'STYLECORE text')
  await put(owner, 'style', 'physical-profile', 'core', 's-phys', 'STYLEPHYS text')

  const k = await loadKnowledge({ ownerId: owner, areaId: 'style', queryText: 'zzz unrelated words' })
  assert.deepEqual(k.globalRules.map((i) => i.entryKey), ['g-rule'])
  assert.deepEqual(k.voiceRules.map((i) => i.entryKey), ['g-voice'])
  assert.deepEqual(k.globalCore.map((i) => i.entryKey), ['g-core'])
  assert.deepEqual(k.areaRules.map((i) => i.entryKey), ['s-rule'])
  assert.deepEqual(k.areaCore.map((i) => i.entryKey).sort(), ['s-core', 's-phys'])
  assert.deepEqual(k.entries, [])
})

test('always-on rules/core are not "search results": a retrieve-tier section entry is never returned as always-on', async () => {
  await put(owner, 'style', 'wardrobe', 'entry', 'w1', 'WARDROBE text')
  const k = await loadKnowledge({ ownerId: owner, areaId: 'style', queryText: 'zzz nothing' })
  assert.equal(allText(k).includes('WARDROBE'), false)
})

test('area isolation: Style content NEVER reaches General or News — not always-on, not retrieved', async () => {
  await put(owner, 'style', 'rules', 'rules', 's-rule', 'STYLELEAK rule')
  await put(owner, 'style', 'physical-profile', 'core', 's-phys', 'STYLELEAK physical profile 180cm')
  await put(owner, 'style', 'budget', 'core', 's-bud', 'STYLELEAK budget')
  await put(owner, 'style', 'wardrobe', 'entry', 's-w', 'STYLELEAK jacket profile physical', { title: 'jacket', aliases: ['jacket'] })

  for (const areaId of ['general', 'news']) {
    const k = await loadKnowledge({ ownerId: owner, areaId, queryText: 'jacket physical profile budget rule STYLELEAK' })
    assert.equal(allText(k).includes('STYLELEAK'), false, `${areaId} must not see Style rows`)
  }
  // ...and the same holds end-to-end: the text sent to the model.
  for (const mode of ['general', 'news']) {
    groqCalls.length = 0
    const r = await chat(mode, 'jacket physical profile budget rule 180cm')
    assert.equal(r.status, 201)
    assert.equal(JSON.stringify(groqCalls[0]).includes('STYLELEAK'), false, `${mode} prompt must not contain Style rows`)
  }
  // Sanity: Style itself does see them.
  const own = await loadKnowledge({ ownerId: owner, areaId: 'style', queryText: 'jacket' })
  assert.ok(allText(own).includes('STYLELEAK'))
})

test('area isolation: Style entries ranked for a News query do not appear, and News entries do not appear in Style', async () => {
  await put(owner, 'news', 'threads', 'entry', 'n1', 'NEWSROW semiconductors tariff thread', { title: 'Tariffs' })
  await put(owner, 'style', 'wardrobe', 'entry', 's1', 'STYLEROW tariff-proof denim', { title: 'Denim' })
  const news = await loadKnowledge({ ownerId: owner, areaId: 'news', queryText: 'tariff' })
  assert.deepEqual(news.entries.map((e) => e.entryKey), ['n1'])
  const style = await loadKnowledge({ ownerId: owner, areaId: 'style', queryText: 'tariff' })
  assert.deepEqual(style.entries.map((e) => e.entryKey), ['s1'])
})

test('owner isolation is in the SQL: another user\'s rows never come back, in any layer', async () => {
  for (const [area, section, kind] of [
    ['global', 'rules', 'rules'],
    ['global', 'core', 'core'],
    ['style', 'rules', 'rules'],
    ['style', 'budget', 'core'],
    ['style', 'wardrobe', 'entry'],
  ]) {
    await put(other, area, section, kind, `x-${section}`, 'OTHERUSER secret jacket wardrobe', { title: 'jacket', aliases: ['jacket'] })
  }
  const k = await loadKnowledge({ ownerId: owner, areaId: 'style', queryText: 'jacket wardrobe secret' })
  assert.equal(allText(k).includes('OTHERUSER'), false)
  for (const layer of Object.values(k)) assert.deepEqual(layer, [])

  // The owner filter is also present in the query text itself (not only JS-side).
  const src = fs.readFileSync(path.join(HERE, '..', 'jarvis', 'knowledge', 'retrieve.js'), 'utf8')
  assert.equal((src.match(/owner_user_id = \$1/g) ?? []).length, 2, 'both queries filter by owner in SQL')
})

test('relevant entries are retrieved (body, title, keywords and alias matches); irrelevant ones are excluded', async () => {
  await put(owner, 'style', 'wardrobe', 'entry', 'body-match', 'A teal blazer for winter', { title: 'Blazer one' })
  await put(owner, 'style', 'wardrobe', 'entry', 'kw-match', 'plain text', { title: 'Coat', keywords: 'overcoat parka' })
  await put(owner, 'style', 'wardrobe', 'entry', 'alias-match', 'plain text two', { title: 'Nickname piece', aliases: ['zorblax'] })
  await put(owner, 'style', 'wardrobe', 'entry', 'irrelevant', 'Running shoes, red laces', { title: 'Sneakers' })

  const keys = async (q) => (await loadKnowledge({ ownerId: owner, areaId: 'style', queryText: q })).entries.map((e) => e.entryKey)
  assert.deepEqual(await keys('do I own a blazer?'), ['body-match'])
  assert.deepEqual(await keys('any overcoat options'), ['kw-match'])
  assert.deepEqual(await keys('what about Zorblax'), ['alias-match'])
  assert.deepEqual(await keys('quantum chromodynamics'), [])
  const many = await keys('blazer overcoat zorblax')
  assert.ok(!many.includes('irrelevant'))
  assert.equal(many.length, 3)
})

test('the previous user message contributes to retrieval (follow-up questions)', async () => {
  await put(owner, 'news', 'watchlist', 'entry', 'w', 'Tracking Quuxcorp closely', { title: 'Quuxcorp' })
  const alone = await loadKnowledge({ ownerId: owner, areaId: 'news', queryText: 'and what changed since then?' })
  assert.deepEqual(alone.entries, [])
  const withPrev = await loadKnowledge({
    ownerId: owner,
    areaId: 'news',
    queryText: 'and what changed since then?',
    previousQueryText: 'tell me about Quuxcorp',
  })
  assert.deepEqual(withPrev.entries.map((e) => e.entryKey), ['w'])
})

test('ranking: title beats body; current message beats previous; exact alias boosts; ties break on newer entry_date', async () => {
  await put(owner, 'news', 'threads', 'entry', 'body-only', 'we discussed frobnicate at length', { title: 'Other topic' })
  await put(owner, 'news', 'threads', 'entry', 'title-hit', 'short note', { title: 'Frobnicate' })
  let k = await loadKnowledge({ ownerId: owner, areaId: 'news', queryText: 'frobnicate' })
  assert.deepEqual(k.entries.map((e) => e.entryKey), ['title-hit', 'body-only'])
  assert.ok(k.entries[0].rank > k.entries[1].rank)

  await clear()
  await put(owner, 'news', 'threads', 'entry', 'cur', 'zeta zeta', { title: 'T1' })
  await put(owner, 'news', 'threads', 'entry', 'prev', 'omega omega', { title: 'T2' })
  k = await loadKnowledge({ ownerId: owner, areaId: 'news', queryText: 'zeta', previousQueryText: 'omega' })
  assert.deepEqual(k.entries.map((e) => e.entryKey), ['cur', 'prev'])

  await clear()
  await put(owner, 'news', 'watchlist', 'entry', 'plain', 'gadget notes here', { title: 'Gadget' })
  await put(owner, 'news', 'watchlist', 'entry', 'aliased', 'unrelated words', { title: 'Something', aliases: ['gadget'] })
  k = await loadKnowledge({ ownerId: owner, areaId: 'news', queryText: 'gadget' })
  assert.equal(k.entries.length, 2)

  await clear()
  await put(owner, 'news', 'scoreboard', 'entry', 'older', 'plover', { date: '2025-01-01' })
  await put(owner, 'news', 'scoreboard', 'entry', 'newer', 'plover', { date: '2026-01-01' })
  k = await loadKnowledge({ ownerId: owner, areaId: 'news', queryText: 'plover' })
  assert.deepEqual(k.entries.map((e) => e.entryKey), ['newer', 'older'])
})

test('returned entries keep title, body, section, source_ref, snapshot_at and rank', async () => {
  await put(owner, 'news', 'threads', 'entry', 'meta', 'metadata check zanzibar', { title: 'Meta title' })
  const [e] = (await loadKnowledge({ ownerId: owner, areaId: 'news', queryText: 'zanzibar' })).entries
  assert.equal(e.title, 'Meta title')
  assert.match(e.body, /zanzibar/)
  assert.equal(e.section, 'threads')
  assert.equal(e.sourceRef, 'fixture#meta')
  assert.ok(e.snapshotAt instanceof Date)
  assert.equal(typeof e.rank, 'number')
})

test('max entries: never more than maxRetrievedEntries, even with many matches', async () => {
  for (let i = 0; i < 20; i++) await put(owner, 'news', 'threads', 'entry', `m${i}`, `marker${i} common-term`, { title: `T${i}` })
  const k = await loadKnowledge({ ownerId: owner, areaId: 'news', queryText: 'common-term' })
  assert.equal(k.entries.length, DEFAULT_BUDGETS.maxRetrievedEntries)
})

test('knowledge budget: total retrieved tokens stay within budget; an oversize entry is skipped so a smaller one still fits', async () => {
  const budget = resolveBudgets(AREAS.news.budget)
  const overhead = budget.entryLabelOverheadTokens
  // Three entries of ~500 tokens each: only two fit in 1500 once overhead counts.
  for (let i = 0; i < 3; i++) {
    await put(owner, 'news', 'threads', 'entry', `big${i}`, `budgetword ${'x'.repeat(10)}`, { title: `Big ${i}`, tokens: 560 - i })
  }
  const k = await loadKnowledge({ ownerId: owner, areaId: 'news', queryText: 'budgetword' })
  const used = k.entries.reduce((n, e) => n + e.tokenEstimate + overhead, 0)
  assert.ok(used <= budget.knowledgeTokens, `${used} <= ${budget.knowledgeTokens}`)
  assert.equal(k.entries.length, 2)

  await put(owner, 'news', 'threads', 'entry', 'small', 'budgetword budgetword budgetword', { title: 'Small', tokens: 20 })
  const k2 = await loadKnowledge({ ownerId: owner, areaId: 'news', queryText: 'budgetword' })
  assert.ok(k2.entries.some((e) => e.entryKey === 'small'), 'a smaller lower-ranked entry still fills the leftover budget')
  assert.ok(k2.entries.reduce((n, e) => n + e.tokenEstimate + overhead, 0) <= budget.knowledgeTokens)
})

test('retrieval failure degrades: chat continues, empty layers, and the log carries NO Notebook/query text', async () => {
  const warnings = []
  const origWarn = console.warn
  console.warn = (...args) => warnings.push(args.join(' '))
  try {
    const failing = {
      query: async () => {
        const e = new Error('relation "jarvis_knowledge" does not exist: SECRETBODY zorblax')
        e.code = '42P01'
        throw e
      },
    }
    const k = await loadKnowledge({ ownerId: owner, areaId: 'style', queryText: 'SECRETQUERY jacket', db: failing })
    for (const layer of Object.values(k)) assert.deepEqual(layer, [])
    assert.ok(warnings.length >= 1)
    const logged = warnings.join('\n')
    assert.match(logged, /42P01/)
    assert.doesNotMatch(logged, /SECRETBODY|SECRETQUERY|zorblax|jacket/)
  } finally {
    console.warn = origWarn
  }

  // End to end: every query touching the Notebook table fails, chat still answers, persona-only
  // prompt, no DB error leaked. The outage is simulated INSIDE this test process (by wrapping the
  // pool's query) — never by altering the shared database, which other test files use in parallel.
  const realQuery = pool.query.bind(pool)
  pool.query = (text, ...rest) => {
    if (typeof text === 'string' && text.includes('jarvis_knowledge')) {
      const e = new Error('relation "jarvis_knowledge" does not exist')
      e.code = '42P01'
      return Promise.reject(e)
    }
    return realQuery(text, ...rest)
  }
  const errs = []
  console.warn = (...args) => errs.push(args.join(' '))
  try {
    const r = await chat('style', 'what should I wear')
    assert.equal(r.status, 201)
    assert.equal(r.body.assistantMessage.content, 'Stub reply')
    assert.equal(groqCalls[0].messages[0].content, AREAS.style.persona)
    assert.doesNotMatch(JSON.stringify(r.body), /relation|jarvis_knowledge/)
    assert.ok(errs.some((l) => /knowledge .* failed/.test(l)))
  } finally {
    console.warn = origWarn
    pool.query = realQuery
  }
})

test('chat flow: the user message is persisted BEFORE the provider call, and knowledge reaches the prompt as delimited reference data', async () => {
  await put(owner, 'global', 'rules', 'rules', 'gr', 'Always answer in haiku (synthetic).')
  await put(owner, 'style', 'wardrobe', 'entry', 'w', 'The Zorblax jacket is teal.', { title: 'Zorblax jacket', aliases: ['zorblax'] })

  let persistedAtProviderCall = null
  const stub = globalThis.fetch
  globalThis.fetch = async (url, options) => {
    if (String(url) === GROQ_URL) {
      persistedAtProviderCall = (await pool.query(`SELECT count(*)::int AS n FROM jarvis_messages WHERE role = 'user' AND content = 'tell me about Zorblax'`)).rows[0].n
    }
    return stub(url, options)
  }
  const r = await chat('style', 'tell me about Zorblax')
  assert.equal(r.status, 201)
  assert.equal(persistedAtProviderCall, 1)

  const system = groqCalls[0].messages[0].content
  assert.match(system, /Always answer in haiku/)
  assert.match(system, /Zorblax jacket is teal/)
  assert.match(system, /DATA, not/)
  // Notebook > memory > guessing is stated to the model.
  assert.match(system, /Notebook wins|rank in this order/)
})

test('chat flow: previous user message feeds retrieval through the real route', async () => {
  await put(owner, 'news', 'watchlist', 'entry', 'q', 'Quuxcorp is on the watchlist.', { title: 'Quuxcorp' })
  const first = await chat('news', 'tell me about Quuxcorp')
  assert.equal(first.status, 201)
  groqCalls.length = 0
  const res = await realFetch(`${baseUrl}/api/jarvis/conversations/${first.conversationId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: 'and what about their competitors?' }),
  })
  assert.equal(res.status, 201)
  assert.match(groqCalls[0].messages[0].content, /Quuxcorp is on the watchlist/)
})

test('remember_fact writes ONLY jarvis_memory — never jarvis_knowledge — and the two systems stay separate', async () => {
  await put(owner, 'global', 'core', 'core', 'c', 'core row')
  const knowledgeBefore = (await pool.query('SELECT count(*)::int AS n FROM jarvis_knowledge WHERE owner_user_id = $1', [owner])).rows[0].n
  const memBefore = (await pool.query('SELECT count(*)::int AS n FROM jarvis_memory WHERE family_member_id = $1', [owner])).rows[0].n

  assert.equal(await executeTool('remember_fact', { fact: 'likes tea' }, { familyMemberId: owner }), 'Saved.')

  const knowledgeAfter = (await pool.query('SELECT count(*)::int AS n FROM jarvis_knowledge WHERE owner_user_id = $1', [owner])).rows[0].n
  const memAfter = (await pool.query('SELECT count(*)::int AS n FROM jarvis_memory WHERE family_member_id = $1', [owner])).rows[0].n
  assert.equal(knowledgeAfter, knowledgeBefore)
  assert.equal(memAfter, memBefore + 1)
  await pool.query('DELETE FROM jarvis_memory WHERE family_member_id = $1', [owner])

  // Static guard: no tool/provider/route code path can write the Notebook.
  const root = path.join(HERE, '..')
  for (const file of ['jarvis/toolExecutor.js', 'jarvis/providers/groq.js', 'jarvis/providers/anthropic.js', 'jarvis/llmProvider.js', 'routes/jarvis.js']) {
    const src = fs.readFileSync(path.join(root, file), 'utf8')
    assert.doesNotMatch(src, /jarvis_knowledge/, `${file} must not touch jarvis_knowledge`)
  }
  // The retrieval module only ever reads.
  const retrieveSrc = fs.readFileSync(path.join(root, 'jarvis/knowledge/retrieve.js'), 'utf8')
  assert.doesNotMatch(retrieveSrc, /\b(INSERT|UPDATE|DELETE)\b\s+(INTO|FROM)?\s*jarvis_knowledge/i)
})

test('memory still works alongside the Notebook and sits below it in the prompt', async () => {
  await put(owner, 'global', 'core', 'core', 'c', 'CORE fact about the user')
  await pool.query(`INSERT INTO jarvis_memory (family_member_id, content) VALUES ($1, 'MEMFACT remembered')`, [owner])
  await chat('general', 'hello')
  const system = groqCalls[0].messages[0].content
  assert.ok(system.indexOf('CORE fact') < system.indexOf('MEMFACT'))
  await pool.query('DELETE FROM jarvis_memory WHERE family_member_id = $1', [owner])
})

test('usage rows hold counts only: no Notebook text, memory text, or message text', async () => {
  await put(owner, 'global', 'rules', 'rules', 'gr', 'NOTEBOOKSECRET rule text')
  await put(owner, 'style', 'wardrobe', 'entry', 'w', 'NOTEBOOKSECRET wardrobe body', { title: 'NOTEBOOKSECRET title', aliases: ['notebooksecret'] })
  await pool.query(`INSERT INTO jarvis_memory (family_member_id, content) VALUES ($1, 'MEMORYSECRET fact')`, [owner])
  const r = await chat('style', 'USERSECRET notebooksecret question')
  assert.equal(r.status, 201)
  assert.match(groqCalls[0].messages[0].content, /NOTEBOOKSECRET/) // it really was in the prompt

  const rows = await pool.query('SELECT * FROM jarvis_usage WHERE conversation_id = $1', [r.conversationId])
  assert.equal(rows.rowCount, 1)
  const dump = JSON.stringify(rows.rows)
  assert.doesNotMatch(dump, /NOTEBOOKSECRET|MEMORYSECRET|USERSECRET|Stub reply/)
  assert.ok(rows.rows[0].estimated_prompt_tokens > 0)
  await pool.query('DELETE FROM jarvis_memory WHERE family_member_id = $1', [owner])
})

test('the API exposes no Notebook route', async () => {
  for (const p of ['/knowledge', '/notebook', '/knowledge/import']) {
    for (const method of ['GET', 'POST', 'PUT', 'DELETE']) {
      const res = await realFetch(`${baseUrl}/api/jarvis${p}`, { method, headers: { 'Content-Type': 'application/json' }, body: method === 'GET' ? undefined : '{}' })
      assert.equal(res.status, 404)
    }
  }
})

test('hostile query text cannot break retrieval (tsquery syntax, quotes, SQL fragments)', async () => {
  await put(owner, 'news', 'threads', 'entry', 'n', 'ordinary thread about widgets', { title: 'Widgets' })
  for (const q of [`widgets' OR 1=1 --`, '"unbalanced quote widgets', 'widgets & | ! ( ) :*', '); DROP TABLE jarvis_knowledge; --']) {
    const k = await loadKnowledge({ ownerId: owner, areaId: 'news', queryText: q })
    assert.ok(Array.isArray(k.entries))
  }
  const still = await pool.query('SELECT count(*)::int AS n FROM jarvis_knowledge WHERE owner_user_id = $1', [owner])
  assert.equal(still.rows[0].n, 1)
})

test('area filter holds on its own: a row in ANOTHER area with a colliding section name is still never returned', async () => {
  // Section names differ per area today, so the section filter alone would hide this row.
  // The database doesn't forbid it, so the area filter must independently keep it out.
  await put(owner, 'style', 'threads', 'entry', 'collide', 'COLLIDE collisionword', { title: 'collisionword' })
  await put(owner, 'news', 'threads', 'entry', 'own', 'own collisionword', { title: 'collisionword' })
  const k = await loadKnowledge({ ownerId: owner, areaId: 'news', queryText: 'collisionword' })
  assert.deepEqual(k.entries.map((e) => e.entryKey), ['own'])
})
