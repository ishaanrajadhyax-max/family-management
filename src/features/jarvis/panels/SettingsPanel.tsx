import { useSyncExternalStore } from 'react'
import { getSoundSettings, playSound, setSoundEnabled, setSoundVolume, subscribeSoundSettings } from '../uiSound'
import { setMotionPreference, useMotionPreference } from '../hooks/useMotionPreference'
import type { MotionPreference } from '../hooks/useMotionPreference'
import type { VoiceEngine } from '../useSpeechOutput'
import { ENGINE_LABEL } from '../logic/labels.ts'
import {
  getVoicePlaybackSettings,
  setVoiceSpeed,
  setVoiceVolume,
  subscribeVoicePlaybackSettings,
  SPEED_MIN,
  SPEED_MAX,
  VOLUME_MIN,
  VOLUME_MAX,
} from '../logic/voiceSettings.ts'

interface SettingsPanelProps {
  speakEnabled: boolean
  onToggleSpeak: () => void
  speechSupported: boolean
  micSupported: boolean
  engine: VoiceEngine | null
  userName: string
  userRole: string
  onSignOut: () => void
}

const MOTION_OPTIONS: { value: MotionPreference; label: string }[] = [
  { value: 'system', label: 'SYSTEM' },
  { value: 'reduced', label: 'REDUCED' },
  { value: 'full', label: 'FULL' },
]

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (next: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} className={`j-switch ${checked ? 'on' : ''}`} onClick={() => onChange(!checked)} data-sound="none">
      <span className="j-switch-knob" />
      <span className="j-switch-text">{checked ? 'ON' : 'OFF'}</span>
    </button>
  )
}

// Minimal, real settings only. Every control here changes something that exists.
export default function SettingsPanel({ speakEnabled, onToggleSpeak, speechSupported, micSupported, engine, userName, userRole, onSignOut }: SettingsPanelProps) {
  const sound = useSyncExternalStore(subscribeSoundSettings, getSoundSettings, getSoundSettings)
  const voice = useSyncExternalStore(subscribeVoicePlaybackSettings, getVoicePlaybackSettings, getVoicePlaybackSettings)
  const motion = useMotionPreference()

  return (
    <div className="j-settings">
      <section className="j-set-group" aria-labelledby="set-sound">
        <h3 id="set-sound">
          UI SOUND <span className="j-slashes">//</span>
        </h3>
        <div className="j-set-row">
          <span>
            Sound
            <small>Short interface cues. Separate from Jarvis&apos;s voice.</small>
          </span>
          <Switch
            checked={sound.enabled}
            label="UI sound"
            onChange={(next) => {
              setSoundEnabled(next)
              if (next) playSound('notify')
            }}
          />
        </div>
        <div className="j-set-row">
          <label htmlFor="ui-volume">
            UI sound volume
            <small>{Math.round(sound.volume * 100)}%</small>
          </label>
          <input
            id="ui-volume"
            className="j-range"
            type="range"
            min={0}
            max={100}
            step={5}
            value={Math.round(sound.volume * 100)}
            disabled={!sound.enabled}
            onChange={(e) => setSoundVolume(Number(e.target.value) / 100)}
            onPointerUp={() => playSound('click')}
            onKeyUp={() => playSound('click')}
          />
        </div>
      </section>

      <section className="j-set-group" aria-labelledby="set-voice">
        <h3 id="set-voice">
          VOICE <span className="j-slashes">//</span>
        </h3>
        {speechSupported && (
          <div className="j-set-row">
            <span>
              Spoken replies in chat
              <small>The voice conversation always speaks.</small>
            </span>
            <Switch checked={speakEnabled} label="Spoken replies" onChange={onToggleSpeak} />
          </div>
        )}
        <div className="j-set-row">
          <label htmlFor="voice-speed">
            Speech speed
            <small>{voice.speed.toFixed(2)}x — playback pace only; Will&apos;s voice stays the same.</small>
          </label>
          <input
            id="voice-speed"
            className="j-range"
            type="range"
            min={SPEED_MIN}
            max={SPEED_MAX}
            step={0.01}
            value={voice.speed}
            onChange={(e) => setVoiceSpeed(Number(e.target.value))}
          />
        </div>
        <div className="j-set-row">
          <label htmlFor="voice-volume">
            Voice volume
            <small>{Math.round(voice.volume)}% — separate from UI sound.</small>
          </label>
          <input
            id="voice-volume"
            className="j-range"
            type="range"
            min={VOLUME_MIN}
            max={VOLUME_MAX}
            step={1}
            value={voice.volume}
            onChange={(e) => setVoiceVolume(Number(e.target.value))}
          />
        </div>
        <dl className="j-set-info">
          <div>
            <dt>Voice engine</dt>
            <dd>{engine ? ENGINE_LABEL[engine] : 'Not used yet'}</dd>
          </div>
          <div>
            <dt>Voice input</dt>
            <dd>{micSupported ? 'Available' : 'Not supported in this browser'}</dd>
          </div>
        </dl>
      </section>

      <section className="j-set-group" aria-labelledby="set-motion">
        <h3 id="set-motion">
          MOTION <span className="j-slashes">//</span>
        </h3>
        <div className="j-set-row">
          <span>
            Animation
            <small>System follows your device&apos;s reduced-motion setting.</small>
          </span>
          <div className="j-seg" role="radiogroup" aria-label="Animation">
            {MOTION_OPTIONS.map((o) => (
              <button key={o.value} type="button" role="radio" aria-checked={motion === o.value} className={motion === o.value ? 'active' : ''} onClick={() => setMotionPreference(o.value)}>
                {o.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="j-set-group" aria-labelledby="set-account">
        <h3 id="set-account">
          ACCOUNT <span className="j-slashes">//</span>
        </h3>
        <dl className="j-set-info">
          <div>
            <dt>Signed in as</dt>
            <dd>
              {userName} · {userRole}
            </dd>
          </div>
        </dl>
        <button type="button" className="j-btn block" onClick={onSignOut}>
          SIGN OUT
        </button>
      </section>
    </div>
  )
}
