// Tests for the history window and budgets (jarvis/historyWindow.js,
// jarvis/budgets.js). Pure logic — no database or server needed.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { selectHistory, clipText, clipUserMessage } from '../jarvis/historyWindow.js'
import { DEFAULT_BUDGETS, estimateTokens, resolveBudgets, CHARS_PER_TOKEN } from '../jarvis/budgets.js'

const turn = (n, userText = `user ${n}`, assistantText = `assistant ${n}`) => [
  { role: 'user', content: userText },
  { role: 'assistant', content: assistantText },
]
const conversation = (turns, lastUser = 'the new question') => [
  ...Array.from({ length: turns }, (_, i) => turn(i)).flat(),
  { role: 'user', content: lastUser },
]

test('budgets: all limits live in one config and are positive integers', () => {
  for (const [key, value] of Object.entries(DEFAULT_BUDGETS)) {
    assert.ok(Number.isInteger(value) && value > 0, key)
  }
  assert.throws(() => {
    DEFAULT_BUDGETS.historyTokens = 1
  })
})

test('budgets: estimates are pessimistic and overrides layer over defaults', () => {
  assert.equal(estimateTokens(''), 0)
  assert.equal(estimateTokens('a'.repeat(30)), Math.ceil(30 / CHARS_PER_TOKEN))
  assert.equal(resolveBudgets({ coreTokens: 9 }).coreTokens, 9)
  assert.equal(resolveBudgets({ coreTokens: 9 }).historyTokens, DEFAULT_BUDGETS.historyTokens)
})

test('a short conversation is sent whole', () => {
  const messages = conversation(2)
  const result = selectHistory(messages)
  assert.deepEqual(result.messages, messages)
  assert.equal(result.droppedCount, 0)
  assert.equal(result.clippedCount, 0)
})

test('newest messages are kept first; the oldest fall away when the budget runs out', () => {
  const messages = [
    ...Array.from({ length: 30 }, (_, i) => turn(i, 'u'.repeat(300), 'a'.repeat(300))).flat(),
    { role: 'user', content: 'the new question' },
  ]
  const result = selectHistory(messages, { historyTokens: 700, maxOldMessageChars: 300 })
  assert.equal(result.messages.at(-1).content, 'the new question')
  assert.ok(result.messages.length < messages.length)
  assert.ok(result.droppedCount > 0)
  assert.ok(result.estimatedTokens <= 700 + estimateTokens('the new question'))
})

test('the selected history never starts with an assistant message, so turns stay complete', () => {
  // Choose a budget that would cut a turn in half.
  for (const historyTokens of [40, 80, 120, 200, 400]) {
    const result = selectHistory(conversation(10, 'question text here', 'answer text here'), { historyTokens })
    assert.equal(result.messages[0].role, 'user', `budget ${historyTokens}`)
    assert.equal(result.messages.at(-1).role, 'user')
  }
})

test('roles alternate: consecutive same-role messages (e.g. after a failed reply) are merged', () => {
  const messages = [
    { role: 'user', content: 'first attempt' },
    { role: 'user', content: 'second attempt' },
    { role: 'assistant', content: 'reply' },
    { role: 'user', content: 'follow-up' },
  ]
  const result = selectHistory(messages)
  assert.deepEqual(
    result.messages.map((m) => m.role),
    ['user', 'assistant', 'user'],
  )
  assert.equal(result.messages[0].content, 'first attempt\n\nsecond attempt')
})

test('very old content is clipped instead of sent whole; the most recent messages are not', () => {
  const long = 'z'.repeat(5000)
  const messages = [
    { role: 'user', content: long },
    { role: 'assistant', content: long },
    { role: 'user', content: long },
    { role: 'assistant', content: long },
    { role: 'user', content: 'now' },
  ]
  const result = selectHistory(messages, { historyTokens: 1e6, maxOldMessageChars: 100, recentUnclippedMessages: 2 })
  const [oldUser, oldAssistant, recentUser, recentAssistant] = result.messages
  assert.ok(oldUser.content.length <= 100 && oldUser.content.endsWith('…'))
  assert.ok(oldAssistant.content.length <= 100)
  // "Recent" = the newest message plus the one before it (2 unclipped):
  // that previous reply is sent whole, everything older is clipped.
  assert.equal(recentAssistant.content.length, 5000)
  assert.ok(recentUser.content.length <= 100 && recentUser.content.endsWith('…'))
  assert.equal(result.clippedCount, 3)
})

test('the history is capped to the newest N messages before anything else', () => {
  const messages = conversation(100)
  const result = selectHistory(messages, { historyTokens: 1e9, maxHistoryMessages: 6 })
  assert.ok(result.messages.length <= 6)
  assert.equal(result.messages.at(-1).content, 'the new question')
  assert.equal(result.droppedCount, messages.length - result.messages.length)
})

test('the newest message is always sent, even if it alone exceeds the history budget', () => {
  const result = selectHistory([{ role: 'user', content: 'q'.repeat(900) }], { historyTokens: 10 })
  assert.equal(result.messages.length, 1)
  assert.equal(result.messages[0].content.length, 900)
})

test('user message clipping: an over-long message is clipped to the cap, marked, and never longer', () => {
  const { text, clipped } = clipUserMessage('w'.repeat(DEFAULT_BUDGETS.maxUserMessageChars + 500))
  assert.equal(clipped, true)
  assert.equal(text.length, DEFAULT_BUDGETS.maxUserMessageChars)
  assert.ok(text.endsWith('…'))

  const short = clipUserMessage('hello')
  assert.deepEqual(short, { text: 'hello', clipped: false })
})

test('a huge newest message is clipped defensively even inside selectHistory', () => {
  const result = selectHistory([{ role: 'user', content: 'x'.repeat(DEFAULT_BUDGETS.maxUserMessageChars * 3) }])
  assert.equal(result.messages[0].content.length, DEFAULT_BUDGETS.maxUserMessageChars)
  assert.equal(result.clippedCount, 1)
})

test('clipText leaves text at or under the limit untouched', () => {
  assert.deepEqual(clipText('abc', 3), { text: 'abc', clipped: false })
  assert.equal(clipText('abcd', 3).text.length, 3)
})

test('non-chat rows and empty input are handled without throwing', () => {
  assert.deepEqual(selectHistory([]).messages, [])
  const result = selectHistory([{ role: 'system', content: 'ignored' }, { role: 'user', content: 'hi' }])
  assert.deepEqual(result.messages, [{ role: 'user', content: 'hi' }])
})
