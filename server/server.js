// React frontend + this server -> PostgreSQL (family_manager). The
// frontend's built files are served by this same Express app (see the
// static/SPA block below) — same origin, one URL, one Render service.
// That's deliberate: when the frontend and API lived on two different
// onrender.com subdomains, the session cookie was a genuine third-party
// cookie (onrender.com is on the public suffix list, so each subdomain
// counts as its own "site"), and Safari blocks third-party cookies by
// default — every iPhone user could log in but the cookie never stuck, so
// the very next request came back "Not authenticated". Same-origin removes
// that failure mode entirely, for every browser, not just Safari.
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
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'
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
import walkRunRouter from './routes/walkRun.js'
import gymRouter from './routes/gym.js'
import { requireAuth, requireAdmin } from './middleware/requireAuth.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const isProduction = process.env.NODE_ENV === 'production'

const app = express()

app.use(helmet())
// CORS is only needed for a genuinely separate origin — the local Vite dev
// server (a different port = a different origin) always gets it; in
// production it's off by default now that the frontend is same-origin,
// but CORS_ORIGIN can still be set if some other origin ever needs access.
if (!isProduction) {
  app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173', credentials: true }))
} else if (process.env.CORS_ORIGIN) {
  app.use(cors({ origin: process.env.CORS_ORIGIN, credentials: true }))
}
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

// The built frontend (see render.yaml's buildCommand) — public, like the
// static assets of any site. The pages themselves carry no data; every
// /api/* route below is still independently protected by requireAuth.
const frontendDist = path.join(__dirname, '..', 'dist')
const frontendIndexHtml = path.join(frontendDist, 'index.html')
app.use(express.static(frontendDist))
// Anything else that isn't an /api/* path (e.g. a client-side route like
// /insights hit on a hard refresh) falls through to the SPA shell, which
// handles its own routing client-side.
app.get(/^\/(?!api\/).*/, (_req, res, next) => {
  if (!existsSync(frontendIndexHtml)) {
    // Frontend hasn't been built here (e.g. running the API alone in
    // local dev) — let it 404 normally instead of crashing on sendFile.
    return next()
  }
  res.sendFile(frontendIndexHtml)
})

// Everything below this line requires a valid session.
app.use(requireAuth)

app.use('/api/family-members', requireAdmin, familyMembersRouter)
app.use('/api/admin/users', requireAdmin, adminUsersRouter)
app.use('/api/blood-sugar-readings', bloodSugarRouter)
app.use('/api/blood-pressure-readings', bloodPressureRouter)
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
