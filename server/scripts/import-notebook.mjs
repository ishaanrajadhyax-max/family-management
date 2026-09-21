#!/usr/bin/env node
// Imports an exported Notebook snapshot (a folder of opted-in Markdown
// files — format documented in jarvis/knowledge/notebookImport.js) into
// jarvis_knowledge for ONE owner. Run it yourself, from server/:
//
//   node scripts/import-notebook.mjs --dir <folder> --owner <user-id> --dry-run
//   node scripts/import-notebook.mjs --dir <folder> --owner <user-id> --yes
//
// Always start with --dry-run: it validates everything, shows exactly what
// would be inserted/updated, and writes NOTHING. A real write needs --yes.
//
// The database it targets is whatever server/.env points at (local dev by
// default). To target another database you must set DATABASE_URL in your
// shell AND pass --allow-remote — a remote write is never the default.
//
// Safety:
//   - refuses a --dir inside this Git repository (a Notebook must never sit
//     where it could be committed) unless --allow-in-repo;
//   - upsert only, in one transaction; never deletes anything;
//   - never prints Notebook text — counts, section names and source
//     references only.
//
// Flags: --dir --owner --dry-run --yes --allow-in-repo --allow-remote
//        --allow-over-budget (downgrade always-on cap errors to warnings)
//        --verbose (list entry keys per section)
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { pool } from '../db.js'
import {
  discoverFiles,
  parseNotebookFiles,
  loadExistingRows,
  planImport,
  checkLayerCaps,
  summarizeItems,
  applyImport,
} from '../jarvis/knowledge/notebookImport.js'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function parseArgs(argv) {
  const args = { flags: new Set() }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--dir' || a === '--owner') args[a.slice(2)] = argv[++i]
    else if (a.startsWith('--')) args.flags.add(a.slice(2))
    else fail(2, `Unexpected argument: ${a}`)
  }
  return args
}

function fail(code, message) {
  console.error(message)
  process.exit(code)
}

function isInside(child, parent) {
  const rel = path.relative(parent, child)
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
}

// Host only — never credentials.
function targetHost() {
  if (process.env.DATABASE_URL) {
    try {
      return new URL(process.env.DATABASE_URL).hostname
    } catch {
      return 'unparseable DATABASE_URL'
    }
  }
  return process.env.PGHOST || 'localhost'
}
const isLocalHost = (h) => ['localhost', '127.0.0.1', '::1'].includes(h)

function printTable(title, obj, unit = '') {
  console.log(`  ${title}`)
  for (const [k, v] of Object.entries(obj).sort()) console.log(`    ${k.padEnd(34)} ${v}${unit}`)
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const { flags } = args
  const dryRun = flags.has('dry-run')

  if (!args.dir || !args.owner) {
    fail(2, 'Usage: node scripts/import-notebook.mjs --dir <folder> --owner <user-id> [--dry-run | --yes]')
  }
  if (!UUID.test(args.owner)) fail(2, '--owner must be a user id (UUID) from family_members.')
  if (!dryRun && !flags.has('yes')) {
    fail(2, 'Refusing to write without --yes. Run with --dry-run first to see what would change.')
  }

  const dir = path.resolve(args.dir)
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) fail(2, `Not a directory: ${dir}`)
  if (isInside(dir, REPO_ROOT) && !flags.has('allow-in-repo')) {
    fail(
      2,
      `Refusing: ${dir} is inside the Git repository (${REPO_ROOT}). A Notebook export must live outside ` +
        'the repo so it can never be committed. Move it, or pass --allow-in-repo if you really mean it.',
    )
  }

  const host = targetHost()
  const remote = !isLocalHost(host)
  if (!dryRun && remote && !flags.has('allow-remote')) {
    fail(2, `Refusing to write to a non-local database (${host}) without --allow-remote.`)
  }

  const ownerResult = await pool.query(
    'SELECT id, name, role, username, is_active FROM family_members WHERE id = $1',
    [args.owner],
  )
  if (ownerResult.rowCount === 0) fail(1, `No family member with id ${args.owner}.`)
  const owner = ownerResult.rows[0]

  console.log(dryRun ? '== DRY RUN — nothing will be written ==' : '== IMPORT ==')
  console.log(`  Owner:    ${owner.name} (${owner.role}, @${owner.username ?? 'no username'}) [${owner.id}]${owner.is_active ? '' : '  ** ACCOUNT DISABLED **'}`)
  console.log(`  Database: ${host}${remote ? '  (REMOTE)' : ' (local)'}`)
  console.log(`  Folder:   ${dir}`)

  const { markdown, otherFileCount } = discoverFiles(dir)
  const { items, warnings, errors, stats } = parseNotebookFiles(markdown)
  const existing = await loadExistingRows(pool, owner.id)
  const plan = planImport(items, existing)

  const capProblems = checkLayerCaps(items, existing)
  if (flags.has('allow-over-budget')) warnings.push(...capProblems.map((p) => `${p} [allowed by --allow-over-budget]`))
  else errors.push(...capProblems)

  const summary = summarizeItems(items)
  const incomingKeys = new Set(items.map((i) => `${i.area}/${i.section}/${i.entryKey}`))
  const untouched = existing.filter((r) => !incomingKeys.has(`${r.area}/${r.section}/${r.entry_key}`)).length

  console.log('\nSummary')
  console.log(`  Files discovered:            ${markdown.length + otherFileCount}  (${markdown.length} Markdown, ${otherFileCount} non-Markdown ignored)`)
  console.log(`  Files imported / skipped:    ${stats.importedFiles} / ${stats.skippedFiles + stats.ignoredFiles}`)
  console.log(`  Entries found:               ${stats.entriesFound}`)
  console.log(`  Entries to insert:           ${plan.insert.length}`)
  console.log(`  Entries to update:           ${plan.update.length}`)
  console.log(`  Unchanged (snapshot refresh): ${plan.unchanged.length}`)
  console.log(`  Entries skipped:             ${stats.entriesSkipped}`)
  console.log(`  Existing rows left untouched: ${untouched}`)
  console.log(`  Estimated tokens (imported): ${summary.totalTokens}`)
  console.log()
  printTable('By area (entries)', summary.byArea)
  printTable('By kind (entries)', summary.byKind)
  console.log('  By section (entries / est. tokens)')
  for (const [k, v] of Object.entries(summary.bySection).sort()) {
    console.log(`    ${k.padEnd(34)} ${String(v.entries).padStart(4)} / ${v.tokens}`)
  }
  if (flags.has('verbose')) {
    console.log('  Entry keys')
    for (const i of items) console.log(`    ${i.area}/${i.section}/${i.entryKey}  <- ${i.sourceRef}`)
  }

  console.log(`\nWarnings (${warnings.length})`)
  for (const w of warnings) console.log(`  - ${w}`)
  console.log(`\nErrors (${errors.length})`)
  for (const e of errors) console.log(`  - ${e}`)

  if (errors.length > 0) fail(1, '\nValidation failed — nothing was written.')
  if (dryRun) {
    console.log('\nDRY RUN complete — nothing was written.')
    return
  }

  const result = await applyImport(pool, owner.id, items, new Date())
  console.log(`\nImported: ${result.inserted} inserted, ${result.updated} updated (one transaction).`)
}

main()
  .catch((err) => {
    // Never echo a message that could carry row data.
    console.error(`Import failed: ${err.code || err.name}`)
    process.exitCode = 1
  })
  .finally(() => pool.end())
