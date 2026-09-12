// Single shared connection pool to the family_manager PostgreSQL database.
// All connection details come from environment variables — nothing here is
// hard-coded, and no password is ever logged or sent anywhere but to
// Postgres itself.
//
// Two ways to configure it, chosen automatically based on what's set:
//   - DATABASE_URL (a full connection string, e.g. Neon in production).
//     SSL is required for Neon, so it's always enabled on this path.
//   - Discrete PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSWORD (local dev,
//     matching the local Postgres install, which has no SSL).
import pg from 'pg'
import 'dotenv/config'

let poolConfig

if (process.env.DATABASE_URL) {
  poolConfig = {
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  }
} else {
  const requiredEnvVars = ['PGHOST', 'PGPORT', 'PGDATABASE', 'PGUSER', 'PGPASSWORD']
  const missing = requiredEnvVars.filter((name) => !process.env[name])
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(', ')}. ` +
        'Copy server/.env.example to server/.env and fill in your own values, ' +
        'or set DATABASE_URL to connect to a hosted database instead.',
    )
  }
  poolConfig = {
    host: process.env.PGHOST,
    port: Number(process.env.PGPORT),
    database: process.env.PGDATABASE,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
  }
}

export const pool = new pg.Pool(poolConfig)
