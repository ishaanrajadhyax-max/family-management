// Single shared connection pool to the family_manager PostgreSQL database.
// All connection details come from environment variables (see .env.example)
// — nothing here is hard-coded, and the password is never logged or sent
// anywhere but to Postgres itself.
import pg from 'pg'
import 'dotenv/config'

const requiredEnvVars = ['PGHOST', 'PGPORT', 'PGDATABASE', 'PGUSER', 'PGPASSWORD']
const missing = requiredEnvVars.filter((name) => !process.env[name])
if (missing.length > 0) {
  throw new Error(
    `Missing required environment variable(s): ${missing.join(', ')}. ` +
      'Copy server/.env.example to server/.env and fill in your own values.',
  )
}

export const pool = new pg.Pool({
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT),
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
})
