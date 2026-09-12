interface EmptyStateProps {
  message: string
  actionLabel?: string
  onAction?: () => void
}

// A calm, professional placeholder shown wherever a list has no records
// yet, instead of leaving a blank space or showing fake data.
export default function EmptyState({ message, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div className="dad-empty-state">
      <p>{message}</p>
      {actionLabel && onAction && (
        <button type="button" className="dad-btn-secondary" onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>
  )
}
