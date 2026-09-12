// Password hashing, isolated in one place so the rest of the app never
// touches a raw bcrypt call directly.
import bcrypt from 'bcryptjs'

const SALT_ROUNDS = 12

export function hashPassword(password) {
  return bcrypt.hash(password, SALT_ROUNDS)
}

export function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash)
}
