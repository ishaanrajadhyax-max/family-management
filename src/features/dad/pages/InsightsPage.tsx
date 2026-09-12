import { useState } from 'react'
import { useDadData } from '../DadDataContext'
import type { Period, ChartInterval } from '../types'
import PeriodSelector from '../components/PeriodSelector'
import IntervalSelector from '../components/IntervalSelector'
import SectionCard from '../components/SectionCard'
import TrendChart from '../components/TrendChart'
import { BLOOD_SUGAR_Y_DOMAIN, SYSTOLIC_Y_DOMAIN, DIASTOLIC_Y_DOMAIN } from '../chartConstants'
import { buildIntervalAveragePoints, buildIntervalCountPoints } from '../utils'

export default function InsightsPage() {
  const { bloodSugarReadings, bloodPressureReadings, walkRunActivities, gymActivities } = useDadData()

  const [period, setPeriod] = useState<Period>('month')
  const [chartInterval, setChartInterval] = useState<ChartInterval>('daily')

  const bloodSugarTrend = buildIntervalAveragePoints(bloodSugarReadings, period, chartInterval, (r) => r.value)
  const systolicTrend = buildIntervalAveragePoints(bloodPressureReadings, period, chartInterval, (r) => r.systolic)
  const diastolicTrend = buildIntervalAveragePoints(bloodPressureReadings, period, chartInterval, (r) => r.diastolic)

  const walkingDistanceTrend = buildIntervalAveragePoints(
    walkRunActivities.filter((a) => a.activityType === 'Walking'),
    period,
    chartInterval,
    (a) => a.distance,
  )
  const runningDistanceTrend = buildIntervalAveragePoints(
    walkRunActivities.filter((a) => a.activityType === 'Running'),
    period,
    chartInterval,
    (a) => a.distance,
  )
  const gymConsistencyTrend = buildIntervalCountPoints(gymActivities, period, chartInterval)

  return (
    <div className="dad-page">
      <div className="dad-page-header">
        <h1>Insights</h1>
        <div className="dad-page-controls">
          <PeriodSelector value={period} onChange={setPeriod} />
          <IntervalSelector value={chartInterval} onChange={setChartInterval} />
        </div>
      </div>

      <SectionCard title="Blood Sugar Trend">
        <TrendChart
          points={bloodSugarTrend}
          unit="mg/dL"
          emptyMessage="No blood sugar readings in this period."
          yDomain={BLOOD_SUGAR_Y_DOMAIN}
        />
      </SectionCard>

      <SectionCard title="Blood Pressure Trend">
        <div className="dad-trend-grid">
          <div>
            <h3 className="dad-subheading">Systolic</h3>
            <TrendChart
              points={systolicTrend}
              unit="mmHg"
              emptyMessage="No readings in this period."
              yDomain={SYSTOLIC_Y_DOMAIN}
            />
          </div>
          <div>
            <h3 className="dad-subheading">Diastolic</h3>
            <TrendChart
              points={diastolicTrend}
              unit="mmHg"
              emptyMessage="No readings in this period."
              yDomain={DIASTOLIC_Y_DOMAIN}
            />
          </div>
        </div>
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
