// The area registry. An "area" is one specialist mode of Jarvis
// (General, News, Style today; Study and Tasks later): its persona, which
// Notebook sections it may see and how, its own budget overrides, its
// tools, and which OTHER areas' knowledge it may read.
//
// Adding an area later is adding one entry here — validateAreaDefinition
// checks its shape — plus importing its sections. No route, prompt-builder,
// or provider change is needed. (Tasks, which is stateful rather than
// knowledge-based, would additionally bring its own tables and tools; the
// `tools` field and jarvis/toolExecutor.js are where those plug in.)
//
// This file holds STRUCTURE only: ids, labels, generic personas, section
// names, and tiers. No personal Notebook content ever lives in source —
// the actual rules, profile, and entries are imported into the database
// (jarvis_knowledge) and loaded at request time.

// Where content that applies to every area lives (general identity/basic
// profile, global rules, global voice behaviour). Not selectable as a mode.
export const GLOBAL_AREA = 'global'

// What kind of Notebook content a section holds, and therefore how the
// prompt uses it:
//   rules    - instructions from the user; always included, never dropped
//   core     - small, high-value reference facts; always included
//   retrieve - reference entries fetched per request within a token budget
export const SECTION_TIERS = ['rules', 'core', 'retrieve']

export const GLOBAL_SECTIONS = {
  rules: { label: 'Global rules', tier: 'rules' },
  voice: { label: 'Voice behaviour', tier: 'rules' },
  core: { label: 'General profile', tier: 'core' },
}

// Tools available in every area regardless of its own list. remember_fact
// is how persistent conversational memory (jarvis_memory) gets written —
// the model decides something is worth keeping and calls it. Definitions
// are provider-neutral ({name, description, parameters as plain JSON
// Schema}); each provider adapter wraps them into its own wire format.
export const COMMON_TOOLS = [
  {
    name: 'remember_fact',
    description:
      "Save a fact, preference, or piece of context about this person that's worth recalling in " +
      'future conversations — not just this one. Use it when they share something durable (a ' +
      'preference, a recurring detail, an important fact about their life), not for one-off details ' +
      "that only matter to the current message.",
    parameters: {
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

export const AREAS = {
  general: {
    id: 'general',
    label: 'General',
    persona:
      'You are Jarvis, a warm, capable personal AI assistant. Be concise ' +
      'and direct, but personable — this is a private assistant for one ' +
      'person, not a customer support bot. Answer plainly; ask a brief ' +
      'clarifying question only when you genuinely need one to help.',
    // General sees only global rules/core — no area sections, so no
    // Style (or any other area's) data can reach it.
    sections: {},
    budget: {},
    tools: [],
    readableFrom: [],
  },
  news: {
    id: 'news',
    label: 'News',
    persona:
      'You are Jarvis in News mode. You do not currently have live ' +
      "internet access, so if asked about breaking or very recent events, " +
      'say plainly that you cannot check the live news right now rather ' +
      'than guessing or presenting stale training data as current. Where ' +
      'you can help (explaining context, summarizing what you do know, ' +
      'discussing a topic), do so concisely.',
    sections: {
      rules: { label: 'News rules', tier: 'rules' },
      profile: { label: 'News profile', tier: 'core' },
      threads: { label: 'Threads', tier: 'retrieve' },
      'term-bank': { label: 'Term Bank', tier: 'retrieve' },
      watchlist: { label: 'Watchlist', tier: 'retrieve' },
      scoreboard: { label: 'Scoreboard', tier: 'retrieve' },
      'company-deep-dive': { label: 'Company Deep Dive', tier: 'retrieve' },
      'company-profiles': { label: 'Company Profiles', tier: 'retrieve' },
    },
    budget: {},
    // Empty for the MVP. A real live-search tool (definition here, handler
    // in jarvis/toolExecutor.js) is the only change needed to give this
    // area live results later.
    tools: [],
    readableFrom: [],
  },
  style: {
    id: 'style',
    label: 'Style',
    persona:
      'You are Jarvis in Style mode — a thoughtful advisor on fashion, ' +
      'grooming, and personal presentation. Be specific and practical ' +
      '(concrete items, combinations, occasions) rather than generic. ' +
      'Ask about context (occasion, weather, existing wardrobe) when it ' +
      'would meaningfully change your answer.',
    sections: {
      rules: { label: 'Style rules', tier: 'rules' },
      budget: { label: 'Budget', tier: 'core' },
      'sizes-fit': { label: 'Sizes & Fit', tier: 'core' },
      'physical-profile': { label: 'Physical Profile', tier: 'core' },
      wardrobe: { label: 'Wardrobe', tier: 'retrieve' },
      wishlist: { label: 'Wishlist', tier: 'retrieve' },
      perfumes: { label: 'Perfumes', tier: 'retrieve' },
      accessories: { label: 'Accessories', tier: 'retrieve' },
      'purchases-log': { label: 'Purchases Log', tier: 'retrieve' },
    },
    // Style's always-on core (budget, sizes, physical profile) is bigger
    // than the default.
    budget: { coreTokens: 600 },
    tools: [],
    readableFrom: [],
  },
}

export const DEFAULT_AREA = 'general'

const REQUIRED_FIELDS = ['id', 'label', 'persona', 'sections', 'budget', 'tools', 'readableFrom']

// Throws on a malformed definition, so a bad registry entry fails loudly at
// startup (and in tests) instead of misbehaving at request time.
export function validateAreaDefinition(def) {
  for (const field of REQUIRED_FIELDS) {
    if (def[field] === undefined || def[field] === null) {
      throw new Error(`Area definition is missing required field "${field}"`)
    }
  }
  if (typeof def.id !== 'string' || !/^[a-z][a-z0-9-]*$/.test(def.id)) {
    throw new Error(`Area id "${def.id}" must be lowercase letters/digits/hyphens`)
  }
  if (def.id === GLOBAL_AREA) {
    throw new Error(`"${GLOBAL_AREA}" is reserved for cross-area content and cannot be an area id`)
  }
  if (typeof def.persona !== 'string' || !def.persona.trim()) {
    throw new Error(`Area "${def.id}" needs a non-empty persona`)
  }
  for (const [slug, section] of Object.entries(def.sections)) {
    if (!SECTION_TIERS.includes(section?.tier)) {
      throw new Error(`Area "${def.id}" section "${slug}" has invalid tier "${section?.tier}"`)
    }
    if (typeof section.label !== 'string' || !section.label) {
      throw new Error(`Area "${def.id}" section "${slug}" needs a label`)
    }
  }
  if (!Array.isArray(def.tools) || !Array.isArray(def.readableFrom)) {
    throw new Error(`Area "${def.id}" tools and readableFrom must be arrays`)
  }
  return def
}

for (const def of Object.values(AREAS)) validateAreaDefinition(def)

export function isValidArea(id, registry = AREAS) {
  return Object.prototype.hasOwnProperty.call(registry, id)
}

export function getArea(id, registry = AREAS) {
  return isValidArea(id, registry) ? registry[id] : null
}

export function listAreas(registry = AREAS) {
  return Object.values(registry).map(({ id, label }) => ({ id, label }))
}

// May content owned by `sourceArea` appear in a prompt for `areaId`?
// Global content is visible everywhere; an area sees its own content;
// anything else requires an explicit `readableFrom` entry. Cross-area
// reading is disabled for the MVP (every readableFrom is empty), but this
// is the single place that will decide it later.
export function isAreaReadable(areaId, sourceArea, registry = AREAS) {
  if (sourceArea === GLOBAL_AREA) return true
  if (sourceArea === areaId) return true
  const area = getArea(areaId, registry)
  return Boolean(area && area.readableFrom.includes(sourceArea))
}

export function getToolsForArea(areaId, registry = AREAS) {
  const area = getArea(areaId, registry)
  return [...COMMON_TOOLS, ...(area ? area.tools : [])]
}

// Human label for a section slug within an area (falls back to the slug).
export function getSectionLabel(areaId, sectionSlug, registry = AREAS) {
  if (areaId === GLOBAL_AREA) return GLOBAL_SECTIONS[sectionSlug]?.label ?? sectionSlug
  return getArea(areaId, registry)?.sections?.[sectionSlug]?.label ?? sectionSlug
}
