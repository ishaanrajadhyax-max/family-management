// Turns an exported Notebook snapshot (a folder of Markdown files) into
// rows for jarvis_knowledge. The Notebook stays the source of truth; this
// only builds a read-only copy for retrieval. Nothing here reads or writes
// anything except through explicit function arguments, and no Notebook text
// is ever logged — reports carry counts, section names, and source
// references only.
//
// INPUT FORMAT (only files that opt in are imported — "no arbitrary files"):
//
//   ---
//   jarvis-notebook: 1        required; a .md file without it is ignored
//   area: style               optional default (a registry area or "global")
//   section: wardrobe         optional default (must exist in that area)
//   ---
//   ## Heading                one entry (or rules/core item) per ## heading
//   @key: stable-key          optional; else a slug of the heading
//   @aliases: a, b            optional exact-match handles (lowercased)
//   @keywords: x, y           optional extra search terms
//   @date: 2026-01-31         optional, YYYY-MM-DD
//   Body text…
//
//   ## Another {area=global section=core}   per-heading routing overrides
//                                           the file default — how one
//                                           mixed file (e.g. a profile) is
//                                           split across areas, explicitly,
//                                           never guessed.
//
// `kind` is not written by hand: it comes from the target section's tier in
// the area registry (rules -> rules, core -> core, retrieve -> entry).
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { AREAS, GLOBAL_AREA, GLOBAL_SECTIONS } from '../areas.js'
import { resolveBudgets, estimateTokens, DEFAULT_BUDGETS } from '../budgets.js'

export const HEADER_KEY = 'jarvis-notebook'

// Source files that must never become a knowledge source of their own.
export const SKIPPED_SOURCE_FILES = {
  'company-profiles.md':
    "not imported: the Notebook's Company Profiles Project is the source of truth for company " +
    'profiles (news/company-profiles) — importing this file too would create a duplicate source',
  'multi-area-setup.md': 'not imported: describes how the areas are set up (structure), not knowledge',
}

const KIND_FOR_TIER = { rules: 'rules', core: 'core', retrieve: 'entry' }

function sectionTable(area) {
  return area === GLOBAL_AREA ? GLOBAL_SECTIONS : AREAS[area]?.sections
}

export function slugify(text) {
  const slug = String(text)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '')
  if (slug) return slug
  // Headings with no ASCII letters/digits still get a stable key.
  return `h-${crypto.createHash('sha1').update(String(text)).digest('hex').slice(0, 12)}`
}

export function parseFrontMatter(text) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  if (lines[0]?.trim() !== '---') return null
  const end = lines.findIndex((l, i) => i > 0 && l.trim() === '---')
  if (end === -1) return null
  const meta = {}
  for (const line of lines.slice(1, end)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const m = trimmed.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/)
    if (m) meta[m[1].toLowerCase()] = m[2].trim()
  }
  return { meta, body: lines.slice(end + 1).join('\n') }
}

// Splits a body into the text before the first `## ` heading (preamble) and
// the entries under each heading. `## ` inside a fenced code block is not a
// heading; a single-`#` title line is ignored.
export function splitEntries(body) {
  const preamble = []
  const entries = []
  let current = null
  let inFence = false
  for (const line of body.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence
    const heading = !inFence && line.match(/^##\s+(.*\S)\s*$/)
    if (heading) {
      current = { rawHeading: heading[1], lines: [] }
      entries.push(current)
      continue
    }
    if (!inFence && /^#\s/.test(line)) continue
    ;(current ? current.lines : preamble).push(line)
  }
  return { preamble: preamble.join('\n').trim(), entries }
}

function parseHeading(rawHeading) {
  const m = rawHeading.match(/^(.*?)\s*\{([^{}]*)\}\s*$/)
  if (!m) return { title: rawHeading.trim(), tags: {} }
  const tags = {}
  for (const pair of m[2].split(/[\s,]+/).filter(Boolean)) {
    const [k, ...rest] = pair.split('=')
    if (k && rest.length) tags[k.toLowerCase()] = rest.join('=')
  }
  return { title: m[1].trim(), tags }
}

function parseEntryMeta(lines) {
  const meta = {}
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) {
      i += 1
      continue
    }
    const m = line.match(/^@(key|aliases|keywords|date)\s*:\s*(.*)$/i)
    if (!m) break
    meta[m[1].toLowerCase()] = m[2].trim()
    i += 1
  }
  return { meta, body: lines.slice(i).join('\n').trim() }
}

function parseAliases(value) {
  return [...new Set(value.split(',').map((a) => a.trim().toLowerCase()).filter(Boolean))]
}

function isRealDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const d = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value
}

// Pattern TYPES only — the matched text is never kept or printed.
const SENSITIVE_PATTERNS = [
  ['card-like number', /\b(?:\d[ -]?){13,19}\b/],
  ['email address', /[^\s@]+@[^\s@]+\.[^\s@]+/],
  ['phone-like number', /(?:\+\d[\d\s().-]{8,}\d)|(?:\b\d{5}[ -]?\d{5}\b)/],
  ['API-key-like token', /\b(?:gsk_|sk-|sk_live_|AKIA)[A-Za-z0-9_-]{10,}/],
]

export function findSensitivePatterns(text) {
  return SENSITIVE_PATTERNS.filter(([, re]) => re.test(text)).map(([name]) => name)
}

export function discoverFiles(rootDir) {
  const md = []
  let other = 0
  const walk = (dir) => {
    for (const dirent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (dirent.name.startsWith('.') || dirent.name === 'node_modules') continue
      const abs = path.join(dir, dirent.name)
      if (dirent.isDirectory()) walk(abs)
      else if (dirent.isFile() && dirent.name.toLowerCase().endsWith('.md')) {
        md.push({ abs, rel: path.relative(rootDir, abs).split(path.sep).join('/') })
      } else if (dirent.isFile()) other += 1
    }
  }
  walk(rootDir)
  md.sort((a, b) => a.rel.localeCompare(b.rel))
  return { markdown: md, otherFileCount: other }
}

// Parses every discovered file. Returns items ready to upsert plus
// warnings (non-fatal) and errors (block the import).
export function parseNotebookFiles(files, readFile = (abs) => fs.readFileSync(abs, 'utf8')) {
  const items = []
  const warnings = []
  const errors = []
  const stats = { files: files.length, importedFiles: 0, skippedFiles: 0, ignoredFiles: 0, entriesFound: 0, entriesSkipped: 0 }
  const seen = new Map() // "area/section/key" -> source_ref

  for (const file of files) {
    const base = path.posix.basename(file.rel).toLowerCase()
    if (SKIPPED_SOURCE_FILES[base]) {
      stats.skippedFiles += 1
      warnings.push(`${file.rel}: ${SKIPPED_SOURCE_FILES[base]}`)
      continue
    }
    const parsed = parseFrontMatter(readFile(file.abs))
    if (!parsed || parsed.meta[HEADER_KEY] === undefined) {
      stats.ignoredFiles += 1
      warnings.push(`${file.rel}: ignored — no "${HEADER_KEY}: 1" header, so it is not treated as a Jarvis source`)
      continue
    }
    if (parsed.meta[HEADER_KEY] !== '1') {
      errors.push(`${file.rel}: unsupported ${HEADER_KEY} version "${parsed.meta[HEADER_KEY]}" (expected 1)`)
      continue
    }
    stats.importedFiles += 1

    const { preamble, entries } = splitEntries(parsed.body)
    const defaults = { area: parsed.meta.area, section: parsed.meta.section }

    const candidates = entries.map((e) => {
      const { title, tags } = parseHeading(e.rawHeading)
      const { meta, body } = parseEntryMeta(e.lines)
      return { title, tags, meta, body }
    })

    // Text before the first heading: kept only for rules/core files that
    // have a default route; otherwise reported, never silently dropped.
    if (preamble) {
      const tier = sectionTable(defaults.area)?.[defaults.section]?.tier
      if (tier === 'rules' || tier === 'core') {
        candidates.unshift({ title: '', tags: {}, meta: { key: 'overview' }, body: preamble })
      } else {
        stats.entriesSkipped += 1
        warnings.push(`${file.rel}: text before the first "##" heading (${preamble.length} chars) was not imported — no rules/core default route to attach it to`)
      }
    }

    for (const c of candidates) {
      stats.entriesFound += 1
      const sourceRef = `${file.rel}#${c.title || 'overview'}`
      const area = c.tags.area ?? defaults.area
      const section = c.tags.section ?? defaults.section

      if (!area || !section) {
        errors.push(`${sourceRef}: cannot route — set "area:" and "section:" in the file header or {area=… section=…} on the heading`)
        continue
      }
      if (area !== GLOBAL_AREA && !AREAS[area]) {
        errors.push(`${sourceRef}: unknown area "${area}"`)
        continue
      }
      const sectionDef = sectionTable(area)?.[section]
      if (!sectionDef) {
        errors.push(`${sourceRef}: area "${area}" has no section "${section}"`)
        continue
      }
      const kind = KIND_FOR_TIER[sectionDef.tier]
      if (c.tags.kind && c.tags.kind !== kind) {
        errors.push(`${sourceRef}: kind "${c.tags.kind}" doesn't match section "${area}/${section}", which holds "${kind}" items`)
        continue
      }
      if (!c.body) {
        stats.entriesSkipped += 1
        warnings.push(`${sourceRef}: empty entry skipped`)
        continue
      }
      if (c.meta.date !== undefined && !isRealDate(c.meta.date)) {
        errors.push(`${sourceRef}: @date must be a real YYYY-MM-DD date`)
        continue
      }

      const entryKey = c.meta.key ? slugify(c.meta.key) : slugify(c.title)
      const uniq = `${area}/${section}/${entryKey}`
      if (seen.has(uniq)) {
        errors.push(`${sourceRef}: duplicate key "${entryKey}" in ${area}/${section} (also ${seen.get(uniq)}) — give one an "@key:"`)
        continue
      }
      seen.set(uniq, sourceRef)

      const tokenEstimate = estimateTokens(c.title ? `${c.title}: ${c.body}` : c.body)
      if (kind === 'entry' && tokenEstimate > DEFAULT_BUDGETS.maxEntryTokens) {
        errors.push(`${sourceRef}: entry is ~${tokenEstimate} tokens, over the ${DEFAULT_BUDGETS.maxEntryTokens}-token limit — split it in the Notebook export`)
        continue
      }
      for (const kindName of findSensitivePatterns(`${c.title}\n${c.body}`)) {
        warnings.push(`${sourceRef}: contains a ${kindName} — Notebook text is sent to the LLM provider when retrieved; consider removing it`)
      }

      items.push({
        area,
        section,
        kind,
        entryKey,
        title: c.title,
        body: c.body,
        aliases: c.meta.aliases ? parseAliases(c.meta.aliases) : [],
        keywords: c.meta.keywords ? c.meta.keywords.split(',').map((k) => k.trim()).filter(Boolean).join(' ') : '',
        entryDate: c.meta.date ?? null,
        sourceRef,
        tokenEstimate,
      })
    }
  }
  return { items, warnings, errors, stats }
}

const sameArray = (a, b) => a.length === b.length && a.every((v, i) => v === b[i])

function sameContent(item, row) {
  return (
    row.kind === item.kind &&
    row.title === item.title &&
    row.body === item.body &&
    sameArray(row.aliases ?? [], item.aliases) &&
    (row.keywords ?? '') === item.keywords &&
    (row.entry_date ?? null) === item.entryDate &&
    (row.source_ref ?? null) === item.sourceRef &&
    row.token_estimate === item.tokenEstimate
  )
}

// Classifies each item against what's already stored (read-only input).
export function planImport(items, existingRows) {
  const byKey = new Map(existingRows.map((r) => [`${r.area}/${r.section}/${r.entry_key}`, r]))
  const plan = { insert: [], update: [], unchanged: [] }
  for (const item of items) {
    const row = byKey.get(`${item.area}/${item.section}/${item.entryKey}`)
    if (!row) plan.insert.push(item)
    else if (sameContent(item, row)) plan.unchanged.push(item)
    else plan.update.push(item)
  }
  return plan
}

const sum = (rows) => rows.reduce((n, r) => n + r.tokenEstimate, 0)

// The always-on layers are never truncated at request time, so their size is
// checked here, against what would be stored AFTER this import (existing
// rows this import doesn't overwrite, plus the incoming ones).
export function checkLayerCaps(items, existingRows) {
  const problems = []
  const incomingKeys = new Set(items.map((i) => `${i.area}/${i.section}/${i.entryKey}`))
  const merged = [
    ...items,
    ...existingRows
      .filter((r) => !incomingKeys.has(`${r.area}/${r.section}/${r.entry_key}`))
      .map((r) => ({ area: r.area, section: r.section, kind: r.kind, tokenEstimate: r.token_estimate })),
  ]
  const groups = [
    [GLOBAL_AREA, 'rules', (i) => i.section === 'rules', 'rulesTokens', 'global rules'],
    [GLOBAL_AREA, 'rules', (i) => i.section === 'voice', 'rulesTokens', 'global voice rules'],
    [GLOBAL_AREA, 'core', () => true, 'coreTokens', 'global core'],
    ...Object.keys(AREAS).flatMap((id) => [
      [id, 'rules', () => true, 'rulesTokens', `${id} rules`],
      [id, 'core', () => true, 'coreTokens', `${id} core`],
    ]),
  ]
  for (const [area, kind, filter, capKey, label] of groups) {
    const cap = resolveBudgets(area === GLOBAL_AREA ? {} : AREAS[area].budget)[capKey]
    const tokens = sum(merged.filter((i) => i.area === area && i.kind === kind && filter(i)))
    if (tokens > cap) {
      problems.push(`${label}: ~${tokens} tokens exceeds the ${cap}-token always-on cap (rules/core are never truncated, so trim it in the Notebook or raise the cap in jarvis/budgets.js)`)
    }
  }
  return problems
}

// Counts + estimated tokens, grouped for the report. No text.
export function summarizeItems(items) {
  const byArea = {}
  const byKind = {}
  const bySection = {}
  for (const i of items) {
    byArea[i.area] = (byArea[i.area] ?? 0) + 1
    byKind[i.kind] = (byKind[i.kind] ?? 0) + 1
    const key = `${i.area}/${i.section}`
    bySection[key] ??= { entries: 0, tokens: 0 }
    bySection[key].entries += 1
    bySection[key].tokens += i.tokenEstimate
  }
  return { byArea, byKind, bySection, totalTokens: sum(items) }
}

// One transaction; upsert only. Never deletes anything.
export async function applyImport(pool, ownerId, items, snapshotAt = new Date()) {
  const client = await pool.connect()
  const result = { inserted: 0, updated: 0 }
  try {
    await client.query('BEGIN')
    for (const item of items) {
      const r = await client.query(
        `INSERT INTO jarvis_knowledge
           (owner_user_id, area, section, kind, entry_key, title, body, aliases, keywords,
            entry_date, source_ref, snapshot_at, token_estimate)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         ON CONFLICT (owner_user_id, area, section, entry_key) DO UPDATE SET
           kind = EXCLUDED.kind, title = EXCLUDED.title, body = EXCLUDED.body,
           aliases = EXCLUDED.aliases, keywords = EXCLUDED.keywords,
           entry_date = EXCLUDED.entry_date, source_ref = EXCLUDED.source_ref,
           snapshot_at = EXCLUDED.snapshot_at, token_estimate = EXCLUDED.token_estimate
         RETURNING (xmax = 0) AS inserted`,
        [
          ownerId, item.area, item.section, item.kind, item.entryKey, item.title, item.body,
          item.aliases, item.keywords, item.entryDate, item.sourceRef, snapshotAt, item.tokenEstimate,
        ],
      )
      if (r.rows[0].inserted) result.inserted += 1
      else result.updated += 1
    }
    await client.query('COMMIT')
    return result
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

// Read-only: what this owner already has stored.
export async function loadExistingRows(pool, ownerId) {
  const r = await pool.query(
    `SELECT area, section, kind, entry_key, title, body, aliases, keywords,
            to_char(entry_date, 'YYYY-MM-DD') AS entry_date, source_ref, token_estimate
       FROM jarvis_knowledge WHERE owner_user_id = $1`,
    [ownerId],
  )
  return r.rows
}
