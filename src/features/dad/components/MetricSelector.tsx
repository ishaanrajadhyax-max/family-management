import type { HealthMetric } from '../healthFilters'
import { HEALTH_METRIC_LABELS } from '../healthFilters'

const METRICS: HealthMetric[] = ['all', 'bloodSugar', 'bloodPressure']

interface MetricSelectorProps {
  value: HealthMetric
  onChange: (metric: HealthMetric) => void
}

// Compact "[ All v ]" dropdown — which metric's chart(s) to show.
export default function MetricSelector({ value, onChange }: MetricSelectorProps) {
  return (
    <select
      className="dad-compact-select"
      aria-label="Metric"
      value={value}
      onChange={(e) => onChange(e.target.value as HealthMetric)}
    >
      {METRICS.map((metric) => (
        <option key={metric} value={metric}>
          {HEALTH_METRIC_LABELS[metric]}
        </option>
      ))}
    </select>
  )
}
