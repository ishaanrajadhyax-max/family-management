import { useState } from 'react'
import type { AggregatedPoint, ReadingDetail } from '../healthFilters'
import { formatDateDisplay, formatTimeDisplay } from '../utils'

interface TrendChartProps {
  points: AggregatedPoint[]
  unit?: string
  emptyMessage?: string
  // Fixed [min, max] for the y-axis. Without this, the chart auto-scales to
  // the visible data's own min/max — fine for activity charts, but for
  // vitals (blood sugar, blood pressure) a fixed clinical range is what
  // makes day-to-day fluctuation visible instead of flattened out by a
  // single outlier. A value outside the domain is still plotted (clamped
  // to the edge, marked) rather than hidden.
  yDomain?: [number, number]
  // Label for what a multi-reading point represents, e.g. "Weekly average".
  groupLabel?: string
  // Looks up the full reading behind a point that has exactly one
  // underlying reading, so its tooltip can show exact time/context/comment
  // instead of just the aggregate value.
  detailLookup?: (id: string) => ReadingDetail | undefined
  // Called with the point's own nominal date range — never with its
  // average — so callers can drill down into the exact underlying records.
  onPointClick?: (point: AggregatedPoint) => void
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

// True only on devices with a real mouse — used to decide whether a tap
// should open the tooltip (touch) or jump straight to drill-down (mouse,
// where hover already showed the tooltip first).
const hasFinePointer =
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(hover: hover) and (pointer: fine)').matches
    : true

// A lightweight line chart (plain SVG + HTML, no charting library). Points
// are positioned by percentage of container width, so the chart always
// fills its box however many points there are, and never overflows
// sideways. Axis labels are plain HTML (not SVG text) so they're never
// squished by the chart's own scaling, and only a thinned, evenly-spaced
// subset is shown so they can't overlap.
export default function TrendChart({
  points,
  unit,
  emptyMessage,
  yDomain,
  groupLabel,
  detailLookup,
  onPointClick,
}: TrendChartProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null)

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

  function handleDotClick(i: number) {
    if (hasFinePointer) {
      onPointClick?.(points[i])
      return
    }
    setActiveIndex((current) => (current === i ? null : i))
  }

  function renderTooltip(i: number) {
    const point = points[i]
    const detail = point.count === 1 ? detailLookup?.(point.ids[0]) : undefined
    return (
      <div
        className="dad-trend-tooltip"
        style={{ left: `${xPercent(i)}%` }}
        onClick={(e) => e.stopPropagation()}
      >
        {point.count === 1 ? (
          <>
            <div className="dad-trend-tooltip-title">{formatDateDisplay(point.startDate)}</div>
            {detail?.time && <div>{formatTimeDisplay(detail.time)}</div>}
            <div>
              {point.value}
              {unit ? ` ${unit}` : ''}
            </div>
            {detail?.readingContext && <div>{detail.readingContext}</div>}
            {detail?.comments && <div className="dad-trend-tooltip-comment">"{detail.comments}"</div>}
          </>
        ) : (
          <>
            {groupLabel && <div className="dad-trend-tooltip-title">{groupLabel}</div>}
            <div>
              {point.startDate === point.endDate
                ? formatDateDisplay(point.startDate)
                : `${formatDateDisplay(point.startDate)} – ${formatDateDisplay(point.endDate)}`}
            </div>
            <div>
              Average: {point.value}
              {unit ? ` ${unit}` : ''}
            </div>
            <div>{point.count} readings</div>
          </>
        )}
        {onPointClick && !hasFinePointer && (
          <button type="button" className="dad-trend-tooltip-link" onClick={() => onPointClick(point)}>
            View readings →
          </button>
        )}
      </div>
    )
  }

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
        <div className="dad-trend-plot" onClick={() => setActiveIndex(null)}>
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
              <button
                key={`${p.startDate}-${i}`}
                type="button"
                className={outOfRange ? 'dad-trend-dot dad-trend-dot-out' : 'dad-trend-dot'}
                style={{ left: `${xPercent(i)}%`, top: `${yPercent(p.value)}%` }}
                onMouseEnter={() => setActiveIndex(i)}
                onMouseLeave={() => hasFinePointer && setActiveIndex(null)}
                onClick={(e) => {
                  e.stopPropagation()
                  handleDotClick(i)
                }}
                aria-label={`${p.startDate === p.endDate ? formatDateDisplay(p.startDate) : `${formatDateDisplay(p.startDate)} to ${formatDateDisplay(p.endDate)}`}: ${p.value}${unit ? ` ${unit}` : ''}`}
              />
            )
          })}
          {activeIndex != null && renderTooltip(activeIndex)}
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
