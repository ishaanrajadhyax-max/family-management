// Signs/verifies the session token stored in an httpOnly cookie. The token
// carries only what routes need for authorization decisions — id, name,
// role — never the password hash.
import jwt from 'jsonwebtoken'
import 'dotenv/config'

const SECRET = process.env.JWT_SECRET
if (!SECRET) {
  throw new Error(
    'Missing required environment variable: JWT_SECRET. ' +
      'Set it in server/.env (a long random string — see server/.env.example).',
  )
}

const EXPIRES_IN = '30d'

export function signToken(member) {
  return jwt.sign({ id: member.id, name: member.name, role: member.role }, SECRET, {
    expiresIn: EXPIRES_IN,
  })
}

export function verifyToken(token) {
  return jwt.verify(token, SECRET)
}
