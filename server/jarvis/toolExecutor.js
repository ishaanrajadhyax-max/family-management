// Runs one tool call server-side. Shared by every provider adapter — this
// logic has never depended on which LLM asked for it, only on the tool
// `name` and `input` it decided to call with. remember_fact is the only
// tool that exists today, and it's how memory actually gets written — the
// model decides something is worth keeping and calls this; there's no
// separate "extract memories" pass. A future News search tool adds
// another case here, not a new code path per provider.
import { pool } from '../db.js'

export async function executeTool(name, input, { familyMemberId }) {
  if (name === 'remember_fact') {
    await pool.query('INSERT INTO jarvis_memory (family_member_id, content) VALUES ($1, $2)', [
      familyMemberId,
      String(input.fact ?? '').slice(0, 2000),
    ])
    return 'Saved.'
  }
  return `Unknown tool: ${name}`
}
