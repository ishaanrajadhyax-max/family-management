import { Router } from 'express'
import { pool } from '../db.js'
import { hashPassword } from '../auth/hash.js'

// Admin-only user management. Mounted behind requireAuth + requireAdmin in
// server.js — every handler here can assume req.user.role === 'admin'.
// Reuses the same bcrypt helper (auth/hash.js) and username normalization
// as the login route (routes/auth.js) and the local set-password.mjs
// script — there is exactly one way passwords get hashed in this app.
//
// Deliberately no DELETE endpoint: every health-data table has
// `family_member_id ... REFERENCES family_members(id) ON DELETE CASCADE`
// (see db/schema.sql), so actually deleting a row here would silently wipe
// that person's entire health history. Disabling (the /status endpoint)
// achieves the same practical goal — the account can no longer log in —
// without that risk.

const router = Router()

const VALID_ROLES = ['dad', 'mom', 'admin']
const MIN_PASSWORD_LENGTH = 8
const UNIQUE_VIOLATION = '23505'

function toApiShape(row) {
  return {
    id: row.id,
    name: row.name,
    username: row.username,
    role: row.role,
    isActive: row.is_active,
    createdAt: row.created_at,
  }
}

// Matches the normalization already used at login (routes/auth.js) and in
// server/scripts/set-password.mjs — one consistent rule everywhere a
// username is read or written.
function normalizeUsername(username) {
  return String(username).trim().toLowerCase()
}

// Would disabling this account, or changing it away from role 'admin',
// leave the app with zero active admins? Only ever true when the target
// is themselves an active admin — touching anyone else's role/status
// never affects the admin count.
async function wouldRemoveLastAdmin(targetId, currentRole, currentIsActive) {
  if (currentRole !== 'admin' || !currentIsActive) return false
  const result = await pool.query(
    "SELECT count(*) FROM family_members WHERE role = 'admin' AND is_active = true AND id != $1",
    [targetId],
  )
  return Number(result.rows[0].count) === 0
}

// GET /api/admin/users
router.get('/', async (_req, res, next) => {
  try {
    const result = await pool.query(
      'SELECT id, name, username, role, is_active, created_at FROM family_members ORDER BY created_at ASC',
    )
    res.json(result.rows.map(toApiShape))
  } catch (err) {
    next(err)
  }
})

// POST /api/admin/users
// Body: { name, username, role, password }
router.post('/', async (req, res, next) => {
  try {
    const name = req.body.name ? String(req.body.name).trim() : ''
    const username = req.body.username ? normalizeUsername(req.body.username) : ''
    const { role, password } = req.body

    if (!name || !username || !role || !password) {
      return res.status(400).json({ error: 'name, username, role, and password are required' })
    }
    if (!VALID_ROLES.includes(role)) {
      return res.status(400).json({ error: `role must be one of: ${VALID_ROLES.join(', ')}` })
    }
    if (String(password).length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ error: `password must be at least ${MIN_PASSWORD_LENGTH} characters` })
    }

    const passwordHash = await hashPassword(password)
    const result = await pool.query(
      `INSERT INTO family_members (name, username, role, password_hash, is_active)
       VALUES ($1, $2, $3, $4, true)
       RETURNING id, name, username, role, is_active, created_at`,
      [name, username, role, passwordHash],
    )
    res.status(201).json(toApiShape(result.rows[0]))
  } catch (err) {
    if (err.code === UNIQUE_VIOLATION) {
      return res.status(409).json({ error: 'That username is already in use' })
    }
    next(err)
  }
})

// PATCH /api/admin/users/:id
// Body: { name, username, role } — password is never editable here; use
// the dedicated reset-password endpoint instead.
router.patch('/:id', async (req, res, next) => {
  try {
    const name = req.body.name ? String(req.body.name).trim() : ''
    const username = req.body.username ? normalizeUsername(req.body.username) : ''
    const { role } = req.body

    if (!name || !username || !role) {
      return res.status(400).json({ error: 'name, username, and role are required' })
    }
    if (!VALID_ROLES.includes(role)) {
      return res.status(400).json({ error: `role must be one of: ${VALID_ROLES.join(', ')}` })
    }

    const existing = await pool.query('SELECT role, is_active FROM family_members WHERE id = $1', [req.params.id])
    if (existing.rowCount === 0) {
      return res.status(404).json({ error: 'User not found' })
    }
    const current = existing.rows[0]

    if (role !== current.role && (await wouldRemoveLastAdmin(req.params.id, current.role, current.is_active))) {
      return res.status(400).json({ error: 'Cannot change this role — it is the only active admin account' })
    }

    const result = await pool.query(
      `UPDATE family_members SET name = $1, username = $2, role = $3
       WHERE id = $4
       RETURNING id, name, username, role, is_active, created_at`,
      [name, username, role, req.params.id],
    )
    res.json(toApiShape(result.rows[0]))
  } catch (err) {
    if (err.code === UNIQUE_VIOLATION) {
      return res.status(409).json({ error: 'That username is already in use' })
    }
    next(err)
  }
})

// POST /api/admin/users/:id/reset-password
// Body: { password } — works for any user, including the admin's own
// account. Never returns the hash or the old/new password.
router.post('/:id/reset-password', async (req, res, next) => {
  try {
    const { password } = req.body
    if (!password || String(password).length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ error: `password must be at least ${MIN_PASSWORD_LENGTH} characters` })
    }

    const passwordHash = await hashPassword(password)
    const result = await pool.query(
      `UPDATE family_members SET password_hash = $1 WHERE id = $2
       RETURNING id, name, username, role, is_active, created_at`,
      [passwordHash, req.params.id],
    )
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'User not found' })
    }
    res.json(toApiShape(result.rows[0]))
  } catch (err) {
    next(err)
  }
})

// POST /api/admin/users/:id/status
// Body: { isActive: boolean }
router.post('/:id/status', async (req, res, next) => {
  try {
    const { isActive } = req.body
    if (typeof isActive !== 'boolean') {
      return res.status(400).json({ error: 'isActive must be true or false' })
    }

    const existing = await pool.query('SELECT role, is_active FROM family_members WHERE id = $1', [req.params.id])
    if (existing.rowCount === 0) {
      return res.status(404).json({ error: 'User not found' })
    }
    const current = existing.rows[0]

    if (!isActive && (await wouldRemoveLastAdmin(req.params.id, current.role, current.is_active))) {
      return res.status(400).json({ error: 'Cannot disable this account — it is the only active admin account' })
    }

    const result = await pool.query(
      `UPDATE family_members SET is_active = $1 WHERE id = $2
       RETURNING id, name, username, role, is_active, created_at`,
      [isActive, req.params.id],
    )
    res.json(toApiShape(result.rows[0]))
  } catch (err) {
    next(err)
  }
})

export default router
