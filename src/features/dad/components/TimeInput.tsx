import { useState } from 'react'

interface TimeInputProps {
  idPrefix: string
  value: string // canonical 24-hour 'HH:mm' — same contract regardless of display mode
  onChange: (value: string) => void
}

type TimeMode = '24h' | '12h'
type Period = 'AM' | 'PM'

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function to12Hour(hour24: number): { hour12: number; period: Period } {
  const period: Period = hour24 >= 12 ? 'PM' : 'AM'
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12
  return { hour12, period }
}

function to24Hour(hour12: number, period: Period): number {
  const h = hour12 % 12
  return period === 'PM' ? h + 12 : h
}

function digitsFor(value: string, mode: TimeMode): string {
  const [h, m] = value.split(':').map(Number)
  if (mode === '24h') return `${pad(h)}${pad(m)}`
  return `${pad(to12Hour(h).hour12)}${pad(m)}`
}

function periodFor(value: string): Period {
  const [h] = value.split(':').map(Number)
  return to12Hour(h).period
}

// Typing four digits and committing them to a canonical hour/minute.
function commit(digits: string, mode: TimeMode, period: Period): string {
  const hourPart = Number(digits.slice(0, 2))
  const minutePart = Math.min(59, Number(digits.slice(2, 4)) || 0)
  if (mode === '24h') {
    return `${pad(Math.min(23, hourPart))}:${pad(minutePart)}`
  }
  const hour12 = Math.min(12, Math.max(1, hourPart || 12))
  return `${pad(to24Hour(hour12, period))}:${pad(minutePart)}`
}

// Lets Dad (or whoever's entering a reading) pick whichever time format
// they think in — 12-hour with AM/PM, or 24-hour ("military") — and just
// type four digits (e.g. "1430") rather than fiddling with a native
// <input type="time">, whose displayed format follows browser/OS locale
// and can't be forced either way. Both modes read/write the same canonical
// 'HH:mm' value, so switching modes re-displays the same moment instead of
// needing to be re-entered, and the default is still whatever the form
// itself defaults to (current time, or an existing reading's time).
export default function TimeInput({ idPrefix, value, onChange }: TimeInputProps) {
  const [mode, setMode] = useState<TimeMode>('24h')
  const [digits, setDigits] = useState(() => digitsFor(value, '24h'))
  const [period, setPeriod] = useState<Period>(() => periodFor(value))

  const displayValue = digits.length > 2 ? `${digits.slice(0, 2)}:${digits.slice(2)}` : digits

  function handleDigitsChange(raw: string) {
    const next = raw.replace(/\D/g, '').slice(0, 4)
    setDigits(next)
    if (next.length === 4) {
      onChange(commit(next, mode, period))
    }
  }

  function switchMode(nextMode: TimeMode) {
    if (nextMode === mode) return
    // Re-derive from the last committed value, not the in-progress digit
    // buffer, so a half-typed edit doesn't carry over oddly across modes.
    setDigits(digitsFor(value, nextMode))
    if (nextMode === '12h') setPeriod(periodFor(value))
    setMode(nextMode)
  }

  function togglePeriod() {
    const next: Period = period === 'AM' ? 'PM' : 'AM'
    setPeriod(next)
    if (digits.length === 4) {
      onChange(commit(digits, mode, next))
    }
  }

  return (
    <div className="dad-time-input">
      <div className="dad-time-mode-toggle" role="group" aria-label="Time format">
        <button
          type="button"
          className={mode === '24h' ? 'active' : ''}
          onClick={() => switchMode('24h')}
        >
          24-hour
        </button>
        <button
          type="button"
          className={mode === '12h' ? 'active' : ''}
          onClick={() => switchMode('12h')}
        >
          12-hour
        </button>
      </div>
      <div className="dad-time-fields">
        <input
          id={`${idPrefix}-digits`}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={5}
          placeholder={mode === '24h' ? 'HH:MM' : 'HH:MM'}
          value={displayValue}
          onChange={(e) => handleDigitsChange(e.target.value)}
          aria-label={mode === '24h' ? 'Time, 24-hour, four digits' : 'Time, 12-hour, four digits'}
          required
        />
        {mode === '12h' && (
          <button type="button" className="dad-time-period-toggle" onClick={togglePeriod}>
            {period}
          </button>
        )}
      </div>
    </div>
  )
}
