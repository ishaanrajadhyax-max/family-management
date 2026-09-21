import type { JarvisConversation, JarvisMode } from '../api'
import type { VoiceEngine } from '../useSpeechOutput'
import { formatRelative, latestCreatedAt } from '../logic/format.ts'
import type { JarvisMemoryEntry } from '../api'
import { ENGINE_LABEL, MODE_NOTE } from '../logic/labels.ts'
import Icon from '../ui/Icon'
import type { IconName } from '../ui/Icon'

interface RowProps {
  icon: IconName
  label: string
  value: string
  note?: string
  action?: { label: string; onClick: () => void }
}

function Row({ icon, label, value, note, action }: RowProps) {
  return (
    <div className="j-ctx-row">
      <span className="j-ctx-key">
        <Icon name={icon} size={16} /> {label}
      </span>
      <span className="j-ctx-val">
        <strong>{value}</strong>
        {note && <small>{note}</small>}
      </span>
      {action && (
        <button type="button" className="j-btn small" onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  )
}

interface ContextPanelProps {
  mode: JarvisMode
  conversation: JarvisConversation | null
  messageCount: number
  memory: JarvisMemoryEntry[]
  memoryReady: boolean
  engine: VoiceEngine | null
  now: number
  onNew: () => void
  onOpenMemory: () => void
  onTestVoice: () => void
}

// The real state of the current session: mode, conversation, memory and voice.
// Nothing decorative — every row is something that exists and that you can act on.
export default function ContextPanel({ mode, conversation, messageCount, memory, memoryReady, engine, now, onNew, onOpenMemory, onTestVoice }: ContextPanelProps) {
  const updated = latestCreatedAt(memory)
  return (
    <div className="j-ctx">
      <Row icon="general" label="Mode" value={mode.toUpperCase()} note={MODE_NOTE[mode]} />
      <Row
        icon="chat"
        label="Session"
        value={conversation ? `${messageCount} message${messageCount === 1 ? '' : 's'}` : 'Not started'}
        note={conversation ? `Started ${formatRelative(conversation.createdAt, now)}` : 'Ask anything to begin'}
        action={{ label: 'NEW', onClick: onNew }}
      />
      <Row
        icon="memory"
        label="Memory"
        value={memoryReady ? `${memory.length} stored fact${memory.length === 1 ? '' : 's'}` : 'Loading'}
        note={updated ? `Last saved ${formatRelative(updated, now)}` : undefined}
        action={{ label: 'OPEN', onClick: onOpenMemory }}
      />
      <Row
        icon="voice"
        label="Voice"
        value={engine ? ENGINE_LABEL[engine] : 'Not used yet'}
        note={engine ? 'Last spoken with' : 'Will · Unreal Speech, with browser fallback'}
        action={{ label: 'TEST', onClick: onTestVoice }}
      />
    </div>
  )
}
