#!/usr/bin/env node
// Run this yourself, locally: `node scripts/set-password.mjs` (from server/).
// Prompts for a role, username, and password — the password is never
// echoed to the screen and never passed as a command-line argument (which
// would land in shell history). Run it once per family member.
//
// By default this connects to whatever database server/.env points at
// (local dev). To set a password on the production database instead, set
// DATABASE_URL in your shell before running this script.
import readline from 'node:readline'
import { pool } from '../db.js'
import { hashPassword } from '../auth/hash.js'

const VALID_ROLES = ['dad', 'mom', 'admin']

// Charcodes used below, spelled out to avoid embedding raw control bytes:
const ENTER_CODES = [10, 13] // \n, \r
const CTRL_C_CODE = 3
const BACKSPACE_CODES = [8, 127] // backspace / DEL

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve) => rl.question(question, (answer) => {
    rl.close()
    resolve(answer.trim())
  }))
}

function askHidden(question) {
  return new Promise((resolve) => {
    process.stdout.write(question)
    let password = ''
    process.stdin.setRawMode(true)
    process.stdin.resume()
    process.stdin.setEncoding('utf8')

    const onData = (char) => {
      const code = char.charCodeAt(0)
      if (ENTER_CODES.includes(code)) {
        process.stdin.setRawMode(false)
        process.stdin.pause()
        process.stdin.removeListener('data', onData)
        process.stdout.write('\n')
        resolve(password)
      } else if (code === CTRL_C_CODE) {
        process.exit(1)
      } else if (BACKSPACE_CODES.includes(code)) {
        password = password.slice(0, -1)
      } else {
        password += char
      }
    }
    process.stdin.on('data', onData)
  })
}

async function main() {
  const role = (await ask(`Role to set up (${VALID_ROLES.join(' / ')}): `)).toLowerCase()
  if (!VALID_ROLES.includes(role)) {
    console.error(`Role must be exactly one of: ${VALID_ROLES.join(', ')}`)
    process.exitCode = 1
    return
  }

  const username = (await ask('Username: ')).toLowerCase()
  if (!username) {
    console.error('Username cannot be empty.')
    process.exitCode = 1
    return
  }

  const password = await askHidden('Password (hidden, min 8 characters): ')
  if (password.length < 8) {
    console.error('Password must be at least 8 characters.')
    process.exitCode = 1
    return
  }

  const passwordHash = await hashPassword(password)
  const result = await pool.query(
    'UPDATE family_members SET username = $1, password_hash = $2 WHERE role = $3 RETURNING id, name, role, username',
    [username, passwordHash, role],
  )

  if (result.rowCount === 0) {
    console.error(`No family member with role "${role}" exists yet.`)
    process.exitCode = 1
  } else {
    console.log('Updated:', result.rows[0])
  }
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => pool.end())
