import { useEffect, useState, useSyncExternalStore } from 'react'
import type { JarvisMemoryEntry } from './api'
import { useAuth } from '../auth/AuthContext'
import { setCoreSignal } from './logic/coreStore.ts'
import { useJarvisSession } from './hooks/useJarvisSession'
import { useMemory } from './hooks/useMemory'
import { useMotionPreference } from './hooks/useMotionPreference'
import { useNow } from './hooks/useNow'
import { useSoundEvents } from './hooks/useSoundEvents'
import { useVoiceCapture } from './useVoiceCapture'
import { getVoiceEngine, subscribeVoiceEngine, useSpeechOutput } from './useSpeechOutput'
import { startMicMeter, stopMicMeter } from './micMeter'
import JarvisCore from './core/JarvisCore'
import JarvisHeader from './JarvisHeader'
import StatusStrip from './StatusStrip'
import VoiceDock from './VoiceDock'
import ConversationStream from './console/ConversationStream'
import CommandBar from './console/CommandBar'
import HistoryList from './panels/HistoryPanel'
import MemoryList from './panels/MemoryList'
import ContextPanel from './panels/ContextPanel'
import IntelligencePanel from './panels/IntelligencePanel'
import QuickActions from './panels/QuickActions'
import NotificationsList from './panels/NotificationsList'
import SettingsPanel from './panels/SettingsPanel'
import HudPanel from './ui/HudPanel'
import Overlay from './ui/Overlay'
import ApprovalDialog from './ui/ApprovalDialog'
import Icon from './ui/Icon'
import ToastProvider from './ui/ToastProvider'
import { useToast } from './ui/toastContext'
import type { HeaderTarget } from './JarvisHeader'
import './design/fonts'
import './design/tokens.css'
import './design/layout.css'
import './design/components.css'

type Panel = 'history' | 'memory' | 'intelligence' | 'settings' | 'notifications'
type ViewMode = 'chat' | 'voice'

interface JarvisAppProps {
  onOpenFamily: () => void
}

const truncate = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

// Jarvis's interface. This component is layout and wiring only: chat data lives
// in useJarvisSession, memory in useMemory, and what Jarvis is doing lives in the
// Core store that the Core, status strip, command bar and sounds all read.
function JarvisInner({ onOpenFamily }: JarvisAppProps) {
  const { user, logout } = useAuth()
  const session = useJarvisSession()
  const memory = useMemory()
  const toast = useToast()
  const voiceCapture = useVoiceCapture()
  const speech = useSpeechOutput()
  const engine = useSyncExternalStore(subscribeVoiceEngine, getVoiceEngine, getVoiceEngine)
  const motion = useMotionPreference()
  const now = useNow(30000)

  const [viewMode, setViewMode] = useState<ViewMode>('chat')
  const [speakEnabled, setSpeakEnabled] = useState(false)
  const [panel, setPanel] = useState<Panel | null>(null)
  const [forgetTarget, setForgetTarget] = useState<JarvisMemoryEntry | null>(null)
  const [seenNotificationId, setSeenNotificationId] = useState(0)

  useSoundEvents('.j-app')

  // The Core learns about the microphone here: one real signal, one place.
  useEffect(() => {
    setCoreSignal('listening', voiceCapture.isListening)
    if (voiceCapture.isListening) void startMicMeter()
    else stopMicMeter()
  }, [voiceCapture.isListening])

  // A failed operation shows on the Core (ERROR) for a few seconds.
  const failing = Boolean(session.sendError || voiceCapture.error)
  useEffect(() => {
    if (!failing) return
    setCoreSignal('error', true)
    const id = setTimeout(() => setCoreSignal('error', false), 5000)
    return () => {
      clearTimeout(id)
      setCoreSignal('error', false)
    }
  }, [failing])

  // Leaving the interface leaves nothing running.
  useEffect(
    () => () => {
      speech.stop()
      stopMicMeter()
      setCoreSignal('listening', false)
      setCoreSignal('thinking', false)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  function announceSaved(entry: JarvisMemoryEntry) {
    toast.notify({
      tone: 'success',
      label: 'MEMORY',
      text: `SAVED — “${truncate(entry.content, 90)}”`,
      sound: 'memorySaved',
      attention: true,
      ttl: 9000,
      action: {
        label: 'UNDO',
        onClick: () => {
          memory
            .forget(entry.id)
            .then(() => toast.notify({ tone: 'info', label: 'MEMORY', text: 'FORGOTTEN', sound: 'memoryDeleted' }))
            .catch(() => toast.notify({ tone: 'error', label: 'MEMORY', text: 'COULD NOT UNDO' }))
        },
      },
    })
  }

  async function sendMessage(content: string) {
    const channel = viewMode === 'voice' ? 'voice' : 'text'
    const reply = await session.send(content, channel, (message) =>
      toast.notify({ tone: 'error', label: 'ERROR', text: `REQUEST FAILED — ${truncate(message, 100)}` }),
    )
    if (reply === null) return
    if (channel === 'voice' || speakEnabled) void speech.speak(reply)
    for (const entry of await memory.checkForNew()) announceSaved(entry)
  }

  function selectMode(mode: Parameters<typeof session.selectMode>[0]) {
    speech.stop()
    if (session.selectMode(mode)) {
      toast.notify({ tone: 'info', label: 'MODE', text: `${mode.toUpperCase()} — NEW CONVERSATION`, sound: null })
    }
    setPanel(null)
  }

  function newConversation() {
    speech.stop()
    session.startFresh()
    setPanel(null)
  }

  function navigate(target: HeaderTarget) {
    if (target === 'family') return onOpenFamily()
    if (target === 'chat') {
      setPanel(null)
      setViewMode('chat')
    } else if (target === 'voice') {
      setPanel(null)
      setViewMode((v) => (v === 'voice' ? 'chat' : 'voice'))
    } else {
      setPanel(target)
    }
  }

  function openNotifications() {
    setPanel('notifications')
    setSeenNotificationId(toast.history[0]?.id ?? 0)
  }

  async function confirmForget() {
    if (!forgetTarget) return
    try {
      await memory.forget(forgetTarget.id)
      toast.notify({ tone: 'info', label: 'MEMORY', text: 'FORGOTTEN', sound: 'memoryDeleted' })
    } catch {
      toast.notify({ tone: 'error', label: 'MEMORY', text: 'COULD NOT FORGET — TRY AGAIN' })
    } finally {
      setForgetTarget(null)
    }
  }

  const unseen = toast.history.filter((h) => h.id > seenNotificationId).length
  const hasMessages = session.messages.length > 0
  const modeLabel = session.modes.find((m) => m.id === session.currentMode)?.label ?? session.currentMode
  const voiceOn = speakEnabled || viewMode === 'voice'
  const streamMessages = viewMode === 'voice' ? session.messages.slice(-2) : session.messages

  if (session.status !== 'ready') {
    return (
      <div className="j-app j-app-boot" data-motion={motion}>
        <div className="j-boot-core">
          <JarvisCore />
        </div>
        {session.status === 'loading' ? (
          <p className="j-boot-text">
            SYSTEM <span className="j-slashes">//</span> INITIALIZING
          </p>
        ) : (
          <div className="j-boot-error" role="alert">
            <p className="j-boot-text">
              SYSTEM <span className="j-slashes">//</span> OFFLINE
            </p>
            <p className="j-empty-note">{session.errorMessage}</p>
            <button type="button" className="j-btn primary" onClick={() => window.location.reload()}>
              <Icon name="replay" size={16} /> RETRY
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="j-app" data-view={viewMode} data-motion={motion}>
      <JarvisHeader
        view={viewMode}
        activePanel={panel}
        unseenNotifications={unseen}
        userName={user?.name ?? ''}
        onNavigate={navigate}
        onOpenNotifications={openNotifications}
        onOpenSettings={() => setPanel('settings')}
      />
      <StatusStrip modes={session.modes} mode={session.currentMode} onSelectMode={selectMode} voiceOn={voiceOn} engine={engine} />

      <main className="j-main">
        <aside className="j-col j-col-left" aria-label="History and memory">
          <HudPanel label="HISTORY" meta={`${session.conversations.length}`} className="j-grow">
            <HistoryList conversations={session.conversations} activeId={session.activeConversation?.id ?? null} now={now} onSelect={session.selectConversation} onNew={newConversation} />
          </HudPanel>
          <HudPanel
            label="MEMORY"
            meta={memory.status === 'ready' ? `${memory.entries.length}` : undefined}
            actions={
              <button type="button" className="j-btn small" onClick={() => setPanel('memory')} data-sound="none">
                OPEN
              </button>
            }
          >
            <ul className="j-mem-mini">
              {memory.entries.slice(0, 3).map((e) => (
                <li key={e.id}>{truncate(e.content, 70)}</li>
              ))}
              {memory.status === 'ready' && memory.entries.length === 0 && <li className="j-empty-note">Nothing stored yet.</li>}
              {memory.status === 'loading' && <li className="j-empty-note">MEMORY // RETRIEVING</li>}
            </ul>
          </HudPanel>
        </aside>

        <section className="j-center" data-compact={hasMessages && viewMode === 'chat' ? 'true' : 'false'}>
          <div className="j-stage">
            <JarvisCore />
          </div>
          <HudPanel label="CONVERSATION" meta={modeLabel.toUpperCase()} className="j-console">
            <ConversationStream
              messages={streamMessages}
              loading={session.messagesLoading}
              revealMessageId={session.revealMessageId}
              canSpeak={speech.isSupported}
              onReplay={(text) => void speech.speak(text)}
              emptyHint={viewMode === 'voice' ? 'Tap the microphone and start talking.' : 'Ask Jarvis anything, or tap the microphone.'}
            />
          </HudPanel>
          {viewMode === 'chat' ? (
            <CommandBar
              onSend={(c) => void sendMessage(c)}
              sending={session.sending}
              error={session.sendError}
              voice={voiceCapture}
              speakEnabled={speakEnabled}
              speechSupported={speech.isSupported}
              onToggleSpeak={() => {
                if (speakEnabled) speech.stop()
                setSpeakEnabled((v) => !v)
              }}
              onStopSpeech={speech.stop}
              onEnterVoice={() => setViewMode('voice')}
              placeholder="Ask Jarvis anything…"
            />
          ) : (
            <VoiceDock voice={voiceCapture} sending={session.sending} error={session.sendError} onSend={(c) => void sendMessage(c)} onStopSpeech={speech.stop} onExit={() => setViewMode('chat')} />
          )}
        </section>

        <aside className="j-col j-col-right" aria-label="Context and shortcuts">
          <HudPanel label="CONTEXT">
            <ContextPanel
              mode={session.currentMode}
              conversation={session.activeConversation}
              messageCount={session.messages.length}
              memory={memory.entries}
              memoryReady={memory.status === 'ready'}
              engine={engine}
              now={now}
              onNew={newConversation}
              onOpenMemory={() => setPanel('memory')}
              onTestVoice={() => void speech.speak('Voice check.')}
            />
          </HudPanel>
          <HudPanel label="INTELLIGENCE">
            <IntelligencePanel onOpenNews={() => selectMode('news')} />
          </HudPanel>
          <HudPanel label="QUICK ACTIONS">
            <QuickActions
              actions={[
                { icon: 'plus', label: 'New chat', onClick: newConversation },
                { icon: 'voice', label: 'Voice', onClick: () => setViewMode('voice'), disabled: !voiceCapture.isSupported },
                { icon: 'memory', label: 'Memories', onClick: () => setPanel('memory') },
                { icon: 'family', label: 'Family', onClick: onOpenFamily },
              ]}
            />
          </HudPanel>
        </aside>
      </main>

      <Overlay open={panel === 'history'} onClose={() => setPanel(null)} label="HISTORY" variant="sheet">
        <HistoryList conversations={session.conversations} activeId={session.activeConversation?.id ?? null} now={now} onSelect={(id) => { session.selectConversation(id); setPanel(null) }} onNew={newConversation} />
      </Overlay>
      <Overlay open={panel === 'memory'} onClose={() => setPanel(null)} label="MEMORY" variant="drawer">
        <MemoryList entries={memory.entries} status={memory.status} errorMessage={memory.errorMessage} now={now} onForget={setForgetTarget} />
      </Overlay>
      <Overlay open={panel === 'intelligence'} onClose={() => setPanel(null)} label="INTELLIGENCE" variant="drawer">
        <IntelligencePanel onOpenNews={() => selectMode('news')} />
      </Overlay>
      <Overlay open={panel === 'notifications'} onClose={() => setPanel(null)} label="NOTIFICATIONS" variant="drawer">
        <NotificationsList entries={toast.history} now={now} />
      </Overlay>
      <Overlay open={panel === 'settings'} onClose={() => setPanel(null)} label="SETTINGS" variant="drawer">
        <SettingsPanel
          speakEnabled={speakEnabled}
          onToggleSpeak={() => {
            if (speakEnabled) speech.stop()
            setSpeakEnabled((v) => !v)
          }}
          speechSupported={speech.isSupported}
          micSupported={voiceCapture.isSupported}
          engine={engine}
          userName={user?.name ?? ''}
          userRole={user?.role ?? ''}
          onSignOut={() => void logout()}
        />
      </Overlay>

      <ApprovalDialog
        open={forgetTarget !== null}
        label="MEMORY REQUEST"
        title="Forget this?"
        detail={forgetTarget?.content}
        confirmLabel="FORGET"
        tone="danger"
        onConfirm={confirmForget}
        onCancel={() => setForgetTarget(null)}
      />
    </div>
  )
}

export default function JarvisApp(props: JarvisAppProps) {
  return (
    <ToastProvider>
      <JarvisInner {...props} />
    </ToastProvider>
  )
}
