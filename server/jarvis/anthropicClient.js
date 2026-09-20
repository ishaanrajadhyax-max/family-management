// Thin wrapper around the Anthropic SDK for Jarvis. Kept as a single
// module so the rest of the app (routes) never touches the SDK directly —
// swapping models, adding tool-call handling for a real News search tool,
// or moving to a different request shape for realtime voice later all
// happen here without changing routes/jarvis.js.
import Anthropic from '@anthropic-ai/sdk'
import { JARVIS_MODES } from './modes.js'

const MODEL = 'claude-sonnet-5'
const MAX_TOKENS = 1024

let client = null

export function isJarvisConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY)
}

function getClient() {
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  }
  return client
}

// `memoryFacts` is a short list of persisted facts about this person (the
// Day 2 memory feature) — empty for now, but the injection point exists
// from Day 1 so turning memory on later is additive.
function buildSystemPrompt(mode, memoryFacts) {
  const base = JARVIS_MODES[mode].systemPrompt
  if (!memoryFacts || memoryFacts.length === 0) return base
  const facts = memoryFacts.map((f) => `- ${f}`).join('\n')
  return `${base}\n\nWhat you remember about this person from past conversations:\n${facts}`
}

// `history` is the conversation so far as [{role: 'user'|'assistant', content: string}, ...],
// oldest first, NOT including the new message being sent — the caller
// appends that as the last entry before calling this.
export async function getJarvisReply({ mode, history, memoryFacts = [] }) {
  if (!isJarvisConfigured()) {
    throw new Error('ANTHROPIC_API_KEY is not configured')
  }
  const modeConfig = JARVIS_MODES[mode]
  const response = await getClient().messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: buildSystemPrompt(mode, memoryFacts),
    tools: modeConfig.tools.length > 0 ? modeConfig.tools : undefined,
    messages: history.map((m) => ({ role: m.role, content: m.content })),
  })

  // Tool-use handling: no mode defines any tools yet (see modes.js), so
  // this loop never runs today — it's here so wiring in a real tool
  // (e.g. News mode's future web search) only means adding a case here,
  // not restructuring how replies are produced.
  const textBlock = response.content.find((block) => block.type === 'text')
  return textBlock ? textBlock.text : ''
}
