// Jarvis's specialist modes. Each mode is a system prompt plus a
// mode-specific tool list — the tool list is what makes this extensible:
// General and Style ship with none of their own for the MVP, but News is
// wired to *pass* a tools array through the same request shape a real
// web-search tool will later use. Adding live search later means filling
// in `tools` here and a handler in anthropicClient.js's tool-execution
// loop — not touching the chat pipeline itself.
//
// COMMON_TOOLS are available in every mode regardless — currently just
// remember_fact, which is how Jarvis's persistent memory (see
// jarvis_memory in db/migrations/004_jarvis.sql) actually gets written:
// the model decides something is worth remembering and calls the tool: no
// separate "memory extraction" pass, no manual save button.
export const COMMON_TOOLS = [
  {
    name: 'remember_fact',
    description:
      "Save a fact, preference, or piece of context about this person that's worth recalling in " +
      'future conversations — not just this one. Use it when they share something durable (a ' +
      'preference, a recurring detail, an important fact about their life), not for one-off details ' +
      "that only matter to the current message.",
    input_schema: {
      type: 'object',
      properties: {
        fact: {
          type: 'string',
          description: 'The fact to remember, written as a short, self-contained statement.',
        },
      },
      required: ['fact'],
    },
  },
]

export const JARVIS_MODES = {
  general: {
    label: 'General',
    systemPrompt:
      'You are Jarvis, a warm, capable personal AI assistant. Be concise ' +
      'and direct, but personable — this is a private assistant for one ' +
      'person, not a customer support bot. Answer plainly; ask a brief ' +
      'clarifying question only when you genuinely need one to help.',
    tools: [],
  },
  news: {
    label: 'News',
    systemPrompt:
      'You are Jarvis in News mode. You do not currently have live ' +
      "internet access, so if asked about breaking or very recent events, " +
      'say plainly that you cannot check the live news right now rather ' +
      'than guessing or presenting stale training data as current. Where ' +
      'you can help (explaining context, summarizing what you do know, ' +
      'discussing a topic), do so concisely.',
    // Intentionally empty for the MVP — see the file header. A real
    // web-search tool definition (name, input schema, and a matching
    // handler in anthropicClient.js's tool-execution loop) is the only
    // change needed to give this mode live results later.
    tools: [],
  },
  style: {
    label: 'Style',
    systemPrompt:
      'You are Jarvis in Style mode — a thoughtful advisor on fashion, ' +
      'grooming, and personal presentation. Be specific and practical ' +
      '(concrete items, combinations, occasions) rather than generic. ' +
      'Ask about context (occasion, weather, existing wardrobe) when it ' +
      'would meaningfully change your answer.',
    tools: [],
  },
}

export const DEFAULT_JARVIS_MODE = 'general'

export function isValidJarvisMode(mode) {
  return Object.prototype.hasOwnProperty.call(JARVIS_MODES, mode)
}

export function getToolsForMode(mode) {
  return [...COMMON_TOOLS, ...JARVIS_MODES[mode].tools]
}
