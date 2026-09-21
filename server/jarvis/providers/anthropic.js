// Anthropic provider adapter — implements the same contract as
// jarvis/providers/groq.js:
//   isConfigured()
//   getReply({ systemPrompt, history, tools, familyMemberId }) -> { text, usage }
//   info() -> { provider, model }
// The system prompt arrives already assembled (jarvis/promptBuilder.js);
// tool definitions arrive in the neutral {name, description, parameters}
// shape and are wrapped into Anthropic's own `input_schema` key here, at
// the edge.
import Anthropic from '@anthropic-ai/sdk'
import { executeTool } from '../toolExecutor.js'
import { emptyUsage, addUsage } from '../usage.js'

const MODEL = 'claude-sonnet-5'
const MAX_TOKENS = 1024
// A tool-use round trip (model asks for a tool -> we run it -> model
// replies using the result) can repeat if the model chains tool calls;
// capped so a confused model can't loop forever.
const MAX_TOOL_ROUNDS = 3

let client = null

export function isConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY)
}

export function info() {
  return { provider: 'anthropic', model: MODEL }
}

function getClient() {
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  }
  return client
}

// Anthropic's tools param wants `input_schema`, not the neutral
// `parameters` name the registry stores it under.
function toAnthropicTools(neutralTools) {
  return neutralTools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters,
  }))
}

function usageFrom(response) {
  const u = response?.usage
  if (!u) return emptyUsage()
  const input = u.input_tokens ?? null
  const output = u.output_tokens ?? null
  return {
    promptTokens: input,
    completionTokens: output,
    totalTokens: input == null && output == null ? null : (input ?? 0) + (output ?? 0),
  }
}

// `history` is the (already windowed) conversation as
// [{role: 'user'|'assistant', content: string}, ...], oldest first,
// including the message being answered.
export async function getReply({ systemPrompt, history, tools = [], familyMemberId }) {
  if (!isConfigured()) {
    throw new Error('ANTHROPIC_API_KEY is not configured')
  }

  const anthropicTools = toAnthropicTools(tools)
  const messages = history.map((m) => ({ role: m.role, content: m.content }))
  let usage = emptyUsage()

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await getClient().messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      tools: anthropicTools.length > 0 ? anthropicTools : undefined,
      messages,
    })
    usage = addUsage(usage, usageFrom(response))

    if (response.stop_reason !== 'tool_use') {
      const textBlock = response.content.find((block) => block.type === 'text')
      return { text: textBlock ? textBlock.text : '', usage }
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

  return { text: "I ran into trouble finishing that — could you try rephrasing?", usage }
}
