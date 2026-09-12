import { useState } from 'react'
import { useDadData } from '../DadDataContext'
import type { Period } from '../types'
import PeriodSelector from '../components/PeriodSelector'
import SectionCard from '../components/SectionCard'
import TrendChart from '../components/TrendChart'
import { buildDailyAveragePoints, buildDailyCountPoints } from '../utils'

// NOTE: All charts on this page read from the same in-memory data used
// across the Dad section (see DadDataContext), which starts empty until
// Dad records his own readings/activities. Once the backend + PostgreSQL
// are connected, these `buildDaily...Points` calls will run against real
// fetched data instead — no other change to this page should be needed.
export default function InsightsPage() {
  const { bloodSugarReadings, bloodPressureReadings, heartRateReadings, walkRunActivities, gymActivities } =
    useDadData()

  const [period, setPeriod] = useState<Period>('month')

  const bloodSugarTrend = buildDailyAveragePoints(bloodSugarReadings, period, (r) => r.value)
  const systolicTrend = buildDailyAveragePoints(bloodPressureReadings, period, (r) => r.systolic)
  const diastolicTrend = buildDailyAveragePoints(bloodPressureReadings, period, (r) => r.diastolic)
  const heartRateTrend = buildDailyAveragePoints(heartRateReadings, period, (r) => r.value)

  const walkingDistanceTrend = buildDailyAveragePoints(
    walkRunActivities.filter((a) => a.activityType === 'Walking'),
    period,
    (a) => a.distance,
  )
  const runningDistanceTrend = buildDailyAveragePoints(
    walkRunActivities.filter((a) => a.activityType === 'Running'),
    period,
    (a) => a.distance,
  )
  const gymConsistencyTrend = buildDailyCountPoints(gymActivities, period)

  return (
    <div className="dad-page">
      <div className="dad-page-header">
        <h1>Insights</h1>
        <PeriodSelector value={period} onChange={setPeriod} />
      </div>
      <p className="dad-page-note">
        Charts below use placeholder/mock data for now. Once the backend and database are connected, these will
        reflect real recorded values.
      </p>

      <SectionCard title="Blood Sugar Trend">
        <TrendChart points={bloodSugarTrend} unit="mg/dL" emptyMessage="No blood sugar readings in this period." />
      </SectionCard>

      <SectionCard title="Blood Pressure Trend">
        <div className="dad-trend-grid">
          <div>
            <h3 className="dad-subheading">Systolic</h3>
            <TrendChart points={systolicTrend} unit="mmHg" emptyMessage="No readings in this period." />
          </div>
          <div>
            <h3 className="dad-subheading">Diastolic</h3>
            <TrendChart points={diastolicTrend} unit="mmHg" emptyMessage="No readings in this period." />
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Heart Rate Trend">
        <TrendChart points={heartRateTrend} unit="BPM" emptyMessage="No heart rate readings in this period." />
      </SectionCard>

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
