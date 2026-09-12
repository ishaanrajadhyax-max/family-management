import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { pool } from '../db.js'
import { hashPassword, verifyPassword } from '../auth/hash.js'
import { signToken } from '../auth/jwt.js'
import { requireAuth } from '../middleware/requireAuth.js'

const MIN_PASSWORD_LENGTH = 8

const router = Router()

const isProduction = process.env.NODE_ENV === 'production'

// httpOnly so frontend JS can never read the token. sameSite: 'lax' is
// correct everywhere now — the frontend is served by this same Express app
// in production (genuinely same-origin, not just same-site) and by the
// local Vite dev server + this API locally (same site, different port).
// secure requires real HTTPS, which only production has.
const cookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: 'lax',
  maxAge: 30 * 24 * 60 * 60 * 1000,
}

// Slows down password-guessing without affecting normal use. Rate-limited
// per IP, not per account — a family behind one home router shares an IP,
// so this needs headroom for Dad/Mom/Ishaan each logging in (with the
// occasional typo) around the same time, not just a single person.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again later.' },
})

// POST /api/auth/login
// Body: { username, password }
router.post('/login', loginLimiter, async (req, res, next) => {
  try {
    const { username, password } = req.body
    if (!username || !password) {
      return res.status(400).json({ error: 'username and password are required' })
    }

    const result = await pool.query(
      'SELECT id, name, role, password_hash, is_active FROM family_members WHERE username = $1',
      [String(username).trim().toLowerCase()],
    )
    const member = result.rows[0]

    // Same generic error whether the username doesn't exist or the
    // password is wrong — never reveal which one it was.
    if (!member || !member.password_hash) {
      return res.status(401).json({ error: 'Invalid username or password' })
    }
    const passwordMatches = await verifyPassword(password, member.password_hash)
    if (!passwordMatches) {
      return res.status(401).json({ error: 'Invalid username or password' })
    }
    // Checked after the password, not before: a disabled account with a
    // correct password should say "disabled" (actionable), but we still
    // don't want a wrong password on a disabled account leaking that the
    // account exists and is disabled.
    if (!member.is_active) {
      return res.status(403).json({ error: 'This account has been disabled. Contact an admin.' })
    }

    const token = signToken(member)
    res.cookie('token', token, cookieOptions)
    res.json({ id: member.id, name: member.name, role: member.role })
  } catch (err) {
    next(err)
  }
})

// GET /api/auth/needs-setup — public. True only while no admin account has
// credentials yet. The frontend uses this to decide whether to show the
// one-time "Set Up Admin Account" screen instead of the login form.
router.get('/needs-setup', async (_req, res, next) => {
  try {
    const result = await pool.query(
      "SELECT count(*) FROM family_members WHERE role = 'admin' AND password_hash IS NOT NULL",
    )
    res.json({ needsSetup: Number(result.rows[0].count) === 0 })
  } catch (err) {
    next(err)
  }
})

// POST /api/auth/setup-admin — public, but self-limiting: refuses (409) the
// moment any admin account already has credentials, re-checked here on the
// server, not trusted from the frontend. This is the *only* way an admin
// account can ever be created without already being logged in as an admin;
// once it succeeds once, it can never succeed again.
// Body: { username, password }
router.post('/setup-admin', loginLimiter, async (req, res, next) => {
  try {
    const { username, password } = req.body
    if (!username || !password) {
      return res.status(400).json({ error: 'username and password are required' })
    }
    if (String(password).length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ error: `password must be at least ${MIN_PASSWORD_LENGTH} characters` })
    }

    const existingAdmin = await pool.query(
      "SELECT count(*) FROM family_members WHERE role = 'admin' AND password_hash IS NOT NULL",
    )
    if (Number(existingAdmin.rows[0].count) > 0) {
      return res.status(409).json({ error: 'An admin account already exists. Ask them to add or reset users.' })
    }

    const target = await pool.query(
      "SELECT id, name, role FROM family_members WHERE role = 'admin' AND password_hash IS NULL LIMIT 1",
    )
    if (target.rowCount === 0) {
      return res.status(409).json({ error: 'No admin account is available to set up.' })
    }
    const member = target.rows[0]

    const passwordHash = await hashPassword(password)
    await pool.query(
      'UPDATE family_members SET username = $1, password_hash = $2 WHERE id = $3',
      [String(username).trim().toLowerCase(), passwordHash, member.id],
    )

    const token = signToken(member)
    res.cookie('token', token, cookieOptions)
    res.status(201).json({ id: member.id, name: member.name, role: member.role })
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'That username is already in use' })
    }
    next(err)
  }
})

// POST /api/auth/logout
router.post('/logout', (_req, res) => {
  res.clearCookie('token', cookieOptions)
  res.json({ ok: true })
})

// GET /api/auth/me — lets the frontend check "am I already logged in?" on
// load, and who it's talking to.
router.get('/me', requireAuth, (req, res) => {
  res.json({ id: req.user.id, name: req.user.name, role: req.user.role })
})

export default router
