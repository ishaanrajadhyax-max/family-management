import Icon from '../ui/Icon'

interface IntelligencePanelProps {
  onOpenNews: () => void
}

// INTELLIGENCE // is where tracked topics, changes since your last check and
// connections between events will appear once a real source feeds it. There is
// no such source yet, so this says so plainly instead of showing invented items.
export default function IntelligencePanel({ onOpenNews }: IntelligencePanelProps) {
  return (
    <div className="j-intel">
      <p className="j-intel-state">
        INTELLIGENCE <span className="j-slashes">//</span> NO ACTIVE FEED
      </p>
      <p className="j-empty-note">Nothing is connected yet. Tracked topics and insights will appear here.</p>
      <button type="button" className="j-btn block" onClick={onOpenNews} data-sound="modeSwitch">
        <Icon name="news" size={16} /> OPEN NEWS MODE
      </button>
    </div>
  )
}
