// Thin wrapper around the Anthropic SDK for Jarvis. Kept as a single
// module so the rest of the app (routes) never touches the SDK directly —
// swapping models, adding tool-call handling for a real News search tool,
// or moving to a different request shape for realtime voice later all
// happen here without changing routes/jarvis.js.
import Anthropic from '@anthropic-ai/sdk'
import { pool } from '../db.js'
import { JARVIS_MODES, getToolsForMode } from './modes.js'

const MODEL = 'claude-sonnet-5'
const MAX_TOKENS = 1024
// A tool-use round trip (model asks for a tool -> we run it -> model
// replies using the result) can repeat if the model chains tool calls;
// capped so a confused model can't loop forever.
const MAX_TOOL_ROUNDS = 3

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

// `memoryFacts` is the persisted jarvis_memory rows for this person — the
// injection point that turns "conversation history" into something that
// persists across separate conversations.
function buildSystemPrompt(mode, memoryFacts) {
  const base = JARVIS_MODES[mode].systemPrompt
  if (!memoryFacts || memoryFacts.length === 0) return base
  const facts = memoryFacts.map((f) => `- ${f}`).join('\n')
  return `${base}\n\nWhat you remember about this person from past conversations:\n${facts}`
}

// Runs one tool call server-side. remember_fact (see modes.js) is the only
// tool that exists today, and it's how memory actually gets written — the
// model decides something is worth keeping and calls this; there's no
// separate "extract memories" pass. A future News search tool adds
// another case here, not a new code path.
async function executeTool(name, input, { familyMemberId }) {
  if (name === 'remember_fact') {
    await pool.query('INSERT INTO jarvis_memory (family_member_id, content) VALUES ($1, $2)', [
      familyMemberId,
      String(input.fact ?? '').slice(0, 2000),
    ])
    return 'Saved.'
  }
  return `Unknown tool: ${name}`
}

// `history` is the conversation so far as [{role: 'user'|'assistant', content: string}, ...],
// oldest first, including the new message just sent (the caller appends
// it before calling this).
export async function getJarvisReply({ mode, history, memoryFacts = [], familyMemberId }) {
  if (!isJarvisConfigured()) {
    throw new Error('ANTHROPIC_API_KEY is not configured')
  }

  const tools = getToolsForMode(mode)
  const messages = history.map((m) => ({ role: m.role, content: m.content }))

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await getClient().messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: buildSystemPrompt(mode, memoryFacts),
      tools: tools.length > 0 ? tools : undefined,
      messages,
    })

    if (response.stop_reason !== 'tool_use') {
      const textBlock = response.content.find((block) => block.type === 'text')
      return textBlock ? textBlock.text : ''
    }

    // The model wants to call one or more tools: run them, then continue
    // the same request with the results so it can produce a final reply.
    messages.push({ role: 'assistant', content: response.content })
    const toolResults = []
    for (const block of response.content) {
      if (block.type !== 'tool_use') continue
      const result = await executeTool(block.name, block.input, { familyMemberId })
      toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result })
    }
    messages.push({ role: 'user', content: toolResults })
  }

  return "I ran into trouble finishing that — could you try rephrasing?"
}
