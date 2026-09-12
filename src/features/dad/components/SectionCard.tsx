import type { ReactNode } from 'react'

interface SectionCardProps {
  title: string
  action?: ReactNode
  children: ReactNode
}

// A titled card/panel used to group related content across the Dad pages.
export default function SectionCard({ title, action, children }: SectionCardProps) {
  return (
    <section className="dad-section-card">
      <div className="dad-section-card-header">
        <h2>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}
