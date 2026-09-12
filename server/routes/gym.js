import { Router } from 'express'
import { pool } from '../db.js'
import { getScopedFamilyMemberId, canAccessFamilyMember } from '../auth/access.js'

const router = Router()

const WORKOUT_FOCUS_OPTIONS = ['Chest', 'Back', 'Shoulders', 'Legs', 'Arms', 'Full Body', 'Other']

function toApiShape(row) {
  return {
    id: row.id,
    familyMemberId: row.family_member_id,
    recordedAt: row.recorded_at,
    focus: row.focus,
    exercises: row.exercises,
    durationMinutes: row.duration_minutes,
    source: row.source,
    comments: row.comments,
  }
}

// GET /api/gym-activities?familyMemberId=...
router.get('/', async (req, res, next) => {
  try {
    const familyMemberId = getScopedFamilyMemberId(req.user, req.query.familyMemberId)
    if (!familyMemberId) {
      return res.status(403).json({ error: "Not authorized to view this family member's data" })
    }
    const result = await pool.query(
      'SELECT * FROM gym_activities WHERE family_member_id = $1 ORDER BY recorded_at DESC',
      [familyMemberId],
    )
    res.json(result.rows.map(toApiShape))
  } catch (err) {
    next(err)
  }
})

function validateFields({ recordedAt, focus, durationMinutes }) {
  if (!recordedAt || !focus) {
    return 'recordedAt and focus are required'
  }
  if (!WORKOUT_FOCUS_OPTIONS.includes(focus)) {
    return `focus must be one of: ${WORKOUT_FOCUS_OPTIONS.join(', ')}`
  }
  if (durationMinutes !== undefined && durationMinutes !== null && (typeof durationMinutes !== 'number' || durationMinutes <= 0)) {
    return 'durationMinutes must be a positive number when provided'
  }
  return null
}

// POST /api/gym-activities
// Body: { familyMemberId, recordedAt, focus, exercises?, durationMinutes?, comments? }
router.post('/', async (req, res, next) => {
  try {
    const familyMemberId = getScopedFamilyMemberId(req.user, req.body.familyMemberId)
    if (!familyMemberId) {
      return res.status(403).json({ error: 'Not authorized to add a session for this family member' })
    }
    const { recordedAt, focus, exercises, durationMinutes, comments } = req.body
    const validationError = validateFields(req.body)
    if (validationError) {
      return res.status(400).json({ error: validationError })
    }

    const result = await pool.query(
      `INSERT INTO gym_activities
         (family_member_id, recorded_at, focus, exercises, duration_minutes, source, comments)
       VALUES ($1, $2, $3, $4, $5, 'app', $6)
       RETURNING *`,
      [familyMemberId, recordedAt, focus, exercises || null, durationMinutes || null, comments || null],
    )
    res.status(201).json(toApiShape(result.rows[0]))
  } catch (err) {
    next(err)
  }
})

// PUT /api/gym-activities/:id
// Body: { recordedAt, focus, exercises?, durationMinutes?, comments? }
router.put('/:id', async (req, res, next) => {
  try {
    const existing = await pool.query(
      'SELECT family_member_id FROM gym_activities WHERE id = $1',
      [req.params.id],
    )
    if (existing.rowCount === 0) {
      return res.status(404).json({ error: 'Activity not found' })
    }
    if (!canAccessFamilyMember(req.user, existing.rows[0].family_member_id)) {
      return res.status(403).json({ error: 'Not authorized to edit this session' })
    }

    const { recordedAt, focus, exercises, durationMinutes, comments } = req.body
    const validationError = validateFields(req.body)
    if (validationError) {
      return res.status(400).json({ error: validationError })
    }

    const result = await pool.query(
      `UPDATE gym_activities
       SET recorded_at = $1, focus = $2, exercises = $3, duration_minutes = $4, comments = $5
       WHERE id = $6
       RETURNING *`,
      [recordedAt, focus, exercises || null, durationMinutes || null, comments || null, req.params.id],
    )
    res.json(toApiShape(result.rows[0]))
  } catch (err) {
    next(err)
  }
})

export default router
