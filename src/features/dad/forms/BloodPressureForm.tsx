import { useState } from 'react'
import type { FormEvent } from 'react'
import { useDadData } from '../DadDataContext'
import TimeInput from '../components/TimeInput'
import type { BloodPressureReading, ReadingContext } from '../types'
import { READING_CONTEXTS } from '../types'
import { toDateString, toTimeString } from '../utils'

interface BloodPressureFormProps {
  onSaved: () => void
  existing?: BloodPressureReading
}

export default function BloodPressureForm({ onSaved, existing }: BloodPressureFormProps) {
  const { addBloodPressureReading, updateBloodPressureReading } = useDadData()

  const [date, setDate] = useState(existing?.date ?? toDateString())
  const [time, setTime] = useState(existing?.time ?? toTimeString())
  const [readingContext, setReadingContext] = useState<ReadingContext>(existing?.readingContext ?? 'Fasting')
  const [systolic, setSystolic] = useState(existing ? String(existing.systolic) : '')
  const [diastolic, setDiastolic] = useState(existing ? String(existing.diastolic) : '')
  const [pulse, setPulse] = useState(existing?.pulse ? String(existing.pulse) : '')
  const [comments, setComments] = useState(existing?.comments ?? '')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const systolicValue = Number(systolic)
    const diastolicValue = Number(diastolic)
    if (!date || !time || !systolic || !diastolic) return
    if (Number.isNaN(systolicValue) || Number.isNaN(diastolicValue)) return

    setIsSaving(true)
    setError('')
    try {
      const payload = {
        date,
        time,
        readingContext,
        systolic: systolicValue,
        diastolic: diastolicValue,
        pulse: pulse ? Number(pulse) : undefined,
        comments: comments.trim() || undefined,
      }
      if (existing) {
        await updateBloodPressureReading(existing.id, payload)
      } else {
        await addBloodPressureReading(payload)
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
        <label htmlFor="bp-date">Date</label>
        <input id="bp-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
      </div>
      <div className="dad-form-row">
        <label htmlFor="bp-time-digits">Time</label>
        <TimeInput idPrefix="bp-time" value={time} onChange={setTime} />
      </div>
      <div className="dad-form-row">
        <label htmlFor="bp-context">When</label>
        <select
          id="bp-context"
          value={readingContext}
          onChange={(e) => setReadingContext(e.target.value as ReadingContext)}
        >
          {READING_CONTEXTS.map((context) => (
            <option key={context} value={context}>{context}</option>
          ))}
        </select>
      </div>
      <div className="dad-form-row">
        <label htmlFor="bp-systolic">Systolic (mmHg)</label>
        <input
          id="bp-systolic"
          type="number"
          inputMode="numeric"
          min={0}
          placeholder="e.g. 128"
          value={systolic}
          onChange={(e) => setSystolic(e.target.value)}
          required
          autoFocus
        />
      </div>
      <div className="dad-form-row">
        <label htmlFor="bp-diastolic">Diastolic (mmHg)</label>
        <input
          id="bp-diastolic"
          type="number"
          inputMode="numeric"
          min={0}
          placeholder="e.g. 82"
          value={diastolic}
          onChange={(e) => setDiastolic(e.target.value)}
          required
        />
      </div>
      <div className="dad-form-row">
        <label htmlFor="bp-pulse">Pulse / heart rate (optional, BPM)</label>
        <input
          id="bp-pulse"
          type="number"
          inputMode="numeric"
          min={0}
          placeholder="e.g. 74"
          value={pulse}
          onChange={(e) => setPulse(e.target.value)}
        />
      </div>
      <div className="dad-form-row">
        <label htmlFor="bp-comments">Comments (optional)</label>
        <textarea
          id="bp-comments"
          placeholder="e.g. Taken while resting"
          value={comments}
          onChange={(e) => setComments(e.target.value)}
          rows={2}
        />
      </div>
      {error && <p className="dad-form-error">{error}</p>}
      <button type="submit" className="dad-btn-primary" disabled={isSaving}>
        {isSaving ? 'Saving…' : existing ? 'Update Reading' : 'Save Reading'}
      </button>
    </form>
  )
}
