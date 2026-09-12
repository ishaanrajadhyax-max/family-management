import { useState } from 'react'
import type { FormEvent } from 'react'
import { useDadData } from '../DadDataContext'
import type { HeartRateReading } from '../types'
import { toDateString, toTimeString } from '../utils'

interface HeartRateFormProps {
  onSaved: () => void
  existing?: HeartRateReading
}

export default function HeartRateForm({ onSaved, existing }: HeartRateFormProps) {
  const { addHeartRateReading, updateHeartRateReading } = useDadData()

  const [date, setDate] = useState(existing?.date ?? toDateString())
  const [time, setTime] = useState(existing?.time ?? toTimeString())
  const [value, setValue] = useState(existing ? String(existing.value) : '')
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
      const payload = { date, time, value: numericValue, comments: comments.trim() || undefined }
      if (existing) {
        await updateHeartRateReading(existing.id, payload)
      } else {
        await addHeartRateReading(payload)
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
        <label htmlFor="hr-date">Date</label>
        <input id="hr-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
      </div>
      <div className="dad-form-row">
        <label htmlFor="hr-time">Time</label>
        <input id="hr-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} required />
      </div>
      <div className="dad-form-row">
        <label htmlFor="hr-value">Heart rate (BPM)</label>
        <input
          id="hr-value"
          type="number"
          inputMode="numeric"
          min={0}
          placeholder="e.g. 72"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          required
          autoFocus
        />
      </div>
      <div className="dad-form-row">
        <label htmlFor="hr-comments">Comments (optional)</label>
        <textarea
          id="hr-comments"
          placeholder="e.g. Resting, first thing in the morning"
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
