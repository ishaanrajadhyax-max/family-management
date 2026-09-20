import { useEffect, useState } from 'react'
import * as api from './api'
import type { JarvisConversation, JarvisMessage, JarvisMode, JarvisModeInfo } from './api'
import ConversationSidebar from './ConversationSidebar'
import ChatView from './ChatView'
import './jarvis.css'

// Jarvis's own top-level view — a distinct UI from the Family Management
// section (see jarvis.css for the visual identity), but built the same
// way: one data-owning component at the top, dumb presentational children
// below it.
export default function JarvisApp() {
  const [modes, setModes] = useState<JarvisModeInfo[]>([])
  const [conversations, setConversations] = useState<JarvisConversation[]>([])
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [messages, setMessages] = useState<JarvisMessage[]>([])
  // Which conversation `messages` actually belongs to — lets the render
  // below hide stale messages the instant activeConversationId changes,
  // without needing to clear them via a synchronous setState in an effect.
  const [messagesConversationId, setMessagesConversationId] = useState<string | null>(null)
  const [selectedMode, setSelectedMode] = useState<JarvisMode>('general')
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [errorMessage, setErrorMessage] = useState('')
  const [messagesLoading, setMessagesLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      setStatus('loading')
      try {
        const [modesResult, conversationsResult] = await Promise.all([
          api.listModes(),
          api.listConversations(),
        ])
        if (cancelled) return
        setModes(modesResult)
        setConversations(conversationsResult)
        setStatus('ready')
      } catch (err) {
        if (cancelled) return
        setErrorMessage(err instanceof Error ? err.message : 'Failed to load Jarvis.')
        setStatus('error')
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!activeConversationId) return
    let cancelled = false
    async function loadMessages(conversationId: string) {
      setMessagesLoading(true)
      try {
        const result = await api.listMessages(conversationId)
        if (cancelled) return
        setMessages(result)
        setMessagesConversationId(conversationId)
      } catch (err) {
        if (cancelled) return
        setSendError(err instanceof Error ? err.message : 'Failed to load messages.')
      } finally {
        if (!cancelled) setMessagesLoading(false)
      }
    }
    loadMessages(activeConversationId)
    return () => {
      cancelled = true
    }
  }, [activeConversationId])

  // Messages only render when they actually belong to the active
  // conversation — switching conversations hides the previous one's
  // messages immediately, before the new ones have loaded.
  const displayedMessages = activeConversationId === messagesConversationId ? messages : []

  function handleSelectConversation(id: string) {
    setSendError('')
    setActiveConversationId(id)
  }

  async function handleNewConversation() {
    setSendError('')
    try {
      const created = await api.createConversation(selectedMode)
      setConversations((prev) => [created, ...prev])
      setActiveConversationId(created.id)
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Failed to start a new conversation.')
    }
  }

  async function handleSend(content: string) {
    setSendError('')
    setSending(true)
    try {
      let conversationId = activeConversationId
      const isNewConversation = !conversationId
      if (!conversationId) {
        const created = await api.createConversation(selectedMode)
        setConversations((prev) => [created, ...prev])
        setActiveConversationId(created.id)
        conversationId = created.id
      }

      const { userMessage, assistantMessage } = await api.sendMessage(conversationId, content)
      if (isNewConversation) {
        setMessages([userMessage, assistantMessage])
      } else {
        setMessages((prev) => [...prev, userMessage, assistantMessage])
      }
      setMessagesConversationId(conversationId)
      setConversations((prev) => {
        const updated = prev.map((c) =>
          c.id === conversationId
            ? { ...c, updatedAt: assistantMessage.createdAt, title: c.title ?? content.slice(0, 60) }
            : c,
        )
        // Bump the active conversation to the top, matching "most
        // recently active first" from the backend.
        const active = updated.find((c) => c.id === conversationId)
        if (!active) return updated
        return [active, ...updated.filter((c) => c.id !== conversationId)]
      })
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Failed to send message.')
    } finally {
      setSending(false)
    }
  }

  if (status === 'loading') {
    return (
      <div className="jarvis-app">
        <div className="jarvis-status">Loading Jarvis…</div>
      </div>
    )
  }
  if (status === 'error') {
    return (
      <div className="jarvis-app">
        <div className="jarvis-status jarvis-status-error">
          <p>Couldn't load Jarvis.</p>
          <p className="jarvis-status-detail">{errorMessage}</p>
        </div>
      </div>
    )
  }

  const activeConversation = conversations.find((c) => c.id === activeConversationId) ?? null

  return (
    <div className="jarvis-app">
      <ConversationSidebar
        modes={modes}
        selectedMode={selectedMode}
        onSelectMode={setSelectedMode}
        conversations={conversations}
        activeConversationId={activeConversationId}
        onSelectConversation={handleSelectConversation}
        onNewConversation={handleNewConversation}
      />
      <ChatView
        conversation={activeConversation}
        modeLabel={modes.find((m) => m.id === (activeConversation?.mode ?? selectedMode))?.label}
        messages={displayedMessages}
        messagesLoading={messagesLoading}
        onSend={handleSend}
        sending={sending}
        error={sendError}
      />
    </div>
  )
}
