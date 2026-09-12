interface StatCardProps {
  label: string
  value: string
  meta?: string
}

// A single "at a glance" figure used in the Dashboard's Today's Snapshot
// and Activity Summary sections.
export default function StatCard({ label, value, meta }: StatCardProps) {
  return (
    <div className="dad-stat-card">
      <span className="dad-stat-label">{label}</span>
      <span className="dad-stat-value">{value}</span>
      {meta && <span className="dad-stat-meta">{meta}</span>}
    </div>
  )
}
