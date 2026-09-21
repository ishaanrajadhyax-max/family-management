// Groq provider adapter — implements the provider contract consumed by
// jarvis/llmProvider.js:
//   isConfigured()
//   getReply({ systemPrompt, history, tools, familyMemberId }) -> { text, usage }
//   info() -> { provider, model }
// The system prompt arrives already assembled (jarvis/promptBuilder.js), so
// nothing here knows about areas, Notebook layers, or memory. Talks to
// Groq's OpenAI-compatible Chat Completions API directly over fetch (no
// SDK dependency; Node 20+ ships fetch natively). Default provider for the
// ₹0-mandatory-cost deployment goal — Groq has a free tier.
import { executeTool } from '../toolExecutor.js'
import { emptyUsage, addUsage } from '../usage.js'

const API_URL = 'https://api.groq.com/openai/v1/chat/completions'
// Overridable without a code change — Groq's hosted model catalog shifts
// over time, and this default may need to move with it. Chosen against
// Groq's docs (rate-limits page, Free Plan table): openai/gpt-oss-120b is
// a production-status model with documented tool use that is on the free
// plan. llama-3.3-70b-versatile is still listed as production and
// supports tools, but is NOT in the free-plan table (it's paid/enterprise
// only there), which would break the ₹0 goal. openai/gpt-oss-20b has the
// same free limits and is a lighter fallback via GROQ_MODEL.
const MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b'
const MAX_TOKENS = 1024
// Mirrors Anthropic adapter's tool-use round cap — see its comment.
const MAX_TOOL_ROUNDS = 3

export function isConfigured() {
  return Boolean(process.env.GROQ_API_KEY)
}

export function info() {
  return { provider: 'groq', model: MODEL }
}

// The OpenAI-compatible tools param wants {type:'function', function:{...}},
// not the neutral {name, description, parameters} shape the registry stores.
function toGroqTools(neutralTools) {
  return neutralTools.map((t) => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }))
}

async function callGroq(messages, tools) {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      messages,
      tools: tools.length > 0 ? tools : undefined,
    }),
  })
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    const message = body?.error?.message || `Groq request failed with status ${response.status}`
    throw new Error(message)
  }
  return body
}

function usageFrom(data) {
  const u = data?.usage
  if (!u) return emptyUsage()
  return {
    promptTokens: u.prompt_tokens ?? null,
    completionTokens: u.completion_tokens ?? null,
    totalTokens: u.total_tokens ?? null,
  }
}

// `history` is the (already windowed) conversation as
// [{role: 'user'|'assistant', content: string}, ...], oldest first,
// including the message being answered.
export async function getReply({ systemPrompt, history, tools = [], familyMemberId }) {
  if (!isConfigured()) {
    throw new Error('GROQ_API_KEY is not configured')
  }

  const groqTools = toGroqTools(tools)
  // Unlike Anthropic's separate top-level `system` param, OpenAI-compatible
  // APIs take the system prompt as the first message in the array.
  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.map((m) => ({ role: m.role, content: m.content })),
  ]
  let usage = emptyUsage()

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const data = await callGroq(messages, groqTools)
    usage = addUsage(usage, usageFrom(data))
    const choice = data.choices?.[0]
    const message = choice?.message

    if (choice?.finish_reason !== 'tool_calls' || !message?.tool_calls?.length) {
      return { text: message?.content ?? '', usage }
    }

    // The model wants to call one or more tools: run them, then continue
    // the same request with the results so it can produce a final reply.
    // Tool call arguments arrive as a JSON *string* here, unlike
    // Anthropic's pre-parsed object — must be parsed before use.
    messages.push(message)
    for (const call of message.tool_calls) {
      let input = {}
      try {
        input = JSON.parse(call.function.arguments)
      } catch {
        input = {}
      }
      const result = await executeTool(call.function.name, input, { familyMemberId })
      messages.push({ role: 'tool', tool_call_id: call.id, content: result })
    }
  }

  return { text: "I ran into trouble finishing that — could you try rephrasing?", usage }
}
