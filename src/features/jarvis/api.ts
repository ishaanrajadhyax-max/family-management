// Thin client for the /api/jarvis/* backend routes. Same conventions as
// src/features/dad/api.ts (wire-shape camelCase, credentials included for
// the session cookie).
import { API_BASE_URL } from '../../apiBase'

// Whether the server could be reached on the last request: a real signal for
// the status strip's CONNECTION indicator (not a guess or a timer).
export type ConnectionState = 'unknown' | 'stable' | 'unreachable'
let connection: ConnectionState = 'unknown'
const connectionListeners = new Set<() => void>()

function setConnection(next: ConnectionState) {
  if (connection === next) return
  connection = next
  connectionListeners.forEach((l) => l())
}

export function getConnection(): ConnectionState {
  return connection
}

export function subscribeConnection(listener: () => void): () => void {
  connectionListeners.add(listener)
  return () => {
    connectionListeners.delete(listener)
  }
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}/jarvis${path}`, {
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      ...options,
    })
  } catch {
    setConnection('unreachable')
    throw new Error('Could not reach the server. Is the backend running (server/)?')
  }
  setConnection('stable')

  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.error || `Request failed with status ${response.status}`)
  }

  if (response.status === 204) {
    return undefined as T
  }
  return response.json() as Promise<T>
}

export type JarvisMode = 'general' | 'news' | 'style'

export interface JarvisModeInfo {
  id: JarvisMode
  label: string
}

export interface JarvisConversation {
  id: string
  mode: JarvisMode
  title: string | null
  createdAt: string
  updatedAt: string
}

export interface JarvisMessage {
  id: string
  conversationId: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
}

export interface JarvisMemoryEntry {
  id: string
  content: string
  createdAt: string
}

export function listModes(): Promise<JarvisModeInfo[]> {
  return apiFetch('/modes')
}

export function listConversations(): Promise<JarvisConversation[]> {
  return apiFetch('/conversations')
}

export function createConversation(mode: JarvisMode): Promise<JarvisConversation> {
  return apiFetch('/conversations', { method: 'POST', body: JSON.stringify({ mode }) })
}

export function listMessages(conversationId: string): Promise<JarvisMessage[]> {
  return apiFetch(`/conversations/${conversationId}/messages`)
}

// channel is 'voice' when the message was spoken in the voice view; the
// server uses it to apply the user's "voice replies stay short" rules.
export function sendMessage(
  conversationId: string,
  content: string,
  channel: 'text' | 'voice' = 'text',
): Promise<{ userMessage: JarvisMessage; assistantMessage: JarvisMessage }> {
  return apiFetch(`/conversations/${conversationId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ content, channel }),
  })
}

// Asks the server to speak `text` with its neural voice (Unreal Speech,
// "Will"); resolves to an MP3 blob held in memory only. Rejects for ANY
// reason the server voice can't be used — not configured, a spend limit,
// provider trouble — and the caller falls back to the browser voice.
// `unconfigured` is true when the server has no key at all, so the caller
// can stop asking for the rest of the session.
export class ServerSpeechUnavailable extends Error {
  unconfigured: boolean
  constructor(unconfigured: boolean) {
    super('Server voice unavailable')
    this.unconfigured = unconfigured
  }
}

export async function fetchSpeech(text: string, signal?: AbortSignal): Promise<Blob> {
  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}/jarvis/speech`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ text }),
      signal,
    })
  } catch {
    throw new ServerSpeechUnavailable(false)
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new ServerSpeechUnavailable(body?.code === 'tts_unconfigured')
  }
  return response.blob()
}

export function listMemory(): Promise<JarvisMemoryEntry[]> {
  return apiFetch('/memory')
}

export async function deleteMemory(id: string): Promise<void> {
  await apiFetch(`/memory/${id}`, { method: 'DELETE' })
}
