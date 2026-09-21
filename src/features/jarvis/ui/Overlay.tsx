import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { useMountTransition } from '../hooks/useMountTransition'
import { playSound } from '../uiSound'
import Icon from './Icon'

export type OverlayVariant = 'modal' | 'drawer' | 'sheet'

interface OverlayProps {
  open: boolean
  onClose: () => void
  label: string // "MEMORY" -> header "MEMORY //" and the dialog's accessible name
  variant?: OverlayVariant
  children: ReactNode
}

const EXIT_MS = 220

// Every modal, drawer and bottom sheet in Jarvis is this one component, so they
// all open, close, trap focus and sound the same way: a blurred dark backdrop, a
// technical panel that fades/scales/slides in, and the reverse on the way out.
export default function Overlay({ open, onClose, label, variant = 'modal', children }: OverlayProps) {
  const { mounted, state } = useMountTransition(open, EXIT_MS)
  const panelRef = useRef<HTMLDivElement>(null)
  const returnFocusTo = useRef<Element | null>(null)
  const wasOpen = useRef(false)

  // One place for panel sounds: opening and closing any overlay.
  useEffect(() => {
    if (open && !wasOpen.current) {
      wasOpen.current = true
      playSound('panelOpen')
      returnFocusTo.current = document.activeElement
    } else if (!open && wasOpen.current) {
      wasOpen.current = false
      playSound('panelClose')
      const back = returnFocusTo.current
      if (back instanceof HTMLElement) back.focus()
    }
  }, [open])

  // Focus the panel when it opens; Escape closes it.
  useEffect(() => {
    if (!open) return
    panelRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!mounted) return null

  return (
    <div className={`j-overlay j-overlay-${variant}`} data-state={state} onClick={onClose}>
      <div
        ref={panelRef}
        className="j-overlay-panel j-panel"
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="j-panel-head">
          <h2 className="j-panel-title">
            {label} <span className="j-slashes">//</span>
          </h2>
          <div className="j-panel-actions">
            <button type="button" className="j-icon-btn" onClick={onClose} aria-label={`Close ${label.toLowerCase()}`} data-sound="none">
              <Icon name="x" />
            </button>
          </div>
        </header>
        <div className="j-panel-body j-overlay-body">{children}</div>
      </div>
    </div>
  )
}
