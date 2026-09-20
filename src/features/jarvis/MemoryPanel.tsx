import { useEffect, useState } from 'react'
import * as api from './api'
import type { JarvisMemoryEntry } from './api'

interface MemoryPanelProps {
  onClose: () => void
}

// What Jarvis remembers about the current person, with the ability to
// remove anything — memory shouldn't be an invisible black box.
export default function MemoryPanel({ onClose }: MemoryPanelProps) {
  const [entries, setEntries] = useState<JarvisMemoryEntry[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [errorMessage, setErrorMessage] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setStatus('loading')
      try {
        const result = await api.listMemory()
        if (cancelled) return
        setEntries(result)
        setStatus('ready')
      } catch (err) {
        if (cancelled) return
        setErrorMessage(err instanceof Error ? err.message : 'Failed to load memory.')
        setStatus('error')
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  async function handleDelete(id: string) {
    setDeletingId(id)
    try {
      await api.deleteMemory(id)
      setEntries((prev) => prev.filter((e) => e.id !== id))
    } catch {
      // Leave the entry in place — a failed delete isn't worth a whole
      // error banner here, the button just stops spinning.
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="jarvis-modal-overlay" onClick={onClose}>
      <div className="jarvis-modal" role="dialog" aria-modal="true" aria-label="What Jarvis remembers" onClick={(e) => e.stopPropagation()}>
        <div className="jarvis-modal-header">
          <h2>What Jarvis remembers</h2>
          <button type="button" className="jarvis-modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        {status === 'loading' && <p className="jarvis-modal-hint">Loading…</p>}
        {status === 'error' && <p className="jarvis-error">{errorMessage}</p>}
        {status === 'ready' && entries.length === 0 && (
          <p className="jarvis-modal-hint">Nothing yet — Jarvis remembers things you share as you chat.</p>
        )}
        {status === 'ready' && entries.length > 0 && (
          <ul className="jarvis-memory-list">
            {entries.map((entry) => (
              <li key={entry.id} className="jarvis-memory-item">
                <span>{entry.content}</span>
                <button
                  type="button"
                  className="jarvis-memory-forget"
                  onClick={() => handleDelete(entry.id)}
                  disabled={deletingId === entry.id}
                >
                  Forget
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
