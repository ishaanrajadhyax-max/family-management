import { useState } from 'react'
import type { FormEvent } from 'react'
import { useDadData } from '../DadDataContext'
import MilitaryTimeInput from '../components/MilitaryTimeInput'
import type { BloodSugarReading, GlucoseUnit, ReadingContext } from '../types'
import { READING_CONTEXTS } from '../types'
import { toDateString, toTimeString } from '../utils'

interface BloodSugarFormProps {
  onSaved: () => void
  // When editing an existing reading, its current values pre-fill the form
  // and submitting calls the update API instead of creating a new row.
  existing?: BloodSugarReading
}

export default function BloodSugarForm({ onSaved, existing }: BloodSugarFormProps) {
  const { addBloodSugarReading, updateBloodSugarReading } = useDadData()

  // Date/time default to right now, the moment the form is opened — unless
  // we're editing, in which case they default to the reading's own values.
  const [date, setDate] = useState(existing?.date ?? toDateString())
  const [time, setTime] = useState(existing?.time ?? toTimeString())
  const [readingContext, setReadingContext] = useState<ReadingContext>(existing?.readingContext ?? 'Fasting')
  const [value, setValue] = useState(existing ? String(existing.value) : '')
  const [unit, setUnit] = useState<GlucoseUnit>(existing?.unit ?? 'mg/dL')
  const [comments, setComments] = useState(existing?.comments ?? '')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const numericValue = Number(value)
    if (!date || !time || !value || Number.isNaN(numericValue)) return

    setIsSaving(true)
    setError('')
    try {
      const payload = {
        date,
        time,
        readingContext,
        value: numericValue,
        unit,
        comments: comments.trim() || undefined,
      }
      if (existing) {
        await updateBloodSugarReading(existing.id, payload)
      } else {
        await addBloodSugarReading(payload)
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
        <label htmlFor="bs-date">Date</label>
        <input id="bs-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
      </div>
      <div className="dad-form-row">
        <label htmlFor="bs-time-hour">Time</label>
        <MilitaryTimeInput idPrefix="bs-time" value={time} onChange={setTime} />
      </div>
      <div className="dad-form-row">
        <label htmlFor="bs-context">When</label>
        <select
          id="bs-context"
          value={readingContext}
          onChange={(e) => setReadingContext(e.target.value as ReadingContext)}
        >
          {READING_CONTEXTS.map((context) => (
            <option key={context} value={context}>{context}</option>
          ))}
        </select>
      </div>
      <div className="dad-form-row">
        <label htmlFor="bs-value">Blood sugar value</label>
        <div className="dad-form-inline">
          <input
            id="bs-value"
            type="number"
            inputMode="decimal"
            min={0}
            step="0.1"
            placeholder="e.g. 110"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            required
            autoFocus
          />
          <select value={unit} onChange={(e) => setUnit(e.target.value as GlucoseUnit)}>
            <option value="mg/dL">mg/dL</option>
            <option value="mmol/L">mmol/L</option>
          </select>
        </div>
      </div>
      <div className="dad-form-row">
        <label htmlFor="bs-comments">Comments (optional)</label>
        <textarea
          id="bs-comments"
          placeholder="e.g. Before breakfast"
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
