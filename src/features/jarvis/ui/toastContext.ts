import { createContext, useContext } from 'react'
import type { SoundName } from '../logic/soundSpec.ts'

export type ToastTone = 'info' | 'success' | 'warn' | 'error'

export interface ToastInput {
  tone: ToastTone
  label: string // "MEMORY"
  text: string // "SAVED"
  action?: { label: string; onClick: () => void }
  ttl?: number // ms before it leaves; default depends on tone
  sound?: SoundName | null // null = silent; default follows the tone
  attention?: boolean // keeps the Core in ATTENTION until this is dismissed
}

export interface ToastRecord extends ToastInput {
  id: number
  closing: boolean
}

export interface NotificationEntry {
  id: number
  tone: ToastTone
  label: string
  text: string
  at: number
}

export interface ToastApi {
  notify: (input: ToastInput) => number
  dismiss: (id: number) => void
  history: NotificationEntry[]
  toasts: ToastRecord[]
}

export const ToastContext = createContext<ToastApi | null>(null)

export function useToast(): ToastApi {
  const api = useContext(ToastContext)
  if (!api) throw new Error('useToast must be used inside <ToastProvider>')
  return api
}
