import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { pool } from '../db.js'
import { verifyPassword } from '../auth/hash.js'
import { signToken } from '../auth/jwt.js'
import { requireAuth } from '../middleware/requireAuth.js'

const router = Router()

const isProduction = process.env.NODE_ENV === 'production'

// httpOnly so frontend JS can never read the token; secure+sameSite=none
// only in production (real HTTPS, cross-origin frontend/backend) — locally
// everything is plain http on the same machine, where 'lax' is correct.
const cookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: isProduction ? 'none' : 'lax',
  maxAge: 30 * 24 * 60 * 60 * 1000,
}

// Slows down password-guessing without affecting normal use — nobody logs
// in 10 times in 15 minutes by accident.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
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
      'SELECT id, name, role, password_hash FROM family_members WHERE username = $1',
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

    const token = signToken(member)
    res.cookie('token', token, cookieOptions)
    res.json({ id: member.id, name: member.name, role: member.role })
  } catch (err) {
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
