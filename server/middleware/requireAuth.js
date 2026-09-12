import { verifyToken } from '../auth/jwt.js'

// Reads the session cookie, verifies it, and attaches the identity to
// req.user for every route mounted after this middleware. Rejects with 401
// if there's no valid session — every health-data route relies on this
// running first, not on anything the frontend claims about who's asking.
export function requireAuth(req, res, next) {
  const token = req.cookies?.token
  if (!token) {
    return res.status(401).json({ error: 'Not authenticated' })
  }
  try {
    req.user = verifyToken(token)
    next()
  } catch {
    return res.status(401).json({ error: 'Invalid or expired session' })
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
