import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { ToastContext } from './toastContext'
import type { NotificationEntry, ToastInput, ToastRecord } from './toastContext'
import { setCoreSignal } from '../logic/coreStore.ts'
import { playSound } from '../uiSound'
import { useMotionPreference } from '../hooks/useMotionPreference'
import Icon from './Icon'
import type { IconName } from './Icon'

const EXIT_MS = 220
const MAX_VISIBLE = 4
const MAX_HISTORY = 30
const DEFAULT_TTL = { info: 4000, success: 4000, warn: 6000, error: 7000 } as const
const TONE_ICON: Record<ToastInput['tone'], IconName> = { info: 'info', success: 'check', warn: 'alert', error: 'alert' }

// Notifications in the Jarvis style: "LABEL // TEXT", entering, holding and
// leaving smoothly. Each carries its own sound (centralised in uiSound), and a
// toast marked `attention` keeps the Core in its ATTENTION state until dismissed.
export default function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([])
  const [history, setHistory] = useState<NotificationEntry[]>([])
  const counter = useRef(0)
  const motion = useMotionPreference()

  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const dismiss = useCallback(
    (id: number) => {
      setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, closing: true } : t)))
      setTimeout(() => remove(id), EXIT_MS)
    },
    [remove],
  )

  const notify = useCallback(
    (input: ToastInput) => {
      const id = ++counter.current
      const sound = input.sound === undefined ? (input.tone === 'error' ? 'error' : 'notify') : input.sound
      if (sound) playSound(sound)
      setToasts((prev) => [...prev, { ...input, id, closing: false }])
      setHistory((prev) => [{ id, tone: input.tone, label: input.label, text: input.text, at: Date.now() }, ...prev].slice(0, MAX_HISTORY))
      return id
    },
    [],
  )

  // Real "something needs your attention" -> the Core shows ATTENTION.
  const wantsAttention = toasts.some((t) => t.attention && !t.closing)
  useEffect(() => {
    setCoreSignal('attention', wantsAttention)
  }, [wantsAttention])

  const visible = toasts.slice(-MAX_VISIBLE)

  return (
    <ToastContext.Provider value={{ notify, dismiss, history, toasts }}>
      {children}
      <div className="j-toasts" data-motion={motion} role="region" aria-label="Notifications">
        {visible.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

function ToastItem({ toast, onDismiss }: { toast: ToastRecord; onDismiss: (id: number) => void }) {
  const ttl = toast.ttl ?? DEFAULT_TTL[toast.tone]
  useEffect(() => {
    const id = setTimeout(() => onDismiss(toast.id), ttl)
    return () => clearTimeout(id)
  }, [toast.id, ttl, onDismiss])

  return (
    <div
      className={`j-toast tone-${toast.tone}`}
      data-state={toast.closing ? 'closing' : 'open'}
      role={toast.tone === 'error' ? 'alert' : 'status'}
      aria-live={toast.tone === 'error' ? 'assertive' : 'polite'}
    >
      <Icon name={TONE_ICON[toast.tone]} size={18} className="j-toast-icon" />
      <p className="j-toast-text">
        <span className="j-toast-label">
          {toast.label} <span className="j-slashes">//</span>
        </span>{' '}
        {toast.text}
      </p>
      {toast.action && (
        <button
          type="button"
          className="j-toast-action"
          onClick={() => {
            toast.action?.onClick()
            onDismiss(toast.id)
          }}
        >
          {toast.action.label}
        </button>
      )}
      <button type="button" className="j-icon-btn small" onClick={() => onDismiss(toast.id)} aria-label="Dismiss notification" data-sound="none">
        <Icon name="x" size={14} />
      </button>
    </div>
  )
}
