import { useSyncExternalStore } from 'react'
import type { JarvisMode, JarvisModeInfo } from './api'
import { getConnection, subscribeConnection } from './api'
import type { VoiceEngine } from './useSpeechOutput'
import { useCoreState } from './hooks/useCoreState'
import { useNow } from './hooks/useNow'
import { CORE_LABEL } from './logic/coreState.ts'
import type { CoreState } from './logic/coreState.ts'
import { formatClock } from './logic/format.ts'
import ModeSelector from './console/ModeSelector'

const CORE_CAPTION: Record<CoreState, string> = {
  idle: 'Ready when you are',
  listening: 'Capturing your voice',
  thinking: 'Working on it',
  speaking: 'Speaking the reply',
  error: 'The last request failed',
  attention: 'Something needs your attention',
}

const ENGINE_SHORT: Record<VoiceEngine, string> = { unreal: 'Will · Unreal', 'unreal-raw': 'Will · Unreal', browser: 'Browser voice' }

interface StatusStripProps {
  modes: JarvisModeInfo[]
  mode: JarvisMode
  onSelectMode: (mode: JarvisMode) => void
  voiceOn: boolean
  engine: VoiceEngine | null
}

// The one-line system status. The CORE cell reads the same store as the Core
// itself, so it can never disagree with it; CONNECTION comes from whether the
// server actually answered the last request; VOICE from the voice actually used.
export default function StatusStrip({ modes, mode, onSelectMode, voiceOn, engine }: StatusStripProps) {
  const { state, detail } = useCoreState()
  const connection = useSyncExternalStore(subscribeConnection, getConnection, getConnection)
  const now = useNow(15000)
  const clock = formatClock(now)

  const connectionTone = connection === 'stable' ? 'ok' : connection === 'unreachable' ? 'bad' : 'info'
  const connectionText = connection === 'stable' ? 'STABLE' : connection === 'unreachable' ? 'UNREACHABLE' : 'CHECKING'

  return (
    <section className="j-status" aria-label="System status">
      <div className="j-status-clock" aria-hidden="true">
        <strong>{clock.time}</strong>
        <small>{clock.date}</small>
      </div>

      <div className="j-status-cell" data-core={state}>
        <span className="j-status-dot" aria-hidden="true" />
        <div>
          <p className="j-status-key">
            CORE <span className="j-slashes">//</span> <strong>{CORE_LABEL[state]}</strong>
          </p>
          <p className="j-status-note">{detail ? detail.charAt(0) + detail.slice(1).toLowerCase() : CORE_CAPTION[state]}</p>
        </div>
      </div>

      <div className="j-status-cell j-status-mode">
        <div>
          <p className="j-status-key">
            MODE <span className="j-slashes">//</span> <strong>{mode.toUpperCase()}</strong>
          </p>
          <ModeSelector modes={modes} value={mode} onSelect={onSelectMode} compact />
        </div>
      </div>

      <div className="j-status-cell j-status-voice">
        <div>
          <p className="j-status-key">
            VOICE <span className="j-slashes">//</span> <strong>{voiceOn ? 'ON' : 'OFF'}</strong>
          </p>
          <p className="j-status-note">{engine ? ENGINE_SHORT[engine] : 'Not used yet'}</p>
        </div>
      </div>

      <div className="j-status-cell j-status-conn" data-tone={connectionTone}>
        <span className="j-status-dot" aria-hidden="true" />
        <div>
          <p className="j-status-key">
            CONNECTION <span className="j-slashes">//</span> <strong>{connectionText}</strong>
          </p>
        </div>
      </div>
    </section>
  )
}
