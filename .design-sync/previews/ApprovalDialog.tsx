import { ApprovalDialog } from 'jarvis-design-system'

const shell = { background: '#02060b', minHeight: 380, position: 'relative' as const }

// A system-style approval step for real destructive/consequential actions -
// shows the thing being approved, waits for an explicit choice.
export function Normal() {
  return (
    <div style={shell}>
      <ApprovalDialog
        open
        label="VOICE REQUEST"
        title="Enable spoken replies?"
        detail="Jarvis will read responses aloud using your browser's voice."
        confirmLabel="ENABLE"
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    </div>
  )
}

export function Danger() {
  return (
    <div style={shell}>
      <ApprovalDialog
        open
        label="MEMORY REQUEST"
        title="Forget this memory?"
        detail="&quot;Prefers dark mode, dislikes notification sounds.&quot;"
        confirmLabel="FORGET"
        tone="danger"
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    </div>
  )
}
