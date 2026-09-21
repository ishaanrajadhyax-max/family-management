import { useState } from 'react'
import { useCoreState } from './hooks/useCoreState'
import { CORE_LABEL } from './logic/coreState.ts'
import type { VoiceCapture } from './useVoiceCapture'
import Icon from './ui/Icon'

interface VoiceDockProps {
  voice: VoiceCapture
  sending: boolean
  error: string
  onSend: (content: string) => void
  onStopSpeech: () => void
  onExit: () => void
}

// The voice conversation controls: one large microphone, the stage the Core
// occupies above it, and a way back to chat. Turn-based: tap, speak, Jarvis
// answers aloud, tap again. The label under the mic is the Core's own state.
export default function VoiceDock({ voice, sending, error, onSend, onStopSpeech, onExit }: VoiceDockProps) {
  const { state } = useCoreState()
  const [heard, setHeard] = useState('')

  function toggle() {
    if (voice.isListening) {
      voice.stop()
      return
    }
    onStopSpeech()
    setHeard('')
    voice.start((transcript) => {
      setHeard(transcript)
      onSend(transcript)
    })
  }

  const busy = sending && !voice.isListening
  const hint =
    state === 'listening' ? 'Listening… tap to stop' : state === 'thinking' ? 'Jarvis is thinking…' : state === 'speaking' ? 'Speaking… tap to interrupt' : 'Tap to talk'

  return (
    <div className="j-voice-dock" data-state={state}>
      <p className="j-voice-heard" aria-live="polite">
        {heard ? (
          <>
            YOU <span className="j-slashes">//</span> {heard}
          </>
        ) : (
          ' '
        )}
      </p>
      <div className="j-voice-controls">
        <button type="button" className="j-icon-btn" onClick={onExit} aria-label="Back to chat" data-sound="none">
          <Icon name="chat" />
        </button>
        <button
          type="button"
          className={`j-voice-mic ${state}`}
          onClick={state === 'speaking' ? onStopSpeech : toggle}
          disabled={!voice.isSupported || busy}
          aria-label={voice.isListening ? 'Stop listening' : state === 'speaking' ? 'Stop speaking' : 'Start talking'}
          aria-pressed={voice.isListening}
          data-sound="none"
        >
          <Icon name={state === 'speaking' ? 'stop' : 'mic'} size={30} />
        </button>
        <span className="j-voice-state">
          VOICE <span className="j-slashes">//</span> {CORE_LABEL[state]}
        </span>
      </div>
      <p className="j-voice-hint">{hint}</p>
      {!voice.isSupported && <p className="j-command-error">ERROR // Voice input isn&apos;t supported in this browser.</p>}
      {(error || voice.error) && (
        <p className="j-command-error" role="alert">
          ERROR <span className="j-slashes">//</span> {error || voice.error}
        </p>
      )}
    </div>
  )
}
