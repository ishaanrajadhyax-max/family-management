import { verifyToken } from '../auth/jwt.js'
import { pool } from '../db.js'

// Reads the session cookie, verifies it, and attaches the identity to
// req.user for every route mounted after this middleware. Rejects with 401
// if there's no valid session — every health-data route relies on this
// running first, not on anything the frontend claims about who's asking.
//
// Also re-checks is_active on every request (not just at login). A JWT is
// otherwise valid for 30 days regardless of what happens afterward, so
// without this, disabling someone's account wouldn't actually take effect
// until their session happened to expire — "disabled" should mean
// disabled immediately, not "can't start a new session."
export async function requireAuth(req, res, next) {
  const token = req.cookies?.token
  if (!token) {
    return res.status(401).json({ error: 'Not authenticated' })
  }
  try {
    req.user = verifyToken(token)
  } catch {
    return res.status(401).json({ error: 'Invalid or expired session' })
  }

  try {
    const result = await pool.query('SELECT is_active FROM family_members WHERE id = $1', [req.user.id])
    const member = result.rows[0]
    if (!member || !member.is_active) {
      return res.status(401).json({ error: 'This account has been disabled.' })
    }
    next()
  } catch (err) {
    next(err)
  }
}

// For routes that must be admin-only (e.g. listing every family member).
// Must run after requireAuth.
export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' })
  }
  next()
}
