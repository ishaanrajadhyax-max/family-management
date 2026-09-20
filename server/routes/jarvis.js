import { Router } from 'express'
import { pool } from '../db.js'
import { JARVIS_MODES, DEFAULT_JARVIS_MODE, isValidJarvisMode } from '../jarvis/modes.js'
import { getJarvisReply, isJarvisConfigured } from '../jarvis/anthropicClient.js'

const router = Router()

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

// GET /api/jarvis/modes — available specialist modes and their labels.
router.get('/modes', (_req, res) => {
  res.json(
    Object.entries(JARVIS_MODES).map(([id, config]) => ({ id, label: config.label })),
  )
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
    const mode = req.body.mode || DEFAULT_JARVIS_MODE
    if (!isValidJarvisMode(mode)) {
      return res.status(400).json({ error: `mode must be one of: ${Object.keys(JARVIS_MODES).join(', ')}` })
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
// Body: { content }. Persists the user's message, asks Jarvis for a reply
// (grounded in this conversation's history), persists that too, and
// returns both.
router.post('/conversations/:id/messages', async (req, res, next) => {
  try {
    const { conversation, forbidden } = await loadOwnConversation(req.params.id, req.user.id)
    if (forbidden) return res.status(403).json({ error: 'Not authorized to post in this conversation' })
    if (!conversation) return res.status(404).json({ error: 'Conversation not found' })

    const content = (req.body.content || '').trim()
    if (!content) {
      return res.status(400).json({ error: 'content is required' })
    }

    // Checked after validation, before anything is written: a bad request
    // should always fail the same way regardless of whether the AI
    // backend happens to be configured yet.
    if (!isJarvisConfigured()) {
      return res.status(503).json({ error: 'AI chat is not configured yet — ANTHROPIC_API_KEY is missing.' })
    }

    const userMessageResult = await pool.query(
      `INSERT INTO jarvis_messages (conversation_id, role, content)
       VALUES ($1, 'user', $2)
       RETURNING *`,
      [req.params.id, content],
    )

    const historyResult = await pool.query(
      'SELECT role, content FROM jarvis_messages WHERE conversation_id = $1 ORDER BY created_at ASC',
      [req.params.id],
    )

    // Memory injection point for Day 2 — empty for now (see
    // jarvis/anthropicClient.js's buildSystemPrompt).
    const replyText = await getJarvisReply({
      mode: conversation.mode,
      history: historyResult.rows,
    })

    const assistantMessageResult = await pool.query(
      `INSERT INTO jarvis_messages (conversation_id, role, content)
       VALUES ($1, 'assistant', $2)
       RETURNING *`,
      [req.params.id, replyText],
    )

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

export default router
