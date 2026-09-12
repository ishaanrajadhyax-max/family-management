import { Router } from 'express'
import { pool } from '../db.js'

const router = Router()

const READING_CONTEXTS = ['Fasting', 'Before Lunch', 'After Lunch', 'Before Dinner', 'After Dinner']

function toApiShape(row) {
  return {
    id: row.id,
    familyMemberId: row.family_member_id,
    recordedAt: row.recorded_at,
    readingContext: row.reading_context,
    systolic: row.systolic,
    diastolic: row.diastolic,
    pulse: row.pulse,
    source: row.source,
    comments: row.comments,
  }
}

// GET /api/blood-pressure-readings?familyMemberId=...
router.get('/', async (req, res, next) => {
  try {
    const { familyMemberId } = req.query
    if (!familyMemberId) {
      return res.status(400).json({ error: 'familyMemberId query parameter is required' })
    }
    const result = await pool.query(
      'SELECT * FROM blood_pressure_readings WHERE family_member_id = $1 ORDER BY recorded_at DESC',
      [familyMemberId],
    )
    res.json(result.rows.map(toApiShape))
  } catch (err) {
    next(err)
  }
})

function validateFields({ recordedAt, readingContext, systolic, diastolic }) {
  if (!recordedAt || !readingContext || systolic === undefined || diastolic === undefined) {
    return 'recordedAt, readingContext, systolic, and diastolic are required'
  }
  if (!READING_CONTEXTS.includes(readingContext)) {
    return `readingContext must be one of: ${READING_CONTEXTS.join(', ')}`
  }
  if (typeof systolic !== 'number' || systolic <= 0 || typeof diastolic !== 'number' || diastolic <= 0) {
    return 'systolic and diastolic must be positive numbers'
  }
  return null
}

// POST /api/blood-pressure-readings
// Body: { familyMemberId, recordedAt, readingContext, systolic, diastolic, pulse?, comments? }
router.post('/', async (req, res, next) => {
  try {
    const { familyMemberId, recordedAt, readingContext, systolic, diastolic, pulse, comments } = req.body

    if (!familyMemberId) {
      return res.status(400).json({ error: 'familyMemberId is required' })
    }
    const validationError = validateFields(req.body)
    if (validationError) {
      return res.status(400).json({ error: validationError })
    }

    const result = await pool.query(
      `INSERT INTO blood_pressure_readings
         (family_member_id, recorded_at, reading_context, systolic, diastolic, pulse, source, comments)
       VALUES ($1, $2, $3, $4, $5, $6, 'app', $7)
       RETURNING *`,
      [familyMemberId, recordedAt, readingContext, systolic, diastolic, pulse || null, comments || null],
    )
    res.status(201).json(toApiShape(result.rows[0]))
  } catch (err) {
    next(err)
  }
})

// PUT /api/blood-pressure-readings/:id
// Body: { recordedAt, readingContext, systolic, diastolic, pulse?, comments? }
router.put('/:id', async (req, res, next) => {
  try {
    const { recordedAt, readingContext, systolic, diastolic, pulse, comments } = req.body

    const validationError = validateFields(req.body)
    if (validationError) {
      return res.status(400).json({ error: validationError })
    }

    const result = await pool.query(
      `UPDATE blood_pressure_readings
       SET recorded_at = $1, reading_context = $2, systolic = $3, diastolic = $4, pulse = $5, comments = $6
       WHERE id = $7
       RETURNING *`,
      [recordedAt, readingContext, systolic, diastolic, pulse || null, comments || null, req.params.id],
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
