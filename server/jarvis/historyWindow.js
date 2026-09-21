// Chooses how much of a conversation to send to the model. The whole
// history stays stored and visible in the UI; only what goes into the
// prompt is bounded, so a long chat can't blow through Groq's free-plan
// token limits. All limits come from budgets.js.
//
// Rules:
//   - newest messages first: walk back from the latest until the history
//     budget is spent;
//   - the newest message is always sent (clipped defensively if huge);
//   - everything except the most recent few messages is clipped to a
//     maximum length rather than sent whole;
//   - consecutive same-role messages are merged (a failed earlier call can
//     leave two user messages in a row, which some providers reject);
//   - the window never starts with an assistant message — that would be
//     half of a turn whose user side was cut off — so complete turns
//     survive and orphaned replies are dropped.
import { DEFAULT_BUDGETS, resolveBudgets, estimateTokens } from './budgets.js'

const ELLIPSIS = '…'

export function clipText(text, maxChars) {
  const s = String(text ?? '')
  if (s.length <= maxChars) return { text: s, clipped: false }
  return { text: `${s.slice(0, Math.max(0, maxChars - 1)).trimEnd()}${ELLIPSIS}`, clipped: true }
}

// The route rejects over-long incoming messages outright; this is the same
// cap applied defensively wherever a user message is sent onward.
export function clipUserMessage(text, maxChars = DEFAULT_BUDGETS.maxUserMessageChars) {
  return clipText(text, maxChars)
}

// `messages` is chronological, oldest first, [{role, content}], and is
// expected to end with the message currently being answered.
export function selectHistory(messages, budgetOverrides = {}) {
  const budgets = resolveBudgets(budgetOverrides)
  const usable = messages
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-budgets.maxHistoryMessages)

  let clippedCount = 0
  let used = 0
  const picked = [] // newest first

  for (let k = 0; k < usable.length; k++) {
    const original = usable[usable.length - 1 - k]
    const isNewest = k === 0
    const cap = isNewest
      ? budgets.maxUserMessageChars
      : k < budgets.recentUnclippedMessages
        ? Infinity
        : budgets.maxOldMessageChars
    const { text, clipped } = clipText(original.content, cap)
    const cost = estimateTokens(text)
    if (!isNewest && used + cost > budgets.historyTokens) break
    if (clipped) clippedCount += 1
    used += cost
    picked.push({ role: original.role, content: text, count: 1 })
  }

  picked.reverse()

  const merged = []
  for (const item of picked) {
    const last = merged[merged.length - 1]
    if (last && last.role === item.role) {
      last.content = `${last.content}\n\n${item.content}`
      last.count += item.count
    } else {
      merged.push({ ...item })
    }
  }

  while (merged.length > 1 && merged[0].role === 'assistant') merged.shift()

  const included = merged.reduce((n, m) => n + m.count, 0)
  const result = merged.map(({ role, content }) => ({ role, content }))
  return {
    messages: result,
    estimatedTokens: result.reduce((n, m) => n + estimateTokens(m.content), 0),
    droppedCount: usable.length - included + (messages.length - usable.length),
    clippedCount,
  }
}
