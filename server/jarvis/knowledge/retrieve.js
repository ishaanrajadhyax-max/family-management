// Notebook retrieval. Two separate jobs, both pure SQL against
// jarvis_knowledge with the owner filter and the area/section filter INSIDE
// the query (never only in JavaScript):
//
//   loadAlwaysOn     - the small always-included layers: global rules,
//                      global voice rules, global core, and the CURRENT
//                      area's rules and core. These are not "search
//                      results"; they don't count against the entry budget.
//   retrieveEntries  - the dynamic layer: entries relevant to the user's
//                      current (and previous) message, found with
//                      PostgreSQL full-text search, ranked, and trimmed to
//                      the knowledge token budget and a small entry count.
//
// No embeddings, no vector store, no external service. Nothing here logs
// Notebook text; failures are reported by code only, by the caller.
import { pool as defaultPool } from '../../db.js'
import { GLOBAL_AREA, GLOBAL_SECTIONS, getArea } from '../areas.js'
import { resolveBudgets } from '../budgets.js'

// Small on purpose: dropping filler words keeps the OR-query from matching
// half the Notebook on "the"/"what"/"my".
const STOPWORDS = new Set(
  (
    'a about above after again all also am an and any are as at be because been before being below ' +
    'between both but by can could did do does doing down during each few for from further get got ' +
    'had has have having he her here hers him his how i if in into is it its just like me more most ' +
    'my no nor not now of off on once only or other our ours out over own same she should so some ' +
    'such than that the their theirs them then there these they this those through to too under ' +
    'until up us very was we were what when where which while who whom why will with would you ' +
    'your yours please tell give show need want know think'
  ).split(' '),
)

const MAX_TERMS = 12
const MAX_ALIAS_CANDIDATES = 60

function tokenize(text) {
  return String(text ?? '')
    .toLowerCase()
    .match(/[\p{L}\p{N}]+/gu) ?? []
}

// Distinct meaningful words, in order of appearance, capped.
export function extractTerms(text, max = MAX_TERMS) {
  const seen = new Set()
  const terms = []
  for (const t of tokenize(text)) {
    if (t.length < 2 || STOPWORDS.has(t) || seen.has(t)) continue
    seen.add(t)
    terms.push(t)
    if (terms.length >= max) break
  }
  return terms
}

// Words and 2-3 word phrases from both messages, lowercased — matched
// exactly against the (lowercased) aliases column.
export function aliasCandidates(...texts) {
  const out = new Set()
  for (const text of texts) {
    const words = tokenize(text)
    for (let n = 1; n <= 3; n++) {
      for (let i = 0; i + n <= words.length; i++) {
        out.add(words.slice(i, i + n).join(' '))
        if (out.size >= MAX_ALIAS_CANDIDATES) return [...out]
      }
    }
  }
  return [...out]
}

const sectionsWithTiers = (table, tiers) =>
  Object.entries(table ?? {})
    .filter(([, s]) => tiers.includes(s.tier))
    .map(([slug]) => slug)

const toItem = (row) => ({
  area: row.area,
  section: row.section,
  title: row.title,
  body: row.body,
  snapshotAt: row.snapshot_at,
  sourceRef: row.source_ref,
  entryKey: row.entry_key,
})

export async function loadAlwaysOn({ ownerId, areaId, db = defaultPool }) {
  const empty = { globalRules: [], voiceRules: [], globalCore: [], areaRules: [], areaCore: [] }
  const area = getArea(areaId)
  if (!area) return empty

  const globalSections = Object.keys(GLOBAL_SECTIONS)
  const areaSections = sectionsWithTiers(area.sections, ['rules', 'core'])

  const res = await db.query(
    `SELECT area, section, kind, entry_key, title, body, snapshot_at, source_ref
       FROM jarvis_knowledge
      WHERE owner_user_id = $1
        AND kind IN ('rules', 'core')
        AND ( (area = $2 AND section = ANY($3::text[]))
           OR (area = $4 AND section = ANY($5::text[])) )
      ORDER BY area, kind, section, entry_key`,
    [ownerId, GLOBAL_AREA, globalSections, areaId, areaSections],
  )

  const out = { ...empty }
  for (const row of res.rows) {
    const item = toItem(row)
    if (row.area === GLOBAL_AREA) {
      if (row.kind === 'core') out.globalCore.push(item)
      else if (row.section === 'voice') out.voiceRules.push(item)
      else out.globalRules.push(item)
    } else if (row.kind === 'core') out.areaCore.push(item)
    else out.areaRules.push(item)
  }
  return out
}

export async function retrieveEntries({ ownerId, areaId, queryText, previousQueryText, db = defaultPool }) {
  const area = getArea(areaId)
  if (!area) return []
  const sections = sectionsWithTiers(area.sections, ['retrieve'])
  if (sections.length === 0) return []

  const budgets = resolveBudgets(area.budget)
  const current = extractTerms(queryText)
  const previous = extractTerms(previousQueryText)
  const aliases = aliasCandidates(queryText, previousQueryText)
  if (current.length === 0 && previous.length === 0 && aliases.length === 0) return []

  // Terms are OR-ed through websearch_to_tsquery ("a or b or c"), which is
  // safe by construction (it never raises a syntax error) — a plain AND
  // would return nothing for a natural-language sentence. The current
  // message counts double the previous one.
  const res = await db.query(
    `WITH q AS (
       SELECT websearch_to_tsquery('english', $4) AS cur,
              websearch_to_tsquery('english', $5) AS prev
     )
     SELECT k.area, k.section, k.entry_key, k.title, k.body, k.source_ref, k.snapshot_at,
            k.token_estimate,
            ( 2 * ts_rank_cd(k.search, q.cur)
                + ts_rank_cd(k.search, q.prev)
                + CASE WHEN k.aliases && $6::text[] THEN 1.0 ELSE 0.0 END ) AS score
       FROM jarvis_knowledge k, q
      WHERE k.owner_user_id = $1
        AND k.area = $2
        AND k.kind = 'entry'
        AND k.section = ANY($3::text[])
        AND ( k.search @@ q.cur OR k.search @@ q.prev OR k.aliases && $6::text[] )
      ORDER BY score DESC, k.entry_date DESC NULLS LAST, k.entry_key
      LIMIT $7`,
    [ownerId, areaId, sections, current.join(' or '), previous.join(' or '), aliases, budgets.maxRetrievedEntries * 2],
  )

  // Best-ranked first; an entry that doesn't fit what's left of the budget
  // is skipped so a smaller, lower-ranked one can still be used.
  const kept = []
  let remaining = budgets.knowledgeTokens
  for (const row of res.rows) {
    const cost = row.token_estimate + budgets.entryLabelOverheadTokens
    if (cost > remaining) continue
    kept.push({ ...toItem(row), rank: Number(row.score), tokenEstimate: row.token_estimate })
    remaining -= cost
    if (kept.length >= budgets.maxRetrievedEntries) break
  }
  return kept
}
