// Orchestrates loading Notebook knowledge for one chat request and returns
// the layers promptBuilder expects. This is the only place the chat route
// touches the knowledge system, so the route never sees SQL:
//
//   always-on   global rules + voice rules + global core, and the current
//               area's rules + core            (retrieve.js: loadAlwaysOn)
//   dynamic     entries relevant to the current and previous user message,
//               ranked and budget-limited      (retrieve.js: retrieveEntries)
//
// Each part degrades independently. If either fails (say the table is
// missing because a migration hasn't been applied there), chat continues
// with whatever succeeded — down to the plain persona + memory prompt —
// and the failure is logged by error CODE only: never a message, query
// text, or any Notebook content.
import { pool } from '../../db.js'
import { loadAlwaysOn, retrieveEntries } from './retrieve.js'

function logDegraded(stage, err) {
  console.warn(`Jarvis knowledge ${stage} failed; continuing without it (${err?.code || err?.name || 'error'})`)
}

// Each returned item is { area, section, title, body, snapshotAt, sourceRef, ... }.
export async function loadKnowledge({ ownerId, areaId, queryText, previousQueryText, db = pool }) {
  const layers = {
    globalRules: [],
    voiceRules: [],
    globalCore: [],
    areaRules: [],
    areaCore: [],
    entries: [],
  }
  try {
    Object.assign(layers, await loadAlwaysOn({ ownerId, areaId, db }))
  } catch (err) {
    logDegraded('always-on load', err)
  }
  try {
    layers.entries = await retrieveEntries({ ownerId, areaId, queryText, previousQueryText, db })
  } catch (err) {
    logDegraded('retrieval', err)
  }
  return layers
}
