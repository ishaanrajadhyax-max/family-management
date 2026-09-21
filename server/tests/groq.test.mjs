// Mocked tests for the Groq adapter (jarvis/providers/groq.js). global
// fetch is stubbed, so no real Groq call is made and no key is needed. The
// remember_fact test uses the real local database (a throwaway family
// member fixture, same convention as the other suites) so it proves the
// JSON-string arguments actually reach the existing executeTool/Postgres
// logic — but it needs the local Postgres reachable, not the API server.
import { test, before, after, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { pool } from '../db.js'
import * as groq from '../jarvis/providers/groq.js'
import { getToolsForArea } from '../jarvis/areas.js'

const DEFAULT_MODEL = 'openai/gpt-oss-120b'
const RUN_ID = Date.now().toString(36)

let fixtureId
let originalFetch
let originalKey
let calls
let queue

before(async () => {
  const result = await pool.query(
    `INSERT INTO family_members (name, username, role, is_active)
     VALUES ($1, $2, 'dad', true) RETURNING id`,
    ['Test groq', `test_groq_${RUN_ID}`],
  )
  fixtureId = result.rows[0].id
})

after(async () => {
  // ON DELETE CASCADE removes the fixture's jarvis_memory rows too.
  await pool.query('DELETE FROM family_members WHERE id = $1', [fixtureId])
  await pool.end()
})

beforeEach(() => {
  originalFetch = globalThis.fetch
  originalKey = process.env.GROQ_API_KEY
  process.env.GROQ_API_KEY = 'test-groq-key'
  calls = []
  queue = []
  globalThis.fetch = async (url, options) => {
    // Snapshot at call time: the adapter mutates its messages array after
    // each call, and we want to assert what was actually sent.
    calls.push({ url, headers: options.headers, body: JSON.parse(options.body) })
    const next = queue.shift()
    if (!next) throw new Error('unexpected extra fetch call')
    return {
      ok: next.ok ?? true,
      status: next.status ?? 200,
      json: async () => next.json,
    }
  }
})

afterEach(() => {
  globalThis.fetch = originalFetch
  if (originalKey === undefined) delete process.env.GROQ_API_KEY
  else process.env.GROQ_API_KEY = originalKey
})

function textResponse(content) {
  return { json: { choices: [{ finish_reason: 'stop', message: { role: 'assistant', content } }] } }
}

function toolCallResponse(calls_) {
  return {
    json: {
      choices: [
        {
          finish_reason: 'tool_calls',
          message: {
            role: 'assistant',
            content: null,
            tool_calls: calls_.map((c, i) => ({
              id: c.id ?? `call_${i + 1}`,
              type: 'function',
              function: { name: c.name, arguments: c.arguments },
            })),
          },
        },
      ],
    },
  }
}

const history = [{ role: 'user', content: 'hello' }]
const SYSTEM_PROMPT = 'TEST SYSTEM PROMPT (assembled elsewhere)'
const TOOLS = getToolsForArea('general')

// The provider contract: { systemPrompt, history, tools, familyMemberId } -> { text, usage }.
function run(overrides = {}) {
  return groq.getReply({
    systemPrompt: SYSTEM_PROMPT,
    history,
    tools: TOOLS,
    familyMemberId: fixtureId,
    ...overrides,
  })
}

test('normal response: returns the assistant text and sends a correctly shaped request', async () => {
  queue.push(textResponse('Hi there'))

  const reply = await run()

  assert.equal(reply.text, 'Hi there')
  assert.equal(calls.length, 1)
  const { url, headers, body } = calls[0]
  assert.equal(url, 'https://api.groq.com/openai/v1/chat/completions')
  assert.equal(headers.Authorization, 'Bearer test-groq-key')
  assert.equal(body.model, process.env.GROQ_MODEL || DEFAULT_MODEL)

  // System prompt is the first message (not a top-level `system` param).
  assert.equal(body.system, undefined)
  assert.equal(body.messages[0].role, 'system')
  assert.equal(body.messages[0].content, SYSTEM_PROMPT)
  assert.deepEqual(body.messages.slice(1), [{ role: 'user', content: 'hello' }])

  // Tools are in OpenAI shape, with neutral `parameters` (no input_schema).
  assert.equal(body.tools.length, 1)
  assert.equal(body.tools[0].type, 'function')
  assert.equal(body.tools[0].function.name, 'remember_fact')
  assert.equal(body.tools[0].function.parameters.type, 'object')
  assert.deepEqual(body.tools[0].function.parameters.required, ['fact'])
  assert.equal(body.tools[0].input_schema, undefined)
})

test('the pre-assembled system prompt is passed through verbatim, and an empty tool list omits tools', async () => {
  queue.push(textResponse('ok'))

  await run({ systemPrompt: 'Exactly this prompt.', tools: [] })

  assert.equal(calls[0].body.messages[0].content, 'Exactly this prompt.')
  assert.equal(calls[0].body.tools, undefined)
})

test('usage: reports the provider-returned token counts', async () => {
  queue.push({
    json: {
      usage: { prompt_tokens: 120, completion_tokens: 30, total_tokens: 150 },
      choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: 'hi' } }],
    },
  })

  const reply = await run()

  assert.deepEqual(reply.usage, { promptTokens: 120, completionTokens: 30, totalTokens: 150 })
})

test('usage: is summed across the rounds of a tool-using reply', async () => {
  const marker = `Usage sum ${RUN_ID}`
  const first = toolCallResponse([{ name: 'remember_fact', arguments: JSON.stringify({ fact: marker }) }])
  first.json.usage = { prompt_tokens: 100, completion_tokens: 10, total_tokens: 110 }
  queue.push(first)
  queue.push({
    json: {
      usage: { prompt_tokens: 140, completion_tokens: 20, total_tokens: 160 },
      choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: 'done' } }],
    },
  })

  const reply = await run()

  assert.deepEqual(reply.usage, { promptTokens: 240, completionTokens: 30, totalTokens: 270 })
})

test('usage: stays null (not zero) when the provider reports none', async () => {
  queue.push(textResponse('no usage field'))

  const reply = await run()

  assert.deepEqual(reply.usage, { promptTokens: null, completionTokens: null, totalTokens: null })
})

test('the adapter reports its provider and model for usage recording', () => {
  assert.equal(groq.info().provider, 'groq')
  assert.equal(groq.info().model, process.env.GROQ_MODEL || DEFAULT_MODEL)
})

test('throws a clear error when GROQ_API_KEY is missing', async () => {
  delete process.env.GROQ_API_KEY
  assert.equal(groq.isConfigured(), false)
  await assert.rejects(() => run(), /GROQ_API_KEY/)
  assert.equal(calls.length, 0)
})

test('surfaces Groq API errors (e.g. rate limit) with the API-provided message', async () => {
  queue.push({ ok: false, status: 429, json: { error: { message: 'Rate limit reached' } } })
  await assert.rejects(
    () => run(),
    /Rate limit reached/,
  )
})

test('tool call detection + JSON-string argument parsing: remember_fact reaches the database', async () => {
  const marker = `Likes masala chai ${RUN_ID}`
  queue.push(toolCallResponse([{ name: 'remember_fact', arguments: JSON.stringify({ fact: marker }) }]))
  queue.push(textResponse('Noted.'))

  await run()

  // The model's tool call caused a second request (detected + executed).
  assert.equal(calls.length, 2)
  // The arguments arrived as a JSON *string* and were parsed before use:
  // the parsed `fact` value is what landed in jarvis_memory.
  const rows = await pool.query(
    'SELECT content FROM jarvis_memory WHERE family_member_id = $1 AND content = $2',
    [fixtureId, marker],
  )
  assert.equal(rows.rowCount, 1)
})

test('tool result threading: the follow-up request carries the assistant tool_calls message then a matching tool message', async () => {
  const marker = `Threading check ${RUN_ID}`
  queue.push(
    toolCallResponse([{ id: 'call_abc', name: 'remember_fact', arguments: JSON.stringify({ fact: marker }) }]),
  )
  queue.push(textResponse('Done.'))

  await run()

  const followUp = calls[1].body.messages
  // system, original user turn, assistant tool_calls turn, tool result.
  assert.equal(followUp.length, 4)
  assert.equal(followUp[0].role, 'system')
  assert.deepEqual(followUp[1], { role: 'user', content: 'hello' })
  assert.equal(followUp[2].role, 'assistant')
  assert.equal(followUp[2].tool_calls[0].id, 'call_abc')
  assert.equal(followUp[2].tool_calls[0].function.name, 'remember_fact')
  assert.deepEqual(followUp[3], { role: 'tool', tool_call_id: 'call_abc', content: 'Saved.' })
})

test('final response after remember_fact is the model text from the follow-up call', async () => {
  const marker = `Final response check ${RUN_ID}`
  queue.push(toolCallResponse([{ name: 'remember_fact', arguments: JSON.stringify({ fact: marker }) }]))
  queue.push(textResponse("Got it — I'll remember that."))

  const reply = await run()

  assert.equal(reply.text, "Got it — I'll remember that.")
  assert.equal(calls.length, 2)
})

test('multiple tool calls in one turn are each executed and each get their own tool message', async () => {
  const a = `Multi A ${RUN_ID}`
  const b = `Multi B ${RUN_ID}`
  queue.push(
    toolCallResponse([
      { id: 'call_a', name: 'remember_fact', arguments: JSON.stringify({ fact: a }) },
      { id: 'call_b', name: 'remember_fact', arguments: JSON.stringify({ fact: b }) },
    ]),
  )
  queue.push(textResponse('Both saved.'))

  const reply = await run()

  assert.equal(reply.text, 'Both saved.')
  const toolMessages = calls[1].body.messages.filter((m) => m.role === 'tool')
  assert.deepEqual(
    toolMessages.map((m) => m.tool_call_id),
    ['call_a', 'call_b'],
  )
  const rows = await pool.query(
    'SELECT content FROM jarvis_memory WHERE family_member_id = $1 AND content = ANY($2::text[])',
    [fixtureId, [a, b]],
  )
  assert.equal(rows.rowCount, 2)
})

test('malformed tool-call arguments do not crash the conversation', async () => {
  queue.push(toolCallResponse([{ name: 'remember_fact', arguments: '{not valid json' }]))
  queue.push(textResponse('Sorry, carrying on.'))

  const reply = await run()

  assert.equal(reply.text, 'Sorry, carrying on.')
})

test('a model that keeps calling tools is capped at 3 rounds instead of looping forever', async () => {
  for (let i = 0; i < 5; i++) {
    queue.push(toolCallResponse([{ name: 'remember_fact', arguments: JSON.stringify({ fact: `loop ${RUN_ID} ${i}` }) }]))
  }

  const reply = await run()

  assert.equal(calls.length, 3)
  assert.match(reply.text, /trouble finishing/)
})
