import { useState } from 'react'
import { useDadData } from '../DadDataContext'
import Modal from '../components/Modal'
import SectionCard from '../components/SectionCard'
import EmptyState from '../components/EmptyState'
import BloodSugarForm from '../forms/BloodSugarForm'
import BloodPressureForm from '../forms/BloodPressureForm'
import { byMostRecent, formatDateDisplay, formatTimeDisplay } from '../utils'
import type { BloodSugarReading, BloodPressureReading } from '../types'

type ActiveForm =
  | { kind: 'add-blood-sugar' }
  | { kind: 'add-blood-pressure' }
  | { kind: 'edit-blood-sugar'; record: BloodSugarReading }
  | { kind: 'edit-blood-pressure'; record: BloodPressureReading }
  | null

export default function HealthReadingsPage() {
  const { bloodSugarReadings, bloodPressureReadings } = useDadData()
  const [activeForm, setActiveForm] = useState<ActiveForm>(null)

  const recentReadings = [
    ...bloodSugarReadings.map((r) => ({
      id: r.id,
      date: r.date,
      time: r.time,
      type: 'Blood Sugar',
      summary: `${r.value} ${r.unit} (${r.readingContext})`,
      onEdit: () => setActiveForm({ kind: 'edit-blood-sugar', record: r }),
    })),
    ...bloodPressureReadings.map((r) => ({
      id: r.id,
      date: r.date,
      time: r.time,
      type: 'Blood Pressure',
      summary: `${r.systolic}/${r.diastolic} mmHg (${r.readingContext})`,
      onEdit: () => setActiveForm({ kind: 'edit-blood-pressure', record: r }),
    })),
  ]
    .sort(byMostRecent)
    .slice(0, 8)

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

      <SectionCard title="Recent Readings">
        {recentReadings.length === 0 ? (
          <EmptyState
            message="No readings recorded yet."
            actionLabel="Add Blood Sugar"
            onAction={() => setActiveForm({ kind: 'add-blood-sugar' })}
          />
        ) : (
          <ul className="dad-recent-list">
            {recentReadings.map((entry) => (
              <li key={entry.id} className="dad-recent-item">
                <span className="dad-recent-date">
                  {formatDateDisplay(entry.date)} · {formatTimeDisplay(entry.time)}
                </span>
                <span className="dad-recent-type">{entry.type}</span>
                <span className="dad-recent-summary">{entry.summary}</span>
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
