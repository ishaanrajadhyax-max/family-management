interface TrendPoint {
  label: string
  value: number
}

interface TrendChartProps {
  points: TrendPoint[]
  unit?: string
  emptyMessage?: string
  // Fixed [min, max] for the y-axis. Without this, the chart auto-scales to
  // the visible data's own min/max — fine for activity charts, but for
  // vitals (blood sugar, blood pressure) a fixed clinical range is what
  // makes day-to-day fluctuation visible instead of flattened out by a
  // single outlier. A value outside the domain is still plotted (clamped
  // to the edge, marked) rather than hidden.
  yDomain?: [number, number]
}

function computeAutoDomain(values: number[]): [number, number] {
  const min = Math.min(...values)
  const max = Math.max(...values)
  if (min === max) {
    const pad = Math.max(1, Math.abs(min) * 0.1)
    return [min - pad, max + pad]
  }
  const pad = (max - min) * 0.15
  return [min - pad, max + pad]
}

// A lightweight line chart (plain SVG + HTML, no charting library). Two
// choices matter for staying readable on a phone, where the old bar chart
// (one fixed-width bar per point) would overflow sideways once a period had
// more than a handful of points:
//  - the plotted line/dots are positioned by percentage, so they always
//    fill the container's actual width, however many points there are —
//    nothing ever renders outside its box.
//  - axis labels are ordinary HTML, not SVG text, so they're never
//    stretched/shrunk by the chart's own scaling, and only a thinned,
//    evenly-spaced subset is shown so they never overlap each other.
export default function TrendChart({ points, unit, emptyMessage, yDomain }: TrendChartProps) {
  if (points.length === 0) {
    return <p className="dad-chart-empty">{emptyMessage ?? 'No data for this period yet.'}</p>
  }

  const [domainMin, domainMax] = yDomain ?? computeAutoDomain(points.map((p) => p.value))
  const domainSpan = domainMax - domainMin || 1

  const xPercent = (index: number) => (points.length === 1 ? 50 : (index / (points.length - 1)) * 100)
  const yPercent = (value: number) => {
    const clamped = Math.min(domainMax, Math.max(domainMin, value))
    return 100 - ((clamped - domainMin) / domainSpan) * 100
  }

  const linePath =
    points.length < 2
      ? ''
      : points
          .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xPercent(i).toFixed(2)} ${yPercent(p.value).toFixed(2)}`)
          .join(' ')

  // Never show more than ~5 x-axis labels, however many points there are —
  // always including the first and last, so it stays legible at any width.
  const maxLabels = 5
  const labelStep = Math.max(1, Math.ceil(points.length / maxLabels))
  const shownIndexes = points.map((_, i) => i).filter((i) => i % labelStep === 0 || i === points.length - 1)

  return (
    <div className="dad-trend-chart">
      <div className="dad-trend-y-axis">
        <span>
          {Math.round(domainMax)}
          {unit ? ` ${unit}` : ''}
        </span>
        <span>
          {Math.round(domainMin)}
          {unit ? ` ${unit}` : ''}
        </span>
      </div>
      <div className="dad-trend-plot-col">
        <div className="dad-trend-plot">
          <svg
            className="dad-trend-svg"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            role="img"
            aria-label={`Trend chart${unit ? ` in ${unit}` : ''}`}
          >
            {linePath && (
              <path d={linePath} className="dad-trend-line" fill="none" vectorEffect="non-scaling-stroke" />
            )}
          </svg>
          {points.map((p, i) => {
            const outOfRange = yDomain != null && (p.value < domainMin || p.value > domainMax)
            return (
              <span
                key={`${p.label}-${i}`}
                className={outOfRange ? 'dad-trend-dot dad-trend-dot-out' : 'dad-trend-dot'}
                style={{ left: `${xPercent(i)}%`, top: `${yPercent(p.value)}%` }}
                title={`${p.label}: ${p.value}${unit ? ` ${unit}` : ''}`}
              />
            )
          })}
        </div>
        <div className="dad-trend-x-axis">
          {shownIndexes.map((i) => {
            const left = xPercent(i)
            // Keep labels from spilling past either edge: the first label
            // stays left-aligned to it, the last right-aligned, everything
            // between is centered on its point.
            const translateX = left <= 0 ? '0%' : left >= 100 ? '-100%' : '-50%'
            return (
              <span
                key={`${points[i].label}-${i}`}
                className="dad-trend-x-label"
                style={{ left: `${left}%`, transform: `translateX(${translateX})` }}
              >
                {points[i].label}
              </span>
            )
          })}
        </div>
      </div>
    </div>
  )
}
