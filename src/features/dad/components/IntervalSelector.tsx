import type { ChartInterval } from '../types'
import { CHART_INTERVAL_LABELS } from '../types'

const INTERVALS: ChartInterval[] = ['daily', '3d', '5d', 'weekly', 'semimonthly', 'monthly']

interface IntervalSelectorProps {
  value: ChartInterval
  onChange: (interval: ChartInterval) => void
}

// A dropdown (not a row of buttons — there are six options, too many to
// stay readable on a phone) for choosing how chart points are grouped.
export default function IntervalSelector({ value, onChange }: IntervalSelectorProps) {
  return (
    <div className="dad-interval-selector">
      <label htmlFor="chart-interval">Group by</label>
      <select
        id="chart-interval"
        value={value}
        onChange={(e) => onChange(e.target.value as ChartInterval)}
      >
        {INTERVALS.map((interval) => (
          <option key={interval} value={interval}>
            {CHART_INTERVAL_LABELS[interval]}
          </option>
        ))}
      </select>
    </div>
  )
}
