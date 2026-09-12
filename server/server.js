// Minimal API layer: React frontend -> this server -> PostgreSQL (family_manager).
//
// Auth model: a signed, httpOnly cookie identifies the caller (id, name,
// role) on every request via requireAuth. Every health-data route below
// that point enforces access itself (see auth/access.js) — Dad and Mom can
// only ever act on their own family_member_id, Ishaan (admin) can act on
// any of them. Nothing here trusts a client-supplied identity without
// checking it against the session.
//
// Bootstrapping the very first admin: POST /api/auth/setup-admin (public,
// self-limiting — see routes/auth.js) is the only way an admin account can
// get credentials without already being logged in as one.
import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import cookieParser from 'cookie-parser'
import { pool } from './db.js'
import authRouter from './routes/auth.js'
import familyMembersRouter from './routes/familyMembers.js'
import adminUsersRouter from './routes/adminUsers.js'
import bloodSugarRouter from './routes/bloodSugar.js'
import bloodPressureRouter from './routes/bloodPressure.js'
import heartRateRouter from './routes/heartRate.js'
import walkRunRouter from './routes/walkRun.js'
import gymRouter from './routes/gym.js'
import { requireAuth, requireAdmin } from './middleware/requireAuth.js'

const isProduction = process.env.NODE_ENV === 'production'
if (isProduction && !process.env.CORS_ORIGIN) {
  throw new Error(
    'Missing required environment variable: CORS_ORIGIN. ' +
      'Set it to the deployed frontend\'s URL — without it, the server would ' +
      'silently fall back to allowing only http://localhost:5173, and every ' +
      'real browser request would fail with an unhelpful CORS error.',
  )
}

const app = express()

app.use(helmet())
app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173', credentials: true }))
app.use(express.json())
app.use(cookieParser())

// Public — no session required.
app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1')
    res.json({ status: 'ok', database: 'connected' })
  } catch {
    res.status(503).json({ status: 'error', database: 'unreachable' })
  }
})
app.use('/api/auth', authRouter)

// Everything below this line requires a valid session.
app.use(requireAuth)

app.use('/api/family-members', requireAdmin, familyMembersRouter)
app.use('/api/admin/users', requireAdmin, adminUsersRouter)
app.use('/api/blood-sugar-readings', bloodSugarRouter)
app.use('/api/blood-pressure-readings', bloodPressureRouter)
app.use('/api/heart-rate-readings', heartRateRouter)
app.use('/api/walk-run-activities', walkRunRouter)
app.use('/api/gym-activities', gymRouter)

// Centralized error handler — keeps route handlers free of repeated
// try/catch boilerplate for the "something unexpected broke" case.
app.use((err, _req, res, _next) => {
  console.error(err)
  res.status(500).json({ error: 'Internal server error' })
})

const port = process.env.PORT || 4000
app.listen(port, () => {
  console.log(`family-manager API listening on port ${port}`)
})
