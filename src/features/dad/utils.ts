// Small date/time and formatting helpers shared across the Dad section.
import type { Period } from './types'

function pad(n: number): string {
  return n.toString().padStart(2, '0')
}

// 'YYYY-MM-DD' for the given date (local time), defaults to now.
export function toDateString(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// 'HH:mm' (24h, local time) for the given date, defaults to now.
export function toTimeString(d: Date = new Date()): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function formatDateDisplay(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`)
  if (Number.isNaN(d.getTime())) return dateStr
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

// Short "11 Sep" form used as chart axis labels.
export function formatShortDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`)
  if (Number.isNaN(d.getTime())) return dateStr
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

export function formatTimeDisplay(timeStr: string): string {
  const [hoursStr, minutesStr] = timeStr.split(':')
  const hours = Number(hoursStr)
  const minutes = Number(minutesStr)
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return timeStr
  const period = hours >= 12 ? 'PM' : 'AM'
  const displayHour = hours % 12 === 0 ? 12 : hours % 12
  return `${displayHour}:${pad(minutes)} ${period}`
}

export function generateId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

// The family is in India and the database stores recorded_at as the actual
// India-local moment (see db/schema.sql's TIMEZONE note). These two
// helpers keep that consistent at the API boundary, regardless of what
// timezone the browser itself happens to be set to.
const IST_TIME_ZONE = 'Asia/Kolkata'

// ISO timestamp (as returned by the API) -> separate date/time strings for
// display and for pre-filling forms, both in IST.
export function isoToIstDateTime(iso: string): { date: string; time: string } {
  const d = new Date(iso)
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: IST_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    time: `${get('hour')}:${get('minute')}`,
  }
}

// Form date/time strings (entered as IST wall-clock values) -> an ISO
// timestamp with an explicit +05:30 offset the API/database can store
// unambiguously, regardless of the browser's own timezone.
export function istDateTimeToIso(date: string, time: string): string {
  return `${date}T${time}:00+05:30`
}

// Whether a 'YYYY-MM-DD' date string falls inside the given period,
// relative to today.
export function isWithinPeriod(dateStr: string, period: Period): boolean {
  const entryDate = new Date(`${dateStr}T00:00:00`)
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const dayDiff = Math.round(
    (today.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24),
  )

  switch (period) {
    case 'today':
      return dayDiff === 0
    case '7d':
      return dayDiff >= 0 && dayDiff < 7
    case 'month':
      return (
        entryDate.getFullYear() === today.getFullYear() &&
        entryDate.getMonth() === today.getMonth()
      )
    case '3m':
      return dayDiff >= 0 && dayDiff < 92
    case '6m':
      return dayDiff >= 0 && dayDiff < 183
    default:
      return true
  }
}

// Sorts newest-first by date then time.
export function byMostRecent<T extends { date: string; time: string }>(
  a: T,
  b: T,
): number {
  const aKey = `${a.date}T${a.time}`
  const bKey = `${b.date}T${b.time}`
  return bKey.localeCompare(aKey)
}

export function average(values: number[]): number | null {
  if (values.length === 0) return null
  return Math.round((values.reduce((sum, v) => sum + v, 0) / values.length) * 10) / 10
}

// Groups entries by date, averages a numeric field per day, and returns
// chronologically ordered {label, value} points ready for TrendChart.
export function buildDailyAveragePoints<T extends { date: string }>(
  entries: T[],
  period: Period,
  valueGetter: (entry: T) => number,
): { label: string; value: number }[] {
  const byDate = new Map<string, number[]>()
  entries
    .filter((entry) => isWithinPeriod(entry.date, period))
    .forEach((entry) => {
      const values = byDate.get(entry.date) ?? []
      values.push(valueGetter(entry))
      byDate.set(entry.date, values)
    })

  return Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, values]) => ({
      label: formatShortDate(date),
      value: average(values) ?? 0,
    }))
}

// Counts how many entries fall on each date within the period. Used for
// "consistency" style charts (e.g. gym sessions per day).
export function buildDailyCountPoints<T extends { date: string }>(
  entries: T[],
  period: Period,
): { label: string; value: number }[] {
  const byDate = new Map<string, number>()
  entries
    .filter((entry) => isWithinPeriod(entry.date, period))
    .forEach((entry) => {
      byDate.set(entry.date, (byDate.get(entry.date) ?? 0) + 1)
    })

  return Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ label: formatShortDate(date), value: count }))
}
