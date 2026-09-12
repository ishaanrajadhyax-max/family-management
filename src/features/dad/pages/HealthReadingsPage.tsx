import { useEffect, useMemo, useState } from 'react'
import { useDadData } from '../DadDataContext'
import Modal from '../components/Modal'
import SectionCard from '../components/SectionCard'
import EmptyState from '../components/EmptyState'
import HealthChartToolbar from '../components/HealthChartToolbar'
import BloodSugarForm from '../forms/BloodSugarForm'
import BloodPressureForm from '../forms/BloodPressureForm'
import { byMostRecent, formatDateDisplay, formatTimeDisplay } from '../utils'
import type { BloodSugarReading, BloodPressureReading } from '../types'
import type { HealthFilterState } from '../healthFilters'
import {
  DEFAULT_HEALTH_FILTERS,
  filterBloodSugarReadings,
  filterBloodPressureReadings,
  collectDistinctComments,
} from '../healthFilters'
import type { ReadingsDrilldownRequest } from '../DadApp'

type ActiveForm =
  | { kind: 'add-blood-sugar' }
  | { kind: 'add-blood-pressure' }
  | { kind: 'edit-blood-sugar'; record: BloodSugarReading }
  | { kind: 'edit-blood-pressure'; record: BloodPressureReading }
  | null

interface HealthReadingsPageProps {
  // Set by Dashboard/Insights when a graph point is clicked — this page
  // applies it once (metric + the point's own underlying date range, never
  // its average) and then reports back that it's been consumed.
  drilldownRequest: ReadingsDrilldownRequest | null
  onDrilldownConsumed: () => void
}

// The source of truth for Dad's actual recorded readings: exact
// timestamps, reading context, comments, and full filtering — everything
// the Dashboard/Insights charts deliberately leave out to stay readable.
export default function HealthReadingsPage({ drilldownRequest, onDrilldownConsumed }: HealthReadingsPageProps) {
  const { bloodSugarReadings, bloodPressureReadings } = useDadData()
  const [activeForm, setActiveForm] = useState<ActiveForm>(null)
  const [filters, setFilters] = useState<HealthFilterState>(DEFAULT_HEALTH_FILTERS)

  // Applies a new drilldown request during render (React's documented
  // pattern for "adjust state when a prop changes"), tracked by token so
  // clicking the same graph point twice in a row still re-applies it.
  // Notifying the parent that it's been consumed is a genuine side effect
  // (it clears state owned by a different component), so that part alone
  // stays in an effect below.
  const [consumedToken, setConsumedToken] = useState<number | null>(null)
  if (drilldownRequest && drilldownRequest.token !== consumedToken) {
    setConsumedToken(drilldownRequest.token)
    setFilters({
      ...DEFAULT_HEALTH_FILTERS,
      metric: drilldownRequest.metric,
      date: {
        mode: 'range',
        asOfDate: null,
        startDate: drilldownRequest.startDate,
        endDate: drilldownRequest.endDate,
      },
    })
  }

  useEffect(() => {
    if (drilldownRequest && drilldownRequest.token === consumedToken) {
      onDrilldownConsumed()
    }
  }, [drilldownRequest, consumedToken, onDrilldownConsumed])

  const filteredBloodSugar = useMemo(
    () => filterBloodSugarReadings(bloodSugarReadings, filters),
    [bloodSugarReadings, filters],
  )
  const filteredBloodPressure = useMemo(
    () => filterBloodPressureReadings(bloodPressureReadings, filters),
    [bloodPressureReadings, filters],
  )
  const commentOptions = useMemo(
    () => collectDistinctComments(bloodSugarReadings, bloodPressureReadings),
    [bloodSugarReadings, bloodPressureReadings],
  )

  const rows = useMemo(() => {
    const sugarRows =
      filters.metric !== 'bloodPressure'
        ? filteredBloodSugar.map((r) => ({
            id: r.id,
            date: r.date,
            time: r.time,
            type: 'Blood Sugar',
            summary: `${r.value} ${r.unit} · ${r.readingContext}`,
            comments: r.comments,
            onEdit: () => setActiveForm({ kind: 'edit-blood-sugar', record: r }),
          }))
        : []
    const pressureRows =
      filters.metric !== 'bloodSugar'
        ? filteredBloodPressure.map((r) => ({
            id: r.id,
            date: r.date,
            time: r.time,
            type: 'Blood Pressure',
            summary: `${r.systolic}/${r.diastolic} mmHg${r.pulse ? ` · ${r.pulse} bpm` : ''} · ${r.readingContext}`,
            comments: r.comments,
            onEdit: () => setActiveForm({ kind: 'edit-blood-pressure', record: r }),
          }))
        : []
    return [...sugarRows, ...pressureRows].sort(byMostRecent)
  }, [filteredBloodSugar, filteredBloodPressure, filters.metric])

  const totalReadings = bloodSugarReadings.length + bloodPressureReadings.length

  return (
    <div className="dad-page">
      <div className="dad-page-header">
        <h1>Health Readings</h1>
      </div>

      <SectionCard title="Add a Reading">
        <div className="dad-action-grid">
          <button type="button" className="dad-action-card" onClick={() => setActiveForm({ kind: 'add-blood-sugar' })}>
            <span className="dad-action-title">Add Blood Sugar</span>
            <span className="dad-action-subtitle">Record a glucose reading</span>
          </button>
          <button type="button" className="dad-action-card" onClick={() => setActiveForm({ kind: 'add-blood-pressure' })}>
            <span className="dad-action-title">Add Blood Pressure</span>
            <span className="dad-action-subtitle">Record systolic / diastolic</span>
          </button>
        </div>
      </SectionCard>

      <SectionCard title={`Readings (${rows.length}${rows.length !== totalReadings ? ` of ${totalReadings}` : ''})`}>
        <HealthChartToolbar filters={filters} onChange={setFilters} commentOptions={commentOptions} showGroupBy={false} />

        {rows.length === 0 ? (
          <EmptyState
            message={totalReadings === 0 ? 'No readings recorded yet.' : 'No readings match these filters.'}
            actionLabel={totalReadings === 0 ? 'Add Blood Sugar' : undefined}
            onAction={totalReadings === 0 ? () => setActiveForm({ kind: 'add-blood-sugar' }) : undefined}
          />
        ) : (
          <ul className="dad-recent-list">
            {rows.map((entry) => (
              <li key={entry.id} className="dad-recent-item dad-history-item">
                <span className="dad-recent-date">
                  {formatDateDisplay(entry.date)} · {formatTimeDisplay(entry.time)}
                </span>
                <span className="dad-recent-type">{entry.type}</span>
                <span className="dad-recent-summary">{entry.summary}</span>
                {entry.comments && <span className="dad-recent-comments">{entry.comments}</span>}
                <button type="button" className="dad-edit-link" onClick={entry.onEdit}>
                  Edit
                </button>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      {activeForm?.kind === 'add-blood-sugar' && (
        <Modal title="Add Blood Sugar" onClose={() => setActiveForm(null)}>
          <BloodSugarForm onSaved={() => setActiveForm(null)} />
        </Modal>
      )}
      {activeForm?.kind === 'add-blood-pressure' && (
        <Modal title="Add Blood Pressure" onClose={() => setActiveForm(null)}>
          <BloodPressureForm onSaved={() => setActiveForm(null)} />
        </Modal>
      )}
      {activeForm?.kind === 'edit-blood-sugar' && (
        <Modal title="Edit Blood Sugar" onClose={() => setActiveForm(null)}>
          <BloodSugarForm existing={activeForm.record} onSaved={() => setActiveForm(null)} />
        </Modal>
      )}
      {activeForm?.kind === 'edit-blood-pressure' && (
        <Modal title="Edit Blood Pressure" onClose={() => setActiveForm(null)}>
          <BloodPressureForm existing={activeForm.record} onSaved={() => setActiveForm(null)} />
        </Modal>
      )}
    </div>
  )
}
