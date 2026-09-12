import { useState } from 'react'
import type {
  HealthFilterState,
  NumericRangeFilter,
} from '../healthFilters'
import {
  countActiveFilters,
  DEFAULT_DATE_FILTER,
  DEFAULT_NUMERIC_FILTER,
} from '../healthFilters'

interface FilterDrawerProps {
  open: boolean
  onClose: () => void
  filters: HealthFilterState
  onApply: (next: HealthFilterState) => void
  // Called with metric/groupBy preserved and only the drawer's own fields
  // (date/bloodSugar/bloodPressure/comment) reset — those two live on the
  // compact toolbar, not inside this drawer, so clearing filters shouldn't
  // also change what's being viewed.
  onClearAll: (next: HealthFilterState) => void
  commentOptions: string[]
  // When false, the Blood Sugar section is hidden (metric is Blood Pressure
  // only) — same for showBloodPressure. Keeps the drawer relevant to
  // whatever the compact Metric selector currently shows.
  showBloodSugar: boolean
  showBloodPressure: boolean
}

function NumericRangeSection({
  title,
  value,
  onChange,
  unit,
}: {
  title: string
  value: NumericRangeFilter
  onChange: (next: NumericRangeFilter) => void
  unit: string
}) {
  return (
    <div className="dad-filter-section">
      <h3 className="dad-filter-section-title">{title}</h3>
      <label className="dad-filter-checkbox">
        <input
          type="checkbox"
          checked={value.exactMode}
          onChange={(e) => onChange({ ...value, exactMode: e.target.checked })}
        />
        Exact value only
      </label>

      {value.exactMode ? (
        <div className="dad-form-row">
          <label htmlFor={`${title}-exact`}>Exact value ({unit})</label>
          <input
            id={`${title}-exact`}
            type="number"
            value={value.exact ?? ''}
            onChange={(e) => onChange({ ...value, exact: e.target.value === '' ? null : Number(e.target.value) })}
            placeholder="e.g. 110"
          />
        </div>
      ) : (
        <>
          <div className="dad-filter-min-row">
            <div className="dad-form-row">
              <label htmlFor={`${title}-min`}>Min ({unit})</label>
              <input
                id={`${title}-min`}
                type="number"
                value={value.min ?? ''}
                disabled={value.blockMin}
                onChange={(e) => onChange({ ...value, min: e.target.value === '' ? null : Number(e.target.value) })}
                placeholder="No minimum"
              />
            </div>
            <button
              type="button"
              className={value.blockMin ? 'dad-block-toggle active' : 'dad-block-toggle'}
              aria-pressed={value.blockMin}
              title={value.blockMin ? 'Minimum is blocked — click to re-enable it' : 'Block the minimum boundary'}
              onClick={() => onChange({ ...value, blockMin: !value.blockMin })}
            >
              🔒
            </button>
          </div>
          <div className="dad-form-row">
            <label htmlFor={`${title}-max`}>Max ({unit})</label>
            <input
              id={`${title}-max`}
              type="number"
              value={value.max ?? ''}
              onChange={(e) => onChange({ ...value, max: e.target.value === '' ? null : Number(e.target.value) })}
              placeholder="No maximum"
            />
          </div>
        </>
      )}
    </div>
  )
}

// Slides in from the right on desktop; becomes a near-full-height bottom
// sheet on mobile (see dad.css). All the detailed filter controls live in
// here so the Dashboard/Insights surface itself stays a compact toolbar.
export default function FilterDrawer({
  open,
  onClose,
  filters,
  onApply,
  onClearAll,
  commentOptions,
  showBloodSugar,
  showBloodPressure,
}: FilterDrawerProps) {
  const [draft, setDraft] = useState<HealthFilterState>(filters)
  // Tracks the `open` value the draft was last synced against. Updated
  // during render (React's documented pattern for "adjust state when a
  // prop changes") rather than in an effect, so reopening the drawer shows
  // what's actually applied right now without an extra render round-trip.
  const [syncedOpen, setSyncedOpen] = useState(open)
  if (open !== syncedOpen) {
    setSyncedOpen(open)
    if (open) setDraft(filters)
  }

  const activeCount = countActiveFilters(draft)

  function handleClearAll() {
    const cleared: HealthFilterState = {
      ...draft,
      date: DEFAULT_DATE_FILTER,
      bloodSugar: DEFAULT_NUMERIC_FILTER,
      bloodPressure: DEFAULT_NUMERIC_FILTER,
      comment: '',
    }
    setDraft(cleared)
    onClearAll(cleared)
  }

  function handleApply() {
    onApply(draft)
  }

  return (
    <>
      <div
        className={open ? 'dad-drawer-backdrop open' : 'dad-drawer-backdrop'}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className={open ? 'dad-drawer open' : 'dad-drawer'}
        role="dialog"
        aria-modal="true"
        aria-label="Filters"
        aria-hidden={!open}
      >
        <div className="dad-drawer-header">
          <div>
            <h2>Filters</h2>
            <p className="dad-drawer-count">
              {activeCount === 0 ? 'No filters active' : `${activeCount} filter${activeCount === 1 ? '' : 's'} active`}
            </p>
          </div>
          <button type="button" className="dad-modal-close" onClick={onClose} aria-label="Close filters">
            ×
          </button>
        </div>

        <div className="dad-drawer-body">
          <div className="dad-filter-section">
            <h3 className="dad-filter-section-title">Date</h3>
            <div className="dad-filter-radio-row">
              <label className="dad-filter-radio">
                <input
                  type="radio"
                  name="date-mode"
                  checked={draft.date.mode === 'asOf'}
                  onChange={() => setDraft({ ...draft, date: { ...draft.date, mode: 'asOf' } })}
                />
                As of date
              </label>
              <label className="dad-filter-radio">
                <input
                  type="radio"
                  name="date-mode"
                  checked={draft.date.mode === 'range'}
                  onChange={() => setDraft({ ...draft, date: { ...draft.date, mode: 'range' } })}
                />
                Date range
              </label>
            </div>

            {draft.date.mode === 'asOf' ? (
              <div className="dad-form-row">
                <label htmlFor="filter-as-of">Date</label>
                <input
                  id="filter-as-of"
                  type="date"
                  value={draft.date.asOfDate ?? ''}
                  onChange={(e) =>
                    setDraft({ ...draft, date: { ...draft.date, asOfDate: e.target.value || null } })
                  }
                />
              </div>
            ) : (
              <div className="dad-filter-date-range">
                <div className="dad-form-row">
                  <label htmlFor="filter-start">Start date</label>
                  <input
                    id="filter-start"
                    type="date"
                    value={draft.date.startDate ?? ''}
                    onChange={(e) =>
                      setDraft({ ...draft, date: { ...draft.date, startDate: e.target.value || null } })
                    }
                  />
                </div>
                <div className="dad-form-row">
                  <label htmlFor="filter-end">End date</label>
                  <input
                    id="filter-end"
                    type="date"
                    value={draft.date.endDate ?? ''}
                    onChange={(e) =>
                      setDraft({ ...draft, date: { ...draft.date, endDate: e.target.value || null } })
                    }
                  />
                </div>
              </div>
            )}
          </div>

          {showBloodSugar && (
            <NumericRangeSection
              title="Blood Sugar"
              unit="mg/dL"
              value={draft.bloodSugar}
              onChange={(next) => setDraft({ ...draft, bloodSugar: next })}
            />
          )}

          {showBloodPressure && (
            <NumericRangeSection
              title="Blood Pressure"
              unit="systolic, mmHg"
              value={draft.bloodPressure}
              onChange={(next) => setDraft({ ...draft, bloodPressure: next })}
            />
          )}

          <div className="dad-filter-section">
            <h3 className="dad-filter-section-title">Comments</h3>
            <div className="dad-form-row">
              <label htmlFor="filter-comment">Search comments</label>
              <input
                id="filter-comment"
                type="text"
                list="filter-comment-options"
                value={draft.comment}
                onChange={(e) => setDraft({ ...draft, comment: e.target.value })}
                placeholder={commentOptions.length === 0 ? 'No comments recorded yet' : 'Type to search…'}
              />
              <datalist id="filter-comment-options">
                {commentOptions.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
          </div>
        </div>

        <div className="dad-drawer-actions">
          <button type="button" className="dad-btn-secondary" onClick={handleClearAll}>
            Clear All
          </button>
          <button type="button" className="dad-btn-primary" onClick={handleApply}>
            Apply Filters
          </button>
        </div>
      </div>
    </>
  )
}
