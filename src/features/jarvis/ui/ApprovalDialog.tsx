import { useState } from 'react'
import Overlay from './Overlay'
import Icon from './Icon'

interface ApprovalDialogProps {
  open: boolean
  label: string // "MEMORY REQUEST"
  title: string
  detail?: string // the specific thing being approved, quoted
  confirmLabel: string
  cancelLabel?: string
  tone?: 'normal' | 'danger'
  onConfirm: () => void | Promise<void>
  onCancel: () => void
}

// A system-style approval step, used for real destructive actions (e.g. forgetting
// a memory). It shows the thing being approved, waits for an explicit choice, and
// reports a working state while the action runs.
export default function ApprovalDialog({
  open,
  label,
  title,
  detail,
  confirmLabel,
  cancelLabel = 'CANCEL',
  tone = 'normal',
  onConfirm,
  onCancel,
}: ApprovalDialogProps) {
  const [busy, setBusy] = useState(false)

  async function confirm() {
    setBusy(true)
    try {
      await onConfirm()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Overlay open={open} onClose={busy ? () => undefined : onCancel} label={label} variant="modal">
      <div className={`j-approval ${tone === 'danger' ? 'danger' : ''}`}>
        <p className="j-approval-title">{title}</p>
        {detail && <blockquote className="j-approval-detail">{detail}</blockquote>}
        <div className="j-approval-actions">
          <button type="button" className="j-btn ghost" onClick={onCancel} disabled={busy} data-sound="reject">
            <Icon name="x" size={16} /> {cancelLabel}
          </button>
          <button type="button" className={`j-btn ${tone === 'danger' ? 'danger' : 'primary'}`} onClick={confirm} disabled={busy} data-sound="approve">
            <Icon name={busy ? 'loading' : 'check'} size={16} className={busy ? 'spin' : ''} /> {busy ? 'WORKING' : confirmLabel}
          </button>
        </div>
      </div>
    </Overlay>
  )
}
