// Tests for the area registry (jarvis/areas.js). Pure logic — no database or
// server needed. All content here is synthetic.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  AREAS,
  GLOBAL_AREA,
  COMMON_TOOLS,
  validateAreaDefinition,
  isValidArea,
  listAreas,
  isAreaReadable,
  getToolsForArea,
  getProviderConfig,
  getSectionLabel,
} from '../jarvis/areas.js'

const REQUIRED = ['id', 'label', 'persona', 'sections', 'budget', 'tools', 'readableFrom']

test('the registry contains general, news and style', () => {
  assert.deepEqual(Object.keys(AREAS).sort(), ['general', 'news', 'style'])
})

test('every area defines all required fields and passes validation', () => {
  for (const area of Object.values(AREAS)) {
    for (const field of REQUIRED) assert.notEqual(area[field], undefined, `${area.id}.${field}`)
    assert.doesNotThrow(() => validateAreaDefinition(area))
  }
})

test('"global" is reserved and is not a selectable area', () => {
  assert.equal(isValidArea(GLOBAL_AREA), false)
  assert.throws(
    () => validateAreaDefinition({ ...AREAS.general, id: GLOBAL_AREA }),
    /reserved/,
  )
})

test('listAreas exposes only id and label', () => {
  assert.deepEqual(listAreas(), [
    { id: 'general', label: 'General' },
    { id: 'news', label: 'News' },
    { id: 'style', label: 'Style' },
  ])
})

test('general declares no area sections, so no Notebook area data can reach it', () => {
  assert.deepEqual(AREAS.general.sections, {})
})

test('Style core is exactly budget, sizes/fit and physical profile', () => {
  const core = Object.entries(AREAS.style.sections)
    .filter(([, s]) => s.tier === 'core')
    .map(([slug]) => slug)
    .sort()
  assert.deepEqual(core, ['budget', 'physical-profile', 'sizes-fit'])
})

test('News and Style declare exactly the agreed sections', () => {
  assert.deepEqual(Object.keys(AREAS.news.sections).sort(), [
    'company-deep-dive',
    'company-profiles',
    'profile',
    'rules',
    'scoreboard',
    'term-bank',
    'threads',
    'watchlist',
  ])
  assert.deepEqual(Object.keys(AREAS.style.sections).sort(), [
    'accessories',
    'budget',
    'perfumes',
    'physical-profile',
    'purchases-log',
    'rules',
    'sizes-fit',
    'wardrobe',
    'wishlist',
  ])
})

test('no Style core section is declared by any other area', () => {
  for (const slug of ['budget', 'sizes-fit', 'physical-profile']) {
    assert.equal(AREAS.news.sections[slug], undefined)
    assert.equal(AREAS.general.sections[slug], undefined)
  }
})

test('cross-area reading is disabled for the MVP: every readableFrom is empty', () => {
  for (const area of Object.values(AREAS)) assert.deepEqual(area.readableFrom, [])
})

test('isAreaReadable: own and global content only, unless readableFrom allows more', () => {
  assert.equal(isAreaReadable('style', 'style'), true)
  assert.equal(isAreaReadable('style', GLOBAL_AREA), true)
  assert.equal(isAreaReadable('general', 'style'), false)
  assert.equal(isAreaReadable('news', 'style'), false)
  assert.equal(isAreaReadable('style', 'news'), false)

  const registry = { ...AREAS, general: { ...AREAS.general, readableFrom: ['style'] } }
  assert.equal(isAreaReadable('general', 'style', registry), true)
})

test('remember_fact is available in every area', () => {
  for (const id of Object.keys(AREAS)) {
    const names = getToolsForArea(id).map((t) => t.name)
    assert.ok(names.includes('remember_fact'), id)
  }
  assert.equal(COMMON_TOOLS[0].parameters.type, 'object')
  assert.equal(COMMON_TOOLS[0].input_schema, undefined)
})

test('a new area (Study/Tasks) is just a new registry entry — the architecture accepts it unchanged', () => {
  const study = {
    id: 'study',
    label: 'Study',
    persona: 'Synthetic persona for a test area.',
    sections: { rules: { label: 'Study rules', tier: 'rules' }, notes: { label: 'Notes', tier: 'retrieve' } },
    budget: {},
    tools: [],
    readableFrom: [],
  }
  const tasks = {
    id: 'tasks',
    label: 'Tasks',
    persona: 'Synthetic persona for a test area.',
    sections: {},
    budget: {},
    tools: [{ name: 'add_task', description: 'd', parameters: { type: 'object', properties: {} } }],
    readableFrom: [],
  }
  assert.doesNotThrow(() => validateAreaDefinition(study))
  assert.doesNotThrow(() => validateAreaDefinition(tasks))

  const registry = { ...AREAS, study, tasks }
  assert.equal(isValidArea('study', registry), true)
  assert.deepEqual(
    getToolsForArea('tasks', registry).map((t) => t.name),
    ['remember_fact', 'add_task'],
  )
  assert.equal(getSectionLabel('study', 'notes', registry), 'Notes')
})

test('validateAreaDefinition rejects malformed entries', () => {
  const ok = { ...AREAS.general, id: 'demo' }
  assert.throws(() => validateAreaDefinition({ ...ok, persona: undefined }), /persona/)
  assert.throws(() => validateAreaDefinition({ ...ok, id: 'Bad Id' }), /Area id/)
  assert.throws(
    () => validateAreaDefinition({ ...ok, sections: { x: { label: 'X', tier: 'nonsense' } } }),
    /invalid tier/,
  )
  assert.throws(() => validateAreaDefinition({ ...ok, tools: 'nope' }), /arrays/)
})

test('getProviderConfig: all three areas offer Groq browser_search; only News overrides the model', () => {
  const news = getProviderConfig('news', 'groq')
  assert.equal(news.model, 'openai/gpt-oss-20b')
  assert.deepEqual(news.tools, [{ type: 'browser_search' }])

  for (const areaId of ['general', 'style']) {
    const config = getProviderConfig(areaId, 'groq')
    assert.equal(config.model, undefined, `${areaId} must not override the model`)
    assert.deepEqual(config.tools, [{ type: 'browser_search' }], areaId)
  }

  assert.deepEqual(getProviderConfig('news', 'anthropic'), {}, 'scoped to Groq only')
  assert.deepEqual(getProviderConfig('not-a-real-area', 'groq'), {})
})

test("News's provider config and persona are unchanged by extending search to General/Style (regression)", () => {
  assert.deepEqual(getProviderConfig('news', 'groq'), { model: 'openai/gpt-oss-20b', tools: [{ type: 'browser_search' }] })
  assert.match(AREAS.news.persona, /You are Jarvis in News mode/)
  assert.match(AREAS.news.persona, /search the web/)
})

test('personas: General and Style both say they CAN search the web (not just mention the phrase — a persona could say "cannot search the web" and still match a loose check)', () => {
  assert.match(AREAS.general.persona, /You can search the web/)
  assert.doesNotMatch(AREAS.general.persona, /cannot search|no live|do not currently have/i)
  assert.match(AREAS.style.persona, /You can search the web/)
  assert.doesNotMatch(AREAS.style.persona, /cannot search|no live|do not currently have/i)
})

test('personas: Style is explicit about staying in its domain and not over-sharing physical details in search queries', () => {
  assert.match(AREAS.style.persona, /Stay in Style/)
  assert.match(AREAS.style.persona, /belongs in News or General/)
  assert.match(AREAS.style.persona, /personal physical details/)
})

test('validateAreaDefinition: providerConfig is optional, but a malformed one is rejected', () => {
  const ok = { ...AREAS.general, id: 'demo' }
  assert.doesNotThrow(() => validateAreaDefinition(ok), 'no providerConfig at all is fine')
  assert.doesNotThrow(() => validateAreaDefinition({ ...ok, providerConfig: { groq: { model: 'x', tools: [{ type: 'browser_search' }] } } }))
  assert.throws(() => validateAreaDefinition({ ...ok, providerConfig: 'nope' }), /providerConfig must be an object/)
  assert.throws(() => validateAreaDefinition({ ...ok, providerConfig: { groq: 'nope' } }), /providerConfig\.groq must be an object/)
  assert.throws(() => validateAreaDefinition({ ...ok, providerConfig: { groq: { tools: 'nope' } } }), /tools must be an array/)
  assert.throws(() => validateAreaDefinition({ ...ok, providerConfig: { groq: { model: '' } } }), /model must be a non-empty string/)
})

test('section labels resolve for global and area sections, falling back to the slug', () => {
  assert.equal(getSectionLabel(GLOBAL_AREA, 'voice'), 'Voice behaviour')
  assert.equal(getSectionLabel('style', 'sizes-fit'), 'Sizes & Fit')
  assert.equal(getSectionLabel('style', 'unknown-slug'), 'unknown-slug')
})
