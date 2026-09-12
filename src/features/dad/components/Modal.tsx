import type { ReactNode } from 'react'

interface ModalProps {
  title: string
  onClose: () => void
  children: ReactNode
}

// A simple, reusable popup used to host each "quick add" form.
export default function Modal({ title, onClose, children }: ModalProps) {
  return (
    <div className="dad-modal-overlay" onClick={onClose}>
      <div
        className="dad-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="dad-modal-header">
          <h2>{title}</h2>
          <button
            type="button"
            className="dad-modal-close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="dad-modal-body">{children}</div>
      </div>
    </div>
  )
}
