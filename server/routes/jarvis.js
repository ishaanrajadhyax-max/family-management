import { Router } from 'express'
import { pool } from '../db.js'
import { DEFAULT_AREA, isValidArea, listAreas, getToolsForArea, getProviderConfig } from '../jarvis/areas.js'
import { getJarvisReply, isJarvisConfigured, getProviderInfo } from '../jarvis/llmProvider.js'
import { buildPrompt } from '../jarvis/promptBuilder.js'
import { selectHistory } from '../jarvis/historyWindow.js'
import { DEFAULT_BUDGETS } from '../jarvis/budgets.js'
import { loadKnowledge } from '../jarvis/knowledge/loadKnowledge.js'
import { recordUsage } from '../jarvis/usage.js'

const router = Router()

const CHANNELS = ['text', 'voice']

// Jarvis conversations are personal, unlike health data — there's no
// "admin can view everyone's" concept here. Every route below scopes
// strictly to req.user.id, including for the admin role.

function toConversationShape(row) {
  return {
    id: row.id,
    mode: row.mode,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toMessageShape(row) {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role,
    content: row.content,
    createdAt: row.created_at,
  }
}

// GET /api/jarvis/modes — available specialist modes (areas) and labels.
router.get('/modes', (_req, res) => {
  res.json(listAreas())
})

// GET /api/jarvis/conversations — the caller's own conversations, most
// recently active first.
router.get('/conversations', async (req, res, next) => {
  try {
    const result = await pool.query(
      'SELECT * FROM jarvis_conversations WHERE family_member_id = $1 ORDER BY updated_at DESC',
      [req.user.id],
    )
    res.json(result.rows.map(toConversationShape))
  } catch (err) {
    next(err)
  }
})

// POST /api/jarvis/conversations
// Body: { mode? } — defaults to 'general'.
router.post('/conversations', async (req, res, next) => {
  try {
    const mode = req.body.mode || DEFAULT_AREA
    if (!isValidArea(mode)) {
      return res.status(400).json({ error: `mode must be one of: ${listAreas().map((a) => a.id).join(', ')}` })
    }
    const result = await pool.query(
      `INSERT INTO jarvis_conversations (family_member_id, mode)
       VALUES ($1, $2)
       RETURNING *`,
      [req.user.id, mode],
    )
    res.status(201).json(toConversationShape(result.rows[0]))
  } catch (err) {
    next(err)
  }
})

async function loadOwnConversation(conversationId, userId) {
  const result = await pool.query('SELECT * FROM jarvis_conversations WHERE id = $1', [conversationId])
  if (result.rowCount === 0) return { conversation: null, forbidden: false }
  if (result.rows[0].family_member_id !== userId) return { conversation: null, forbidden: true }
  return { conversation: result.rows[0], forbidden: false }
}

// GET /api/jarvis/conversations/:id/messages
router.get('/conversations/:id/messages', async (req, res, next) => {
  try {
    const { conversation, forbidden } = await loadOwnConversation(req.params.id, req.user.id)
    if (forbidden) return res.status(403).json({ error: 'Not authorized to view this conversation' })
    if (!conversation) return res.status(404).json({ error: 'Conversation not found' })

    const result = await pool.query(
      'SELECT * FROM jarvis_messages WHERE conversation_id = $1 ORDER BY created_at ASC',
      [req.params.id],
    )
    res.json(result.rows.map(toMessageShape))
  } catch (err) {
    next(err)
  }
})

// POST /api/jarvis/conversations/:id/messages
// Body: { content, channel? } — channel is 'text' (default) or 'voice'.
// Persists the user's message, asks Jarvis for a reply, persists that too,
// and returns both. The prompt is assembled from bounded layers (see
// jarvis/promptBuilder.js) and only a bounded window of the conversation
// is sent to the model (jarvis/historyWindow.js) — the full history stays
// stored and visible.
router.post('/conversations/:id/messages', async (req, res, next) => {
  try {
    const { conversation, forbidden } = await loadOwnConversation(req.params.id, req.user.id)
    if (forbidden) return res.status(403).json({ error: 'Not authorized to post in this conversation' })
    if (!conversation) return res.status(404).json({ error: 'Conversation not found' })
    if (!isValidArea(conversation.mode)) {
      return res.status(400).json({ error: 'This conversation uses a mode that is no longer available.' })
    }

    const content = (req.body.content || '').trim()
    if (!content) {
      return res.status(400).json({ error: 'content is required' })
    }
    // Rejected outright rather than silently truncated, so what's stored
    // is exactly what the user typed and what the model sees.
    if (content.length > DEFAULT_BUDGETS.maxUserMessageChars) {
      return res.status(400).json({
        error: `Message is too long (max ${DEFAULT_BUDGETS.maxUserMessageChars} characters).`,
      })
    }
    const channel = req.body.channel ?? 'text'
    if (!CHANNELS.includes(channel)) {
      return res.status(400).json({ error: `channel must be one of: ${CHANNELS.join(', ')}` })
    }

    // Checked after validation, before anything is written: a bad request
    // should always fail the same way regardless of whether the AI
    // backend happens to be configured yet.
    if (!isJarvisConfigured()) {
      return res.status(503).json({ error: 'AI chat is not configured yet. Set an API key for the active LLM_PROVIDER.' })
    }

    const userMessageResult = await pool.query(
      `INSERT INTO jarvis_messages (conversation_id, role, content)
       VALUES ($1, 'user', $2)
       RETURNING *`,
      [req.params.id, content],
    )

    // Only the newest messages are read (newest-first, then reversed into
    // chronological order); historyWindow trims that to the token budget.
    const historyResult = await pool.query(
      `SELECT role, content FROM jarvis_messages
       WHERE conversation_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [req.params.id, DEFAULT_BUDGETS.maxHistoryMessages],
    )
    const recentRows = historyResult.rows.reverse()
    const history = selectHistory(recentRows)
    // The user message before the one being answered, so a follow-up like
    // "what about the blue one?" still retrieves the right entries.
    const previousUserMessage = recentRows.filter((m) => m.role === 'user').at(-2)?.content

    // Notebook layers (always-on rules/core + entries relevant to this and
    // the previous message). loadKnowledge owns all SQL and degrades to
    // empty layers on failure, so chat never depends on it.
    const knowledge = await loadKnowledge({
      ownerId: req.user.id,
      areaId: conversation.mode,
      queryText: content,
      previousQueryText: previousUserMessage,
    })

    // Most recent facts first, capped — a short list injected into the
    // system prompt, not a retrieval/RAG system (see jarvis_memory in
    // db/migrations/004_jarvis.sql for why it's deliberately this simple).
    // Memory and the Notebook stay separate systems: remember_fact only
    // ever writes jarvis_memory.
    const memoryResult = await pool.query(
      'SELECT content FROM jarvis_memory WHERE family_member_id = $1 ORDER BY updated_at DESC LIMIT 30',
      [req.user.id],
    )

    const prompt = buildPrompt({
      areaId: conversation.mode,
      channel,
      ...knowledge,
      memoryFacts: memoryResult.rows.map((r) => r.content).reverse(),
    })

    // Provider-specific request overrides for this area (currently: News's
    // Groq browser_search tool and the model it runs on). Empty for every
    // other area/provider combination, so this is always safe to pass.
    const providerConfig = getProviderConfig(conversation.mode, getProviderInfo().provider)

    const reply = await getJarvisReply({
      systemPrompt: prompt.systemPrompt,
      history: history.messages,
      tools: getToolsForArea(conversation.mode),
      familyMemberId: req.user.id,
      providerConfig,
    })

    const assistantMessageResult = await pool.query(
      `INSERT INTO jarvis_messages (conversation_id, role, content)
       VALUES ($1, 'assistant', $2)
       RETURNING *`,
      [req.params.id, reply.text],
    )

    // Counts only — never any prompt/Notebook/memory/conversation text.
    // model comes from the reply itself, not the provider's static
    // default: News can run on a different model than General/Style (see
    // providerConfig above), so what was actually used must be recorded,
    // not assumed.
    await recordUsage({
      ownerId: req.user.id,
      conversationId: req.params.id,
      provider: getProviderInfo().provider,
      model: reply.model ?? getProviderInfo().model,
      area: conversation.mode,
      estimatedPromptTokens: prompt.estimatedTokens + history.estimatedTokens,
      usage: reply.usage,
    })

    await pool.query('UPDATE jarvis_conversations SET updated_at = now() WHERE id = $1', [req.params.id])

    // First message in a conversation also sets its title, so the
    // sidebar has something better than "Untitled" without a separate
    // naming step.
    if (!conversation.title) {
      const title = content.length > 60 ? `${content.slice(0, 57)}...` : content
      await pool.query('UPDATE jarvis_conversations SET title = $1 WHERE id = $2', [title, req.params.id])
    }

    res.status(201).json({
      userMessage: toMessageShape(userMessageResult.rows[0]),
      assistantMessage: toMessageShape(assistantMessageResult.rows[0]),
    })
  } catch (err) {
    next(err)
  }
})

function toMemoryShape(row) {
  return { id: row.id, content: row.content, createdAt: row.created_at }
}

// GET /api/jarvis/memory — what Jarvis currently remembers about the
// caller, most recent first. Lets them see (and, via DELETE below,
// remove) what's being fed into every conversation's system prompt,
// rather than memory being an invisible black box.
router.get('/memory', async (req, res, next) => {
  try {
    const result = await pool.query(
      'SELECT * FROM jarvis_memory WHERE family_member_id = $1 ORDER BY updated_at DESC',
      [req.user.id],
    )
    res.json(result.rows.map(toMemoryShape))
  } catch (err) {
    next(err)
  }
})

// DELETE /api/jarvis/memory/:id
router.delete('/memory/:id', async (req, res, next) => {
  try {
    const result = await pool.query(
      'DELETE FROM jarvis_memory WHERE id = $1 AND family_member_id = $2 RETURNING id',
      [req.params.id, req.user.id],
    )
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Memory entry not found' })
    }
    res.status(204).end()
  } catch (err) {
    next(err)
  }
})

export default router
