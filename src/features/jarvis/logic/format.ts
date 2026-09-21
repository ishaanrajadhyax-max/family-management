// Small formatting and diffing helpers. Pure functions; "now" is always passed
// in so components never read the clock during render.

export function formatRelative(iso: string, nowMs: number): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const seconds = Math.max(0, Math.round((nowMs - then) / 1000))
  if (seconds < 45) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(then).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

export function formatClock(ms: number): { time: string; date: string } {
  const d = new Date(ms)
  return {
    time: d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false }),
    date: d.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase(),
  }
}

// Entries present in `next` but not in `previous`, compared by id.
export function newEntries<T extends { id: string }>(previous: readonly { id: string }[], next: readonly T[]): T[] {
  const seen = new Set(previous.map((e) => e.id))
  return next.filter((e) => !seen.has(e.id))
}

// The most recent createdAt among entries, or null.
export function latestCreatedAt(entries: readonly { createdAt: string }[]): string | null {
  let best: string | null = null
  for (const e of entries) if (best === null || new Date(e.createdAt) > new Date(best)) best = e.createdAt
  return best
}
