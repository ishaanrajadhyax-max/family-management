// Keeps spoken replies inside Unreal Speech's FREE allowance. Unreal's
// pricing page lists 250K characters/month on the free plan but doesn't say
// what happens at the limit, so this treats the allowance as a hard wall and
// stops well short of it. Everything is configurable by env var:
//
//   TTS_MAX_CHARS_PER_REQUEST     default 600   (Unreal's /stream cap is 1000)
//   TTS_DAILY_CHAR_LIMIT          default 12000 (all users combined, UTC day)
//   TTS_MONTHLY_CHAR_LIMIT        default 200000 (80% of the free 250K, UTC month)
//   TTS_MAX_REQUESTS_PER_MINUTE   default 15    (per user)
//
// The daily/monthly counters are persisted to a small JSON file (counts and
// dates only — never text or audio) so a server restart doesn't reset them.
// That file is best-effort: on hosting with an ephemeral disk (Render's
// free web service) a redeploy resets it, which is why the monthly default
// leaves 20% headroom. When a limit is hit the caller falls back to the
// browser voice, so hitting one is never an error for the user.
import fs from 'node:fs'

const num = (value, fallback, { min = 1, max = Infinity } = {}) => {
  const n = Number(value)
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.floor(n))) : fallback
}

export function readSpeechLimits(env = process.env) {
  return {
    maxCharsPerRequest: num(env.TTS_MAX_CHARS_PER_REQUEST, 600, { max: 1000 }),
    dailyChars: num(env.TTS_DAILY_CHAR_LIMIT, 12000),
    monthlyChars: num(env.TTS_MONTHLY_CHAR_LIMIT, 200000),
    requestsPerMinute: num(env.TTS_MAX_REQUESTS_PER_MINUTE, 15),
  }
}

export function createSpeechGuard({ limits = readSpeechLimits(), storePath = null, now = () => new Date() } = {}) {
  const perUser = new Map() // userId -> recent request timestamps (ms)
  let breakerUntil = 0
  let state = { month: '', monthChars: 0, day: '', dayChars: 0 }

  if (storePath) {
    try {
      const saved = JSON.parse(fs.readFileSync(storePath, 'utf8'))
      if (saved && typeof saved === 'object') state = { ...state, ...saved }
    } catch {
      // No file yet, or unreadable: start from zero.
    }
  }

  const roll = () => {
    const iso = now().toISOString()
    if (state.month !== iso.slice(0, 7)) state = { month: iso.slice(0, 7), monthChars: 0, day: iso.slice(0, 10), dayChars: 0 }
    else if (state.day !== iso.slice(0, 10)) state = { ...state, day: iso.slice(0, 10), dayChars: 0 }
  }

  const persist = () => {
    if (!storePath) return
    try {
      fs.writeFileSync(storePath, JSON.stringify(state))
    } catch {
      // Best-effort: the in-memory counters still apply.
    }
  }

  return {
    // Checks every limit and, if all pass, counts `chars` against them.
    reserve(userId, chars) {
      roll()
      const nowMs = now().getTime()
      if (nowMs < breakerUntil) return { ok: false, reason: 'cooldown' }

      const recent = (perUser.get(userId) ?? []).filter((t) => nowMs - t < 60_000)
      if (recent.length >= limits.requestsPerMinute) return { ok: false, reason: 'rate' }
      if (state.dayChars + chars > limits.dailyChars) return { ok: false, reason: 'daily' }
      if (state.monthChars + chars > limits.monthlyChars) return { ok: false, reason: 'monthly' }

      recent.push(nowMs)
      perUser.set(userId, recent)
      state.dayChars += chars
      state.monthChars += chars
      persist()
      return { ok: true }
    },
    // After the provider says quota/auth trouble: stop calling it for a while.
    tripBreaker(ms) {
      breakerUntil = now().getTime() + ms
    },
    // Counts only, for logs/tests.
    snapshot() {
      roll()
      return { ...state }
    },
  }
}
