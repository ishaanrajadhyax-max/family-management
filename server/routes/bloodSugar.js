import { Router } from 'express'
import { pool } from '../db.js'

const router = Router()

const READING_CONTEXTS = ['Fasting', 'Before Lunch', 'After Lunch', 'Before Dinner', 'After Dinner']
const UNITS = ['mg/dL', 'mmol/L']

function toApiShape(row) {
  return {
    id: row.id,
    familyMemberId: row.family_member_id,
    recordedAt: row.recorded_at,
    readingContext: row.reading_context,
    value: Number(row.value),
    unit: row.unit,
    source: row.source,
    comments: row.comments,
  }
}

// GET /api/blood-sugar-readings?familyMemberId=...
router.get('/', async (req, res, next) => {
  try {
    const { familyMemberId } = req.query
    if (!familyMemberId) {
      return res.status(400).json({ error: 'familyMemberId query parameter is required' })
    }
    const result = await pool.query(
      'SELECT * FROM blood_sugar_readings WHERE family_member_id = $1 ORDER BY recorded_at DESC',
      [familyMemberId],
    )
    res.json(result.rows.map(toApiShape))
  } catch (err) {
    next(err)
  }
})

function validateFields({ recordedAt, readingContext, value, unit }) {
  if (!recordedAt || !readingContext || value === undefined || !unit) {
    return 'recordedAt, readingContext, value, and unit are required'
  }
  if (!READING_CONTEXTS.includes(readingContext)) {
    return `readingContext must be one of: ${READING_CONTEXTS.join(', ')}`
  }
  if (!UNITS.includes(unit)) {
    return `unit must be one of: ${UNITS.join(', ')}`
  }
  if (typeof value !== 'number' || Number.isNaN(value) || value <= 0) {
    return 'value must be a positive number'
  }
  return null
}

// POST /api/blood-sugar-readings
// Body: { familyMemberId, recordedAt, readingContext, value, unit, comments? }
// Always inserted with source='app' — historical rows only ever come from
// the one-time import, never through this endpoint.
router.post('/', async (req, res, next) => {
  try {
    const { familyMemberId, recordedAt, readingContext, value, unit, comments } = req.body

    if (!familyMemberId) {
      return res.status(400).json({ error: 'familyMemberId is required' })
    }
    const validationError = validateFields(req.body)
    if (validationError) {
      return res.status(400).json({ error: validationError })
    }

    const result = await pool.query(
      `INSERT INTO blood_sugar_readings
         (family_member_id, recorded_at, reading_context, value, unit, source, comments)
       VALUES ($1, $2, $3, $4, $5, 'app', $6)
       RETURNING *`,
      [familyMemberId, recordedAt, readingContext, value, unit, comments || null],
    )
    res.status(201).json(toApiShape(result.rows[0]))
  } catch (err) {
    next(err)
  }
})

// PUT /api/blood-sugar-readings/:id
// Body: { recordedAt, readingContext, value, unit, comments? }
// Updates an existing reading in place. `source` is left untouched — editing
// a historical_import row doesn't turn it into an app-entered one.
router.put('/:id', async (req, res, next) => {
  try {
    const { recordedAt, readingContext, value, unit, comments } = req.body

    const validationError = validateFields(req.body)
    if (validationError) {
      return res.status(400).json({ error: validationError })
    }

    const result = await pool.query(
      `UPDATE blood_sugar_readings
       SET recorded_at = $1, reading_context = $2, value = $3, unit = $4, comments = $5
       WHERE id = $6
       RETURNING *`,
      [recordedAt, readingContext, value, unit, comments || null, req.params.id],
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
