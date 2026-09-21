import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Router } from 'express'
import { cleanForSpeech, limitForSpeech } from '../jarvis/tts/speechText.js'
import { createSpeechGuard, readSpeechLimits } from '../jarvis/tts/speechGuard.js'
import { isUnrealConfigured, synthesize } from '../jarvis/tts/unrealSpeech.js'

// POST /api/jarvis/speech  { text }  ->  audio/mpeg
//
// Turns a Jarvis reply into spoken audio with Unreal Speech's "Will" voice.
// Mounted behind requireAuth in server.js, so only a logged-in user can
// spend the allowance. The API key stays in this process. Audio is streamed
// straight back and never written to disk or cached anywhere.
//
// Every non-200 response is a signal for the browser to fall back to its own
// built-in voice — none of them is a user-facing failure:
//   503 tts_unconfigured  no UNREAL_SPEECH_API_KEY on the server
//   429 tts_limit         a configured character/request limit was reached
//   503 tts_cooldown      the provider recently reported quota/auth trouble
//   502 tts_unavailable   the provider errored, timed out or sent non-audio
//   400                   no speakable text in the request
//
// Nothing here logs reply text; failures are logged by short code only.
const STORE_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.tts-usage.json')
const BREAKER_MS = 10 * 60 * 1000

export function createSpeechRouter({
  guard = createSpeechGuard({ storePath: STORE_PATH }),
  limits = readSpeechLimits(),
  speak = synthesize,
  isConfigured = isUnrealConfigured,
} = {}) {
  const router = Router()

  router.post('/', async (req, res, next) => {
    try {
      if (typeof req.body?.text !== 'string') {
        return res.status(400).json({ error: 'text is required' })
      }
      // Checked after validation so a bad request always fails the same way.
      if (!isConfigured()) {
        return res.status(503).json({ code: 'tts_unconfigured', error: 'Server voice is not configured.' })
      }

      const cleaned = cleanForSpeech(req.body.text)
      if (!cleaned) return res.status(400).json({ error: 'nothing to speak' })
      const { text, truncated } = limitForSpeech(cleaned, limits.maxCharsPerRequest)

      const reservation = guard.reserve(req.user.id, text.length)
      if (!reservation.ok) {
        const cooldown = reservation.reason === 'cooldown'
        return res
          .status(cooldown ? 503 : 429)
          .json({ code: cooldown ? 'tts_cooldown' : 'tts_limit', error: 'Server voice is paused.' })
      }

      const result = await speak(text)
      if (!result.ok) {
        // Provider says quota/auth trouble: stop calling it for a while
        // rather than burning requests (or the allowance) on retries.
        if (result.code === 'quota' || result.code === 'auth') guard.tripBreaker(BREAKER_MS)
        console.warn(`Jarvis speech: provider unavailable (${result.code}, ${result.status})`)
        return res.status(502).json({ code: 'tts_unavailable', error: 'Server voice is unavailable.' })
      }

      res.set({
        'Content-Type': 'audio/mpeg',
        'Content-Length': String(result.audio.length),
        'Cache-Control': 'no-store',
        'X-Speech-Truncated': truncated ? '1' : '0',
      })
      res.send(result.audio)
    } catch (err) {
      next(err)
    }
  })

  return router
}

export default createSpeechRouter()
