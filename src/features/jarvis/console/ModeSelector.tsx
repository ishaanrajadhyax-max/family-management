import type { JarvisMode, JarvisModeInfo } from '../api'
import Icon from '../ui/Icon'
import type { IconName } from '../ui/Icon'

const MODE_ICON: Record<JarvisMode, IconName> = { general: 'general', news: 'news', style: 'style' }

interface ModeSelectorProps {
  modes: JarvisModeInfo[]
  value: JarvisMode // the mode of the conversation you are in (or will start)
  onSelect: (mode: JarvisMode) => void
  compact?: boolean
}

// MODE // GENERAL · NEWS · STYLE. Selecting a mode starts a fresh conversation
// in that mode (the mode of an existing conversation never changes), so what is
// highlighted here is always the mode Jarvis is actually using.
export default function ModeSelector({ modes, value, onSelect, compact = false }: ModeSelectorProps) {
  return (
    <div className={`j-modes ${compact ? 'compact' : ''}`} role="radiogroup" aria-label="Mode">
      {modes.map((mode) => (
        <button
          key={mode.id}
          type="button"
          role="radio"
          aria-checked={mode.id === value}
          className={mode.id === value ? 'j-mode active' : 'j-mode'}
          onClick={() => onSelect(mode.id)}
          data-sound="modeSwitch"
        >
          <Icon name={MODE_ICON[mode.id]} size={16} />
          <span>{mode.label}</span>
        </button>
      ))}
    </div>
  )
}
