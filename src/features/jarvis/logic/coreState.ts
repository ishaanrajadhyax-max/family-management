// The Jarvis Core's state model. The core is the single visual source of truth
// for "what is Jarvis doing right now": every other part of the interface
// (status strip, command bar, console, sounds) reads this state instead of
// keeping its own spinner or flag. This file is pure logic, no React.

export type CoreState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error' | 'attention'

// Independent real-world signals. Each one is set by exactly one real source.
export interface CoreSignals {
  listening: boolean // the microphone is capturing speech
  thinking: boolean // a message is being processed by the assistant
  preparing: boolean // a spoken reply is being generated/fetched
  speaking: boolean // Jarvis is speaking aloud
  error: boolean // the last operation failed
  attention: boolean // something real needs the user's notice (e.g. a memory was saved)
}

export const EMPTY_SIGNALS: CoreSignals = {
  listening: false,
  thinking: false,
  preparing: false,
  speaking: false,
  error: false,
  attention: false,
}

// Priority: what the user most needs to see wins.
export function deriveCoreState(s: CoreSignals): CoreState {
  if (s.error) return 'error'
  if (s.speaking) return 'speaking'
  if (s.thinking || s.preparing) return 'thinking'
  if (s.listening) return 'listening'
  if (s.attention) return 'attention'
  return 'idle'
}

// A short second line that says what "thinking" actually means right now.
export function coreDetail(s: CoreSignals): string {
  const state = deriveCoreState(s)
  if (state !== 'thinking') return ''
  return s.thinking ? 'PROCESSING' : 'PREPARING VOICE'
}

export const CORE_LABEL: Record<CoreState, string> = {
  idle: 'READY',
  listening: 'LISTENING',
  thinking: 'THINKING',
  speaking: 'SPEAKING',
  error: 'ERROR',
  attention: 'ATTENTION',
}

export interface CoreSnapshot {
  state: CoreState
  detail: string
}
