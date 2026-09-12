import { useMemo, useState } from 'react'
import { useDadData } from '../DadDataContext'
import type { Period } from '../types'
import { CHART_INTERVAL_LABELS } from '../types'
import PeriodSelector from '../components/PeriodSelector'
import StatCard from '../components/StatCard'
import SectionCard from '../components/SectionCard'
import TrendChart from '../components/TrendChart'
import HealthChartToolbar from '../components/HealthChartToolbar'
import EmptyState from '../components/EmptyState'
import { BLOOD_SUGAR_Y_DOMAIN, SYSTOLIC_Y_DOMAIN } from '../chartConstants'
import type { HealthFilterState } from '../healthFilters'
import {
  DEFAULT_HEALTH_FILTERS,
  filterBloodSugarReadings,
  filterBloodPressureReadings,
  aggregateReadings,
  collectDistinctComments,
} from '../healthFilters'
import {
  byMostRecent,
  formatDateDisplay,
  formatTimeDisplay,
  isWithinPeriod,
  toDateString,
} from '../utils'

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

interface DashboardPageProps {
  onDrilldown: (metric: 'bloodSugar' | 'bloodPressure', startDate: string, endDate: string) => void
}

export default function DashboardPage({ onDrilldown }: DashboardPageProps) {
  const {
    bloodSugarReadings,
    bloodPressureReadings,
    walkRunActivities,
    gymActivities,
    historyEntries,
  } = useDadData()

  const [period, setPeriod] = useState<Period>('7d')
  const today = toDateString()

  // --- Today's Snapshot -----------------------------------------------
  const latestBloodSugar = [...bloodSugarReadings].sort(byMostRecent)[0]
  const latestBloodPressure = [...bloodPressureReadings].sort(byMostRecent)[0]

  const todaysReadingsCount =
    bloodSugarReadings.filter((r) => r.date === today).length +
    bloodPressureReadings.filter((r) => r.date === today).length

  const todaysActivities = historyEntries.filter(
    (e) => e.category === 'Activity' && e.date === today,
  )
  const todaysActivitySummary =
    todaysActivities.length > 0
      ? todaysActivities.map((a) => `${a.type} (${a.summary})`).join(' · ')
      : 'No activity logged yet'

  // --- Activity Summary (for the selected period) ----------------------
  const periodWalks = walkRunActivities.filter(
    (a) => a.activityType === 'Walking' && isWithinPeriod(a.date, period),
  )
  const periodRuns = walkRunActivities.filter(
    (a) => a.activityType === 'Running' && isWithinPeriod(a.date, period),
  )
  const periodGymSessions = gymActivities.filter((a) => isWithinPeriod(a.date, period))

  const totalWalkDistance = periodWalks.reduce((sum, a) => sum + a.distance, 0)
  const totalRunDistance = periodRuns.reduce((sum, a) => sum + a.distance, 0)

  // Last 7 days, oldest to newest, with a dot for each type of activity done that day.
  const weeklyOverview = useMemo(() => {
    const days: { label: string; date: string; walked: boolean; ran: boolean; gym: boolean }[] = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const dateStr = toDateString(d)
      days.push({
        label: WEEKDAY_LABELS[(d.getDay() + 6) % 7],
        date: dateStr,
        walked: walkRunActivities.some((a) => a.activityType === 'Walking' && a.date === dateStr),
        ran: walkRunActivities.some((a) => a.activityType === 'Running' && a.date === dateStr),
        gym: gymActivities.some((a) => a.date === dateStr),
      })
    }
    return days
  }, [walkRunActivities, gymActivities])

  // --- Health Trends -----------------------------------------------------
  const [healthFilters, setHealthFilters] = useState<HealthFilterState>(DEFAULT_HEALTH_FILTERS)

  const filteredBloodSugar = useMemo(
    () => filterBloodSugarReadings(bloodSugarReadings, healthFilters),
    [bloodSugarReadings, healthFilters],
  )
  const filteredBloodPressure = useMemo(
    () => filterBloodPressureReadings(bloodPressureReadings, healthFilters),
    [bloodPressureReadings, healthFilters],
  )
  const bloodSugarPoints = useMemo(
    () => aggregateReadings(filteredBloodSugar, healthFilters.groupBy, (r) => r.value),
    [filteredBloodSugar, healthFilters.groupBy],
  )
  const systolicPoints = useMemo(
    () => aggregateReadings(filteredBloodPressure, healthFilters.groupBy, (r) => r.systolic),
    [filteredBloodPressure, healthFilters.groupBy],
  )
  const bloodSugarDetailById = useMemo(
    () => new Map(filteredBloodSugar.map((r) => [r.id, { time: r.time, readingContext: r.readingContext, comments: r.comments }])),
    [filteredBloodSugar],
  )
  const bloodPressureDetailById = useMemo(
    () =>
      new Map(
        filteredBloodPressure.map((r) => [
          r.id,
          { time: r.time, readingContext: r.readingContext, comments: r.comments },
        ]),
      ),
    [filteredBloodPressure],
  )
  const commentOptions = useMemo(
    () => collectDistinctComments(bloodSugarReadings, bloodPressureReadings),
    [bloodSugarReadings, bloodPressureReadings],
  )
  const groupLabel =
    healthFilters.groupBy === 'daily' ? undefined : `${CHART_INTERVAL_LABELS[healthFilters.groupBy]}`

  // --- Recent entries ------------------------------------------------
  const recentEntries = historyEntries.slice(0, 6)

  return (
    <div className="dad-page">
      <div className="dad-page-header">
        <h1>Dashboard</h1>
        <PeriodSelector value={period} onChange={setPeriod} />
      </div>

      <SectionCard title="Today's Snapshot">
        <div className="dad-stat-grid">
          <StatCard
            label="Latest Blood Sugar"
            value={latestBloodSugar ? `${latestBloodSugar.value} ${latestBloodSugar.unit}` : 'No readings yet'}
            meta={latestBloodSugar ? formatTimeDisplay(latestBloodSugar.time) : undefined}
          />
          <StatCard
            label="Latest Blood Pressure"
            value={
              latestBloodPressure
                ? `${latestBloodPressure.systolic}/${latestBloodPressure.diastolic} mmHg`
                : 'No readings yet'
            }
            meta={latestBloodPressure ? formatTimeDisplay(latestBloodPressure.time) : undefined}
          />
          <StatCard label="Today's Activity" value={todaysActivitySummary} />
          <StatCard label="Readings Recorded Today" value={String(todaysReadingsCount)} />
        </div>
      </SectionCard>

      <SectionCard title="Activity Summary">
        <div className="dad-stat-grid">
          <StatCard label="Walking" value={`${totalWalkDistance} km`} meta={`${periodWalks.length} session(s)`} />
          <StatCard label="Running" value={`${totalRunDistance} km`} meta={`${periodRuns.length} session(s)`} />
          <StatCard label="Gym" value={`${periodGymSessions.length} session(s)`} />
        </div>
        <h3 className="dad-subheading">Weekly activity overview</h3>
        <div className="dad-week-overview">
          {weeklyOverview.map((day) => (
            <div className="dad-week-day" key={day.date}>
              <span className="dad-week-day-label">{day.label}</span>
              <div className="dad-week-day-dots">
                {day.walked && <span className="dad-dot dad-dot-walk" title="Walking" />}
                {day.ran && <span className="dad-dot dad-dot-run" title="Running" />}
                {day.gym && <span className="dad-dot dad-dot-gym" title="Gym" />}
                {!day.walked && !day.ran && !day.gym && <span className="dad-dot dad-dot-none" />}
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Health Trends">
        <HealthChartToolbar filters={healthFilters} onChange={setHealthFilters} commentOptions={commentOptions} />
        <div className="dad-trend-grid">
          {healthFilters.metric !== 'bloodPressure' && (
            <div>
              <h3 className="dad-subheading">Blood Sugar</h3>
              <TrendChart
                points={bloodSugarPoints}
                unit="mg/dL"
                emptyMessage="No blood sugar readings match these filters."
                yDomain={BLOOD_SUGAR_Y_DOMAIN}
                groupLabel={groupLabel}
                detailLookup={(id) => bloodSugarDetailById.get(id)}
                onPointClick={(point) => onDrilldown('bloodSugar', point.startDate, point.endDate)}
              />
            </div>
          )}
          {healthFilters.metric !== 'bloodSugar' && (
            <div>
              <h3 className="dad-subheading">Blood Pressure (systolic)</h3>
              <TrendChart
                points={systolicPoints}
                unit="mmHg"
                emptyMessage="No blood pressure readings match these filters."
                yDomain={SYSTOLIC_Y_DOMAIN}
                groupLabel={groupLabel}
                detailLookup={(id) => bloodPressureDetailById.get(id)}
                onPointClick={(point) => onDrilldown('bloodPressure', point.startDate, point.endDate)}
              />
            </div>
          )}
        </div>
      </SectionCard>

      <SectionCard title="Recent Activity">
        {recentEntries.length === 0 ? (
          <EmptyState message="No records yet. Add a health reading or log an activity to see it here." />
        ) : (
          <ul className="dad-recent-list">
            {recentEntries.map((entry) => (
              <li key={entry.id} className="dad-recent-item">
                <span className="dad-recent-date">
                  {formatDateDisplay(entry.date)} · {formatTimeDisplay(entry.time)}
                </span>
                <span className="dad-recent-type">{entry.type}</span>
                <span className="dad-recent-summary">{entry.summary}</span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  )
}
