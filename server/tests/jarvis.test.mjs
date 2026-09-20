// Integration tests for the Jarvis routes. Same conventions as
// admin-users.test.mjs: Node's built-in test runner, throwaway
// test_-prefixed fixtures cleaned up in `after`, requires a local dev
// server on http://localhost:4000 pointed at the LOCAL database.
//
// These deliberately don't require ANTHROPIC_API_KEY to be set — the
// "send a message with no key configured" test is exactly the graceful
// 503 path that must keep working whether or not a key is present, and
// everything else here (modes, conversation CRUD, ownership scoping) is
// independent of the LLM call itself.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { pool } from '../db.js'
import { hashPassword } from '../auth/hash.js'

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:4000'
const TEST_PASSWORD = 'TestPass123'
const RUN_ID = Date.now().toString(36)

const fixtureIds = []

function cookieHeaderFrom(response) {
  const cookies = typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : []
  const tokenCookie = cookies.find((c) => c.startsWith('token='))
  if (!tokenCookie) throw new Error('Login response had no token cookie')
  return tokenCookie.split(';')[0]
}

async function api(path, { method = 'GET', cookie, body } = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await response.json().catch(() => null)
  return { status: response.status, body: json }
}

async function loginAs(username, password) {
  const response = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  assert.equal(response.status, 200, `login as ${username} should succeed`)
  return cookieHeaderFrom(response)
}

async function createFixture(role, usernameSuffix) {
  const username = `test_${usernameSuffix}_${RUN_ID}`
  const passwordHash = await hashPassword(TEST_PASSWORD)
  const result = await pool.query(
    `INSERT INTO family_members (name, username, role, password_hash, is_active)
     VALUES ($1, $2, $3, $4, true) RETURNING id`,
    [`Test ${usernameSuffix}`, username, role, passwordHash],
  )
  const id = result.rows[0].id
  fixtureIds.push(id)
  return { id, username, password: TEST_PASSWORD }
}

let dadFixture
let otherFixture
let dadCookie
let otherCookie

before(async () => {
  dadFixture = await createFixture('dad', 'jarvis_dad')
  otherFixture = await createFixture('mom', 'jarvis_other')
  dadCookie = await loginAs(dadFixture.username, dadFixture.password)
  otherCookie = await loginAs(otherFixture.username, otherFixture.password)
})

after(async () => {
  if (fixtureIds.length > 0) {
    // ON DELETE CASCADE takes jarvis_conversations/jarvis_messages with it.
    await pool.query('DELETE FROM family_members WHERE id = ANY($1::uuid[])', [fixtureIds])
  }
  await pool.end()
})

test('unauthenticated request is rejected', async () => {
  const { status } = await api('/api/jarvis/conversations')
  assert.equal(status, 401)
})

test('modes lists exactly general/news/style', async () => {
  const { status, body } = await api('/api/jarvis/modes', { cookie: dadCookie })
  assert.equal(status, 200)
  assert.deepEqual(
    body.map((m) => m.id).sort(),
    ['general', 'news', 'style'],
  )
})

test('a fresh account has no conversations yet', async () => {
  const { status, body } = await api('/api/jarvis/conversations', { cookie: dadCookie })
  assert.equal(status, 200)
  assert.equal(body.length, 0)
})

test('creating a conversation rejects an invalid mode', async () => {
  const { status, body } = await api('/api/jarvis/conversations', {
    method: 'POST',
    cookie: dadCookie,
    body: { mode: 'not-a-real-mode' },
  })
  assert.equal(status, 400)
  assert.match(body.error, /mode must be one of/)
})

test('can create a conversation and it appears in the list', async () => {
  const created = await api('/api/jarvis/conversations', {
    method: 'POST',
    cookie: dadCookie,
    body: { mode: 'style' },
  })
  assert.equal(created.status, 201)
  assert.equal(created.body.mode, 'style')

  const list = await api('/api/jarvis/conversations', { cookie: dadCookie })
  assert.equal(list.status, 200)
  assert.ok(list.body.some((c) => c.id === created.body.id))
})

test("one person's conversations are invisible to another person", async () => {
  const created = await api('/api/jarvis/conversations', {
    method: 'POST',
    cookie: dadCookie,
    body: { mode: 'general' },
  })

  const otherList = await api('/api/jarvis/conversations', { cookie: otherCookie })
  assert.ok(!otherList.body.some((c) => c.id === created.body.id))

  const otherMessages = await api(`/api/jarvis/conversations/${created.body.id}/messages`, {
    cookie: otherCookie,
  })
  assert.equal(otherMessages.status, 403)
})

test('messages on a nonexistent conversation return 404', async () => {
  const { status } = await api('/api/jarvis/conversations/00000000-0000-0000-0000-000000000000/messages', {
    cookie: dadCookie,
  })
  assert.equal(status, 404)
})

test('sending an empty message is rejected', async () => {
  const created = await api('/api/jarvis/conversations', {
    method: 'POST',
    cookie: dadCookie,
    body: { mode: 'general' },
  })
  const { status, body } = await api(`/api/jarvis/conversations/${created.body.id}/messages`, {
    method: 'POST',
    cookie: dadCookie,
    body: { content: '   ' },
  })
  assert.equal(status, 400)
  assert.match(body.error, /content is required/)
})

test('sending a message without ANTHROPIC_API_KEY configured fails gracefully with 503, not a crash', async () => {
  const created = await api('/api/jarvis/conversations', {
    method: 'POST',
    cookie: dadCookie,
    body: { mode: 'general' },
  })
  const { status, body } = await api(`/api/jarvis/conversations/${created.body.id}/messages`, {
    method: 'POST',
    cookie: dadCookie,
    body: { content: 'hello' },
  })
  // This test intentionally passes in both states: if a real key is
  // configured (e.g. in CI later), the message should actually succeed
  // (201); if not, it must degrade to a clear 503, never a bare 500.
  assert.ok(
    status === 503 || status === 201,
    `expected 503 (no key) or 201 (key configured), got ${status}: ${JSON.stringify(body)}`,
  )
  if (status === 503) {
    assert.match(body.error, /ANTHROPIC_API_KEY/)
  }
})
