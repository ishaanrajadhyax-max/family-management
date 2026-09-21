// Selects which LLM provider Jarvis talks to, via LLM_PROVIDER
// (anthropic|groq). This is the one stable import path routes/jarvis.js
// uses — it never needs to change when a provider is added, removed, or
// swapped as the default. Each provider module implements the same
// contract: isConfigured(), info() -> { provider, model }, and
// getReply({ systemPrompt, history, tools, familyMemberId }) -> { text,
// usage } — the system prompt arrives pre-assembled by promptBuilder.js.
import * as anthropicProvider from './providers/anthropic.js'
import * as groqProvider from './providers/groq.js'

const PROVIDERS = {
  anthropic: anthropicProvider,
  groq: groqProvider,
}

// Groq by default — it has a genuinely free tier, matching the "₹0
// mandatory recurring cost" deployment goal. Anthropic stays fully
// supported by setting LLM_PROVIDER=anthropic.
const DEFAULT_PROVIDER = 'groq'

function getActiveProvider() {
  const name = process.env.LLM_PROVIDER || DEFAULT_PROVIDER
  const provider = PROVIDERS[name]
  if (!provider) {
    throw new Error(`Invalid LLM_PROVIDER: "${name}". Must be one of: ${Object.keys(PROVIDERS).join(', ')}`)
  }
  return provider
}

export function isJarvisConfigured() {
  return getActiveProvider().isConfigured()
}

export function getJarvisReply(args) {
  return getActiveProvider().getReply(args)
}

export function getProviderInfo() {
  return getActiveProvider().info()
}
