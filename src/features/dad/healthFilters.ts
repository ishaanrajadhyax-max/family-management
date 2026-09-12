// Shared filtering + aggregation engine for the health graphs (Dashboard's
// Health Trends section, Insights' Blood Sugar/Blood Pressure sections) and
// for the Health Readings page's detailed filter. One set of rules lives
// here so those three surfaces can never drift apart.
//
// Pipeline order matters: filterBloodSugarReadings/filterBloodPressureReadings
// run FIRST against the raw underlying readings, and aggregateReadings only
// ever runs on that already-filtered list — never the other way around
// (averaging first and then filtering the averages would silently change
// what "100-130" means).
import type { BloodSugarReading, BloodPressureReading, ChartInterval } from './types'
import { average, formatShortDate } from './utils'

export type HealthMetric = 'all' | 'bloodSugar' | 'bloodPressure'

export const HEALTH_METRIC_LABELS: Record<HealthMetric, string> = {
  all: 'All',
  bloodSugar: 'Blood Sugar',
  bloodPressure: 'Blood Pressure',
}

export interface NumericRangeFilter {
  min: number | null
  max: number | null
  // "Blocks" (ignores) the min boundary even if a value is still typed in —
  // lets someone flip a lower bound on/off without retyping it.
  blockMin: boolean
  exactMode: boolean
  exact: number | null
}

export const DEFAULT_NUMERIC_FILTER: NumericRangeFilter = {
  min: null,
  max: null,
  blockMin: false,
  exactMode: false,
  exact: null,
}

export type DateFilterMode = 'asOf' | 'range'

export interface DateFilterState {
  mode: DateFilterMode
  asOfDate: string | null
  startDate: string | null
  endDate: string | null
}

export const DEFAULT_DATE_FILTER: DateFilterState = {
  mode: 'range',
  asOfDate: null,
  startDate: null,
  endDate: null,
}

export interface HealthFilterState {
  metric: HealthMetric
  groupBy: ChartInterval
  date: DateFilterState
  bloodSugar: NumericRangeFilter
  bloodPressure: NumericRangeFilter
  comment: string
}

export const DEFAULT_HEALTH_FILTERS: HealthFilterState = {
  metric: 'all',
  groupBy: 'daily',
  date: DEFAULT_DATE_FILTER,
  bloodSugar: DEFAULT_NUMERIC_FILTER,
  bloodPressure: DEFAULT_NUMERIC_FILTER,
  comment: '',
}

export function isNumericFilterActive(f: NumericRangeFilter): boolean {
  if (f.exactMode) return f.exact != null
  return (f.min != null && !f.blockMin) || f.max != null
}

export function passesNumericFilter(value: number, f: NumericRangeFilter): boolean {
  if (f.exactMode) {
    return f.exact == null ? true : value === f.exact
  }
  const effectiveMin = f.blockMin ? null : f.min
  if (effectiveMin != null && value < effectiveMin) return false
  if (f.max != null && value > f.max) return false
  return true
}

export function isDateFilterActive(f: DateFilterState): boolean {
  return f.mode === 'asOf' ? f.asOfDate != null : f.startDate != null || f.endDate != null
}

// Inclusive on both ends: a range of Aug 1 - Aug 31 includes both days.
export function passesDateFilter(dateStr: string, f: DateFilterState): boolean {
  if (f.mode === 'asOf') {
    return f.asOfDate == null ? true : dateStr === f.asOfDate
  }
  if (f.startDate && dateStr < f.startDate) return false
  if (f.endDate && dateStr > f.endDate) return false
  return true
}

export function passesCommentFilter(comment: string | undefined, query: string): boolean {
  const trimmed = query.trim().toLowerCase()
  if (!trimmed) return true
  return (comment ?? '').toLowerCase().includes(trimmed)
}

export function countActiveFilters(f: HealthFilterState): number {
  let count = 0
  if (isDateFilterActive(f.date)) count += 1
  if (isNumericFilterActive(f.bloodSugar)) count += 1
  if (isNumericFilterActive(f.bloodPressure)) count += 1
  if (f.comment.trim()) count += 1
  return count
}

export function filterBloodSugarReadings(
  readings: BloodSugarReading[],
  f: HealthFilterState,
): BloodSugarReading[] {
  return readings.filter(
    (r) =>
      passesDateFilter(r.date, f.date) &&
      passesNumericFilter(r.value, f.bloodSugar) &&
      passesCommentFilter(r.comments, f.comment),
  )
}

// Blood pressure's Min/Max/Exact filter is checked against the systolic
// (the commonly-tracked "top number") reading — there's one range filter
// for blood pressure, not separate ones per systolic/diastolic.
export function filterBloodPressureReadings(
  readings: BloodPressureReading[],
  f: HealthFilterState,
): BloodPressureReading[] {
  return readings.filter(
    (r) =>
      passesDateFilter(r.date, f.date) &&
      passesNumericFilter(r.systolic, f.bloodPressure) &&
      passesCommentFilter(r.comments, f.comment),
  )
}

// Every distinct, non-empty comment actually present across both reading
// types — used to populate the Comments filter's suggestions. Never
// hardcoded, never invented; reflects whatever's really been recorded.
export function collectDistinctComments(
  bloodSugarReadings: BloodSugarReading[],
  bloodPressureReadings: BloodPressureReading[],
): string[] {
  const seen = new Set<string>()
  for (const r of bloodSugarReadings) {
    if (r.comments && r.comments.trim()) seen.add(r.comments.trim())
  }
  for (const r of bloodPressureReadings) {
    if (r.comments && r.comments.trim()) seen.add(r.comments.trim())
  }
  return Array.from(seen).sort((a, b) => a.localeCompare(b))
}

// One point on a health trend chart. startDate/endDate are the *nominal*
// period boundary the point represents (e.g. the full Mon-Sun week), not
// just the span of days that happened to have a reading — so clicking a
// sparse week still drills into the whole week, matching what the axis
// label promised.
export interface AggregatedPoint {
  label: string
  value: number
  startDate: string
  endDate: string
  count: number
  ids: string[]
}

// Enough of a single reading's own fields to fill out a tooltip for a point
// that has exactly one underlying reading.
export interface ReadingDetail {
  time: string
  readingContext?: string
  comments?: string
}

function pad(n: number): string {
  return n.toString().padStart(2, '0')
}

function toDateStringUTC(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

function daysSinceEpoch(dateStr: string): number {
  return Math.floor(new Date(`${dateStr}T00:00:00Z`).getTime() / 86_400_000)
}

function addDaysUTC(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return toDateStringUTC(d)
}

function lastDayOfMonth(year: number, month1to12: number): string {
  // Day 0 of next month = last day of this month.
  const d = new Date(Date.UTC(year, month1to12, 0))
  return toDateStringUTC(d)
}

const FIXED_BUCKET_DAYS: Record<'daily' | '3d' | '5d' | 'weekly', number> = {
  daily: 1,
  '3d': 3,
  '5d': 5,
  weekly: 7,
}

// The nominal [start, end] period a given reading date falls into, for the
// chosen grouping. Fixed-size buckets (daily/3-day/5-day/weekly) are
// anchored to `rangeAnchor` (the earliest date in play) so "3-day" always
// means consecutive periods counted from the start of what's being viewed.
// Semi-monthly and monthly are true calendar periods, independent of the
// anchor, per spec.
function bucketBoundsFor(
  dateStr: string,
  groupBy: ChartInterval,
  rangeAnchor: string,
): { key: string; start: string; end: string } {
  if (groupBy === 'monthly') {
    const [year, month] = dateStr.split('-').map(Number)
    const start = `${year}-${pad(month)}-01`
    const end = lastDayOfMonth(year, month)
    return { key: `${year}-${pad(month)}`, start, end }
  }
  if (groupBy === 'semimonthly') {
    const [year, month, day] = dateStr.split('-').map(Number)
    const isFirstHalf = day <= 15
    const start = `${year}-${pad(month)}-${isFirstHalf ? '01' : '16'}`
    const end = isFirstHalf ? `${year}-${pad(month)}-15` : lastDayOfMonth(year, month)
    return { key: `${year}-${pad(month)}-${isFirstHalf ? 'a' : 'b'}`, start, end }
  }

  const bucketDays = FIXED_BUCKET_DAYS[groupBy]
  const bucketIndex = Math.floor((daysSinceEpoch(dateStr) - daysSinceEpoch(rangeAnchor)) / bucketDays)
  const start = addDaysUTC(rangeAnchor, bucketIndex * bucketDays)
  const end = addDaysUTC(start, bucketDays - 1)
  return { key: String(bucketIndex), start, end }
}

function pointLabelFor(start: string, end: string, groupBy: ChartInterval): string {
  if (groupBy === 'monthly') {
    const d = new Date(`${start}T00:00:00`)
    return d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })
  }
  if (start === end) return formatShortDate(start)
  return formatShortDate(start)
}

function bucketEntries<T extends { date: string }>(
  entries: T[],
  groupBy: ChartInterval,
): { start: string; end: string; items: T[] }[] {
  if (entries.length === 0) return []
  const rangeAnchor = entries.map((e) => e.date).sort()[0]

  const buckets = new Map<string, { start: string; end: string; items: T[] }>()
  for (const entry of entries) {
    const { key, start, end } = bucketBoundsFor(entry.date, groupBy, rangeAnchor)
    const bucket = buckets.get(key)
    if (bucket) {
      bucket.items.push(entry)
    } else {
      buckets.set(key, { start, end, items: [entry] })
    }
  }

  return Array.from(buckets.values()).sort((a, b) => a.start.localeCompare(b.start))
}

// Groups already-filtered entries into AggregatedPoints, averaging
// valueGetter's result within each period. Never invents or interpolates a
// point for a period with zero underlying readings — only periods that
// actually have at least one reading appear.
export function aggregateReadings<T extends { id: string; date: string }>(
  entries: T[],
  groupBy: ChartInterval,
  valueGetter: (entry: T) => number,
): AggregatedPoint[] {
  return bucketEntries(entries, groupBy).map(({ start, end, items }) => ({
    label: pointLabelFor(start, end, groupBy),
    value: average(items.map(valueGetter)) ?? 0,
    startDate: start,
    endDate: end,
    count: items.length,
    ids: items.map((i) => i.id),
  }))
}

// Like aggregateReadings, but counts entries per period instead of
// averaging a value — used for "consistency" style charts (gym sessions).
export function aggregateReadingsCount<T extends { id: string; date: string }>(
  entries: T[],
  groupBy: ChartInterval,
): AggregatedPoint[] {
  return bucketEntries(entries, groupBy).map(({ start, end, items }) => ({
    label: pointLabelFor(start, end, groupBy),
    value: items.length,
    startDate: start,
    endDate: end,
    count: items.length,
    ids: items.map((i) => i.id),
  }))
}
