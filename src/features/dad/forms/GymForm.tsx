import { useState } from 'react'
import type { FormEvent } from 'react'
import { useDadData } from '../DadDataContext'
import type { GymActivity, WorkoutFocus } from '../types'
import { toDateString, toTimeString } from '../utils'

interface GymFormProps {
  onSaved: () => void
  existing?: GymActivity
}

const WORKOUT_FOCUS_OPTIONS: WorkoutFocus[] = [
  'Chest',
  'Back',
  'Shoulders',
  'Legs',
  'Arms',
  'Full Body',
  'Other',
]

export default function GymForm({ onSaved, existing }: GymFormProps) {
  const { addGymActivity, updateGymActivity } = useDadData()

  const [date, setDate] = useState(existing?.date ?? toDateString())
  const [time, setTime] = useState(existing?.time ?? toTimeString())
  const [focus, setFocus] = useState<WorkoutFocus>(existing?.focus ?? 'Chest')
  const [exercises, setExercises] = useState(existing?.exercises ?? '')
  const [duration, setDuration] = useState(existing?.durationMinutes ? String(existing.durationMinutes) : '')
  const [comments, setComments] = useState(existing?.comments ?? '')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!date || !time) return

    setIsSaving(true)
    setError('')
    try {
      const payload = {
        date,
        time,
        focus,
        exercises: exercises.trim(),
        durationMinutes: duration ? Number(duration) : undefined,
        comments: comments.trim() || undefined,
      }
      if (existing) {
        await updateGymActivity(existing.id, payload)
      } else {
        await addGymActivity(payload)
      }
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save. Please try again.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <form className="dad-form" onSubmit={handleSubmit}>
      <div className="dad-form-row">
        <label htmlFor="gym-date">Date</label>
        <input id="gym-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
      </div>
      <div className="dad-form-row">
        <label htmlFor="gym-time">Time</label>
        <input id="gym-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} required />
      </div>
      <div className="dad-form-row">
        <label htmlFor="gym-focus">Workout focus</label>
        <select id="gym-focus" value={focus} onChange={(e) => setFocus(e.target.value as WorkoutFocus)}>
          {WORKOUT_FOCUS_OPTIONS.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      </div>
      <div className="dad-form-row">
        <label htmlFor="gym-exercises">Exercise(s) (optional)</label>
        <input
          id="gym-exercises"
          type="text"
          placeholder="e.g. Bench press, incline dumbbell press"
          value={exercises}
          onChange={(e) => setExercises(e.target.value)}
        />
      </div>
      <div className="dad-form-row">
        <label htmlFor="gym-duration">Duration in minutes (optional)</label>
        <input
          id="gym-duration"
          type="number"
          inputMode="numeric"
          min={0}
          placeholder="e.g. 50"
          value={duration}
          onChange={(e) => setDuration(e.target.value)}
        />
      </div>
      <div className="dad-form-row">
        <label htmlFor="gym-comments">Notes / comments (optional)</label>
        <textarea
          id="gym-comments"
          placeholder="e.g. Increased weight on squats"
          value={comments}
          onChange={(e) => setComments(e.target.value)}
          rows={2}
        />
      </div>
      {error && <p className="dad-form-error">{error}</p>}
      <button type="submit" className="dad-btn-primary" disabled={isSaving}>
        {isSaving ? 'Saving…' : existing ? 'Update Session' : 'Save Session'}
      </button>
    </form>
  )
}
