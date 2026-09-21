// Token-usage bookkeeping. Providers report what the API actually
// returned; the route records it so budgets (budgets.js) can later be
// tuned from real numbers rather than assumptions. Only counts are ever
// stored — never prompt text, Notebook text, memory text, or any other
// conversation content.
import { pool } from '../db.js'

export function emptyUsage() {
  return { promptTokens: null, completionTokens: null, totalTokens: null }
}

function addNullable(a, b) {
  if (a == null && b == null) return null
  return (a ?? 0) + (b ?? 0)
}

// Sums usage across the rounds of one reply (a tool-use round trip is
// several API calls). Stays null for any field the provider never reported.
export function addUsage(total, part) {
  return {
    promptTokens: addNullable(total.promptTokens, part.promptTokens),
    completionTokens: addNullable(total.completionTokens, part.completionTokens),
    totalTokens: addNullable(total.totalTokens, part.totalTokens),
  }
}

// Best-effort: a failure to record usage must never fail the user's reply
// (e.g. a database that hasn't had migration 005 applied yet), so this
// logs a content-free warning and moves on.
export async function recordUsage({ ownerId, conversationId, provider, model, area, estimatedPromptTokens, usage }) {
  try {
    await pool.query(
      `INSERT INTO jarvis_usage
         (owner_user_id, conversation_id, provider, model, area,
          estimated_prompt_tokens, actual_prompt_tokens, actual_completion_tokens, actual_total_tokens)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        ownerId,
        conversationId,
        provider,
        model,
        area,
        estimatedPromptTokens,
        usage.promptTokens,
        usage.completionTokens,
        usage.totalTokens,
      ],
    )
  } catch (err) {
    console.warn(`Could not record Jarvis usage: ${err.code || err.message}`)
  }
}
