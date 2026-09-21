// Every context/token budget Jarvis uses lives in this one file — routes,
// providers, the prompt builder, and the history window all read from
// here, so tuning (e.g. from the real `usage` Groq returns, recorded in
// jarvis_usage) means editing numbers in one place, not hunting for magic
// numbers. Defaults are deliberately conservative for Groq's free plan,
// which has tight per-minute and per-day token limits; an area can
// override individual values via its own `budget` in areas.js.

// No tokenizer dependency: a deliberately pessimistic characters-per-token
// ratio, so estimates run high rather than low. Replace/calibrate once
// there's enough recorded `usage` to compare against.
export const CHARS_PER_TOKEN = 3

export const DEFAULT_BUDGETS = Object.freeze({
  // Ceiling for the whole assembled system prompt. Mandatory layers
  // (persona, global rules, area rules, cores) are never dropped to meet
  // it — only retrieved entries and then memory are.
  totalSystemTokens: 3000,
  // Retrieved Notebook entries (layer 5).
  knowledgeTokens: 1500,
  // At most this many dynamic entries are retrieved per request, even if
  // the token budget would allow more — keeps the context focused.
  maxRetrievedEntries: 8,
  // Rough per-entry cost of the "[Section · Title · synced …]" label the
  // prompt builder adds, so retrieval's budget fill isn't optimistic.
  entryLabelOverheadTokens: 15,
  // Import-time ceiling for a single entry: retrieval returns whole
  // entries, so one that can never fit the knowledge budget is rejected
  // at import instead of silently never being retrievable.
  maxEntryTokens: 600,
  // Personal conversational memory (layer 6).
  memoryTokens: 300,
  // Informational caps for the always-on layers. The (later) importer is
  // what enforces these — the builder never truncates rules or core.
  rulesTokens: 600,
  coreTokens: 500,

  // Conversation history sent to the model.
  historyTokens: 1200,
  maxHistoryMessages: 40,
  // The newest N messages are sent whole; anything older is clipped.
  recentUnclippedMessages: 2,
  maxOldMessageChars: 1200,

  // Incoming user message: the route rejects anything longer.
  maxUserMessageChars: 4000,
})

export function estimateTokens(text) {
  if (!text) return 0
  return Math.ceil(String(text).length / CHARS_PER_TOKEN)
}

// Defaults overlaid with an area's own overrides.
export function resolveBudgets(areaOverrides = {}) {
  return { ...DEFAULT_BUDGETS, ...areaOverrides }
}
