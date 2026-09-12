// Holds one family member's data (whichever familyMemberId is passed in —
// see DadApp.tsx for how that's chosen), fetched from the backend API
// (server/), which reads and writes the real family_manager PostgreSQL
// database. Every page and form reads through this context, so a reading
// added on one page immediately shows up on the Dashboard/History/Insights
// pages too. The name is historical (this started as Dad-only) — the same
// components now serve whichever family member is being viewed.
//
// Data flow:  React (this file, via api.ts) -> server/ (Express) -> PostgreSQL
// Server-side authorization (see server/auth/access.js) is what actually
// decides whether a request for a given familyMemberId is allowed — this
// file just asks; it doesn't enforce anything.
import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type {
  BloodSugarReading,
  BloodPressureReading,
  WalkRunActivity,
  GymActivity,
  HistoryEntry,
} from './types'
import * as api from './api'
import { byMostRecent, isoToIstDateTime, istDateTimeToIso } from './utils'

interface DadDataContextValue {
  bloodSugarReadings: BloodSugarReading[]
  bloodPressureReadings: BloodPressureReading[]
  walkRunActivities: WalkRunActivity[]
  gymActivities: GymActivity[]
  historyEntries: HistoryEntry[]
  addBloodSugarReading: (entry: Omit<BloodSugarReading, 'id'>) => Promise<void>
  addBloodPressureReading: (entry: Omit<BloodPressureReading, 'id'>) => Promise<void>
  addWalkRunActivity: (entry: Omit<WalkRunActivity, 'id'>) => Promise<void>
  addGymActivity: (entry: Omit<GymActivity, 'id'>) => Promise<void>
  updateBloodSugarReading: (id: string, entry: Omit<BloodSugarReading, 'id'>) => Promise<void>
  updateBloodPressureReading: (id: string, entry: Omit<BloodPressureReading, 'id'>) => Promise<void>
  updateWalkRunActivity: (id: string, entry: Omit<WalkRunActivity, 'id'>) => Promise<void>
  updateGymActivity: (id: string, entry: Omit<GymActivity, 'id'>) => Promise<void>
}

const DadDataContext = createContext<DadDataContextValue | null>(null)

interface DadDataProviderProps {
  // Whose data to load. This is the authenticated user's own id for Dad/Mom;
  // for Ishaan (admin) it's whichever family member is currently selected
  // to view/manage — the server enforces who's actually allowed to see it,
  // this prop only decides what this provider *asks* for.
  familyMemberId: string
  children: ReactNode
}

export function DadDataProvider({ familyMemberId, children }: DadDataProviderProps) {
  const [bloodSugarReadings, setBloodSugarReadings] = useState<BloodSugarReading[]>([])
  const [bloodPressureReadings, setBloodPressureReadings] = useState<BloodPressureReading[]>([])
  const [walkRunActivities, setWalkRunActivities] = useState<WalkRunActivity[]>([])
  const [gymActivities, setGymActivities] = useState<GymActivity[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    let cancelled = false

    async function loadEverything() {
      setStatus('loading')
      try {
        const [sugar, pressure, walkRun, gym] = await Promise.all([
          api.listBloodSugarReadings(familyMemberId),
          api.listBloodPressureReadings(familyMemberId),
          api.listWalkRunActivities(familyMemberId),
          api.listGymActivities(familyMemberId),
        ])

        if (cancelled) return

        setBloodSugarReadings(sugar.map((r) => ({
          id: r.id,
          ...isoToIstDateTime(r.recordedAt),
          readingContext: r.readingContext,
          value: r.value,
          unit: r.unit,
          comments: r.comments ?? undefined,
        })))
        setBloodPressureReadings(pressure.map((r) => ({
          id: r.id,
          ...isoToIstDateTime(r.recordedAt),
          readingContext: r.readingContext,
          systolic: r.systolic,
          diastolic: r.diastolic,
          pulse: r.pulse ?? undefined,
          comments: r.comments ?? undefined,
        })))
        setWalkRunActivities(walkRun.map((a) => {
          const { date, time } = isoToIstDateTime(a.recordedAt)
          return {
            id: a.id,
            activityType: a.activityType,
            date,
            startTime: time,
            durationMinutes: a.durationMinutes,
            distance: a.distance,
            distanceUnit: a.distanceUnit,
            comments: a.comments ?? undefined,
          }
        }))
        setGymActivities(gym.map((a) => ({
          id: a.id,
          ...isoToIstDateTime(a.recordedAt),
          focus: a.focus,
          exercises: a.exercises ?? '',
          durationMinutes: a.durationMinutes ?? undefined,
          comments: a.comments ?? undefined,
        })))
        setStatus('ready')
      } catch (err) {
        if (cancelled) return
        setErrorMessage(err instanceof Error ? err.message : 'Failed to load data.')
        setStatus('error')
      }
    }

    loadEverything()
    return () => {
      cancelled = true
    }
  }, [familyMemberId])

  const addBloodSugarReading: DadDataContextValue['addBloodSugarReading'] = async (entry) => {
    const created = await api.createBloodSugarReading({
      familyMemberId,
      recordedAt: istDateTimeToIso(entry.date, entry.time),
      readingContext: entry.readingContext,
      value: entry.value,
      unit: entry.unit,
      comments: entry.comments,
    })
    setBloodSugarReadings((prev) => [...prev, {
      id: created.id,
      ...isoToIstDateTime(created.recordedAt),
      readingContext: created.readingContext,
      value: created.value,
      unit: created.unit,
      comments: created.comments ?? undefined,
    }])
  }

  const updateBloodSugarReading: DadDataContextValue['updateBloodSugarReading'] = async (id, entry) => {
    const updated = await api.updateBloodSugarReading(id, {
      recordedAt: istDateTimeToIso(entry.date, entry.time),
      readingContext: entry.readingContext,
      value: entry.value,
      unit: entry.unit,
      comments: entry.comments,
    })
    setBloodSugarReadings((prev) => prev.map((r) => (r.id !== id ? r : {
      id: updated.id,
      ...isoToIstDateTime(updated.recordedAt),
      readingContext: updated.readingContext,
      value: updated.value,
      unit: updated.unit,
      comments: updated.comments ?? undefined,
    })))
  }

  const addBloodPressureReading: DadDataContextValue['addBloodPressureReading'] = async (entry) => {
    const created = await api.createBloodPressureReading({
      familyMemberId,
      recordedAt: istDateTimeToIso(entry.date, entry.time),
      readingContext: entry.readingContext,
      systolic: entry.systolic,
      diastolic: entry.diastolic,
      pulse: entry.pulse,
      comments: entry.comments,
    })
    setBloodPressureReadings((prev) => [...prev, {
      id: created.id,
      ...isoToIstDateTime(created.recordedAt),
      readingContext: created.readingContext,
      systolic: created.systolic,
      diastolic: created.diastolic,
      pulse: created.pulse ?? undefined,
      comments: created.comments ?? undefined,
    }])
  }

  const updateBloodPressureReading: DadDataContextValue['updateBloodPressureReading'] = async (id, entry) => {
    const updated = await api.updateBloodPressureReading(id, {
      recordedAt: istDateTimeToIso(entry.date, entry.time),
      readingContext: entry.readingContext,
      systolic: entry.systolic,
      diastolic: entry.diastolic,
      pulse: entry.pulse,
      comments: entry.comments,
    })
    setBloodPressureReadings((prev) => prev.map((r) => (r.id !== id ? r : {
      id: updated.id,
      ...isoToIstDateTime(updated.recordedAt),
      readingContext: updated.readingContext,
      systolic: updated.systolic,
      diastolic: updated.diastolic,
      pulse: updated.pulse ?? undefined,
      comments: updated.comments ?? undefined,
    })))
  }

  const addWalkRunActivity: DadDataContextValue['addWalkRunActivity'] = async (entry) => {
    const created = await api.createWalkRunActivity({
      familyMemberId,
      activityType: entry.activityType,
      recordedAt: istDateTimeToIso(entry.date, entry.startTime),
      durationMinutes: entry.durationMinutes,
      distance: entry.distance,
      distanceUnit: entry.distanceUnit,
      comments: entry.comments,
    })
    const { date, time } = isoToIstDateTime(created.recordedAt)
    setWalkRunActivities((prev) => [...prev, {
      id: created.id,
      activityType: created.activityType,
      date,
      startTime: time,
      durationMinutes: created.durationMinutes,
      distance: created.distance,
      distanceUnit: created.distanceUnit,
      comments: created.comments ?? undefined,
    }])
  }

  const updateWalkRunActivity: DadDataContextValue['updateWalkRunActivity'] = async (id, entry) => {
    const updated = await api.updateWalkRunActivity(id, {
      activityType: entry.activityType,
      recordedAt: istDateTimeToIso(entry.date, entry.startTime),
      durationMinutes: entry.durationMinutes,
      distance: entry.distance,
      distanceUnit: entry.distanceUnit,
      comments: entry.comments,
    })
    const { date, time } = isoToIstDateTime(updated.recordedAt)
    setWalkRunActivities((prev) => prev.map((a) => (a.id !== id ? a : {
      id: updated.id,
      activityType: updated.activityType,
      date,
      startTime: time,
      durationMinutes: updated.durationMinutes,
      distance: updated.distance,
      distanceUnit: updated.distanceUnit,
      comments: updated.comments ?? undefined,
    })))
  }

  const addGymActivity: DadDataContextValue['addGymActivity'] = async (entry) => {
    const created = await api.createGymActivity({
      familyMemberId,
      recordedAt: istDateTimeToIso(entry.date, entry.time),
      focus: entry.focus,
      exercises: entry.exercises,
      durationMinutes: entry.durationMinutes,
      comments: entry.comments,
    })
    setGymActivities((prev) => [...prev, {
      id: created.id,
      ...isoToIstDateTime(created.recordedAt),
      focus: created.focus,
      exercises: created.exercises ?? '',
      durationMinutes: created.durationMinutes ?? undefined,
      comments: created.comments ?? undefined,
    }])
  }

  const updateGymActivity: DadDataContextValue['updateGymActivity'] = async (id, entry) => {
    const updated = await api.updateGymActivity(id, {
      recordedAt: istDateTimeToIso(entry.date, entry.time),
      focus: entry.focus,
      exercises: entry.exercises,
      durationMinutes: entry.durationMinutes,
      comments: entry.comments,
    })
    setGymActivities((prev) => prev.map((a) => (a.id !== id ? a : {
      id: updated.id,
      ...isoToIstDateTime(updated.recordedAt),
      focus: updated.focus,
      exercises: updated.exercises ?? '',
      durationMinutes: updated.durationMinutes ?? undefined,
      comments: updated.comments ?? undefined,
    })))
  }

  // Flatten every record type into one chronological shape for the
  // History page and the Dashboard's "Recent Activity" list.
  const historyEntries = useMemo<HistoryEntry[]>(() => {
    const entries: HistoryEntry[] = [
      ...bloodSugarReadings.map((r) => ({
        id: r.id,
        date: r.date,
        time: r.time,
        category: 'Health Reading' as const,
        type: 'Blood Sugar',
        summary: `${r.value} ${r.unit} (${r.readingContext})`,
        comments: r.comments,
      })),
      ...bloodPressureReadings.map((r) => ({
        id: r.id,
        date: r.date,
        time: r.time,
        category: 'Health Reading' as const,
        type: 'Blood Pressure',
        summary: `${r.systolic}/${r.diastolic} mmHg${r.pulse ? ` · ${r.pulse} bpm` : ''} (${r.readingContext})`,
        comments: r.comments,
      })),
      ...walkRunActivities.map((a) => ({
        id: a.id,
        date: a.date,
        time: a.startTime,
        category: 'Activity' as const,
        type: a.activityType,
        summary: `${a.distance} ${a.distanceUnit} in ${a.durationMinutes} min`,
        comments: a.comments,
      })),
      ...gymActivities.map((a) => ({
        id: a.id,
        date: a.date,
        time: a.time,
        category: 'Activity' as const,
        type: 'Gym',
        summary: `${a.focus}${a.durationMinutes ? ` · ${a.durationMinutes} min` : ''}`,
        comments: a.comments,
      })),
    ]
    return entries.sort(byMostRecent)
  }, [bloodSugarReadings, bloodPressureReadings, walkRunActivities, gymActivities])

  if (status === 'loading') {
    return <div className="dad-app-status">Loading…</div>
  }

  if (status === 'error') {
    return (
      <div className="dad-app-status dad-app-status-error">
        <p>Couldn't load data from the server.</p>
        <p className="dad-form-hint">{errorMessage}</p>
        <p className="dad-form-hint">
          Make sure the backend is running: <code>cd server &amp;&amp; npm start</code>
        </p>
      </div>
    )
  }

  const value: DadDataContextValue = {
    bloodSugarReadings,
    bloodPressureReadings,
    walkRunActivities,
    gymActivities,
    historyEntries,
    addBloodSugarReading,
    addBloodPressureReading,
    addWalkRunActivity,
    addGymActivity,
    updateBloodSugarReading,
    updateBloodPressureReading,
    updateWalkRunActivity,
    updateGymActivity,
  }

  return <DadDataContext.Provider value={value}>{children}</DadDataContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components -- hook belongs next to the context it reads
export function useDadData(): DadDataContextValue {
  const ctx = useContext(DadDataContext)
  if (!ctx) {
    throw new Error('useDadData must be used within a DadDataProvider')
  }
  return ctx
}
