// Thin client for the backend API (server/). Every function here returns
// the "wire shape" (camelCase, as sent by the server) — DadDataContext is
// responsible for translating that into the UI-friendly shapes in types.ts
// (e.g. recordedAt -> separate date/time strings).
import type { GlucoseUnit, DistanceUnit, WorkoutFocus, ActivityType, ReadingContext } from './types'

const API_BASE_URL = 'http://localhost:4000/api'

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    })
  } catch {
    throw new Error('Could not reach the server. Is the backend running (server/)?')
  }

  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.error || `Request failed with status ${response.status}`)
  }

  return response.json() as Promise<T>
}

export interface ApiFamilyMember {
  id: string
  name: string
  role: 'dad' | 'mom' | 'admin'
}

export function getFamilyMembers(): Promise<ApiFamilyMember[]> {
  return apiFetch('/family-members')
}

export interface ApiBloodSugarReading {
  id: string
  familyMemberId: string
  recordedAt: string
  readingContext: ReadingContext
  value: number
  unit: GlucoseUnit
  comments: string | null
}

export function listBloodSugarReadings(familyMemberId: string): Promise<ApiBloodSugarReading[]> {
  return apiFetch(`/blood-sugar-readings?familyMemberId=${familyMemberId}`)
}

export function createBloodSugarReading(payload: {
  familyMemberId: string
  recordedAt: string
  readingContext: ReadingContext
  value: number
  unit: GlucoseUnit
  comments?: string
}): Promise<ApiBloodSugarReading> {
  return apiFetch('/blood-sugar-readings', { method: 'POST', body: JSON.stringify(payload) })
}

export function updateBloodSugarReading(
  id: string,
  payload: { recordedAt: string; readingContext: ReadingContext; value: number; unit: GlucoseUnit; comments?: string },
): Promise<ApiBloodSugarReading> {
  return apiFetch(`/blood-sugar-readings/${id}`, { method: 'PUT', body: JSON.stringify(payload) })
}

export interface ApiBloodPressureReading {
  id: string
  familyMemberId: string
  recordedAt: string
  readingContext: ReadingContext
  systolic: number
  diastolic: number
  pulse: number | null
  comments: string | null
}

export function listBloodPressureReadings(familyMemberId: string): Promise<ApiBloodPressureReading[]> {
  return apiFetch(`/blood-pressure-readings?familyMemberId=${familyMemberId}`)
}

export function createBloodPressureReading(payload: {
  familyMemberId: string
  recordedAt: string
  readingContext: ReadingContext
  systolic: number
  diastolic: number
  pulse?: number
  comments?: string
}): Promise<ApiBloodPressureReading> {
  return apiFetch('/blood-pressure-readings', { method: 'POST', body: JSON.stringify(payload) })
}

export function updateBloodPressureReading(
  id: string,
  payload: {
    recordedAt: string
    readingContext: ReadingContext
    systolic: number
    diastolic: number
    pulse?: number
    comments?: string
  },
): Promise<ApiBloodPressureReading> {
  return apiFetch(`/blood-pressure-readings/${id}`, { method: 'PUT', body: JSON.stringify(payload) })
}

export interface ApiHeartRateReading {
  id: string
  familyMemberId: string
  recordedAt: string
  value: number
  comments: string | null
}

export function listHeartRateReadings(familyMemberId: string): Promise<ApiHeartRateReading[]> {
  return apiFetch(`/heart-rate-readings?familyMemberId=${familyMemberId}`)
}

export function createHeartRateReading(payload: {
  familyMemberId: string
  recordedAt: string
  value: number
  comments?: string
}): Promise<ApiHeartRateReading> {
  return apiFetch('/heart-rate-readings', { method: 'POST', body: JSON.stringify(payload) })
}

export function updateHeartRateReading(
  id: string,
  payload: { recordedAt: string; value: number; comments?: string },
): Promise<ApiHeartRateReading> {
  return apiFetch(`/heart-rate-readings/${id}`, { method: 'PUT', body: JSON.stringify(payload) })
}

export interface ApiWalkRunActivity {
  id: string
  familyMemberId: string
  activityType: ActivityType
  recordedAt: string
  durationMinutes: number
  distance: number
  distanceUnit: DistanceUnit
  comments: string | null
}

export function listWalkRunActivities(familyMemberId: string): Promise<ApiWalkRunActivity[]> {
  return apiFetch(`/walk-run-activities?familyMemberId=${familyMemberId}`)
}

export function createWalkRunActivity(payload: {
  familyMemberId: string
  activityType: ActivityType
  recordedAt: string
  durationMinutes: number
  distance: number
  distanceUnit: DistanceUnit
  comments?: string
}): Promise<ApiWalkRunActivity> {
  return apiFetch('/walk-run-activities', { method: 'POST', body: JSON.stringify(payload) })
}

export function updateWalkRunActivity(
  id: string,
  payload: {
    activityType: ActivityType
    recordedAt: string
    durationMinutes: number
    distance: number
    distanceUnit: DistanceUnit
    comments?: string
  },
): Promise<ApiWalkRunActivity> {
  return apiFetch(`/walk-run-activities/${id}`, { method: 'PUT', body: JSON.stringify(payload) })
}

export interface ApiGymActivity {
  id: string
  familyMemberId: string
  recordedAt: string
  focus: WorkoutFocus
  exercises: string | null
  durationMinutes: number | null
  comments: string | null
}

export function listGymActivities(familyMemberId: string): Promise<ApiGymActivity[]> {
  return apiFetch(`/gym-activities?familyMemberId=${familyMemberId}`)
}

export function createGymActivity(payload: {
  familyMemberId: string
  recordedAt: string
  focus: WorkoutFocus
  exercises?: string
  durationMinutes?: number
  comments?: string
}): Promise<ApiGymActivity> {
  return apiFetch('/gym-activities', { method: 'POST', body: JSON.stringify(payload) })
}

export function updateGymActivity(
  id: string,
  payload: { recordedAt: string; focus: WorkoutFocus; exercises?: string; durationMinutes?: number; comments?: string },
): Promise<ApiGymActivity> {
  return apiFetch(`/gym-activities/${id}`, { method: 'PUT', body: JSON.stringify(payload) })
}
