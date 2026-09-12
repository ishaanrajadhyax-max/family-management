import { Router } from 'express'
import { pool } from '../db.js'
import { getScopedFamilyMemberId, canAccessFamilyMember } from '../auth/access.js'

const router = Router()

const ACTIVITY_TYPES = ['Walking', 'Running']
const DISTANCE_UNITS = ['km', 'mi']

function toApiShape(row) {
  return {
    id: row.id,
    familyMemberId: row.family_member_id,
    activityType: row.activity_type,
    recordedAt: row.recorded_at,
    durationMinutes: row.duration_minutes,
    distance: Number(row.distance),
    distanceUnit: row.distance_unit,
    source: row.source,
    comments: row.comments,
  }
}

// GET /api/walk-run-activities?familyMemberId=...
router.get('/', async (req, res, next) => {
  try {
    const familyMemberId = getScopedFamilyMemberId(req.user, req.query.familyMemberId)
    if (!familyMemberId) {
      return res.status(403).json({ error: "Not authorized to view this family member's data" })
    }
    const result = await pool.query(
      'SELECT * FROM walk_run_activities WHERE family_member_id = $1 ORDER BY recorded_at DESC',
      [familyMemberId],
    )
    res.json(result.rows.map(toApiShape))
  } catch (err) {
    next(err)
  }
})

function validateFields({ activityType, recordedAt, durationMinutes, distance, distanceUnit }) {
  if (!activityType || !recordedAt || !durationMinutes || !distance || !distanceUnit) {
    return 'activityType, recordedAt, durationMinutes, distance, and distanceUnit are required'
  }
  if (!ACTIVITY_TYPES.includes(activityType)) {
    return `activityType must be one of: ${ACTIVITY_TYPES.join(', ')}`
  }
  if (!DISTANCE_UNITS.includes(distanceUnit)) {
    return `distanceUnit must be one of: ${DISTANCE_UNITS.join(', ')}`
  }
  if (typeof durationMinutes !== 'number' || durationMinutes <= 0 || typeof distance !== 'number' || distance <= 0) {
    return 'durationMinutes and distance must be positive numbers'
  }
  return null
}

// POST /api/walk-run-activities
// Body: { familyMemberId, activityType, recordedAt, durationMinutes, distance, distanceUnit, comments? }
router.post('/', async (req, res, next) => {
  try {
    const familyMemberId = getScopedFamilyMemberId(req.user, req.body.familyMemberId)
    if (!familyMemberId) {
      return res.status(403).json({ error: 'Not authorized to add an activity for this family member' })
    }
    const { activityType, recordedAt, durationMinutes, distance, distanceUnit, comments } = req.body
    const validationError = validateFields(req.body)
    if (validationError) {
      return res.status(400).json({ error: validationError })
    }

    const result = await pool.query(
      `INSERT INTO walk_run_activities
         (family_member_id, activity_type, recorded_at, duration_minutes, distance, distance_unit, source, comments)
       VALUES ($1, $2, $3, $4, $5, $6, 'app', $7)
       RETURNING *`,
      [familyMemberId, activityType, recordedAt, durationMinutes, distance, distanceUnit, comments || null],
    )
    res.status(201).json(toApiShape(result.rows[0]))
  } catch (err) {
    next(err)
  }
})

// PUT /api/walk-run-activities/:id
// Body: { activityType, recordedAt, durationMinutes, distance, distanceUnit, comments? }
router.put('/:id', async (req, res, next) => {
  try {
    const existing = await pool.query(
      'SELECT family_member_id FROM walk_run_activities WHERE id = $1',
      [req.params.id],
    )
    if (existing.rowCount === 0) {
      return res.status(404).json({ error: 'Activity not found' })
    }
    if (!canAccessFamilyMember(req.user, existing.rows[0].family_member_id)) {
      return res.status(403).json({ error: 'Not authorized to edit this activity' })
    }

    const { activityType, recordedAt, durationMinutes, distance, distanceUnit, comments } = req.body
    const validationError = validateFields(req.body)
    if (validationError) {
      return res.status(400).json({ error: validationError })
    }

    const result = await pool.query(
      `UPDATE walk_run_activities
       SET activity_type = $1, recorded_at = $2, duration_minutes = $3, distance = $4, distance_unit = $5, comments = $6
       WHERE id = $7
       RETURNING *`,
      [activityType, recordedAt, durationMinutes, distance, distanceUnit, comments || null, req.params.id],
    )
    res.json(toApiShape(result.rows[0]))
  } catch (err) {
    next(err)
  }
})

export default router
