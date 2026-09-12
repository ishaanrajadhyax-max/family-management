import { useState } from 'react'
import type { FormEvent } from 'react'
import { useDadData } from '../DadDataContext'
import type { ActivityType, DistanceUnit, WalkRunActivity } from '../types'
import { toDateString, toTimeString } from '../utils'

interface WalkRunFormProps {
  onSaved: () => void
  // Required when adding (Activity page asks for a specific type up front).
  // Ignored when editing — the existing record's own type is used instead.
  initialType?: ActivityType
  existing?: WalkRunActivity
}

export default function WalkRunForm({ initialType, onSaved, existing }: WalkRunFormProps) {
  const { addWalkRunActivity, updateWalkRunActivity } = useDadData()

  const [activityType, setActivityType] = useState<ActivityType>(existing?.activityType ?? initialType ?? 'Walking')
  const [date, setDate] = useState(existing?.date ?? toDateString())
  const [startTime, setStartTime] = useState(existing?.startTime ?? toTimeString())
  const [duration, setDuration] = useState(existing ? String(existing.durationMinutes) : '')
  const [distance, setDistance] = useState(existing ? String(existing.distance) : '')
  const [distanceUnit, setDistanceUnit] = useState<DistanceUnit>(existing?.distanceUnit ?? 'km')
  const [comments, setComments] = useState(existing?.comments ?? '')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')

  const durationNum = Number(duration)
  const distanceNum = Number(distance)
  const canComputePace =
    duration && distance && !Number.isNaN(durationNum) && !Number.isNaN(distanceNum) && distanceNum > 0
  const pace = canComputePace ? (durationNum / distanceNum).toFixed(1) : null

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!date || !startTime || !duration || !distance) return
    if (Number.isNaN(durationNum) || Number.isNaN(distanceNum)) return

    setIsSaving(true)
    setError('')
    try {
      const payload = {
        activityType,
        date,
        startTime,
        durationMinutes: durationNum,
        distance: distanceNum,
        distanceUnit,
        comments: comments.trim() || undefined,
      }
      if (existing) {
        await updateWalkRunActivity(existing.id, payload)
      } else {
        await addWalkRunActivity(payload)
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
        <label htmlFor="wr-type">Activity type</label>
        <select
          id="wr-type"
          value={activityType}
          onChange={(e) => setActivityType(e.target.value as ActivityType)}
        >
          <option value="Walking">Walking</option>
          <option value="Running">Running</option>
        </select>
      </div>
      <div className="dad-form-row">
        <label htmlFor="wr-date">Date</label>
        <input id="wr-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
      </div>
      <div className="dad-form-row">
        <label htmlFor="wr-start">Start time</label>
        <input id="wr-start" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} required />
      </div>
      <div className="dad-form-row">
        <label htmlFor="wr-duration">Duration (minutes)</label>
        <input
          id="wr-duration"
          type="number"
          inputMode="numeric"
          min={0}
          placeholder="e.g. 45"
          value={duration}
          onChange={(e) => setDuration(e.target.value)}
          required
          autoFocus
        />
      </div>
      <div className="dad-form-row">
        <label htmlFor="wr-distance">Distance</label>
        <div className="dad-form-inline">
          <input
            id="wr-distance"
            type="number"
            inputMode="decimal"
            min={0}
            step="0.1"
            placeholder="e.g. 5"
            value={distance}
            onChange={(e) => setDistance(e.target.value)}
            required
          />
          <select value={distanceUnit} onChange={(e) => setDistanceUnit(e.target.value as DistanceUnit)}>
            <option value="km">km</option>
            <option value="mi">mi</option>
          </select>
        </div>
      </div>
      {pace && (
        <p className="dad-form-hint">
          Pace: {pace} min/{distanceUnit}
        </p>
      )}
      <div className="dad-form-row">
        <label htmlFor="wr-comments">Comments (optional)</label>
        <textarea
          id="wr-comments"
          placeholder="e.g. Felt good, cool morning"
          value={comments}
          onChange={(e) => setComments(e.target.value)}
          rows={2}
        />
      </div>
      {error && <p className="dad-form-error">{error}</p>}
      <button type="submit" className="dad-btn-primary" disabled={isSaving}>
        {isSaving ? 'Saving…' : existing ? 'Update Activity' : 'Save Activity'}
      </button>
    </form>
  )
}
