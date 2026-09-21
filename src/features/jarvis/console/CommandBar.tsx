import { useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import { useCoreState } from '../hooks/useCoreState'
import { CORE_LABEL } from '../logic/coreState.ts'
import Icon from '../ui/Icon'
import type { VoiceCapture } from '../useVoiceCapture'

interface CommandBarProps {
  onSend: (content: string) => void
  sending: boolean
  error: string
  voice: VoiceCapture
  speakEnabled: boolean
  speechSupported: boolean
  onToggleSpeak: () => void
  onStopSpeech: () => void
  onEnterVoice: () => void
  placeholder: string
}

const LABEL_FOR_STATE: Record<string, string> = { thinking: 'PROCESSING' }

// COMMAND // — text, microphone, send and stop, all driven by the same Core
// state as everything else: it shows what Jarvis is doing (READY / LISTENING /
// PROCESSING / SPEAKING / ERROR) and offers Stop exactly when there is
// something to stop.
export default function CommandBar({
  onSend,
  sending,
  error,
  voice,
  speakEnabled,
  speechSupported,
  onToggleSpeak,
  onStopSpeech,
  onEnterVoice,
  placeholder,
}: CommandBarProps) {
  const { state } = useCoreState()
  const [draft, setDraft] = useState('')
  const [sentPulse, setSentPulse] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const busy = sending
  const canSend = draft.trim().length > 0 && !busy
  const canStop = state === 'speaking' || voice.isListening

  function resize() {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`
  }

  function submit(e?: FormEvent) {
    e?.preventDefault()
    const content = draft.trim()
    if (!content || busy) return
    setDraft('')
    requestAnimationFrame(resize)
    setSentPulse(true)
    setTimeout(() => setSentPulse(false), 320)
    onSend(content)
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    } else if (e.key === 'Escape' && canStop) {
      stop()
    }
  }

  function stop() {
    if (voice.isListening) voice.stop()
    onStopSpeech()
  }

  function toggleMic() {
    if (voice.isListening) {
      voice.stop()
      return
    }
    onStopSpeech()
    voice.start((transcript) => {
      setDraft((prev) => (prev ? `${prev} ${transcript}` : transcript))
      requestAnimationFrame(resize)
    })
  }

  const stateLabel = LABEL_FOR_STATE[state] ?? CORE_LABEL[state]

  return (
    <form className="j-command" data-state={state} data-typing={draft ? 'true' : 'false'} data-sent={sentPulse ? 'true' : 'false'} onSubmit={submit}>
      <div className="j-command-label" aria-live="polite">
        COMMAND <span className="j-slashes">//</span> <span className="j-command-state">{stateLabel}</span>
      </div>
      <div className="j-command-row">
        {voice.isSupported && (
          <button
            type="button"
            className={`j-icon-btn round mic ${voice.isListening ? 'active' : ''}`}
            onClick={toggleMic}
            disabled={busy}
            aria-label={voice.isListening ? 'Stop listening' : 'Speak your message'}
            aria-pressed={voice.isListening}
            data-sound="none"
          >
            <Icon name="mic" size={20} />
          </button>
        )}
        <div className="j-command-field">
          <textarea
            ref={inputRef}
            className="j-command-input"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value)
              resize()
            }}
            onKeyDown={onKeyDown}
            placeholder={voice.isListening ? 'Listening…' : placeholder}
            rows={1}
            disabled={busy}
            aria-label="Message Jarvis"
          />
        </div>
        {canStop && (
          <button type="button" className="j-icon-btn round stop" onClick={stop} aria-label="Stop" data-sound="none">
            <Icon name="stop" size={18} />
          </button>
        )}
        {speechSupported && (
          <button
            type="button"
            className={`j-icon-btn j-cmd-secondary ${speakEnabled ? 'active' : ''}`}
            onClick={onToggleSpeak}
            aria-label={speakEnabled ? 'Spoken replies on' : 'Spoken replies off'}
            aria-pressed={speakEnabled}
          >
            <Icon name={speakEnabled ? 'speaker' : 'speaker-off'} />
          </button>
        )}
        {voice.isSupported && (
          <button type="button" className="j-icon-btn j-cmd-secondary" onClick={onEnterVoice} aria-label="Voice conversation">
            <Icon name="voice" />
          </button>
        )}
        <button type="submit" className="j-send" disabled={!canSend} aria-label="Send message">
          <Icon name={busy ? 'loading' : 'send'} size={18} className={busy ? 'spin' : ''} />
        </button>
      </div>
      {(error || voice.error) && (
        <p className="j-command-error" role="alert">
          ERROR <span className="j-slashes">//</span> {error || voice.error}
        </p>
      )}
    </form>
  )
}
