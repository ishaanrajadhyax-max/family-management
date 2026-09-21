// Pure logic behind the Jarvis interface: the Core's state model, the audio
// envelope, the Markdown parser, formatting helpers and the UI sound system's
// specification and policy. No DOM and no React — the same modules the browser
// runs, imported here through Node's native TypeScript support.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { deriveCoreState, coreDetail, EMPTY_SIGNALS, CORE_LABEL } from '../../src/features/jarvis/logic/coreState.ts'
import { setCoreSignal, getCoreSnapshot, subscribeCore, setLevelSource, readCoreLevel } from '../../src/features/jarvis/logic/coreStore.ts'
import { buildEnvelope, envelopeAt, ENVELOPE_WINDOW_SEC } from '../../src/features/jarvis/logic/envelope.ts'
import { parseMarkdown, parseInline, isSafeUrl } from '../../src/features/jarvis/logic/markdownParse.ts'
import { formatRelative, formatClock, newEntries, latestCreatedAt } from '../../src/features/jarvis/logic/format.ts'
import {
  SOUNDS,
  SOUND_NAMES,
  MASTER_MAX,
  DEFAULT_VOLUME,
  soundDuration,
  volumeToGain,
  defaultSoundEnabled,
  shouldPlay,
  soundForTransition,
} from '../../src/features/jarvis/logic/soundSpec.ts'
import { scheduleSound } from '../../src/features/jarvis/uiSound.ts'

// ------------------------------------------------------------------ Core state

const sig = (over = {}) => ({ ...EMPTY_SIGNALS, ...over })

test('core: with no signals the core is idle; each signal alone maps to its own state', () => {
  assert.equal(deriveCoreState(sig()), 'idle')
  assert.equal(deriveCoreState(sig({ listening: true })), 'listening')
  assert.equal(deriveCoreState(sig({ thinking: true })), 'thinking')
  assert.equal(deriveCoreState(sig({ preparing: true })), 'thinking')
  assert.equal(deriveCoreState(sig({ speaking: true })), 'speaking')
  assert.equal(deriveCoreState(sig({ error: true })), 'error')
  assert.equal(deriveCoreState(sig({ attention: true })), 'attention')
})

test('core: priority is error > speaking > thinking > listening > attention > idle, for every combination', () => {
  const order = ['error', 'speaking', 'thinking', 'listening', 'attention']
  const keyFor = { error: 'error', speaking: 'speaking', thinking: 'thinking', listening: 'listening', attention: 'attention' }
  for (let mask = 0; mask < 64; mask++) {
    const s = {
      listening: !!(mask & 1),
      thinking: !!(mask & 2),
      preparing: !!(mask & 4),
      speaking: !!(mask & 8),
      error: !!(mask & 16),
      attention: !!(mask & 32),
    }
    const expected =
      s.error ? 'error' : s.speaking ? 'speaking' : s.thinking || s.preparing ? 'thinking' : s.listening ? 'listening' : s.attention ? 'attention' : 'idle'
    assert.equal(deriveCoreState(s), expected, JSON.stringify(s))
    if (expected !== 'idle') assert.ok(order.includes(keyFor[expected] ?? expected))
  }
})

test('core: "thinking" says what it means — processing a message vs preparing a spoken reply', () => {
  assert.equal(coreDetail(sig({ thinking: true })), 'PROCESSING')
  assert.equal(coreDetail(sig({ preparing: true })), 'PREPARING VOICE')
  assert.equal(coreDetail(sig({ thinking: true, preparing: true })), 'PROCESSING')
  assert.equal(coreDetail(sig({ speaking: true })), '')
  assert.equal(coreDetail(sig()), '')
})

test('core: every state has a display label', () => {
  for (const s of ['idle', 'listening', 'thinking', 'speaking', 'error', 'attention']) assert.ok(CORE_LABEL[s], s)
  assert.equal(CORE_LABEL.idle, 'READY')
})

test('core store: notifies subscribers only when the visible state changes, and the snapshot is stable between changes', () => {
  const seen = []
  const unsubscribe = subscribeCore(() => seen.push(getCoreSnapshot().state))
  const first = getCoreSnapshot()
  assert.equal(first.state, 'idle')
  assert.equal(getCoreSnapshot(), first, 'same object while nothing changed')

  setCoreSignal('listening', true)
  setCoreSignal('listening', true) // no change -> no notification
  setCoreSignal('attention', true) // hidden behind listening -> state unchanged -> no notification
  setCoreSignal('thinking', true)
  setCoreSignal('thinking', false)
  setCoreSignal('listening', false)
  setCoreSignal('attention', false)
  assert.deepEqual(seen, ['listening', 'thinking', 'listening', 'attention', 'idle'])
  unsubscribe()
  setCoreSignal('error', true)
  assert.equal(seen.length, 5, 'unsubscribed listeners hear nothing')
  setCoreSignal('error', false)
  assert.equal(getCoreSnapshot().state, 'idle')
})

test('core store: audio level comes only from the source for the current state, and null means "no measurement"', () => {
  setLevelSource('speaking', () => 0.7)
  setLevelSource('listening', () => 0.2)
  assert.equal(readCoreLevel(), null, 'idle has no level')
  setCoreSignal('speaking', true)
  assert.equal(readCoreLevel(), 0.7)
  setCoreSignal('speaking', false)
  setCoreSignal('listening', true)
  assert.equal(readCoreLevel(), 0.2)
  setLevelSource('listening', () => null)
  assert.equal(readCoreLevel(), null, 'a source with no measurement (e.g. the browser voice) reports null')
  setLevelSource('listening', null)
  assert.equal(readCoreLevel(), null)
  setCoreSignal('listening', false)
  setLevelSource('speaking', null)
})

// -------------------------------------------------------------------- Envelope

test('envelope: follows the loudness of the samples, normalised to 0..1, one value per 20 ms', () => {
  const sr = 44100
  const win = Math.round(sr * ENVELOPE_WINDOW_SEC)
  const samples = new Float32Array(win * 4)
  for (let i = 0; i < samples.length; i++) {
    const amp = [0, 0.1, 0.4, 0.1][Math.floor(i / win)]
    samples[i] = amp * Math.sin(i / 5)
  }
  const env = buildEnvelope(samples, sr)
  assert.equal(env.length, 4)
  assert.equal(env[0], 0)
  assert.ok(Math.abs(env[2] - 1) < 1e-6, 'the loudest window is 1')
  assert.ok(env[1] > 0 && env[1] < env[2] && Math.abs(env[3] - env[1]) < 0.03, 'quieter windows sit below it')
  assert.ok(env.every((v) => v >= 0 && v <= 1))
})

test('envelope: lookups by playback time, out-of-range is silence, silent audio stays silent', () => {
  const env = Float32Array.from([0.1, 0.5, 0.9])
  assert.equal(envelopeAt(env, 0), Math.fround(0.1))
  assert.equal(envelopeAt(env, ENVELOPE_WINDOW_SEC * 1.5), 0.5)
  assert.equal(envelopeAt(env, 10), 0)
  assert.equal(envelopeAt(env, -1), 0)
  assert.ok(buildEnvelope(new Float32Array(1000), 44100).every((v) => v === 0))
  assert.equal(buildEnvelope(new Float32Array(0), 44100).length, 0)
})

// -------------------------------------------------------------------- Markdown

const kinds = (blocks) => blocks.map((b) => b.t)

test('markdown: headings, paragraphs, lists, quotes, rules and code blocks', () => {
  const md = '# Title\n\nSome **bold** and *italic* text.\n\n- one\n- two\n  - nested\n\n1. first\n2. second\n\n> quoted\n\n---\n\n```js\nconst x = 1\n```'
  const blocks = parseMarkdown(md)
  assert.deepEqual(kinds(blocks), ['h', 'p', 'ul', 'ol', 'quote', 'hr', 'code'])
  assert.equal(blocks[0].level, 1)
  assert.deepEqual(blocks[2].items.map((i) => i.depth), [0, 0, 1])
  assert.equal(blocks[3].start, 1)
  assert.equal(blocks[6].lang, 'js')
  assert.equal(blocks[6].v, 'const x = 1')
  const strong = blocks[1].c.find((n) => n.t === 'strong')
  assert.deepEqual(strong.c, [{ t: 'text', v: 'bold' }])
  assert.ok(blocks[1].c.some((n) => n.t === 'em'))
})

test('markdown: tables keep their header, rows and column count (missing cells are padded)', () => {
  const blocks = parseMarkdown('| Item | Detail |\n|------|--------|\n| Band | Rs 1,700 |\n| Listing |\n\nAfter.')
  assert.deepEqual(kinds(blocks), ['table', 'p'])
  assert.equal(blocks[0].head.length, 2)
  assert.equal(blocks[0].rows.length, 2)
  assert.ok(blocks[0].rows.every((r) => r.length === 2))
})

test('markdown: inline code, strikethrough, links and bare URLs; underscores inside words are left alone', () => {
  const inline = parseInline('Use `GMP` and ~~old~~ [Mint](https://example.com/a) or https://example.com/raw. snake_case_name stays')
  assert.ok(inline.some((n) => n.t === 'code' && n.v === 'GMP'))
  assert.ok(inline.some((n) => n.t === 'del'))
  const links = inline.filter((n) => n.t === 'link')
  assert.deepEqual(links.map((l) => l.href), ['https://example.com/a', 'https://example.com/raw'])
  assert.ok(!inline.some((n) => n.t === 'em'), 'snake_case_name is not italics')
  assert.ok(inline.some((n) => n.t === 'text' && n.v.includes('snake_case_name')))
})

test('markdown: SAFE — unsafe link targets are dropped, HTML stays inert text, and bare * / _ are literal', () => {
  assert.equal(isSafeUrl('https://a.com'), true)
  assert.equal(isSafeUrl('javascript:alert(1)'), false)
  assert.equal(isSafeUrl('data:text/html,<script>'), false)
  const bad = parseInline('[click](javascript:alert(1)) and [x](data:text/html,hi)')
  assert.ok(!bad.some((n) => n.t === 'link'), 'no link nodes for unsafe URLs')
  assert.ok(JSON.stringify(bad).includes('click'), 'the visible words survive')
  const html = parseMarkdown('<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>')
  assert.deepEqual(kinds(html), ['p', 'p'])
  assert.ok(html.every((b) => b.c.every((n) => n.t === 'text')), 'markup is plain text nodes, never elements')
  assert.deepEqual(parseInline('2 * 3 = 6 and a_b'), [{ t: 'text', v: '2 * 3 = 6 and a_b' }])
})

test('markdown: single newlines inside a paragraph become line breaks (chat style)', () => {
  const [p] = parseMarkdown('line one\nline two')
  assert.deepEqual(p.c.map((n) => n.t), ['text', 'br', 'text'])
})

test('markdown: never hangs or throws on hostile or random input (fuzz)', () => {
  const pieces = ['**', '*', '_', '__', '`', '```', '~~~', '|', '---', '# ', '- ', '1. ', '> ', '[', '](', ')', '\n', '\n\n', ' ', 'a', '<b>', 'https://x.io', '\t', '|--|']
  let seed = 12345
  const rand = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32)
  for (let n = 0; n < 400; n++) {
    let s = ''
    const len = 1 + Math.floor(rand() * 60)
    for (let i = 0; i < len; i++) s += pieces[Math.floor(rand() * pieces.length)]
    const started = performance.now()
    const blocks = parseMarkdown(s)
    assert.ok(Array.isArray(blocks))
    assert.ok(performance.now() - started < 200, `slow parse for ${JSON.stringify(s)}`)
  }
  const big = 'word '.repeat(20000)
  const t0 = performance.now()
  parseMarkdown(big)
  assert.ok(performance.now() - t0 < 1500, 'a very long reply parses quickly')
})

test('markdown: an unterminated code fence takes the rest of the message, empty input gives no blocks', () => {
  assert.deepEqual(parseMarkdown(''), [])
  assert.deepEqual(parseMarkdown('   \n\n '), [])
  const [code] = parseMarkdown('```\nstill open\nmore')
  assert.equal(code.t, 'code')
  assert.equal(code.v, 'still open\nmore')
})

// ---------------------------------------------------------------------- Format

test('format: relative times', () => {
  const now = Date.parse('2026-09-22T12:00:00Z')
  assert.equal(formatRelative('2026-09-22T11:59:40Z', now), 'just now')
  assert.equal(formatRelative('2026-09-22T11:30:00Z', now), '30m ago')
  assert.equal(formatRelative('2026-09-22T09:00:00Z', now), '3h ago')
  assert.equal(formatRelative('2026-09-20T12:00:00Z', now), '2d ago')
  assert.match(formatRelative('2026-08-01T12:00:00Z', now), /\d/)
  assert.equal(formatRelative('not a date', now), '')
  assert.equal(formatRelative('2026-09-22T12:05:00Z', now), 'just now', 'a slightly-future timestamp is not negative')
})

test('format: clock shows 24-hour time and an upper-case date', () => {
  const c = formatClock(Date.parse('2026-09-22T13:05:00Z'))
  assert.match(c.time, /^\d{2}:\d{2}$/)
  assert.equal(c.date, c.date.toUpperCase())
})

test('format: new memory entries are found by id, and the latest entry date is picked', () => {
  const prev = [{ id: 'a' }, { id: 'b' }]
  const next = [{ id: 'a', content: 'x' }, { id: 'c', content: 'new' }, { id: 'b', content: 'y' }]
  assert.deepEqual(newEntries(prev, next).map((e) => e.id), ['c'])
  assert.deepEqual(newEntries([], next).length, 3)
  assert.deepEqual(newEntries(next, next), [])
  assert.equal(latestCreatedAt([{ createdAt: '2026-01-01T00:00:00Z' }, { createdAt: '2026-03-01T00:00:00Z' }]), '2026-03-01T00:00:00Z')
  assert.equal(latestCreatedAt([]), null)
})

// ----------------------------------------------------------------- UI sound spec

test('sound spec: the vocabulary covers every required cue', () => {
  const required = ['click', 'panelOpen', 'panelClose', 'modeSwitch', 'thinkStart', 'responseReady', 'voiceStart', 'voiceStop', 'memorySaved', 'memoryDeleted', 'approve', 'reject', 'error', 'notify']
  assert.deepEqual([...SOUND_NAMES].sort(), [...required].sort())
})

test('sound spec: every sound is short, quiet, mid-range, and made of soft waveforms only', () => {
  for (const name of SOUND_NAMES) {
    assert.ok(soundDuration(name) <= 0.3, `${name} lasts ${soundDuration(name)}s`)
    assert.ok(soundDuration(name) >= 0.025, `${name} is too short to hear`)
    for (const t of SOUNDS[name]) {
      assert.ok(t.freq >= 140 && t.freq <= 2000, `${name}: ${t.freq} Hz`)
      if (t.endFreq) assert.ok(t.endFreq >= 140 && t.endFreq <= 2000, `${name}: glide to ${t.endFreq} Hz`)
      assert.ok(['sine', 'triangle'].includes(t.type), `${name}: ${t.type}`)
      assert.ok(t.gain > 0 && t.gain <= 0.5, `${name}: gain ${t.gain}`)
      assert.ok(t.dur > 0 && t.at >= 0)
    }
    const simultaneous = SOUNDS[name].filter((a) => SOUNDS[name].some((b) => b !== a && b.at < a.at + a.dur && a.at < b.at + b.dur)).length
    assert.ok(simultaneous <= 2, `${name}: at most two overlapping tones`)
  }
})

test('sound spec: direction carries meaning — opening/starting rise, closing/stopping fall, errors are low', () => {
  const end = (n) => SOUNDS[n][0].endFreq ?? SOUNDS[n][0].freq
  assert.ok(end('panelOpen') > SOUNDS.panelOpen[0].freq)
  assert.ok(end('panelClose') < SOUNDS.panelClose[0].freq)
  assert.ok(end('voiceStart') > SOUNDS.voiceStart[0].freq)
  assert.ok(end('voiceStop') < SOUNDS.voiceStop[0].freq)
  assert.ok(end('memoryDeleted') < SOUNDS.memoryDeleted[0].freq)
  assert.ok(SOUNDS.error.every((t) => t.freq <= 200), 'error tones are low and muted')
  assert.ok(SOUNDS.error.every((t) => t.lowpass && t.lowpass <= 1000), 'and filtered soft')
  const memory = SOUNDS.memorySaved.map((t) => t.freq)
  assert.deepEqual(memory, [...memory].sort((a, b) => a - b), 'memory saved climbs')
})

test('sound spec: volume maps to a bounded, monotonic, quiet-at-the-bottom gain', () => {
  assert.equal(volumeToGain(0), 0)
  assert.equal(volumeToGain(1), MASTER_MAX)
  assert.equal(volumeToGain(-5), 0)
  assert.equal(volumeToGain(9), MASTER_MAX)
  let prev = -1
  for (let v = 0; v <= 1.0001; v += 0.05) {
    const g = volumeToGain(v)
    assert.ok(g >= prev)
    assert.ok(g <= MASTER_MAX)
    prev = g
  }
  assert.ok(volumeToGain(0.5) < MASTER_MAX / 2, 'the curve is gentle at low settings')
  assert.ok(MASTER_MAX <= 0.5 && DEFAULT_VOLUME > 0 && DEFAULT_VOLUME < 1)
})

test('sound spec: default on/off honours reduced-motion, and an explicit choice always wins', () => {
  assert.equal(defaultSoundEnabled(false, null), true)
  assert.equal(defaultSoundEnabled(true, null), false, 'off by default when the system asks for reduced motion')
  assert.equal(defaultSoundEnabled(true, 'true'), true)
  assert.equal(defaultSoundEnabled(false, 'false'), false)
  assert.equal(defaultSoundEnabled(false, 'garbage'), true)
})

test('sound policy: silent when disabled; silent while the mic is open (except voice cues); quiet while Jarvis speaks', () => {
  for (const name of SOUND_NAMES) {
    assert.equal(shouldPlay(name, { enabled: false, coreState: 'idle' }), false)
    assert.equal(shouldPlay(name, { enabled: true, coreState: 'idle' }), true)
    assert.equal(shouldPlay(name, { enabled: true, coreState: 'thinking' }), true)
    const whileListening = shouldPlay(name, { enabled: true, coreState: 'listening' })
    assert.equal(whileListening, name === 'voiceStart' || name === 'voiceStop', `listening: ${name}`)
    const whileSpeaking = shouldPlay(name, { enabled: true, coreState: 'speaking' })
    assert.equal(whileSpeaking, ['error', 'voiceStart', 'voiceStop'].includes(name), `speaking: ${name}`)
  }
})

test('sound policy: core transitions map to exactly the intended cues, and never double-fire', () => {
  const s = (state, detail = '') => ({ state, detail })
  assert.equal(soundForTransition(s('idle'), s('thinking', 'PROCESSING')), 'thinkStart')
  assert.equal(soundForTransition(s('thinking', 'PROCESSING'), s('idle')), 'responseReady')
  assert.equal(soundForTransition(s('thinking', 'PROCESSING'), s('thinking', 'PREPARING VOICE')), 'responseReady')
  assert.equal(soundForTransition(s('thinking', 'PROCESSING'), s('error')), 'error', 'a failed reply is an error, not "response ready"')
  assert.equal(soundForTransition(s('idle'), s('thinking', 'PREPARING VOICE')), null, 'preparing a spoken reply is silent')
  assert.equal(soundForTransition(s('thinking', 'PREPARING VOICE'), s('speaking')), null)
  assert.equal(soundForTransition(s('speaking'), s('idle')), null)
  assert.equal(soundForTransition(s('idle'), s('listening')), 'voiceStart')
  assert.equal(soundForTransition(s('listening'), s('idle')), 'voiceStop')
  assert.equal(soundForTransition(s('listening'), s('thinking', 'PROCESSING')), 'voiceStop', 'the voice cue wins when speech ends and processing begins')
  assert.equal(soundForTransition(s('idle'), s('error')), 'error')
  assert.equal(soundForTransition(s('error'), s('error')), null)
  assert.equal(soundForTransition(s('idle'), s('attention')), null)
  assert.equal(soundForTransition(s('idle'), s('idle')), null)
})

// A recording stand-in for an AudioContext: proves the scheduler builds a valid,
// self-terminating envelope for every tone, without needing audio hardware.
function fakeContext() {
  const log = { oscillators: [], gains: [], filters: [] }
  const param = (name, sink) => {
    const p = { value: 0, calls: [] }
    for (const fn of ['setValueAtTime', 'linearRampToValueAtTime', 'exponentialRampToValueAtTime']) p[fn] = (v, t) => (p.calls.push([fn, v, t]), p)
    sink.params ??= {}
    sink.params[name] = p
    return p
  }
  const node = () => ({ connect() {}, disconnect() {} })
  return {
    log,
    createOscillator() {
      const o = { ...node(), type: '', started: null, stopped: null, start(t) { o.started = t }, stop(t) { o.stopped = t } }
      o.frequency = param('frequency', o)
      log.oscillators.push(o)
      return o
    },
    createGain() {
      const g = node()
      g.gain = param('gain', g)
      log.gains.push(g)
      return g
    },
    createBiquadFilter() {
      const f = { ...node(), type: '', frequency: { value: 0 } }
      log.filters.push(f)
      return f
    },
  }
}

test('sound engine: scheduling builds one oscillator + envelope per tone, ending in silence, with filters only where specified', () => {
  for (const name of SOUND_NAMES) {
    const ctx = fakeContext()
    scheduleSound(ctx, { connect() {} }, SOUNDS[name], 2)
    const tones = SOUNDS[name]
    assert.equal(ctx.log.oscillators.length, tones.length, name)
    assert.equal(ctx.log.gains.length, tones.length, name)
    assert.equal(ctx.log.filters.length, tones.filter((t) => t.lowpass).length, name)
    tones.forEach((tone, i) => {
      const osc = ctx.log.oscillators[i]
      assert.equal(osc.started, 2 + tone.at)
      assert.ok(osc.stopped > osc.started + tone.dur, 'stops after the tone ends')
      const env = ctx.log.gains[i].params.gain.calls
      assert.equal(env[0][0], 'setValueAtTime')
      assert.ok(env[0][1] < 0.001, 'starts silent (no click)')
      assert.equal(env.at(-1)[0], 'exponentialRampToValueAtTime')
      assert.ok(env.at(-1)[1] < 0.001, 'ends silent')
      assert.ok(Math.max(...env.map((c) => c[1])) <= tone.gain + 1e-9)
      if (tone.endFreq) assert.ok(osc.params.frequency.calls.some((c) => c[0] === 'exponentialRampToValueAtTime' && c[1] === tone.endFreq))
    })
  }
})
