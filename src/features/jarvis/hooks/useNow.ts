import { useEffect, useState } from 'react'

// The current time in ms, refreshed on an interval. Components use this instead
// of reading the clock while rendering.
export function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}
