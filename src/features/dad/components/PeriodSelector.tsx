import type { Period } from '../types'
import { PERIOD_LABELS } from '../types'

const PERIODS: Period[] = ['today', '7d', 'month', '3m', '6m']

interface PeriodSelectorProps {
  value: Period
  onChange: (period: Period) => void
}

// Lets the user switch the analysis window for the Dashboard/Insights pages.
export default function PeriodSelector({ value, onChange }: PeriodSelectorProps) {
  return (
    <div className="dad-period-selector" role="group" aria-label="Select time period">
      {PERIODS.map((period) => (
        <button
          key={period}
          type="button"
          className={period === value ? 'dad-period-btn active' : 'dad-period-btn'}
          onClick={() => onChange(period)}
        >
          {PERIOD_LABELS[period]}
        </button>
      ))}
    </div>
  )
}
