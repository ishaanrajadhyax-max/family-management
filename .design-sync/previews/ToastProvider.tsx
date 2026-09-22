import { useEffect } from 'react'
import { ToastProvider, useToast } from 'jarvis-design-system'

const shell = { background: '#02060b', minHeight: 260, padding: 24 }

// Notifications in the Jarvis style: "LABEL // TEXT", each with its own
// tone and, optionally, an action. Fired on mount so the stack is visible
// in the preview capture.
function AllTonesDemo() {
  const { notify } = useToast()
  useEffect(() => {
    notify({ tone: 'info', label: 'MEMORY', text: 'Recalling saved context…', sound: null })
    notify({ tone: 'success', label: 'MEMORY', text: 'Saved successfully.', sound: null })
    notify({ tone: 'warn', label: 'VOICE', text: 'Microphone permission not granted yet.', sound: null })
    notify({ tone: 'error', label: 'SYSTEM', text: 'Connection to Jarvis lost.', sound: null })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return <p style={{ margin: 0, color: '#5f7a90', fontSize: 12, fontFamily: 'ui-monospace, Consolas, monospace' }}>Notifications appear in the corner.</p>
}

export function AllTones() {
  return (
    <div style={shell}>
      <ToastProvider>
        <AllTonesDemo />
      </ToastProvider>
    </div>
  )
}

function WithActionDemo() {
  const { notify } = useToast()
  useEffect(() => {
    notify({ tone: 'error', label: 'SYSTEM', text: 'Connection to Jarvis lost.', sound: null, action: { label: 'RETRY', onClick: () => {} } })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return <p style={{ margin: 0, color: '#5f7a90', fontSize: 12, fontFamily: 'ui-monospace, Consolas, monospace' }}>A toast with an action button.</p>
}

export function WithAction() {
  return (
    <div style={shell}>
      <ToastProvider>
        <WithActionDemo />
      </ToastProvider>
    </div>
  )
}
