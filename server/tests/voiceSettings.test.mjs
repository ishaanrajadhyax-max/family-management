// Jarvis voice playback settings (src/features/jarvis/logic/voiceSettings.ts):
// speed and volume, completely separate from uiSound.ts's UI-cue volume.
// Node has no `window`, so the module's localStorage persistence naturally
// no-ops here (guarded by `typeof window === 'undefined'`) — what's tested
// is the store contract itself: defaults, clamping, and change notification.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  getVoicePlaybackSettings,
  setVoiceSpeed,
  setVoiceVolume,
  subscribeVoicePlaybackSettings,
  volumeToNativeRange,
  DEFAULT_SPEED,
  SPEED_MIN,
  SPEED_MAX,
  DEFAULT_VOLUME,
  VOLUME_MIN,
  VOLUME_MAX,
} from '../../src/features/jarvis/logic/voiceSettings.ts'

test('spec: the ranges and defaults match what was requested', () => {
  assert.equal(SPEED_MIN, 0.5)
  assert.equal(SPEED_MAX, 1.6)
  assert.equal(DEFAULT_SPEED, 1.0)
  assert.equal(VOLUME_MIN, 0)
  assert.equal(VOLUME_MAX, 150)
  assert.equal(DEFAULT_VOLUME, 100)
})

test('defaults: with no stored value (as in this Node environment), speed and volume start at their defaults', () => {
  const s = getVoicePlaybackSettings()
  assert.equal(s.speed, DEFAULT_SPEED)
  assert.equal(s.volume, DEFAULT_VOLUME)
})

test('setVoiceSpeed: accepts any value in range, clamps outside it', () => {
  setVoiceSpeed(0.75)
  assert.equal(getVoicePlaybackSettings().speed, 0.75)
  setVoiceSpeed(1.25)
  assert.equal(getVoicePlaybackSettings().speed, 1.25)
  setVoiceSpeed(-5)
  assert.equal(getVoicePlaybackSettings().speed, SPEED_MIN)
  setVoiceSpeed(99)
  assert.equal(getVoicePlaybackSettings().speed, SPEED_MAX)
  setVoiceSpeed(DEFAULT_SPEED) // reset for later tests
})

test('setVoiceVolume: accepts any value in range, clamps outside it', () => {
  setVoiceVolume(25)
  assert.equal(getVoicePlaybackSettings().volume, 25)
  setVoiceVolume(150)
  assert.equal(getVoicePlaybackSettings().volume, VOLUME_MAX)
  setVoiceVolume(-10)
  assert.equal(getVoicePlaybackSettings().volume, VOLUME_MIN)
  setVoiceVolume(1000)
  assert.equal(getVoicePlaybackSettings().volume, VOLUME_MAX)
  setVoiceVolume(DEFAULT_VOLUME) // reset for later tests
})

test('the full continuous range is reachable, not a fixed set of checkpoints', () => {
  // Every 0.01 step across the whole range must be settable exactly — proves
  // this is a real continuous control, not snapping to preset stops.
  for (let v = SPEED_MIN; v <= SPEED_MAX + 1e-9; v = Math.round((v + 0.01) * 100) / 100) {
    setVoiceSpeed(v)
    assert.equal(getVoicePlaybackSettings().speed, Math.round(v * 100) / 100, `speed ${v}`)
  }
  setVoiceSpeed(DEFAULT_SPEED)
  for (let v = VOLUME_MIN; v <= VOLUME_MAX; v += 1) {
    setVoiceVolume(v)
    assert.equal(getVoicePlaybackSettings().volume, v, `volume ${v}%`)
  }
  setVoiceVolume(DEFAULT_VOLUME)
})

test('subscribe: notifies only on an actual change, and unsubscribe stops notifications', () => {
  const seen = []
  const unsub = subscribeVoicePlaybackSettings(() => seen.push(getVoicePlaybackSettings()))
  setVoiceSpeed(1.1)
  assert.equal(seen.length, 1)
  setVoiceSpeed(1.1) // no change
  assert.equal(seen.length, 1)
  setVoiceVolume(80)
  assert.equal(seen.length, 2)
  unsub()
  setVoiceSpeed(0.6)
  assert.equal(seen.length, 2, 'unsubscribed listener hears nothing more')
  setVoiceSpeed(DEFAULT_SPEED)
  setVoiceVolume(DEFAULT_VOLUME)
})

test('volumeToNativeRange: maps percent to the 0..1 range native APIs accept, clamped at 100%', () => {
  assert.equal(volumeToNativeRange(0), 0)
  assert.equal(volumeToNativeRange(50), 0.5)
  assert.equal(volumeToNativeRange(100), 1)
  assert.equal(volumeToNativeRange(150), 1, 'boosted volume is capped, never exceeds the native ceiling')
  assert.equal(volumeToNativeRange(-20), 0)
})

test('UI sound volume and voice volume are genuinely separate stores', async () => {
  // Different modules entirely — importing this one never touches uiSound.ts.
  // Checked as an actual import statement, not a comment mentioning it (this
  // file's own header comment explains the separation in prose).
  const src = new URL('../../src/features/jarvis/logic/voiceSettings.ts', import.meta.url)
  const text = await (await import('node:fs')).promises.readFile(src, 'utf8')
  assert.doesNotMatch(text, /^\s*import[^\n]*from\s*['"][^'"]*uiSound/m)
  assert.doesNotMatch(text, /^\s*import[^\n]*from\s*['"][^'"]*soundSpec/m)
})
