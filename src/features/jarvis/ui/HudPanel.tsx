import type { ReactNode } from 'react'

interface HudPanelProps {
  label: string // e.g. "MEMORY" — rendered as "MEMORY //"
  meta?: string // small mono text at the right of the header
  actions?: ReactNode
  tone?: 'default' | 'attention'
  className?: string
  children: ReactNode
}

// The framed technical panel used everywhere: corner brackets, a
// "LABEL //" header in the display face, restrained glow only when attention
// is needed.
export default function HudPanel({ label, meta, actions, tone = 'default', className, children }: HudPanelProps) {
  return (
    <section className={`j-panel ${tone === 'attention' ? 'attention' : ''} ${className ?? ''}`} aria-label={label}>
      <header className="j-panel-head">
        <h2 className="j-panel-title">
          {label} <span className="j-slashes">//</span>
        </h2>
        {meta && <span className="j-panel-meta">{meta}</span>}
        {actions && <div className="j-panel-actions">{actions}</div>}
      </header>
      <div className="j-panel-body">{children}</div>
    </section>
  )
}
