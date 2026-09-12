import { useState } from 'react'
import type { ChartInterval } from '../types'
import { CHART_INTERVAL_LABELS } from '../types'
import type { HealthFilterState } from '../healthFilters'
import { countActiveFilters, DEFAULT_DATE_FILTER, DEFAULT_NUMERIC_FILTER } from '../healthFilters'
import MetricSelector from './MetricSelector'
import FilterDrawer from './FilterDrawer'

const GROUP_BY_OPTIONS: ChartInterval[] = ['daily', '3d', '5d', 'weekly', 'semimonthly', 'monthly']

interface HealthChartToolbarProps {
  filters: HealthFilterState
  onChange: (next: HealthFilterState) => void
  commentOptions: string[]
  // Health Readings is a raw list, not a chart, so "Group by" doesn't apply
  // there — everything else about the toolbar (Metric, Filter, the drawer)
  // is identical, so this is the one shared component rather than a
  // second near-duplicate toolbar.
  showGroupBy?: boolean
}

// The compact, always-visible control row: [ All v ] [ Group by: Daily v ]
// [ Filter ]. Everything else (date range, numeric ranges, comments) lives
// behind the Filter button in a drawer, so the chart stays the visual focus
// instead of a page full of permanently-visible inputs.
export default function HealthChartToolbar({
  filters,
  onChange,
  commentOptions,
  showGroupBy = true,
}: HealthChartToolbarProps) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const activeCount = countActiveFilters(filters)

  function clearDetailedFilters() {
    onChange({
      ...filters,
      date: DEFAULT_DATE_FILTER,
      bloodSugar: DEFAULT_NUMERIC_FILTER,
      bloodPressure: DEFAULT_NUMERIC_FILTER,
      comment: '',
    })
  }

  return (
    <div className="dad-chart-toolbar">
      <MetricSelector value={filters.metric} onChange={(metric) => onChange({ ...filters, metric })} />

      {showGroupBy && (
        <select
          className="dad-compact-select"
          aria-label="Group by"
          value={filters.groupBy}
          onChange={(e) => onChange({ ...filters, groupBy: e.target.value as ChartInterval })}
        >
          {GROUP_BY_OPTIONS.map((g) => (
            <option key={g} value={g}>
              Group by: {CHART_INTERVAL_LABELS[g]}
            </option>
          ))}
        </select>
      )}

      <div className="dad-filter-button">
        <button type="button" onClick={() => setDrawerOpen(true)}>
          Filter ⚙{activeCount > 0 ? ` · ${activeCount} active` : ''}
        </button>
        {activeCount > 0 && (
          <button
            type="button"
            className="dad-filter-button-clear"
            aria-label="Clear all filters"
            onClick={clearDetailedFilters}
          >
            ×
          </button>
        )}
      </div>

      <FilterDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        filters={filters}
        onApply={(next) => {
          onChange(next)
          setDrawerOpen(false)
        }}
        onClearAll={(next) => {
          onChange(next)
          setDrawerOpen(false)
        }}
        commentOptions={commentOptions}
        showBloodSugar={filters.metric !== 'bloodPressure'}
        showBloodPressure={filters.metric !== 'bloodSugar'}
      />
    </div>
  )
}
