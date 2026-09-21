// Server voice (Unreal Speech "Will"): configuration, text cleaning, spend
// guard, the provider contract, and the route's success / failure behaviour.
// No network and no real API key anywhere — the provider is stubbed with a
// fake fetch, and the route is mounted in a tiny Express app with a fake
// logged-in user. No database needed.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import express from 'express'
import { fileURLToPath } from 'node:url'
import { cleanForSpeech, limitForSpeech } from '../jarvis/tts/speechText.js'
import { createSpeechGuard, readSpeechLimits } from '../jarvis/tts/speechGuard.js'
import { synthesize, isUnrealConfigured, resolveVoice, looksLikeMp3, ttsProvider } from '../jarvis/tts/unrealSpeech.js'
import { createSpeechRouter } from '../routes/jarvisSpeech.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const FAKE_KEY = 'unit-test-key-not-real-123'
const MP3 = Buffer.concat([Buffer.from('ID3'), Buffer.alloc(64, 1)])

// ---------------------------------------------------------------- configuration

test('config: server voice needs provider "unreal" (the default) AND a key', () => {
  assert.equal(ttsProvider({}), 'unreal')
  assert.equal(isUnrealConfigured({}), false, 'no key -> not configured')
  assert.equal(isUnrealConfigured({ UNREAL_SPEECH_API_KEY: '   ' }), false, 'blank key -> not configured')
  assert.equal(isUnrealConfigured({ UNREAL_SPEECH_API_KEY: FAKE_KEY }), true)
  assert.equal(isUnrealConfigured({ TTS_PROVIDER: 'unreal', UNREAL_SPEECH_API_KEY: FAKE_KEY }), true)
  assert.equal(isUnrealConfigured({ TTS_PROVIDER: 'browser', UNREAL_SPEECH_API_KEY: FAKE_KEY }), false, 'switched off')
})

test('config: voice defaults to Will, is case-insensitive, and unknown voices fall back to Will', () => {
  assert.equal(resolveVoice({}), 'Will')
  assert.equal(resolveVoice({ UNREAL_SPEECH_VOICE: 'will' }), 'Will')
  assert.equal(resolveVoice({ UNREAL_SPEECH_VOICE: 'Amy' }), 'Amy')
  assert.equal(resolveVoice({ UNREAL_SPEECH_VOICE: 'not-a-voice' }), 'Will')
})

test('config: limits have conservative defaults, honour env, and never exceed Unreal\'s 1000-char /stream cap', () => {
  const d = readSpeechLimits({})
  assert.deepEqual(d, { maxCharsPerRequest: 600, dailyChars: 12000, monthlyChars: 200000, requestsPerMinute: 15 })
  assert.ok(d.monthlyChars < 250_000, 'monthly default sits below the 250K free allowance')
  assert.equal(readSpeechLimits({ TTS_MAX_CHARS_PER_REQUEST: '5000' }).maxCharsPerRequest, 1000)
  assert.equal(readSpeechLimits({ TTS_MONTHLY_CHAR_LIMIT: '50000' }).monthlyChars, 50000)
  assert.equal(readSpeechLimits({ TTS_DAILY_CHAR_LIMIT: 'junk' }).dailyChars, 12000)
})

// --------------------------------------------------------------- text cleaning

test('cleaning: Markdown, tables, links, code and emoji are removed; text stays readable', () => {
  const md = [
    '## Quick snapshot 📈',
    '',
    '**NSE IPO** is *open* until 21 Sep.',
    '',
    '| Item | Detail |',
    '|------|--------|',
    '| Band | Rs 1,700–1,785 |',
    '',
    '- first point',
    '- second point',
    '1. numbered',
    '',
    'See [the Mint story](https://example.com/x) or https://example.com/raw.',
    '```js',
    'const secret = 1',
    '```',
    'Use `GMP` carefully. 🙂',
  ].join('\n')
  const out = cleanForSpeech(md)
  for (const bad of ['**', '##', '|', '](', 'http', '```', '`', '📈', '🙂', 'const secret', '---']) {
    assert.ok(!out.includes(bad), `should not contain ${JSON.stringify(bad)}: ${out}`)
  }
  for (const good of ['NSE IPO is open until 21 Sep', 'Item, Detail', 'Band, Rs 1,700–1,785', 'first point', 'second point', 'the Mint story', 'GMP']) {
    assert.ok(out.includes(good), `should contain ${JSON.stringify(good)}: ${out}`)
  }
  assert.doesNotMatch(out, /\s{2,}/)
})

test('cleaning: plain sentences pass through; empty/garbage becomes empty', () => {
  assert.equal(cleanForSpeech('Good morning. How can I help?'), 'Good morning. How can I help?')
  assert.equal(cleanForSpeech('  \n\n '), '')
  assert.equal(cleanForSpeech(null), '')
  assert.equal(cleanForSpeech('🙂🙂'), '')
  assert.equal(cleanForSpeech('---'), '')
})

test('cleaning: list items get sentence breaks so speech pauses naturally', () => {
  assert.equal(cleanForSpeech('- one\n- two\n- three'), 'one. two. three.')
})

test('limit: short text untouched; long text is cut at a sentence boundary (never mid-word), flagged truncated', () => {
  assert.deepEqual(limitForSpeech('Short.', 600), { text: 'Short.', truncated: false })
  const long = `${'This is a sentence. '.repeat(50)}`.trim()
  const r = limitForSpeech(long, 100)
  assert.equal(r.truncated, true)
  assert.ok(r.text.length <= 100)
  assert.match(r.text, /sentence\.$/)
  const noPunct = limitForSpeech('word '.repeat(100), 50)
  assert.ok(noPunct.text.length <= 51)
  assert.match(noPunct.text, /word\.$/)
})

// ------------------------------------------------------------------- the guard

test('guard: per-minute request limit is per user and expires after a minute', () => {
  let t = new Date('2026-09-21T10:00:00Z')
  const guard = createSpeechGuard({ limits: { ...readSpeechLimits({}), requestsPerMinute: 2 }, now: () => t })
  assert.equal(guard.reserve('a', 10).ok, true)
  assert.equal(guard.reserve('a', 10).ok, true)
  assert.deepEqual(guard.reserve('a', 10), { ok: false, reason: 'rate' })
  assert.equal(guard.reserve('b', 10).ok, true, 'another user is unaffected')
  t = new Date('2026-09-21T10:01:01Z')
  assert.equal(guard.reserve('a', 10).ok, true)
})

test('guard: daily and monthly character limits stop further requests and reset on the next day / month', () => {
  let t = new Date('2026-09-21T10:00:00Z')
  const limits = { maxCharsPerRequest: 600, dailyChars: 100, monthlyChars: 150, requestsPerMinute: 999 }
  const guard = createSpeechGuard({ limits, now: () => t })
  assert.equal(guard.reserve('a', 60).ok, true)
  assert.deepEqual(guard.reserve('a', 60), { ok: false, reason: 'daily' })
  assert.equal(guard.reserve('b', 40).ok, true)
  t = new Date('2026-09-22T10:00:00Z') // next day: daily resets, monthly (100 used of 150) does not
  assert.equal(guard.reserve('a', 50).ok, true)
  assert.deepEqual(guard.reserve('a', 1), { ok: false, reason: 'monthly' })
  t = new Date('2026-10-01T00:00:01Z') // next month: both reset
  assert.equal(guard.reserve('a', 100).ok, true)
  assert.deepEqual(guard.snapshot(), { month: '2026-10', monthChars: 100, day: '2026-10-01', dayChars: 100 })
})

test('guard: counters persist across restarts, and the store holds counts and dates only', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tts-guard-')), 'usage.json')
  const now = () => new Date('2026-09-21T10:00:00Z')
  const limits = { maxCharsPerRequest: 600, dailyChars: 1000, monthlyChars: 1000, requestsPerMinute: 999 }
  createSpeechGuard({ limits, storePath: file, now }).reserve('a', 900)
  const restarted = createSpeechGuard({ limits, storePath: file, now })
  assert.equal(restarted.snapshot().monthChars, 900)
  assert.deepEqual(restarted.reserve('a', 200), { ok: false, reason: 'daily' })
  assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(file, 'utf8'))).sort(), ['day', 'dayChars', 'month', 'monthChars'])
  fs.rmSync(path.dirname(file), { recursive: true, force: true })
})

test('guard: an unwritable store never breaks it (in-memory limits still apply)', () => {
  const guard = createSpeechGuard({ storePath: path.join(os.tmpdir(), 'no-such-dir-xyz', 'usage.json') })
  assert.equal(guard.reserve('a', 10).ok, true)
})

test('guard: the circuit breaker blocks everyone until it expires', () => {
  let t = new Date('2026-09-21T10:00:00Z')
  const guard = createSpeechGuard({ now: () => t })
  guard.tripBreaker(60_000)
  assert.deepEqual(guard.reserve('a', 10), { ok: false, reason: 'cooldown' })
  t = new Date('2026-09-21T10:01:01Z')
  assert.equal(guard.reserve('a', 10).ok, true)
})

// ---------------------------------------------------- the provider (fake fetch)

const okResponse = (bytes = MP3) => ({ ok: true, status: 200, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length) })

test('provider: calls the /stream endpoint with Bearer auth, VoiceId Will, and the documented body', async () => {
  let call
  const result = await synthesize('Hello there.', {
    env: { UNREAL_SPEECH_API_KEY: FAKE_KEY },
    fetchImpl: async (url, opts) => {
      call = { url, opts, body: JSON.parse(opts.body) }
      return okResponse()
    },
  })
  assert.equal(result.ok, true)
  assert.ok(Buffer.isBuffer(result.audio) && result.audio.length === MP3.length)
  assert.equal(call.url, 'https://api.v7.unrealspeech.com/stream')
  assert.equal(call.opts.method, 'POST')
  assert.equal(call.opts.headers.Authorization, `Bearer ${FAKE_KEY}`)
  assert.equal(call.body.Text, 'Hello there.')
  assert.equal(call.body.VoiceId, 'Will')
  assert.equal(call.body.Codec, 'libmp3lame')
  // Variant B — the chosen production voice. Changing any of these changes the voice.
  assert.equal(call.body.Bitrate, '320k')
  assert.equal(call.body.Temperature, 0.25)
  assert.equal(call.body.Speed, '-0.1')
  assert.equal(call.body.Pitch, '0.95')
  assert.ok(call.opts.signal, 'has a timeout signal')
})

test('provider: voice/speed/pitch/base URL come from env, and out-of-range delivery values are clamped', async () => {
  let call
  await synthesize('Hi.', {
    env: { UNREAL_SPEECH_API_KEY: FAKE_KEY, UNREAL_SPEECH_VOICE: 'Dan', UNREAL_SPEECH_SPEED: '5', UNREAL_SPEECH_PITCH: '0.1', UNREAL_SPEECH_BASE_URL: 'https://example.test' },
    fetchImpl: async (url, opts) => {
      call = { url, body: JSON.parse(opts.body) }
      return okResponse()
    },
  })
  assert.equal(call.url, 'https://example.test/stream')
  assert.equal(call.body.VoiceId, 'Dan')
  assert.equal(call.body.Speed, '1')
  assert.equal(call.body.Pitch, '0.5')
})

test('provider: failures are classified, never throw, and never carry the provider\'s response body', async () => {
  const env = { UNREAL_SPEECH_API_KEY: FAKE_KEY }
  const run = (fetchImpl) => synthesize('Hi.', { env, fetchImpl })
  assert.deepEqual(await synthesize('Hi.', { env: {}, fetchImpl: async () => assert.fail('must not call') }), { ok: false, status: 503, code: 'unconfigured' })
  assert.equal((await run(async () => ({ ok: false, status: 401 }))).code, 'auth')
  assert.equal((await run(async () => ({ ok: false, status: 403 }))).code, 'auth')
  assert.equal((await run(async () => ({ ok: false, status: 429 }))).code, 'quota')
  assert.equal((await run(async () => ({ ok: false, status: 402 }))).code, 'quota')
  assert.equal((await run(async () => ({ ok: false, status: 500, text: async () => `SECRET ${FAKE_KEY}` }))).code, 'upstream')
  assert.equal((await run(async () => { throw new Error(`boom ${FAKE_KEY}`) })).code, 'network')
  const json = Buffer.from('{"error":"quota exceeded"}')
  const notAudio = await run(async () => okResponse(json))
  assert.equal(notAudio.code, 'invalid_audio', '200 with a JSON body is not played as audio')
  assert.ok(!JSON.stringify(notAudio).includes('quota exceeded'))
})

test('provider: MP3 detection accepts ID3 tags and MPEG frame sync, rejects everything else', () => {
  assert.equal(looksLikeMp3(Buffer.from([0x49, 0x44, 0x33, 4, 0])), true)
  assert.equal(looksLikeMp3(Buffer.from([0xff, 0xfb, 0x90, 0x00])), true)
  assert.equal(looksLikeMp3(Buffer.from('{"error"')), false)
  assert.equal(looksLikeMp3(Buffer.from([0xff])), false)
})

// ------------------------------------------------------------------ the route

async function withApp({ speak, isConfigured = () => true, limits, guard }, fn) {
  const router = createSpeechRouter({
    speak,
    isConfigured,
    limits: { ...readSpeechLimits({}), ...limits },
    guard: guard ?? createSpeechGuard({ limits: { ...readSpeechLimits({}), requestsPerMinute: 999, ...limits } }),
  })
  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => {
    req.user = { id: 'user-1', role: 'admin' }
    next()
  })
  app.use('/api/jarvis/speech', router)
  const server = await new Promise((r) => {
    const s = app.listen(0, () => r(s))
  })
  const post = (body) =>
    fetch(`http://127.0.0.1:${server.address().port}/api/jarvis/speech`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  try {
    await fn(post)
  } finally {
    await new Promise((r) => server.close(r))
  }
}

test('route success: returns audio/mpeg bytes, never cached, sends only CLEANED and LIMITED text to the provider', async () => {
  const sent = []
  await withApp(
    { speak: async (text) => (sent.push(text), { ok: true, audio: MP3 }), limits: { maxCharsPerRequest: 60 } },
    async (post) => {
      const res = await post({ text: '## Heading 📈\n\n**Bold** point. ' + 'Another sentence here. '.repeat(20) })
      assert.equal(res.status, 200)
      assert.equal(res.headers.get('content-type'), 'audio/mpeg')
      assert.equal(res.headers.get('cache-control'), 'no-store')
      assert.equal(res.headers.get('x-speech-truncated'), '1')
      assert.deepEqual(Buffer.from(await res.arrayBuffer()), MP3)
    },
  )
  assert.equal(sent.length, 1)
  assert.ok(sent[0].length <= 60)
  assert.ok(!/[#*📈]/u.test(sent[0]), `cleaned: ${sent[0]}`)
  assert.match(sent[0], /^Heading\. Bold point\./)
})

test('route: not configured -> 503 tts_unconfigured, provider never called (browser voice takes over)', async () => {
  let calls = 0
  await withApp({ isConfigured: () => false, speak: async () => (calls++, { ok: true, audio: MP3 }) }, async (post) => {
    const res = await post({ text: 'Hello.' })
    assert.equal(res.status, 503)
    assert.equal((await res.json()).code, 'tts_unconfigured')
  })
  assert.equal(calls, 0, 'provider must not be called')
})

test('route validation: missing / non-string / empty-after-cleaning text -> 400, provider never called', async () => {
  let calls = 0
  await withApp({ speak: async () => (calls++, { ok: true, audio: MP3 }) }, async (post) => {
    assert.equal((await post({})).status, 400)
    assert.equal((await post({ text: 42 })).status, 400)
    assert.equal((await post({ text: '🙂 ---' })).status, 400)
  })
  assert.equal(calls, 0, 'provider must not be called')
})

test('route failure: provider error -> 502 tts_unavailable with no provider detail or key in the response', async () => {
  const warnings = []
  const origWarn = console.warn
  console.warn = (...a) => warnings.push(a.join(' '))
  try {
    await withApp({ speak: async () => ({ ok: false, status: 500, code: 'upstream' }) }, async (post) => {
      const res = await post({ text: 'Hello.' })
      assert.equal(res.status, 502)
      const text = await res.text()
      assert.equal(JSON.parse(text).code, 'tts_unavailable')
      assert.ok(!text.includes(FAKE_KEY) && !/upstream/.test(text))
    })
  } finally {
    console.warn = origWarn
  }
  assert.ok(warnings.every((w) => !w.includes('Hello')), 'reply text is never logged')
})

test('route failure: quota/auth trouble trips the breaker, so later requests stop calling the provider', async () => {
  let calls = 0
  const origWarn = console.warn
  console.warn = () => {}
  try {
    await withApp({ speak: async () => (calls++, { ok: false, status: 429, code: 'quota' }) }, async (post) => {
      assert.equal((await post({ text: 'One.' })).status, 502)
      const second = await post({ text: 'Two.' })
      assert.equal(second.status, 503)
      assert.equal((await second.json()).code, 'tts_cooldown')
    })
  } finally {
    console.warn = origWarn
  }
  assert.equal(calls, 1, 'provider called once, then blocked')
})

test('route guard: limits return 429 tts_limit and the provider is not called', async () => {
  let calls = 0
  await withApp(
    { speak: async () => (calls++, { ok: true, audio: MP3 }), limits: { dailyChars: 20 } },
    async (post) => {
      assert.equal((await post({ text: 'Twelve chars' })).status, 200)
      const res = await post({ text: 'Another twelve.' })
      assert.equal(res.status, 429)
      assert.equal((await res.json()).code, 'tts_limit')
    },
  )
  assert.equal(calls, 1)
})

test('route end-to-end with the real provider client: request reaches "Unreal" with the key, and the key is absent from the response', async () => {
  const realFetch = globalThis.fetch
  let upstream
  globalThis.fetch = async (url, opts) => {
    if (String(url).startsWith('https://api.v7.unrealspeech.com')) {
      upstream = { url: String(url), auth: opts.headers.Authorization, body: JSON.parse(opts.body) }
      return okResponse()
    }
    return realFetch(url, opts)
  }
  const saved = { k: process.env.UNREAL_SPEECH_API_KEY, p: process.env.TTS_PROVIDER }
  process.env.UNREAL_SPEECH_API_KEY = FAKE_KEY
  delete process.env.TTS_PROVIDER
  let server
  try {
    const router = createSpeechRouter({ guard: createSpeechGuard({ limits: { ...readSpeechLimits({}), requestsPerMinute: 999 } }) })
    const app = express()
    app.use(express.json())
    app.use((req, _res, next) => ((req.user = { id: 'u' }), next()))
    app.use('/speech', router)
    server = await new Promise((r) => {
      const s = app.listen(0, () => r(s))
    })
    const res = await realFetch(`http://127.0.0.1:${server.address().port}/speech`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: '**Hello**, sir.' }),
    })
    const headers = JSON.stringify([...res.headers.entries()])
    assert.equal(res.status, 200)
    assert.ok(!headers.includes(FAKE_KEY))
    assert.equal(upstream.url, 'https://api.v7.unrealspeech.com/stream')
    assert.equal(upstream.auth, `Bearer ${FAKE_KEY}`)
    assert.equal(upstream.body.VoiceId, 'Will')
    assert.equal(upstream.body.Text, 'Hello, sir.')
  } finally {
    if (server) await new Promise((r) => server.close(r))
    globalThis.fetch = realFetch
    for (const [k, v] of [['UNREAL_SPEECH_API_KEY', saved.k], ['TTS_PROVIDER', saved.p]]) v === undefined ? delete process.env[k] : (process.env[k] = v)
  }
})

// ---------------------------------------------------------------- wiring / safety

test('wiring: the speech route is mounted AFTER requireAuth, so only logged-in users can spend the allowance', () => {
  const server = fs.readFileSync(path.join(HERE, '..', 'server.js'), 'utf8')
  assert.ok(server.indexOf('app.use(requireAuth)') > 0)
  assert.ok(server.indexOf("app.use('/api/jarvis/speech'") > server.indexOf('app.use(requireAuth)'))
})

test('secrecy: the key and provider host appear nowhere in the frontend source, and the frontend has no key env var', () => {
  const src = path.join(HERE, '..', '..', 'src')
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]))
  for (const f of walk(src).filter((f) => /\.(ts|tsx|css)$/.test(f))) {
    const text = fs.readFileSync(f, 'utf8')
    assert.ok(!/UNREAL_SPEECH|unrealspeech|VITE_.*(TTS|SPEECH)/i.test(text), `${f} must not reference the provider or its key`)
  }
})

test('no audio is stored: the speech modules never write files except the counter store', () => {
  const dir = path.join(HERE, '..', 'jarvis', 'tts')
  for (const f of ['unrealSpeech.js', 'speechText.js']) {
    assert.doesNotMatch(fs.readFileSync(path.join(dir, f), 'utf8'), /writeFile|createWriteStream|appendFile/)
  }
  const route = fs.readFileSync(path.join(HERE, '..', 'routes', 'jarvisSpeech.js'), 'utf8')
  assert.doesNotMatch(route, /writeFile|createWriteStream|appendFile/)
  const guard = fs.readFileSync(path.join(dir, 'speechGuard.js'), 'utf8')
  assert.equal((guard.match(/writeFileSync/g) ?? []).length, 1, 'the guard\'s counter file is the only write')
})

test('cleaning: punctuation-only leftovers are treated as empty (nothing to say, nothing to pay for)', () => {
  for (const junk of ['...', '* * *', '| | |', '-- ; --', '!!!', '🙂 ---']) assert.equal(cleanForSpeech(junk), '', junk)
})

// Regression: the server voice plays from a blob: URL, and Helmet's default CSP has no
// media-src, so media fell back to default-src 'self' and the browser blocked it (the
// voice silently reverted to the browser's). Needs the API server on :4000, like the other HTTP suites.
test('CSP: media-src allows blob: (so the Unreal MP3 can play) while the other default directives are untouched', async () => {
  const res = await fetch('http://localhost:4000/api/health')
  const csp = res.headers.get('content-security-policy') ?? ''
  const directives = Object.fromEntries(csp.split(';').filter(Boolean).map((d) => d.trim().split(/\s+/)).map(([name, ...v]) => [name, v.join(' ')]))
  assert.equal(directives['media-src'], "'self' blob:")
  assert.equal(directives['default-src'], "'self'")
  assert.equal(directives['script-src'], "'self'")
  assert.equal(directives['script-src-attr'], "'none'")
  assert.equal(directives['object-src'], "'none'")
  assert.equal(directives['frame-ancestors'], "'self'")
  assert.equal(directives['img-src'], "'self' data:")
  assert.equal(directives['style-src'], "'self' https: 'unsafe-inline'")
  assert.ok('upgrade-insecure-requests' in directives)
  assert.ok(!/\*/.test(csp), 'no wildcard sources were introduced')
})
