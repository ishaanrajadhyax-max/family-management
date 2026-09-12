// Shared types for the Dad section.
// These shapes are designed to map cleanly onto future PostgreSQL tables.

export type GlucoseUnit = 'mg/dL' | 'mmol/L'
export type DistanceUnit = 'km' | 'mi'

export type WorkoutFocus =
  | 'Chest'
  | 'Back'
  | 'Shoulders'
  | 'Legs'
  | 'Arms'
  | 'Full Body'
  | 'Other'

export type ActivityType = 'Walking' | 'Running'

// When during the day a blood sugar / blood pressure reading was taken.
// Mirrors the database's reading_context CHECK constraint exactly.
export type ReadingContext = 'Fasting' | 'Before Lunch' | 'After Lunch' | 'Before Dinner' | 'After Dinner'

export const READING_CONTEXTS: ReadingContext[] = [
  'Fasting',
  'Before Lunch',
  'After Lunch',
  'Before Dinner',
  'After Dinner',
]

export interface BloodSugarReading {
  id: string
  date: string // 'YYYY-MM-DD'
  time: string // 'HH:mm' (24h)
  readingContext: ReadingContext
  value: number
  unit: GlucoseUnit
  comments?: string
}

export interface BloodPressureReading {
  id: string
  date: string
  time: string
  readingContext: ReadingContext
  systolic: number
  diastolic: number
  pulse?: number
  comments?: string
}

export interface WalkRunActivity {
  id: string
  activityType: ActivityType
  date: string
  startTime: string
  durationMinutes: number
  distance: number
  distanceUnit: DistanceUnit
  comments?: string
}

export interface GymActivity {
  id: string
  date: string
  time: string
  focus: WorkoutFocus
  exercises: string
  durationMinutes?: number
  comments?: string
}

// The selectable analysis windows used on the Dashboard and Insights pages.
export type Period = 'today' | '7d' | 'month' | '3m' | '6m'

export const PERIOD_LABELS: Record<Period, string> = {
  today: 'Today',
  '7d': 'Last 7 days',
  month: 'This month',
  '3m': 'Last 3 months',
  '6m': 'Last 6 months',
}

// How multiple readings within the selected period are grouped into one
// chart point — e.g. "weekly" averages every 7 days together. Used on the
// Insights page so a long period (like "Last 6 months") doesn't try to plot
// a point per day.
export type ChartInterval = 'daily' | '3d' | '5d' | 'weekly' | 'semimonthly' | 'monthly'

export const CHART_INTERVAL_LABELS: Record<ChartInterval, string> = {
  daily: 'Daily',
  '3d': 'Every 3 Days',
  '5d': 'Every 5 Days',
  weekly: 'Weekly Average',
  semimonthly: 'Semi-Monthly Average',
  monthly: 'Monthly Average',
}

// A flattened, unified shape used by the History page and the
// "Recent Activity" list on the Dashboard, so readings and activities
// of different kinds can be shown in one chronological list.
export interface HistoryEntry {
  id: string
  date: string
  time: string
  category: 'Health Reading' | 'Activity'
  type: string
  summary: string
  comments?: string
}
