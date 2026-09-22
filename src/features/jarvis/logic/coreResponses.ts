// Deterministic response pools for Core interactions. Plain data — not
// AI-generated, never sent to a model; just a fixed set of lines the
// interaction engine picks from via logic/responsePool.ts. Kept in one
// small, easy-to-extend file so a future interaction can add its own pool
// alongside these without touching the engine itself.
import type { ShotOutcome } from './interactionState.ts'

export const TAP_RESPONSES: readonly string[] = ['Ow, sir.', 'Easy, sir.', 'I felt that.', 'Really, sir?', 'That was unnecessary.']

export const SHOT_RESPONSES: Readonly<Record<ShotOutcome, readonly string[]>> = {
  made: ['Good shot, sir.', 'Beautiful.', 'Nothing but net.'],
  close: ["Ohh, that's close, sir.", 'Just missed.', 'That was fairly close, sir.', 'So close.'],
  miss: ['Not quite, sir.', 'A little off.', 'Missed that one.'],
  very_bad_miss: ['Sir... where exactly were you aiming?', "That wasn't even close.", 'You can do better than that, sir.'],
}
