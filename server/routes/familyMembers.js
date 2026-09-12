import { Router } from 'express'
import { pool } from '../db.js'

const router = Router()

// GET /api/family-members — admin only (enforced by requireAdmin where this
// router is mounted in server.js). Used by the frontend so Ishaan can pick
// which family member's data to view/manage.
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
