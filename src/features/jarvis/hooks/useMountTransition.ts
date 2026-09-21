import { useEffect, useState } from 'react'

// Keeps an element mounted while its exit animation plays. `state` is what the
// CSS keys off (data-state="open" | "closing"); `mounted` says whether to render.
export function useMountTransition(open: boolean, exitMs: number) {
  const [mounted, setMounted] = useState(open)
  if (open && !mounted) setMounted(true)

  useEffect(() => {
    if (open || !mounted) return
    const id = setTimeout(() => setMounted(false), exitMs)
    return () => clearTimeout(id)
  }, [open, mounted, exitMs])

  return { mounted, state: open ? 'open' : 'closing' } as const
}
