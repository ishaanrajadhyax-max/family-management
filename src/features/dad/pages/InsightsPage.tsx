import { useMemo, useState } from 'react'
import { useDadData } from '../DadDataContext'
import type { Period, ChartInterval } from '../types'
import { CHART_INTERVAL_LABELS } from '../types'
import PeriodSelector from '../components/PeriodSelector'
import IntervalSelector from '../components/IntervalSelector'
import SectionCard from '../components/SectionCard'
import TrendChart from '../components/TrendChart'
import HealthChartToolbar from '../components/HealthChartToolbar'
import { BLOOD_SUGAR_Y_DOMAIN, SYSTOLIC_Y_DOMAIN, DIASTOLIC_Y_DOMAIN } from '../chartConstants'
import type { HealthFilterState } from '../healthFilters'
import {
  DEFAULT_HEALTH_FILTERS,
  filterBloodSugarReadings,
  filterBloodPressureReadings,
  aggregateReadings,
  aggregateReadingsCount,
  collectDistinctComments,
} from '../healthFilters'
import { isWithinPeriod } from '../utils'

interface InsightsPageProps {
  onDrilldown: (metric: 'bloodSugar' | 'bloodPressure', startDate: string, endDate: string) => void
}

export default function InsightsPage({ onDrilldown }: InsightsPageProps) {
  const { bloodSugarReadings, bloodPressureReadings, walkRunActivities, gymActivities } = useDadData()

  // Blood Sugar / Blood Pressure — the new compact toolbar + filter drawer.
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
  const diastolicPoints = useMemo(
    () => aggregateReadings(filteredBloodPressure, healthFilters.groupBy, (r) => r.diastolic),
    [filteredBloodPressure, healthFilters.groupBy],
  )
  const bloodSugarDetailById = useMemo(
    () =>
      new Map(
        filteredBloodSugar.map((r) => [r.id, { time: r.time, readingContext: r.readingContext, comments: r.comments }]),
      ),
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
  const groupLabel = healthFilters.groupBy === 'daily' ? undefined : CHART_INTERVAL_LABELS[healthFilters.groupBy]

  // Walking / Running / Gym — unrelated to this request's scope, unchanged:
  // still driven by the page-level Period + Group by pills.
  const [period, setPeriod] = useState<Period>('month')
  const [chartInterval, setChartInterval] = useState<ChartInterval>('daily')

  const walkingDistanceTrend = aggregateReadings(
    walkRunActivities.filter((a) => a.activityType === 'Walking' && isWithinPeriod(a.date, period)),
    chartInterval,
    (a) => a.distance,
  )
  const runningDistanceTrend = aggregateReadings(
    walkRunActivities.filter((a) => a.activityType === 'Running' && isWithinPeriod(a.date, period)),
    chartInterval,
    (a) => a.distance,
  )
  const gymConsistencyTrend = aggregateReadingsCount(
    gymActivities.filter((a) => isWithinPeriod(a.date, period)),
    chartInterval,
  )

  return (
    <div className="dad-page">
      <div className="dad-page-header">
        <h1>Insights</h1>
      </div>

      <SectionCard title="Blood Sugar Trend">
        <HealthChartToolbar filters={healthFilters} onChange={setHealthFilters} commentOptions={commentOptions} />
        {healthFilters.metric !== 'bloodPressure' && (
          <TrendChart
            points={bloodSugarPoints}
            unit="mg/dL"
            emptyMessage="No blood sugar readings match these filters."
            yDomain={BLOOD_SUGAR_Y_DOMAIN}
            groupLabel={groupLabel}
            detailLookup={(id) => bloodSugarDetailById.get(id)}
            onPointClick={(point) => onDrilldown('bloodSugar', point.startDate, point.endDate)}
          />
        )}
      </SectionCard>

      {healthFilters.metric !== 'bloodSugar' && (
        <SectionCard title="Blood Pressure Trend">
          <div className="dad-trend-grid">
            <div>
              <h3 className="dad-subheading">Systolic</h3>
              <TrendChart
                points={systolicPoints}
                unit="mmHg"
                emptyMessage="No readings match these filters."
                yDomain={SYSTOLIC_Y_DOMAIN}
                groupLabel={groupLabel}
                detailLookup={(id) => bloodPressureDetailById.get(id)}
                onPointClick={(point) => onDrilldown('bloodPressure', point.startDate, point.endDate)}
              />
            </div>
            <div>
              <h3 className="dad-subheading">Diastolic</h3>
              <TrendChart
                points={diastolicPoints}
                unit="mmHg"
                emptyMessage="No readings match these filters."
                yDomain={DIASTOLIC_Y_DOMAIN}
                groupLabel={groupLabel}
                detailLookup={(id) => bloodPressureDetailById.get(id)}
                onPointClick={(point) => onDrilldown('bloodPressure', point.startDate, point.endDate)}
              />
            </div>
          </div>
        </SectionCard>
      )}

      <div className="dad-page-header">
        <h2>Activity &amp; Consistency</h2>
        <div className="dad-page-controls">
          <PeriodSelector value={period} onChange={setPeriod} />
          <IntervalSelector value={chartInterval} onChange={setChartInterval} />
        </div>
      </div>

      <SectionCard title="Walking / Running Activity">
        <div className="dad-trend-grid">
          <div>
            <h3 className="dad-subheading">Walking distance</h3>
            <TrendChart points={walkingDistanceTrend} unit="km" emptyMessage="No walks in this period." />
          </div>
          <div>
            <h3 className="dad-subheading">Running distance</h3>
            <TrendChart points={runningDistanceTrend} unit="km" emptyMessage="No runs in this period." />
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Gym Consistency">
        <TrendChart points={gymConsistencyTrend} unit="session(s)" emptyMessage="No gym sessions in this period." />
      </SectionCard>
    </div>
  )
}
