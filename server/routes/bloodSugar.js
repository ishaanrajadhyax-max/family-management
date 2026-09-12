import { Router } from 'express'
import { pool } from '../db.js'
import { getScopedFamilyMemberId, canAccessFamilyMember } from '../auth/access.js'

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
// Non-admins always get their own data regardless of the query param;
// admins may pass familyMemberId to view anyone's.
router.get('/', async (req, res, next) => {
  try {
    const familyMemberId = getScopedFamilyMemberId(req.user, req.query.familyMemberId)
    if (!familyMemberId) {
      return res.status(403).json({ error: "Not authorized to view this family member's data" })
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
    const familyMemberId = getScopedFamilyMemberId(req.user, req.body.familyMemberId)
    if (!familyMemberId) {
      return res.status(403).json({ error: "Not authorized to add a reading for this family member" })
    }
    const { recordedAt, readingContext, value, unit, comments } = req.body
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
    const existing = await pool.query(
      'SELECT family_member_id FROM blood_sugar_readings WHERE id = $1',
      [req.params.id],
    )
    if (existing.rowCount === 0) {
      return res.status(404).json({ error: 'Reading not found' })
    }
    if (!canAccessFamilyMember(req.user, existing.rows[0].family_member_id)) {
      return res.status(403).json({ error: 'Not authorized to edit this reading' })
    }

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
    res.json(toApiShape(result.rows[0]))
  } catch (err) {
    next(err)
  }
})

export default router
