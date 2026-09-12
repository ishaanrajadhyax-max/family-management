interface TrendPoint {
  label: string
  value: number
}

interface TrendChartProps {
  points: TrendPoint[]
  unit?: string
  emptyMessage?: string
}

// A minimal bar chart used to sketch out trend visuals before a real
// charting solution is wired up to live database data. Deliberately simple
// (plain divs, no charting library) since a package isn't needed yet.
export default function TrendChart({ points, unit, emptyMessage }: TrendChartProps) {
  if (points.length === 0) {
    return <p className="dad-chart-empty">{emptyMessage ?? 'No data for this period yet.'}</p>
  }

  const maxValue = Math.max(...points.map((p) => p.value), 1)

  return (
    <div className="dad-trend-chart">
      <div className="dad-trend-bars">
        {points.map((point, index) => (
          <div className="dad-trend-bar-column" key={`${point.label}-${index}`}>
            <span className="dad-trend-bar-value">
              {point.value}
              {unit ? ` ${unit}` : ''}
            </span>
            <div
              className="dad-trend-bar"
              style={{ height: `${Math.max((point.value / maxValue) * 100, 4)}%` }}
            />
            <span className="dad-trend-bar-label">{point.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
