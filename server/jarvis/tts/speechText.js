// Turns a Jarvis reply into text that sounds right when read aloud, and
// trims it to a length worth speaking. Pure functions, no I/O.
//
// Replies are written for reading (Markdown: bold, bullets, tables, links,
// emoji). A TTS engine either reads those symbols out or stumbles over
// them, so they're removed here BEFORE anything is sent to Unreal Speech.
// The chat transcript is unaffected — it still shows the full reply.

const EMOJI = /[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu

export function cleanForSpeech(input) {
  // Emoji go first so a line like "🙂 ---" is recognised as a bare rule below.
  let text = String(input ?? '').replace(EMOJI, '').replace(/\r\n?/g, '\n')

  // Fenced code and inline code: not worth reading aloud.
  text = text.replace(/```[\s\S]*?```/g, ' ').replace(/~~~[\s\S]*?~~~/g, ' ')
  text = text.replace(/`([^`]*)`/g, '$1')

  // Tables: drop the separator row, turn cell pipes into commas.
  text = text
    .split('\n')
    .filter((line) => !/^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(line) || !/-/.test(line))
    .map((line) => (/^\s*\|.*\|\s*$/.test(line) ? line.replace(/^\s*\||\|\s*$/g, '').split('|').map((c) => c.trim()).filter(Boolean).join(', ') : line))
    .join('\n')

  // Links and images: keep the visible text only. Bare URLs are dropped.
  text = text.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
  text = text.replace(/\bhttps?:\/\/\S+/g, ' ')

  // Headings, blockquotes, list markers, horizontal rules.
  text = text
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/^\s*([-*+]|\d+[.)])\s+/gm, '')
    .replace(/^\s*([-*_]\s*){3,}$/gm, ' ')

  // Emphasis markers.
  text = text.replace(/(\*\*|__)(.+?)\1/g, '$2').replace(/(\*|_)(.+?)\1/g, '$2').replace(/~~(.+?)~~/g, '$1')
  text = text.replace(/[*_~#|]+/g, ' ')

  // Each remaining line becomes its own sentence so the pauses stay natural.
  text = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => (/[.!?:;,]$/.test(l) ? l : `${l}.`))
    .join(' ')

  text = text.replace(/\s+/g, ' ').replace(/\s+([.,!?;:])/g, '$1').trim()
  // Nothing but punctuation is nothing to say — and nothing worth paying for.
  return /[\p{L}\p{N}]/u.test(text) ? text : ''
}

// Trims to at most maxChars, ending on a sentence boundary when possible
// (else on a word), so speech never stops mid-word. Returns the text and
// whether anything was cut.
export function limitForSpeech(text, maxChars) {
  if (text.length <= maxChars) return { text, truncated: false }
  const slice = text.slice(0, maxChars)
  const sentenceEnd = Math.max(slice.lastIndexOf('. '), slice.lastIndexOf('! '), slice.lastIndexOf('? '))
  if (sentenceEnd >= maxChars * 0.4) return { text: slice.slice(0, sentenceEnd + 1), truncated: true }
  const wordEnd = slice.lastIndexOf(' ')
  const cut = (wordEnd > 0 ? slice.slice(0, wordEnd) : slice).replace(/[,;:\s]+$/, '')
  return { text: /[.!?]$/.test(cut) ? cut : `${cut}.`, truncated: true }
}
