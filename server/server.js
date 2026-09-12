// Minimal API layer: React frontend -> this server -> PostgreSQL (family_manager).
//
// Current phase: Dad-only, no login. The auth system built for Milestone 6
// (JWT sessions, bcrypt, admin roles) is intentionally not wired up here —
// its code still exists (server/auth/, server/middleware/requireAuth.js,
// server/routes/auth.js, server/routes/adminUsers.js) but nothing imports
// it, so nothing in family_members.username/password_hash/is_active is
// read or enforced right now. Every route below is reachable directly,
// scoped only by whatever familyMemberId the frontend sends — which, for
// this phase, is always looked up as "whoever has role='dad'."
import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { pool } from './db.js'
import familyMembersRouter from './routes/familyMembers.js'
import bloodSugarRouter from './routes/bloodSugar.js'
import bloodPressureRouter from './routes/bloodPressure.js'
import heartRateRouter from './routes/heartRate.js'
import walkRunRouter from './routes/walkRun.js'
import gymRouter from './routes/gym.js'

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

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1')
    res.json({ status: 'ok', database: 'connected' })
  } catch {
    res.status(503).json({ status: 'error', database: 'unreachable' })
  }
})

app.use('/api/family-members', familyMembersRouter)
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
