import { Router } from 'express'
import { pool } from '../db.js'

const router = Router()

// GET /api/family-members — used by the frontend to look up Dad's id once
// on load. This phase is Dad-only with no login (see server.js) — Mom and
// Ishaan's rows still exist in the table but nothing in the app currently
// looks them up or uses them.
router.get('/', async (_req, res, next) => {
  try {
    const result = await pool.query(
      'SELECT id, name, role FROM family_members ORDER BY created_at ASC',
    )
    res.json(result.rows)
  } catch (err) {
    next(err)
  }
})

export default router
