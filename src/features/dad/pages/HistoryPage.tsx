import { useMemo, useState } from 'react'
import { useDadData } from '../DadDataContext'
import SectionCard from '../components/SectionCard'
import EmptyState from '../components/EmptyState'
import Modal from '../components/Modal'
import BloodSugarForm from '../forms/BloodSugarForm'
import BloodPressureForm from '../forms/BloodPressureForm'
import HeartRateForm from '../forms/HeartRateForm'
import WalkRunForm from '../forms/WalkRunForm'
import GymForm from '../forms/GymForm'
import { formatDateDisplay, formatTimeDisplay } from '../utils'
import type { HistoryEntry } from '../types'

type RecordTypeFilter = 'all' | 'Health Reading' | 'Activity'
type ActivityTypeFilter = 'all' | 'Walking' | 'Running' | 'Gym'
type HealthMetricFilter = 'all' | 'Blood Sugar' | 'Blood Pressure' | 'Heart Rate'

export default function HistoryPage() {
  const {
    historyEntries,
    bloodSugarReadings,
    bloodPressureReadings,
    heartRateReadings,
    walkRunActivities,
    gymActivities,
  } = useDadData()

  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [recordType, setRecordType] = useState<RecordTypeFilter>('all')
  const [activityType, setActivityType] = useState<ActivityTypeFilter>('all')
  const [healthMetric, setHealthMetric] = useState<HealthMetricFilter>('all')
  const [editingEntry, setEditingEntry] = useState<HistoryEntry | null>(null)

  const filteredEntries = useMemo(() => {
    return historyEntries.filter((entry) => {
      if (startDate && entry.date < startDate) return false
      if (endDate && entry.date > endDate) return false
      if (recordType !== 'all' && entry.category !== recordType) return false
      if (entry.category === 'Activity' && activityType !== 'all' && entry.type !== activityType) return false
      if (entry.category === 'Health Reading' && healthMetric !== 'all' && entry.type !== healthMetric) return false
      return true
    })
  }, [historyEntries, startDate, endDate, recordType, activityType, healthMetric])

  // The unified history list only carries a flattened summary — look the
  // full original record back up by id so the right form can be pre-filled.
  const editingBloodSugar = editingEntry?.type === 'Blood Sugar'
    ? bloodSugarReadings.find((r) => r.id === editingEntry.id)
    : undefined
  const editingBloodPressure = editingEntry?.type === 'Blood Pressure'
    ? bloodPressureReadings.find((r) => r.id === editingEntry.id)
    : undefined
  const editingHeartRate = editingEntry?.type === 'Heart Rate'
    ? heartRateReadings.find((r) => r.id === editingEntry.id)
    : undefined
  const editingWalkRun = editingEntry?.type === 'Walking' || editingEntry?.type === 'Running'
    ? walkRunActivities.find((a) => a.id === editingEntry.id)
    : undefined
  const editingGym = editingEntry?.type === 'Gym'
    ? gymActivities.find((a) => a.id === editingEntry.id)
    : undefined

  return (
    <div className="dad-page">
      <div className="dad-page-header">
        <h1>History</h1>
      </div>

      <SectionCard title="Filters">
        <div className="dad-filter-grid">
          <div className="dad-form-row">
            <label htmlFor="hist-start">From</label>
            <input id="hist-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div className="dad-form-row">
            <label htmlFor="hist-end">To</label>
            <input id="hist-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
          <div className="dad-form-row">
            <label htmlFor="hist-record-type">Record type</label>
            <select
              id="hist-record-type"
              value={recordType}
              onChange={(e) => setRecordType(e.target.value as RecordTypeFilter)}
            >
              <option value="all">All</option>
              <option value="Health Reading">Health Reading</option>
              <option value="Activity">Activity</option>
            </select>
          </div>
          {recordType !== 'Health Reading' && (
            <div className="dad-form-row">
              <label htmlFor="hist-activity-type">Activity type</label>
              <select
                id="hist-activity-type"
                value={activityType}
                onChange={(e) => setActivityType(e.target.value as ActivityTypeFilter)}
              >
                <option value="all">All</option>
                <option value="Walking">Walking</option>
                <option value="Running">Running</option>
                <option value="Gym">Gym</option>
              </select>
            </div>
          )}
          {recordType !== 'Activity' && (
            <div className="dad-form-row">
              <label htmlFor="hist-health-metric">Health metric</label>
              <select
                id="hist-health-metric"
                value={healthMetric}
                onChange={(e) => setHealthMetric(e.target.value as HealthMetricFilter)}
              >
                <option value="all">All</option>
                <option value="Blood Sugar">Blood Sugar</option>
                <option value="Blood Pressure">Blood Pressure</option>
                <option value="Heart Rate">Heart Rate</option>
              </select>
            </div>
          )}
        </div>
      </SectionCard>

      <SectionCard title={`Records (${filteredEntries.length})`}>
        {filteredEntries.length === 0 ? (
          <EmptyState
            message={
              historyEntries.length === 0
                ? 'No records yet. Add a health reading or log an activity to see it here.'
                : 'No records match these filters.'
            }
          />
        ) : (
          <ul className="dad-recent-list">
            {filteredEntries.map((entry) => (
              <li key={entry.id} className="dad-recent-item dad-history-item">
                <span className="dad-recent-date">
                  {formatDateDisplay(entry.date)} · {formatTimeDisplay(entry.time)}
                </span>
                <span className="dad-recent-type">
                  {entry.type}
                  <span className="dad-category-tag">{entry.category}</span>
                </span>
                <span className="dad-recent-summary">{entry.summary}</span>
                {entry.comments && <span className="dad-recent-comments">{entry.comments}</span>}
                <button type="button" className="dad-edit-link" onClick={() => setEditingEntry(entry)}>
                  Edit
                </button>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      {editingBloodSugar && (
        <Modal title="Edit Blood Sugar" onClose={() => setEditingEntry(null)}>
          <BloodSugarForm existing={editingBloodSugar} onSaved={() => setEditingEntry(null)} />
        </Modal>
      )}
      {editingBloodPressure && (
        <Modal title="Edit Blood Pressure" onClose={() => setEditingEntry(null)}>
          <BloodPressureForm existing={editingBloodPressure} onSaved={() => setEditingEntry(null)} />
        </Modal>
      )}
      {editingHeartRate && (
        <Modal title="Edit Heart Rate" onClose={() => setEditingEntry(null)}>
          <HeartRateForm existing={editingHeartRate} onSaved={() => setEditingEntry(null)} />
        </Modal>
      )}
      {editingWalkRun && (
        <Modal title={`Edit ${editingWalkRun.activityType}`} onClose={() => setEditingEntry(null)}>
          <WalkRunForm existing={editingWalkRun} onSaved={() => setEditingEntry(null)} />
        </Modal>
      )}
      {editingGym && (
        <Modal title="Edit Gym Session" onClose={() => setEditingEntry(null)}>
          <GymForm existing={editingGym} onSaved={() => setEditingEntry(null)} />
        </Modal>
      )}
    </div>
  )
}
