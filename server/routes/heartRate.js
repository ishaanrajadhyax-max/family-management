import { Router } from 'express'
import { pool } from '../db.js'

const router = Router()

function toApiShape(row) {
  return {
    id: row.id,
    familyMemberId: row.family_member_id,
    recordedAt: row.recorded_at,
    value: row.value,
    source: row.source,
    comments: row.comments,
  }
}

// GET /api/heart-rate-readings?familyMemberId=...
router.get('/', async (req, res, next) => {
  try {
    const { familyMemberId } = req.query
    if (!familyMemberId) {
      return res.status(400).json({ error: 'familyMemberId query parameter is required' })
    }
    const result = await pool.query(
      'SELECT * FROM heart_rate_readings WHERE family_member_id = $1 ORDER BY recorded_at DESC',
      [familyMemberId],
    )
    res.json(result.rows.map(toApiShape))
  } catch (err) {
    next(err)
  }
})

function validateFields({ recordedAt, value }) {
  if (!recordedAt || value === undefined) {
    return 'recordedAt and value are required'
  }
  if (typeof value !== 'number' || value <= 0) {
    return 'value must be a positive number'
  }
  return null
}

// POST /api/heart-rate-readings
// Body: { familyMemberId, recordedAt, value, comments? }
router.post('/', async (req, res, next) => {
  try {
    const { familyMemberId, recordedAt, value, comments } = req.body

    if (!familyMemberId) {
      return res.status(400).json({ error: 'familyMemberId is required' })
    }
    const validationError = validateFields(req.body)
    if (validationError) {
      return res.status(400).json({ error: validationError })
    }

    const result = await pool.query(
      `INSERT INTO heart_rate_readings (family_member_id, recorded_at, value, source, comments)
       VALUES ($1, $2, $3, 'app', $4)
       RETURNING *`,
      [familyMemberId, recordedAt, value, comments || null],
    )
    res.status(201).json(toApiShape(result.rows[0]))
  } catch (err) {
    next(err)
  }
})

// PUT /api/heart-rate-readings/:id
// Body: { recordedAt, value, comments? }
router.put('/:id', async (req, res, next) => {
  try {
    const { recordedAt, value, comments } = req.body

    const validationError = validateFields(req.body)
    if (validationError) {
      return res.status(400).json({ error: validationError })
    }

    const result = await pool.query(
      `UPDATE heart_rate_readings SET recorded_at = $1, value = $2, comments = $3 WHERE id = $4 RETURNING *`,
      [recordedAt, value, comments || null, req.params.id],
    )
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Reading not found' })
    }
    res.json(toApiShape(result.rows[0]))
  } catch (err) {
    next(err)
  }
})

export default router
