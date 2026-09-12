import { Router } from 'express'
import { pool } from '../db.js'

const router = Router()

// GET /api/family-members — used by the frontend to look up Dad's id once
// on load. No auth/roles yet, so this just returns everyone in the table
// (currently just Dad).
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
