import { HudPanel } from 'jarvis-design-system'

const shell = { background: '#02060b', padding: 24, minHeight: 200 }

// The framed technical panel used everywhere in Jarvis: corner brackets, a
// "LABEL //" header, restrained glow only when attention is needed.
export function Default() {
  return (
    <div style={shell}>
      <HudPanel label="MEMORY">
        <p style={{ margin: 0, color: '#9db4c8', fontSize: 13 }}>3 facts recalled from the last 7 days.</p>
      </HudPanel>
    </div>
  )
}

export function WithMetaAndActions() {
  return (
    <div style={shell}>
      <HudPanel
        label="CONVERSATION"
        meta="GENERAL"
        actions={
          <button type="button" style={{ background: 'transparent', border: '1px solid rgba(34,211,238,0.3)', color: '#22d3ee', borderRadius: 3, padding: '5px 10px', fontFamily: 'monospace', fontSize: 10.5 }}>
            NEW
          </button>
        }
      >
        <p style={{ margin: 0, color: '#9db4c8', fontSize: 13 }}>12 messages · last active 4 minutes ago.</p>
      </HudPanel>
    </div>
  )
}

export function Attention() {
  return (
    <div style={shell}>
      <HudPanel label="NOTIFICATIONS" meta="1 NEW" tone="attention">
        <p style={{ margin: 0, color: '#9db4c8', fontSize: 13 }}>A memory was saved: &quot;Prefers dark mode.&quot;</p>
      </HudPanel>
    </div>
  )
}
