import { Router } from 'express'
import { pool } from '../db.js'
import { getScopedFamilyMemberId, canAccessFamilyMember } from '../auth/access.js'

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
    const familyMemberId = getScopedFamilyMemberId(req.user, req.query.familyMemberId)
    if (!familyMemberId) {
      return res.status(403).json({ error: "Not authorized to view this family member's data" })
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
    const familyMemberId = getScopedFamilyMemberId(req.user, req.body.familyMemberId)
    if (!familyMemberId) {
      return res.status(403).json({ error: 'Not authorized to add a reading for this family member' })
    }
    const { recordedAt, value, comments } = req.body
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
    const existing = await pool.query(
      'SELECT family_member_id FROM heart_rate_readings WHERE id = $1',
      [req.params.id],
    )
    if (existing.rowCount === 0) {
      return res.status(404).json({ error: 'Reading not found' })
    }
    if (!canAccessFamilyMember(req.user, existing.rows[0].family_member_id)) {
      return res.status(403).json({ error: 'Not authorized to edit this reading' })
    }

    const { recordedAt, value, comments } = req.body
    const validationError = validateFields(req.body)
    if (validationError) {
      return res.status(400).json({ error: validationError })
    }

    const result = await pool.query(
      `UPDATE heart_rate_readings SET recorded_at = $1, value = $2, comments = $3 WHERE id = $4 RETURNING *`,
      [recordedAt, value, comments || null, req.params.id],
    )
    res.json(toApiShape(result.rows[0]))
  } catch (err) {
    next(err)
  }
})

export default router
