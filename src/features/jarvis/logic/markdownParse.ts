// A small, safe Markdown parser for Jarvis's replies: headings, lists, bold,
// italics, inline and fenced code, links, quotes, rules and tables. It
// produces a plain data tree that MessageContent.tsx turns into React
// elements — there is no HTML string anywhere, so nothing in a reply can
// inject markup. Links are limited to http(s) and mailto.

export type Inline =
  | { t: 'text'; v: string }
  | { t: 'strong'; c: Inline[] }
  | { t: 'em'; c: Inline[] }
  | { t: 'del'; c: Inline[] }
  | { t: 'code'; v: string }
  | { t: 'link'; href: string; c: Inline[] }
  | { t: 'br' }

export interface ListItem {
  c: Inline[]
  depth: number
}

export type Block =
  | { t: 'p'; c: Inline[] }
  | { t: 'h'; level: 1 | 2 | 3 | 4; c: Inline[] }
  | { t: 'ul'; items: ListItem[] }
  | { t: 'ol'; start: number; items: ListItem[] }
  | { t: 'code'; lang: string; v: string }
  | { t: 'quote'; c: Inline[] }
  | { t: 'table'; head: Inline[][]; rows: Inline[][][] }
  | { t: 'hr' }

export function isSafeUrl(url: string): boolean {
  return /^(https?:\/\/|mailto:)/i.test(url.trim())
}

const text = (v: string): Inline => ({ t: 'text', v })

// Inline parsing: scan left to right, emitting a node for each construct.
export function parseInline(src: string): Inline[] {
  const out: Inline[] = []
  let buf = ''
  const flush = () => {
    if (buf) out.push(text(buf))
    buf = ''
  }
  let i = 0
  while (i < src.length) {
    const rest = src.slice(i)
    let m: RegExpMatchArray | null

    if ((m = rest.match(/^`([^`\n]+)`/))) {
      flush()
      out.push({ t: 'code', v: m[1] })
      i += m[0].length
    } else if ((m = rest.match(/^\*\*(?=\S)([\s\S]*?\S)\*\*/)) || (m = rest.match(/^__(?=\S)([\s\S]*?\S)__/))) {
      flush()
      out.push({ t: 'strong', c: parseInline(m[1]) })
      i += m[0].length
    } else if ((m = rest.match(/^~~(?=\S)([\s\S]*?\S)~~/))) {
      flush()
      out.push({ t: 'del', c: parseInline(m[1]) })
      i += m[0].length
    } else if ((m = rest.match(/^\*(?=\S)([^*\n]*?\S)\*(?!\*)/))) {
      flush()
      out.push({ t: 'em', c: parseInline(m[1]) })
      i += m[0].length
    } else if (
      (m = rest.match(/^_(?=\S)([^_\n]*?\S)_(?![\w])/)) &&
      (i === 0 || !/\w/.test(src[i - 1]))
    ) {
      flush()
      out.push({ t: 'em', c: parseInline(m[1]) })
      i += m[0].length
    } else if ((m = rest.match(/^\[([^\]\n]+)\]\(([^)\s]+)\)/))) {
      flush()
      if (isSafeUrl(m[2])) out.push({ t: 'link', href: m[2], c: parseInline(m[1]) })
      else out.push(...parseInline(m[1])) // unsafe target: keep the words, drop the link
      i += m[0].length
    } else if ((m = rest.match(/^https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"]/))) {
      flush()
      out.push({ t: 'link', href: m[0], c: [text(m[0])] })
      i += m[0].length
    } else if (rest.startsWith('\n')) {
      flush()
      out.push({ t: 'br' })
      i += 1
    } else {
      buf += src[i]
      i += 1
    }
  }
  flush()
  return out
}

const isBlank = (l: string) => l.trim() === ''
const FENCE = /^\s{0,3}(```|~~~)\s*([\w+-]*)\s*$/
const HEADING = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/
const HR = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/
const UL = /^(\s*)[-*+]\s+(.*)$/
const OL = /^(\s*)(\d{1,9})[.)]\s+(.*)$/
const QUOTE = /^\s{0,3}>\s?(.*)$/
const TABLE_SEP = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/

function splitRow(line: string): string[] {
  let l = line.trim()
  if (l.startsWith('|')) l = l.slice(1)
  if (l.endsWith('|')) l = l.slice(0, -1)
  return l.split('|').map((c) => c.trim())
}

const depthOf = (indent: string) => Math.min(3, Math.floor(indent.replace(/\t/g, '    ').length / 2))

export function parseMarkdown(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, '\n').split('\n')
  const blocks: Block[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]
    if (isBlank(line)) {
      i++
      continue
    }

    const fence = line.match(FENCE)
    if (fence) {
      const marker = fence[1]
      const body: string[] = []
      i++
      while (i < lines.length && !lines[i].trim().startsWith(marker)) body.push(lines[i++])
      i++ // closing fence (or end of text)
      blocks.push({ t: 'code', lang: fence[2], v: body.join('\n') })
      continue
    }

    const heading = line.match(HEADING)
    if (heading) {
      blocks.push({ t: 'h', level: Math.min(4, heading[1].length) as 1 | 2 | 3 | 4, c: parseInline(heading[2]) })
      i++
      continue
    }

    if (HR.test(line)) {
      blocks.push({ t: 'hr' })
      i++
      continue
    }

    if (line.includes('|') && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1]) && lines[i + 1].includes('-')) {
      const head = splitRow(line).map(parseInline)
      const rows: Inline[][][] = []
      i += 2
      while (i < lines.length && !isBlank(lines[i]) && lines[i].includes('|')) {
        const cells = splitRow(lines[i]).map(parseInline)
        while (cells.length < head.length) cells.push([])
        rows.push(cells.slice(0, head.length))
        i++
      }
      blocks.push({ t: 'table', head, rows })
      continue
    }

    const ul = line.match(UL)
    const ol = line.match(OL)
    if (ul || ol) {
      const ordered = Boolean(ol)
      const items: ListItem[] = []
      const start = ol ? Number(ol[2]) : 1
      while (i < lines.length) {
        const u = lines[i].match(UL)
        const o = lines[i].match(OL)
        if (ordered ? o : u) {
          const m = (ordered ? o : u)!
          items.push({ depth: depthOf(m[1]), c: parseInline(ordered ? m[3] : m[2]) })
          i++
        } else if (u || o) {
          // A different list style at the same place starts a new block.
          break
        } else if (!isBlank(lines[i]) && /^\s{2,}\S/.test(lines[i]) && items.length > 0) {
          // Continuation line of the previous item.
          items[items.length - 1].c.push({ t: 'br' }, ...parseInline(lines[i].trim()))
          i++
        } else {
          break
        }
      }
      blocks.push(ordered ? { t: 'ol', start, items } : { t: 'ul', items })
      continue
    }

    if (QUOTE.test(line)) {
      const body: string[] = []
      while (i < lines.length && QUOTE.test(lines[i])) body.push(lines[i++].match(QUOTE)![1])
      blocks.push({ t: 'quote', c: parseInline(body.join('\n')) })
      continue
    }

    // Paragraph: consecutive lines that don't start another block.
    const para: string[] = []
    while (
      i < lines.length &&
      !isBlank(lines[i]) &&
      !FENCE.test(lines[i]) &&
      !HEADING.test(lines[i]) &&
      !HR.test(lines[i]) &&
      !UL.test(lines[i]) &&
      !OL.test(lines[i]) &&
      !QUOTE.test(lines[i])
    ) {
      para.push(lines[i++])
    }
    if (para.length === 0) {
      // Safety net: never loop without consuming a line.
      para.push(lines[i++])
    }
    blocks.push({ t: 'p', c: parseInline(para.join('\n')) })
  }
  return blocks
}
