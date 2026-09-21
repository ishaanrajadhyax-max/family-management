import { useEffect, useState } from 'react'
import * as api from '../api'
import type { JarvisConversation, JarvisMessage, JarvisMode, JarvisModeInfo } from '../api'
import { setCoreSignal } from '../logic/coreStore.ts'

// All of the chat data and actions for the Jarvis interface: modes,
// conversations, messages and sending. This is the previous JarvisApp logic
// moved out of the layout component, plus two things: it reports "thinking" to
// the Core while a message is processed, and switching mode now starts a fresh
// conversation in that mode (a conversation's mode never changes), so the mode
// shown is always the mode in use.
export function useJarvisSession() {
  const [modes, setModes] = useState<JarvisModeInfo[]>([])
  const [conversations, setConversations] = useState<JarvisConversation[]>([])
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [messages, setMessages] = useState<JarvisMessage[]>([])
  // Which conversation `messages` belongs to, so stale messages are hidden the
  // instant the active conversation changes.
  const [messagesConversationId, setMessagesConversationId] = useState<string | null>(null)
  const [selectedMode, setSelectedMode] = useState<JarvisMode>('general')
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [errorMessage, setErrorMessage] = useState('')
  const [messagesLoading, setMessagesLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')
  // The assistant reply that just arrived live (it gets the staged reveal).
  const [revealMessageId, setRevealMessageId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setStatus('loading')
      try {
        const [modesResult, conversationsResult] = await Promise.all([api.listModes(), api.listConversations()])
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

  const displayedMessages = activeConversationId === messagesConversationId ? messages : []
  const activeConversation = conversations.find((c) => c.id === activeConversationId) ?? null
  // The mode actually in use: an open conversation's own mode, else the chosen one.
  const currentMode: JarvisMode = activeConversation?.mode ?? selectedMode

  function selectConversation(id: string) {
    setSendError('')
    setRevealMessageId(null)
    setActiveConversationId(id)
    const c = conversations.find((x) => x.id === id)
    if (c) setSelectedMode(c.mode)
  }

  // A fresh, empty conversation; it is created on the first message.
  function startFresh() {
    setSendError('')
    setRevealMessageId(null)
    setActiveConversationId(null)
  }

  // Returns true if this started a fresh conversation (the current one was in a different mode).
  function selectMode(mode: JarvisMode): boolean {
    setSelectedMode(mode)
    if (activeConversation && activeConversation.mode !== mode) {
      startFresh()
      return true
    }
    return false
  }

  // Resolves with the reply text, or null if sending failed.
  async function send(content: string, channel: 'text' | 'voice', onError?: (message: string) => void): Promise<string | null> {
    setSendError('')
    setSending(true)
    setCoreSignal('thinking', true)
    try {
      let conversationId = activeConversationId
      const isNewConversation = !conversationId
      if (!conversationId) {
        const created = await api.createConversation(selectedMode)
        setConversations((prev) => [created, ...prev])
        setActiveConversationId(created.id)
        conversationId = created.id
      }

      const { userMessage, assistantMessage } = await api.sendMessage(conversationId, content, channel)
      if (isNewConversation) setMessages([userMessage, assistantMessage])
      else setMessages((prev) => [...prev, userMessage, assistantMessage])
      setMessagesConversationId(conversationId)
      setRevealMessageId(assistantMessage.id)
      setConversations((prev) => {
        const updated = prev.map((c) =>
          c.id === conversationId ? { ...c, updatedAt: assistantMessage.createdAt, title: c.title ?? content.slice(0, 60) } : c,
        )
        const active = updated.find((c) => c.id === conversationId)
        if (!active) return updated
        return [active, ...updated.filter((c) => c.id !== conversationId)]
      })
      return assistantMessage.content
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to send message.'
      setSendError(message)
      onError?.(message)
      return null
    } finally {
      setSending(false)
      setCoreSignal('thinking', false)
    }
  }

  return {
    modes,
    conversations,
    activeConversation,
    messages: displayedMessages,
    messagesLoading,
    status,
    errorMessage,
    currentMode,
    sending,
    sendError,
    clearSendError: () => setSendError(''),
    revealMessageId,
    selectConversation,
    startFresh,
    selectMode,
    send,
  }
}
