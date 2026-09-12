// Integration tests for admin user management. Uses Node's built-in test
// runner and assert module — no new dependency, since the project has no
// existing test framework to plug into (see package.json).
//
// Requires a local dev server already running on http://localhost:4000
// (or set TEST_BASE_URL), pointed at the LOCAL database — never run this
// against production. Run with:  npm test   (from server/)
//
// These tests create their own throwaway fixtures (test_admin_/test_dad_/
// test_mom_-prefixed accounts with known passwords, hashed the same way
// the app does) rather than using anyone's real credentials, which this
// test file has no access to and shouldn't. Everything it creates is
// cleaned up in the `after` hook, including a temporary, fully-restored
// toggle of the real admin's is_active flag for the one test that needs
// exactly one active admin to exist.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { pool } from '../db.js'
import { hashPassword } from '../auth/hash.js'

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:4000'
const TEST_PASSWORD = 'TestPass123'
const RUN_ID = Date.now().toString(36)

const fixtureIds = []
let realAdminId
let realAdminWasActive

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
  return { status: response.status, body: json, response }
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
let momFixture
let adminFixture
let adminCookie
let dadCookie
let momCookie
let healthCountsBefore

before(async () => {
  const sugar = await pool.query('SELECT count(*) FROM blood_sugar_readings')
  const pressure = await pool.query('SELECT count(*) FROM blood_pressure_readings')
  healthCountsBefore = { sugar: sugar.rows[0].count, pressure: pressure.rows[0].count }

  const realAdmin = await pool.query("SELECT id, is_active FROM family_members WHERE role = 'admin' LIMIT 1")
  realAdminId = realAdmin.rows[0]?.id
  realAdminWasActive = realAdmin.rows[0]?.is_active

  dadFixture = await createFixture('dad', 'dad')
  momFixture = await createFixture('mom', 'mom')
  adminFixture = await createFixture('admin', 'admin')

  adminCookie = await loginAs(adminFixture.username, adminFixture.password)
  dadCookie = await loginAs(dadFixture.username, dadFixture.password)
  momCookie = await loginAs(momFixture.username, momFixture.password)
})

after(async () => {
  if (realAdminId !== undefined) {
    await pool.query('UPDATE family_members SET is_active = $1 WHERE id = $2', [realAdminWasActive, realAdminId])
  }
  if (fixtureIds.length > 0) {
    await pool.query('DELETE FROM family_members WHERE id = ANY($1::uuid[])', [fixtureIds])
  }

  const sugar = await pool.query('SELECT count(*) FROM blood_sugar_readings')
  const pressure = await pool.query('SELECT count(*) FROM blood_pressure_readings')
  assert.equal(sugar.rows[0].count, healthCountsBefore.sugar, 'blood_sugar_readings count must be unchanged')
  assert.equal(pressure.rows[0].count, healthCountsBefore.pressure, 'blood_pressure_readings count must be unchanged')

  await pool.end()
})

test('admin can list users, and no password field is ever present', async () => {
  const { status, body } = await api('/api/admin/users', { cookie: adminCookie })
  assert.equal(status, 200)
  assert.ok(Array.isArray(body))
  assert.ok(body.some((u) => u.id === dadFixture.id))
  for (const user of body) {
    assert.equal(user.password, undefined)
    assert.equal(user.passwordHash, undefined)
    assert.equal(user.password_hash, undefined)
  }
})

test('dad receives 403 on admin endpoints', async () => {
  const { status } = await api('/api/admin/users', { cookie: dadCookie })
  assert.equal(status, 403)
})

test('mom receives 403 on admin endpoints', async () => {
  const { status } = await api('/api/admin/users', { cookie: momCookie })
  assert.equal(status, 403)
})

test('unauthenticated request is rejected', async () => {
  const { status } = await api('/api/admin/users')
  assert.equal(status, 401)
})

test('admin can create a user, and the response has no password field', async () => {
  const username = `test_new_${RUN_ID}`
  const { status, body } = await api('/api/admin/users', {
    method: 'POST',
    cookie: adminCookie,
    body: { name: 'Test New User', username, role: 'dad', password: TEST_PASSWORD },
  })
  assert.equal(status, 201)
  assert.equal(body.username, username)
  assert.equal(body.role, 'dad')
  assert.equal(body.isActive, true)
  assert.equal(body.passwordHash, undefined)
  fixtureIds.push(body.id)

  // The created account can actually log in with the password that was set.
  await loginAs(username, TEST_PASSWORD)
})

test('admin cannot create a user with a duplicate username', async () => {
  const { status, body } = await api('/api/admin/users', {
    method: 'POST',
    cookie: adminCookie,
    body: { name: 'Duplicate', username: dadFixture.username, role: 'dad', password: TEST_PASSWORD },
  })
  assert.equal(status, 409)
  assert.match(body.error, /already in use/i)
})

test('admin can edit a user', async () => {
  const { status, body } = await api(`/api/admin/users/${dadFixture.id}`, {
    method: 'PATCH',
    cookie: adminCookie,
    body: { name: 'Test Dad Renamed', username: dadFixture.username, role: 'dad' },
  })
  assert.equal(status, 200)
  assert.equal(body.name, 'Test Dad Renamed')
})

test('admin can change a role', async () => {
  const { status, body } = await api(`/api/admin/users/${momFixture.id}`, {
    method: 'PATCH',
    cookie: adminCookie,
    body: { name: 'Test mom', username: momFixture.username, role: 'admin' },
  })
  assert.equal(status, 200)
  assert.equal(body.role, 'admin')

  // put it back for the rest of the suite
  await api(`/api/admin/users/${momFixture.id}`, {
    method: 'PATCH',
    cookie: adminCookie,
    body: { name: 'Test mom', username: momFixture.username, role: 'mom' },
  })
})

test('admin can reset another user\'s password, and it actually changes authentication', async () => {
  const newPassword = 'BrandNewPass456'
  const { status, body } = await api(`/api/admin/users/${dadFixture.id}/reset-password`, {
    method: 'POST',
    cookie: adminCookie,
    body: { password: newPassword },
  })
  assert.equal(status, 200)
  assert.equal(body.passwordHash, undefined)

  const oldLogin = await api('/api/auth/login', { method: 'POST', body: { username: dadFixture.username, password: dadFixture.password } })
  assert.equal(oldLogin.status, 401, 'old password must no longer work')

  const newLoginCookie = await loginAs(dadFixture.username, newPassword)
  assert.ok(newLoginCookie)
})

test('reset-password rejects a too-short password', async () => {
  const { status } = await api(`/api/admin/users/${dadFixture.id}/reset-password`, {
    method: 'POST',
    cookie: adminCookie,
    body: { password: 'short' },
  })
  assert.equal(status, 400)
})

test('admin can disable and re-enable an account, and a disabled account cannot log in', async () => {
  const disable = await api(`/api/admin/users/${momFixture.id}/status`, {
    method: 'POST',
    cookie: adminCookie,
    body: { isActive: false },
  })
  assert.equal(disable.status, 200)
  assert.equal(disable.body.isActive, false)

  const loginAttempt = await api('/api/auth/login', {
    method: 'POST',
    body: { username: momFixture.username, password: momFixture.password },
  })
  assert.equal(loginAttempt.status, 403)

  const enable = await api(`/api/admin/users/${momFixture.id}/status`, {
    method: 'POST',
    cookie: adminCookie,
    body: { isActive: true },
  })
  assert.equal(enable.status, 200)
  assert.equal(enable.body.isActive, true)
})

test('disabling an already-authenticated user rejects their very next request', async () => {
  const sessionCookie = await loginAs(momFixture.username, momFixture.password)
  const before = await api('/api/blood-sugar-readings', { cookie: sessionCookie })
  assert.equal(before.status, 200)

  await api(`/api/admin/users/${momFixture.id}/status`, {
    method: 'POST',
    cookie: adminCookie,
    body: { isActive: false },
  })

  const after1 = await api('/api/blood-sugar-readings', { cookie: sessionCookie })
  assert.equal(after1.status, 401, 'an existing session must be rejected immediately once disabled, not just at next login')

  await api(`/api/admin/users/${momFixture.id}/status`, {
    method: 'POST',
    cookie: adminCookie,
    body: { isActive: true },
  })
})

test('cannot disable the only active admin account', async () => {
  // Isolate to exactly one active admin (our test admin fixture) by
  // temporarily disabling the real admin — restored in `after`, and
  // re-verified here immediately afterward regardless of outcome.
  await pool.query('UPDATE family_members SET is_active = false WHERE id = $1', [realAdminId])
  try {
    const { status, body } = await api(`/api/admin/users/${adminFixture.id}/status`, {
      method: 'POST',
      cookie: adminCookie,
      body: { isActive: false },
    })
    assert.equal(status, 400)
    assert.match(body.error, /only active admin/i)
  } finally {
    await pool.query('UPDATE family_members SET is_active = true WHERE id = $1', [realAdminId])
  }
})

test('cannot change the only active admin\'s role away from admin', async () => {
  await pool.query('UPDATE family_members SET is_active = false WHERE id = $1', [realAdminId])
  try {
    const { status, body } = await api(`/api/admin/users/${adminFixture.id}`, {
      method: 'PATCH',
      cookie: adminCookie,
      body: { name: 'Test admin', username: adminFixture.username, role: 'dad' },
    })
    assert.equal(status, 400)
    assert.match(body.error, /only active admin/i)
  } finally {
    await pool.query('UPDATE family_members SET is_active = true WHERE id = $1', [realAdminId])
  }
})
