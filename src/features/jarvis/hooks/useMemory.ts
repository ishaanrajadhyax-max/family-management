import { useCallback, useEffect, useRef, useState } from 'react'
import * as api from '../api'
import type { JarvisMemoryEntry } from '../api'
import { newEntries } from '../logic/format.ts'

// Jarvis's stored memory as one shared piece of state: the panel, the context
// summary and the "saved" notifications all read the same list.
export function useMemory() {
  const [entries, setEntries] = useState<JarvisMemoryEntry[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [errorMessage, setErrorMessage] = useState('')
  const known = useRef<JarvisMemoryEntry[]>([])

  useEffect(() => {
    known.current = entries
  }, [entries])

  useEffect(() => {
    let cancelled = false
    api
      .listMemory()
      .then((result) => {
        if (cancelled) return
        setEntries(result)
        setStatus('ready')
      })
      .catch((err) => {
        if (cancelled) return
        setErrorMessage(err instanceof Error ? err.message : 'Failed to load memory.')
        setStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [])

  // After a reply: re-read memory and return anything that was just saved, so
  // the interface can say so (and offer to undo it). Memory is written by the
  // server when Jarvis decides something is worth keeping; this only observes.
  const checkForNew = useCallback(async (): Promise<JarvisMemoryEntry[]> => {
    try {
      const fresh = await api.listMemory()
      const added = newEntries(known.current, fresh)
      setEntries(fresh)
      setStatus('ready')
      return added
    } catch {
      return []
    }
  }, [])

  // Throws on failure so callers can report it.
  const forget = useCallback(async (id: string) => {
    await api.deleteMemory(id)
    setEntries((prev) => prev.filter((e) => e.id !== id))
  }, [])

  return { entries, status, errorMessage, checkForNew, forget }
}
