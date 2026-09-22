import { Overlay } from 'jarvis-design-system'

const shell = { background: '#02060b', minHeight: 380, position: 'relative' as const }

// Every modal, drawer and bottom sheet in Jarvis is this one component -
// they all open, close, trap focus and sound the same way.
export function Modal() {
  return (
    <div style={shell}>
      <Overlay open onClose={() => {}} label="MEMORY" variant="modal">
        <p style={{ margin: 0, color: '#9db4c8', fontSize: 13 }}>Forget the fact &quot;Prefers dark mode&quot;? This can&apos;t be undone.</p>
      </Overlay>
    </div>
  )
}

export function Drawer() {
  return (
    <div style={shell}>
      <Overlay open onClose={() => {}} label="SETTINGS" variant="drawer">
        <p style={{ margin: 0, color: '#9db4c8', fontSize: 13 }}>Voice replies, sound, and account options.</p>
      </Overlay>
    </div>
  )
}

export function Sheet() {
  return (
    <div style={shell}>
      <Overlay open onClose={() => {}} label="QUICK ACTIONS" variant="sheet">
        <p style={{ margin: 0, color: '#9db4c8', fontSize: 13 }}>Log a reading, start a new conversation, or check the news.</p>
      </Overlay>
    </div>
  )
}
