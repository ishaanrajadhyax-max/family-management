import { useState } from 'react'

interface MilitaryTimeInputProps {
  idPrefix: string
  value: string // 'HH:mm', 24-hour
  onChange: (value: string) => void
}

function clampInt(raw: string, min: number, max: number): number {
  const n = Math.trunc(Number(raw))
  if (Number.isNaN(n)) return min
  return Math.min(max, Math.max(min, n))
}

// Two plain number inputs (Hour 0-23 / Minute 0-59) instead of the browser's
// native <input type="time">, whose displayed format (12-hour with AM/PM vs.
// 24-hour) follows the OS/browser locale and can't be forced via HTML alone.
// Dad records everything in 24-hour ("military") time, so this guarantees
// that regardless of whose browser or device it's opened on. The value/
// onChange contract is unchanged — still a plain 'HH:mm' string — so nothing
// else in the app (storage, display formatting) needs to know this exists.
export default function MilitaryTimeInput({ idPrefix, value, onChange }: MilitaryTimeInputProps) {
  const [initialHour, initialMinute] = value.split(':')
  const [hour, setHour] = useState(initialHour ?? '00')
  const [minute, setMinute] = useState(initialMinute ?? '00')

  function commit(nextHour: string, nextMinute: string) {
    const h = clampInt(nextHour, 0, 23)
    const m = clampInt(nextMinute, 0, 59)
    onChange(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
  }

  return (
    <div className="dad-military-time">
      <input
        id={`${idPrefix}-hour`}
        type="number"
        inputMode="numeric"
        min={0}
        max={23}
        value={hour}
        onChange={(e) => {
          setHour(e.target.value)
          commit(e.target.value, minute)
        }}
        aria-label="Hour (24-hour)"
        required
      />
      <span className="dad-military-time-sep">:</span>
      <input
        type="number"
        inputMode="numeric"
        min={0}
        max={59}
        value={minute}
        onChange={(e) => {
          setMinute(e.target.value)
          commit(hour, e.target.value)
        }}
        aria-label="Minute"
        required
      />
      <span className="dad-military-time-hint">24-hr</span>
    </div>
  )
}
