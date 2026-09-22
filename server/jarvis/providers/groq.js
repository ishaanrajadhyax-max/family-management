// Groq provider adapter — implements the provider contract consumed by
// jarvis/llmProvider.js:
//   isConfigured()
//   getReply({ systemPrompt, history, tools, familyMemberId, providerConfig }) -> { text, usage, model }
//   info() -> { provider, model }
// The system prompt arrives already assembled (jarvis/promptBuilder.js), so
// nothing here knows about areas, Notebook layers, or memory — EXCEPT for
// `providerConfig`, an optional, already-resolved bag of Groq-specific
// request overrides (currently: News's browser_search tool and the model it
// runs on) that jarvis/areas.js resolves by area and routes/jarvis.js
// passes through unchanged; this file never looks at an area id itself.
// Talks to Groq's OpenAI-compatible Chat Completions API directly over
// fetch (no SDK dependency; Node 20+ ships fetch natively). Default
// provider for the ₹0-mandatory-cost deployment goal — Groq has a free
// tier.
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
// same free limits and is a lighter fallback via GROQ_MODEL — and is also
// what News specifically uses for browser_search (see the area registry),
// on its own separate per-model rate-limit budget from this default.
const DEFAULT_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b'
const MAX_TOKENS = 1024
// Mirrors Anthropic adapter's tool-use round cap — see its comment.
const MAX_TOOL_ROUNDS = 3
// A 429 here is very plausibly transient rather than a real outage — a
// single browser_search call can use most of a model's free-tier
// per-minute token budget on its own (verified: one search used ~8-9k of
// an 8k TPM limit) — so a couple of quick retries turns a momentary rate
// limit into a short delay instead of an immediate, user-visible failure.
// Deliberately small and fixed ("basic"), not adaptive.
const RATE_LIMIT_MAX_RETRIES = 2
const RATE_LIMIT_BASE_DELAY_MS = 300

export function isConfigured() {
  return Boolean(process.env.GROQ_API_KEY)
}

export function info() {
  return { provider: 'groq', model: DEFAULT_MODEL }
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function callGroq(messages, tools, model) {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        max_tokens: MAX_TOKENS,
        messages,
        tools: tools.length > 0 ? tools : undefined,
      }),
    })
    if (response.status === 429 && attempt < RATE_LIMIT_MAX_RETRIES) {
      await sleep(RATE_LIMIT_BASE_DELAY_MS * (attempt + 1))
      continue
    }
    const body = await response.json().catch(() => null)
    if (!response.ok) {
      const message = body?.error?.message || `Groq request failed with status ${response.status}`
      throw new Error(message)
    }
    return body
  }
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

// Groq's browser_search occasionally cites sources with OpenAI-style inline
// bracket markers like 【2†L8-L11】 — not markdown, not meaningful to a
// reader, and not rendered as links by the chat UI. Simplest safe fix:
// remove them rather than exposing raw internal citation syntax. (A real
// source link could be built later from the URLs already present in the
// response's executed_tools[].output — not done here, to keep this change
// minimal.) The delimiters are the U+3010/U+3011 fullwidth brackets, chosen
// by OpenAI specifically because they're unlikely to appear in ordinary text.
const CITATION_MARKER = /【[^】]*】/g

export function cleanCitations(text) {
  return text
    .replace(CITATION_MARKER, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+([.,;:!?])/g, '$1')
    .trim()
}

// `history` is the (already windowed) conversation as
// [{role: 'user'|'assistant', content: string}, ...], oldest first,
// including the message being answered. `providerConfig` is optional and
// Groq-specific — `{ model?, tools? }`, already resolved for this area by
// jarvis/areas.js. Its `tools` are Groq-native built-in tool specs (e.g.
// `{ type: 'browser_search' }`), merged alongside — not instead of — the
// neutral function tools in `tools`.
export async function getReply({ systemPrompt, history, tools = [], familyMemberId, providerConfig = {} }) {
  if (!isConfigured()) {
    throw new Error('GROQ_API_KEY is not configured')
  }

  const model = providerConfig.model || DEFAULT_MODEL
  const groqTools = [...toGroqTools(tools), ...(providerConfig.tools ?? [])]
  // Unlike Anthropic's separate top-level `system` param, OpenAI-compatible
  // APIs take the system prompt as the first message in the array.
  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.map((m) => ({ role: m.role, content: m.content })),
  ]
  let usage = emptyUsage()

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const data = await callGroq(messages, groqTools, model)
    usage = addUsage(usage, usageFrom(data))
    const choice = data.choices?.[0]
    const message = choice?.message

    if (choice?.finish_reason !== 'tool_calls' || !message?.tool_calls?.length) {
      return { text: cleanCitations(message?.content ?? ''), usage, model }
    }

    // The model wants to call one or more tools: run them, then continue
    // the same request with the results so it can produce a final reply.
    // Built-in tools like browser_search never appear here — Groq resolves
    // them itself, server-side, before the response comes back (see
    // providerConfig above) — so every call this loop sees is one of our
    // own function tools (e.g. remember_fact), exactly as before
    // browser_search existed. Verified directly: a request offering both
    // together came back with browser_search already resolved and only
    // remember_fact in tool_calls.
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

  return { text: "I ran into trouble finishing that — could you try rephrasing?", usage, model }
}
