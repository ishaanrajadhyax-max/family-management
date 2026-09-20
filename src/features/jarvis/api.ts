// Thin client for the /api/jarvis/* backend routes. Same conventions as
// src/features/dad/api.ts (wire-shape camelCase, credentials included for
// the session cookie).
import { API_BASE_URL } from '../../apiBase'

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}/jarvis${path}`, {
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      ...options,
    })
  } catch {
    throw new Error('Could not reach the server. Is the backend running (server/)?')
  }

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

export function sendMessage(
  conversationId: string,
  content: string,
): Promise<{ userMessage: JarvisMessage; assistantMessage: JarvisMessage }> {
  return apiFetch(`/conversations/${conversationId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ content }),
  })
}

export function listMemory(): Promise<JarvisMemoryEntry[]> {
  return apiFetch('/memory')
}

export async function deleteMemory(id: string): Promise<void> {
  await apiFetch(`/memory/${id}`, { method: 'DELETE' })
}
