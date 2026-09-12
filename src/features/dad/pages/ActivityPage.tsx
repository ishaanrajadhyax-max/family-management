import { useState } from 'react'
import { useDadData } from '../DadDataContext'
import Modal from '../components/Modal'
import SectionCard from '../components/SectionCard'
import EmptyState from '../components/EmptyState'
import WalkRunForm from '../forms/WalkRunForm'
import GymForm from '../forms/GymForm'
import { byMostRecent, formatDateDisplay, formatTimeDisplay } from '../utils'
import type { ActivityType, WalkRunActivity, GymActivity } from '../types'

type ActiveForm =
  | { kind: 'add-walk-run'; activityType: ActivityType }
  | { kind: 'add-gym' }
  | { kind: 'edit-walk-run'; record: WalkRunActivity }
  | { kind: 'edit-gym'; record: GymActivity }
  | null

export default function ActivityPage() {
  const { walkRunActivities, gymActivities } = useDadData()
  const [activeForm, setActiveForm] = useState<ActiveForm>(null)

  const recentActivities = [
    ...walkRunActivities.map((a) => ({
      id: a.id,
      date: a.date,
      time: a.startTime,
      type: a.activityType,
      summary: `${a.distance} ${a.distanceUnit} in ${a.durationMinutes} min`,
      onEdit: () => setActiveForm({ kind: 'edit-walk-run', record: a }),
    })),
    ...gymActivities.map((a) => ({
      id: a.id,
      date: a.date,
      time: a.time,
      type: 'Gym',
      summary: `${a.focus}${a.durationMinutes ? ` · ${a.durationMinutes} min` : ''}`,
      onEdit: () => setActiveForm({ kind: 'edit-gym', record: a }),
    })),
  ]
    .sort(byMostRecent)
    .slice(0, 8)

  return (
    <div className="dad-page">
      <div className="dad-page-header">
        <h1>Activity</h1>
      </div>

      <SectionCard title="Log an Activity">
        <div className="dad-action-grid">
          <button
            type="button"
            className="dad-action-card"
            onClick={() => setActiveForm({ kind: 'add-walk-run', activityType: 'Walking' })}
          >
            <span className="dad-action-title">Log Walk</span>
            <span className="dad-action-subtitle">Distance, duration, pace</span>
          </button>
          <button
            type="button"
            className="dad-action-card"
            onClick={() => setActiveForm({ kind: 'add-walk-run', activityType: 'Running' })}
          >
            <span className="dad-action-title">Log Run</span>
            <span className="dad-action-subtitle">Distance, duration, pace</span>
          </button>
          <button type="button" className="dad-action-card" onClick={() => setActiveForm({ kind: 'add-gym' })}>
            <span className="dad-action-title">Log Gym Session</span>
            <span className="dad-action-subtitle">Workout focus and exercises</span>
          </button>
        </div>
      </SectionCard>

      <SectionCard title="Recent Activity">
        {recentActivities.length === 0 ? (
          <EmptyState
            message="No activity recorded yet."
            actionLabel="Log Walk"
            onAction={() => setActiveForm({ kind: 'add-walk-run', activityType: 'Walking' })}
          />
        ) : (
          <ul className="dad-recent-list">
            {recentActivities.map((entry) => (
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

      {activeForm?.kind === 'add-walk-run' && (
        <Modal
          title={activeForm.activityType === 'Walking' ? 'Log Walk' : 'Log Run'}
          onClose={() => setActiveForm(null)}
        >
          <WalkRunForm initialType={activeForm.activityType} onSaved={() => setActiveForm(null)} />
        </Modal>
      )}
      {activeForm?.kind === 'add-gym' && (
        <Modal title="Log Gym Session" onClose={() => setActiveForm(null)}>
          <GymForm onSaved={() => setActiveForm(null)} />
        </Modal>
      )}
      {activeForm?.kind === 'edit-walk-run' && (
        <Modal title={`Edit ${activeForm.record.activityType}`} onClose={() => setActiveForm(null)}>
          <WalkRunForm existing={activeForm.record} onSaved={() => setActiveForm(null)} />
        </Modal>
      )}
      {activeForm?.kind === 'edit-gym' && (
        <Modal title="Edit Gym Session" onClose={() => setActiveForm(null)}>
          <GymForm existing={activeForm.record} onSaved={() => setActiveForm(null)} />
        </Modal>
      )}
    </div>
  )
}
