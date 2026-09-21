// Notebook importer: parsing, deterministic keys, upsert, dry-run safety and
// the CLI's guard rails. All content here is SYNTHETIC ("Zorblax", "Quuxville")
// — never real Notebook text. Fixture folders live in the OS temp dir (outside
// the repo, like a real export must). Needs local Postgres with migration 005.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { pool } from '../db.js'
import {
  parseFrontMatter,
  splitEntries,
  slugify,
  discoverFiles,
  parseNotebookFiles,
  planImport,
  checkLayerCaps,
  summarizeItems,
  applyImport,
  loadExistingRows,
} from '../jarvis/knowledge/notebookImport.js'

const RUN_ID = Date.now().toString(36)
const SERVER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SCRIPT = path.join(SERVER_DIR, 'scripts', 'import-notebook.mjs')

let ownerA
let ownerB
const tmpDirs = []

function makeExport(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-fixture-'))
  tmpDirs.push(dir)
  for (const [name, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true })
    fs.writeFileSync(path.join(dir, name), text)
  }
  return dir
}

const parseDir = (dir) => parseNotebookFiles(discoverFiles(dir).markdown)

const FIXTURE = {
  'style/wardrobe.md': `---
jarvis-notebook: 1
area: style
section: wardrobe
---
## Zorblax jacket
@aliases: Zorblax, Quux Jacket
@keywords: outerwear, winter
@date: 2026-01-31
A synthetic teal jacket used only in tests.

## Plain shirt
A synthetic shirt.
`,
  'style/rules.md': `---
jarvis-notebook: 1
area: style
section: rules
---
Always suggest two options. (synthetic rule)
`,
  'mixed/profile.md': `---
jarvis-notebook: 1
---
## Basic facts {area=global section=core}
Synthetic person who lives in Quuxville.

## Fit notes {area=style section=physical-profile}
Synthetic fit note.
`,
  'news/company-profiles.md': '---\njarvis-notebook: 1\narea: news\nsection: company-profiles\n---\n## Acme\nDuplicate source.\n',
  'random-notes.md': '# no header here\n## Something\nnot opted in\n',
  'image.png': 'binary-ish',
}

before(async () => {
  const mk = async (tag) =>
    (
      await pool.query(
        `INSERT INTO family_members (name, username, role, is_active) VALUES ($1, $2, 'dad', true) RETURNING id`,
        [`Test import ${tag}`, `test_import_${tag}_${RUN_ID}`],
      )
    ).rows[0].id
  ownerA = await mk('a')
  ownerB = await mk('b')
})

after(async () => {
  await pool.query('DELETE FROM family_members WHERE id = ANY($1)', [[ownerA, ownerB]])
  for (const d of tmpDirs) fs.rmSync(d, { recursive: true, force: true })
  await pool.end()
})

test('front matter, heading split and slugs behave', () => {
  assert.equal(parseFrontMatter('no front matter'), null)
  assert.deepEqual(parseFrontMatter('---\njarvis-notebook: 1\narea: news\n---\nbody').meta, { 'jarvis-notebook': '1', area: 'news' })

  const { preamble, entries } = splitEntries('intro\n## A\nx\n```\n## not a heading\n```\n## B\ny')
  assert.equal(preamble, 'intro')
  assert.deepEqual(entries.map((e) => e.rawHeading), ['A', 'B'])
  assert.ok(entries[0].lines.join('\n').includes('## not a heading'))

  assert.equal(slugify('  Zorblax Jacket!! '), 'zorblax-jacket')
  assert.match(slugify('日本語'), /^h-[0-9a-f]{12}$/)
  assert.equal(slugify('日本語'), slugify('日本語'))
})

test('parsing: opt-in header, routing, kinds, metadata; company-profiles.md is never a second source', () => {
  const dir = makeExport(FIXTURE)
  const { items, warnings, errors, stats } = parseDir(dir)

  assert.deepEqual(errors, [])
  assert.equal(stats.importedFiles, 3)
  assert.equal(stats.skippedFiles, 1) // company-profiles.md
  assert.equal(stats.ignoredFiles, 1) // random-notes.md has no opt-in header
  assert.ok(warnings.some((w) => /company-profiles\.md.*source of truth/.test(w)))
  assert.ok(warnings.some((w) => /random-notes\.md.*ignored/.test(w)))
  assert.ok(!items.some((i) => i.body.includes('Duplicate source')))
  assert.ok(!items.some((i) => i.body.includes('not opted in')))

  const by = (area, section, key) => items.find((i) => i.area === area && i.section === section && i.entryKey === key)

  const jacket = by('style', 'wardrobe', 'zorblax-jacket')
  assert.equal(jacket.kind, 'entry')
  assert.equal(jacket.title, 'Zorblax jacket')
  assert.deepEqual(jacket.aliases, ['zorblax', 'quux jacket'])
  assert.equal(jacket.keywords, 'outerwear, winter'.split(', ').join(' '))
  assert.equal(jacket.entryDate, '2026-01-31')
  assert.equal(jacket.sourceRef, 'style/wardrobe.md#Zorblax jacket')
  assert.ok(jacket.tokenEstimate > 0)

  // Rules file with only a preamble becomes one rules item.
  const rule = by('style', 'rules', 'overview')
  assert.equal(rule.kind, 'rules')

  // Per-heading routing splits one file across areas, explicitly.
  assert.equal(by('global', 'core', 'basic-facts').kind, 'core')
  assert.equal(by('style', 'physical-profile', 'fit-notes').kind, 'core')
  // Style profile text must not have landed in global/news.
  assert.ok(!items.some((i) => i.area !== 'style' && i.body.includes('fit note')))
})

test('parsing errors block the import: unknown area/section, bad date, duplicates, oversize, unroutable', () => {
  const dir = makeExport({
    'bad.md': `---
jarvis-notebook: 1
area: style
section: wardrobe
---
## Wrong section {section=nonexistent}
x

## Bad date
@date: 2026-13-45
x

## Same
a

## Same
b

## Huge
${'word '.repeat(1000)}
`,
    'unrouted.md': '---\njarvis-notebook: 1\n---\n## Nowhere\nx\n',
    'wrong-area.md': '---\njarvis-notebook: 1\narea: finance\nsection: x\n---\n## X\ny\n',
    'future.md': '---\njarvis-notebook: 2\n---\n## X\ny\n',
  })
  const { errors } = parseDir(dir)
  const text = errors.join('\n')
  assert.match(text, /has no section "nonexistent"/)
  assert.match(text, /@date must be a real/)
  assert.match(text, /duplicate key "same"/)
  assert.match(text, /over the \d+-token limit/)
  assert.match(text, /cannot route/)
  assert.match(text, /unknown area "finance"/)
  assert.match(text, /unsupported jarvis-notebook version "2"/)
})

test('warnings flag sensitive-looking patterns by TYPE without echoing the text', () => {
  const dir = makeExport({
    's.md': `---
jarvis-notebook: 1
area: style
section: wardrobe
---
## Contact
Reach me at someone@example.com or call +91 98765 43210.
`,
  })
  const { warnings, items } = parseDir(dir)
  assert.equal(items.length, 1)
  const text = warnings.join('\n')
  assert.match(text, /email address/)
  assert.match(text, /phone-like number/)
  assert.doesNotMatch(text, /someone@example\.com/)
  assert.doesNotMatch(text, /98765/)
})

test('entry keys are deterministic: same input twice gives identical keys, and @key overrides the heading', () => {
  const a = parseDir(makeExport(FIXTURE)).items.map((i) => `${i.area}/${i.section}/${i.entryKey}`)
  const b = parseDir(makeExport(FIXTURE)).items.map((i) => `${i.area}/${i.section}/${i.entryKey}`)
  assert.deepEqual(a, b)

  const dir = makeExport({
    'k.md': '---\njarvis-notebook: 1\narea: style\nsection: wardrobe\n---\n## Renamed heading\n@key: stable-id\nx\n',
  })
  assert.equal(parseDir(dir).items[0].entryKey, 'stable-id')
})

test('dry-run planning writes nothing; a real import inserts, then re-import is idempotent, then a change updates only that row', async () => {
  const { items } = parseDir(makeExport(FIXTURE))
  const count = async (owner) =>
    Number((await pool.query('SELECT count(*) FROM jarvis_knowledge WHERE owner_user_id = $1', [owner])).rows[0].count)

  // Planning is a pure read.
  const plan1 = planImport(items, await loadExistingRows(pool, ownerA))
  assert.equal(plan1.insert.length, items.length)
  assert.equal(await count(ownerA), 0, 'planning must not write')

  const first = await applyImport(pool, ownerA, items, new Date('2026-02-01T00:00:00Z'))
  assert.deepEqual(first, { inserted: items.length, updated: 0 })
  assert.equal(await count(ownerA), items.length)

  // Stored fields survive: title, body, aliases, keywords, entry_date, source_ref, snapshot_at, token_estimate.
  const row = (
    await pool.query(
      `SELECT *, to_char(entry_date,'YYYY-MM-DD') AS d FROM jarvis_knowledge
        WHERE owner_user_id = $1 AND entry_key = 'zorblax-jacket'`,
      [ownerA],
    )
  ).rows[0]
  assert.equal(row.title, 'Zorblax jacket')
  assert.match(row.body, /synthetic teal jacket/)
  assert.deepEqual(row.aliases, ['zorblax', 'quux jacket'])
  assert.equal(row.keywords, 'outerwear winter')
  assert.equal(row.d, '2026-01-31')
  assert.equal(row.source_ref, 'style/wardrobe.md#Zorblax jacket')
  assert.equal(row.snapshot_at.toISOString(), '2026-02-01T00:00:00.000Z')
  assert.ok(row.token_estimate > 0)

  // Same input: nothing to insert or update.
  const plan2 = planImport(items, await loadExistingRows(pool, ownerA))
  assert.equal(plan2.insert.length + plan2.update.length, 0)
  assert.equal(plan2.unchanged.length, items.length)
  const again = await applyImport(pool, ownerA, items, new Date('2026-03-01T00:00:00Z'))
  assert.deepEqual(again, { inserted: 0, updated: items.length }) // snapshot_at refreshed
  assert.equal(await count(ownerA), items.length, 'upsert never duplicates')

  // Edit one body: exactly one update.
  const edited = items.map((i) => (i.entryKey === 'plain-shirt' ? { ...i, body: 'A changed synthetic shirt.' } : i))
  const plan3 = planImport(edited, await loadExistingRows(pool, ownerA))
  assert.equal(plan3.update.length, 1)
  assert.equal(plan3.update[0].entryKey, 'plain-shirt')

  // Rows the import does not mention are left alone (no deletes).
  await pool.query(
    `INSERT INTO jarvis_knowledge (owner_user_id, area, section, kind, entry_key, body, token_estimate)
     VALUES ($1, 'style', 'wardrobe', 'entry', 'unrelated-row', 'left alone', 3)`,
    [ownerA],
  )
  await applyImport(pool, ownerA, edited)
  const unrelated = await pool.query(`SELECT 1 FROM jarvis_knowledge WHERE owner_user_id = $1 AND entry_key = 'unrelated-row'`, [ownerA])
  assert.equal(unrelated.rowCount, 1)
})

test('owner isolation on import: another owner\'s rows are never touched or matched', async () => {
  const { items } = parseDir(makeExport(FIXTURE))
  await applyImport(pool, ownerB, items.slice(0, 2))
  const beforeA = (await pool.query('SELECT count(*) FROM jarvis_knowledge WHERE owner_user_id = $1', [ownerA])).rows[0].count
  await applyImport(pool, ownerB, items.map((i) => ({ ...i, body: `${i.body} (b)` })))
  const afterA = (await pool.query('SELECT count(*) FROM jarvis_knowledge WHERE owner_user_id = $1', [ownerA])).rows[0].count
  assert.equal(beforeA, afterA)
  const leaked = await pool.query(`SELECT 1 FROM jarvis_knowledge WHERE owner_user_id = $1 AND body LIKE '% (b)'`, [ownerA])
  assert.equal(leaked.rowCount, 0)
})

test('a failing item rolls the whole import back (transaction)', async () => {
  const owner = (
    await pool.query(
      `INSERT INTO family_members (name, username, role, is_active) VALUES ('Test import tx', $1, 'dad', true) RETURNING id`,
      [`test_import_tx_${RUN_ID}`],
    )
  ).rows[0].id
  try {
    const { items } = parseDir(makeExport(FIXTURE))
    const bad = [...items, { ...items[0], entryKey: 'bad-kind', kind: 'not-a-kind' }] // violates the kind CHECK
    await assert.rejects(applyImport(pool, owner, bad))
    const n = (await pool.query('SELECT count(*) FROM jarvis_knowledge WHERE owner_user_id = $1', [owner])).rows[0].count
    assert.equal(n, '0', 'nothing from the failed import may remain')
  } finally {
    await pool.query('DELETE FROM family_members WHERE id = $1', [owner])
  }
})

test('always-on layers are capped at import time (rules/core are never truncated later)', () => {
  const big = (n) => ({ area: 'global', section: 'rules', kind: 'rules', entryKey: `r${n}`, tokenEstimate: 400 })
  assert.deepEqual(checkLayerCaps([big(1)], []), [])
  const problems = checkLayerCaps([big(1), big(2)], [])
  assert.equal(problems.length, 1)
  assert.match(problems[0], /global rules.*exceeds/)
  // Counts what's already stored too, not just the incoming batch.
  const stored = [{ area: 'global', section: 'rules', kind: 'rules', entry_key: 'old', token_estimate: 400 }]
  assert.equal(checkLayerCaps([big(1)], stored).length, 1)
  // ...unless the incoming item replaces that stored row.
  assert.equal(checkLayerCaps([{ ...big(1), entryKey: 'old' }], stored).length, 0)
})

test('summary reports counts by area/kind/section with token totals', () => {
  const s = summarizeItems(parseDir(makeExport(FIXTURE)).items)
  assert.equal(s.byArea.style, 4)
  assert.equal(s.byArea.global, 1)
  assert.equal(s.byKind.entry, 2)
  assert.ok(s.totalTokens > 0)
  assert.ok(s.bySection['style/wardrobe'].tokens > 0)
})

function runCli(args) {
  return spawnSync(process.execPath, [SCRIPT, ...args], { cwd: SERVER_DIR, encoding: 'utf8', env: { ...process.env } })
}

test('CLI: --dry-run shows a summary, names the owner, and writes nothing (and never prints Notebook text)', () => {
  const dir = makeExport(FIXTURE)
  const r = runCli(['--dir', dir, '--owner', ownerA, '--dry-run'])
  assert.equal(r.status, 0, r.stderr)
  assert.match(r.stdout, /DRY RUN/)
  assert.match(r.stdout, /Owner:\s+Test import a/)
  assert.match(r.stdout, /Entries found:\s+5/)
  assert.match(r.stdout, /Estimated tokens/)
  assert.doesNotMatch(r.stdout, /synthetic teal jacket/)
  assert.doesNotMatch(r.stdout + r.stderr, /Quuxville/)
})

test('CLI: a real write needs --yes; missing/invalid args are refused', async () => {
  const dir = makeExport(FIXTURE)
  const noYes = runCli(['--dir', dir, '--owner', ownerB])
  assert.notEqual(noYes.status, 0)
  assert.match(noYes.stderr, /without --yes/)

  assert.notEqual(runCli(['--dir', dir]).status, 0)
  assert.match(runCli(['--dir', dir, '--owner', 'not-a-uuid', '--dry-run']).stderr, /must be a user id/)
  assert.match(runCli(['--dir', path.join(dir, 'nope'), '--owner', ownerA, '--dry-run']).stderr, /Not a directory/)
})

test('CLI: refuses a folder inside the Git repository unless --allow-in-repo', () => {
  const inRepo = path.join(SERVER_DIR, `.test-fixture-${RUN_ID}`)
  fs.mkdirSync(inRepo)
  tmpDirs.push(inRepo)
  fs.writeFileSync(path.join(inRepo, 'a.md'), FIXTURE['style/rules.md'])
  const refused = runCli(['--dir', inRepo, '--owner', ownerA, '--dry-run'])
  assert.notEqual(refused.status, 0)
  assert.match(refused.stderr, /inside the Git repository/)
  const allowed = runCli(['--dir', inRepo, '--owner', ownerA, '--dry-run', '--allow-in-repo'])
  assert.equal(allowed.status, 0, allowed.stderr)
})

test('CLI: validation errors exit non-zero before any write, even with --yes', async () => {
  const owner = ownerB
  const before = (await pool.query('SELECT count(*) FROM jarvis_knowledge WHERE owner_user_id = $1', [owner])).rows[0].count
  const dir = makeExport({ 'bad.md': '---\njarvis-notebook: 1\narea: style\nsection: wardrobe\n---\n## X\n@date: nope\nbody\n' })
  const r = runCli(['--dir', dir, '--owner', owner, '--yes'])
  assert.notEqual(r.status, 0)
  assert.match(r.stdout + r.stderr, /Validation failed/)
  const after = (await pool.query('SELECT count(*) FROM jarvis_knowledge WHERE owner_user_id = $1', [owner])).rows[0].count
  assert.equal(before, after)
})

test('CLI: refuses to write to a non-local database without --allow-remote', () => {
  const dir = makeExport(FIXTURE)
  const r = spawnSync(process.execPath, [SCRIPT, '--dir', dir, '--owner', ownerA, '--yes'], {
    cwd: SERVER_DIR,
    encoding: 'utf8',
    env: { ...process.env, DATABASE_URL: 'postgres://u:p@db.example.invalid:5432/x' },
  })
  assert.notEqual(r.status, 0)
  assert.match(r.stderr, /non-local database/)
  assert.doesNotMatch(r.stdout + r.stderr, /u:p/)
})
