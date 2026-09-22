// A small, generic, reusable way to pick "one of several deterministic lines"
// — used for Jarvis's reactions to physical Core interactions. These are
// NOT AI-generated: every line is fixed, written ahead of time, and chosen
// only by random selection from a fixed pool (never by a model). Any future
// interaction (Pong, catch, a reaction test, ...) can define its own pool —
// this file has no idea what a "tap" or a "basketball" is.
export function pickResponse<T>(pool: readonly T[], avoid?: T, random: () => number = Math.random): T {
  if (pool.length === 0) throw new Error('pickResponse: pool must not be empty')
  if (pool.length === 1) return pool[0]
  let choice = pool[Math.floor(random() * pool.length)]
  // Avoid repeating the immediately previous line, so the same response
  // never fires twice in a row by chance — still a random pick, just one
  // retry away from a repeat. Bounded, so a bad `random` can't loop forever.
  for (let attempt = 0; choice === avoid && attempt < 8; attempt++) {
    choice = pool[Math.floor(random() * pool.length)]
  }
  return choice
}
