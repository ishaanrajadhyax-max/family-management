// Minimal API layer: React frontend -> this server -> PostgreSQL (family_manager).
// No authentication/roles yet — every route just takes a familyMemberId,
// matching the current single-user (Dad) scope of the frontend.
import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { pool } from './db.js'
import familyMembersRouter from './routes/familyMembers.js'
import bloodSugarRouter from './routes/bloodSugar.js'
import bloodPressureRouter from './routes/bloodPressure.js'
import heartRateRouter from './routes/heartRate.js'
import walkRunRouter from './routes/walkRun.js'
import gymRouter from './routes/gym.js'

const app = express()

app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173' }))
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
  console.log(`family-manager API listening on http://localhost:${port}`)
})
