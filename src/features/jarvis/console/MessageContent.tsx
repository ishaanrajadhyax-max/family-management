import { Fragment, useMemo } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { parseMarkdown } from '../logic/markdownParse.ts'
import type { Block, Inline } from '../logic/markdownParse.ts'

function renderInline(nodes: Inline[]): ReactNode {
  return nodes.map((n, i) => {
    switch (n.t) {
      case 'text':
        return <Fragment key={i}>{n.v}</Fragment>
      case 'strong':
        return <strong key={i}>{renderInline(n.c)}</strong>
      case 'em':
        return <em key={i}>{renderInline(n.c)}</em>
      case 'del':
        return <del key={i}>{renderInline(n.c)}</del>
      case 'code':
        return <code key={i}>{n.v}</code>
      case 'link':
        return (
          <a key={i} href={n.href} target="_blank" rel="noopener noreferrer">
            {renderInline(n.c)}
          </a>
        )
      case 'br':
        return <br key={i} />
    }
  })
}

function renderBlock(b: Block, key: number, style: CSSProperties | undefined, cls: string): ReactNode {
  switch (b.t) {
    case 'p':
      return (
        <p key={key} className={cls} style={style}>
          {renderInline(b.c)}
        </p>
      )
    case 'h': {
      const Tag = (`h${Math.min(6, b.level + 2)}`) as 'h3' | 'h4' | 'h5' | 'h6'
      return (
        <Tag key={key} className={`j-md-h ${cls}`} style={style}>
          {renderInline(b.c)}
        </Tag>
      )
    }
    case 'ul':
    case 'ol': {
      const Tag = b.t
      return (
        <Tag key={key} className={cls} style={style} start={b.t === 'ol' && b.start !== 1 ? b.start : undefined}>
          {b.items.map((item, i) => (
            <li key={i} style={item.depth ? { marginLeft: `${item.depth * 1.1}rem` } : undefined}>
              {renderInline(item.c)}
            </li>
          ))}
        </Tag>
      )
    }
    case 'code':
      return (
        <pre key={key} className={`j-md-code ${cls}`} style={style}>
          {b.lang && <span className="j-md-lang">{b.lang}</span>}
          <code>{b.v}</code>
        </pre>
      )
    case 'quote':
      return (
        <blockquote key={key} className={cls} style={style}>
          {renderInline(b.c)}
        </blockquote>
      )
    case 'table':
      return (
        <div key={key} className={`j-md-table-wrap ${cls}`} style={style}>
          <table>
            <thead>
              <tr>
                {b.head.map((cell, i) => (
                  <th key={i}>{renderInline(cell)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {b.rows.map((row, r) => (
                <tr key={r}>
                  {row.map((cell, c) => (
                    <td key={c}>{renderInline(cell)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    case 'hr':
      return <hr key={key} className={cls} style={style} />
  }
}

interface MessageContentProps {
  content: string
  // When true (a reply that just arrived), blocks appear one after another over
  // a short, fixed time. Long replies and history appear instantly: reading comes first.
  reveal?: boolean
}

const REVEAL_MAX_CHARS = 900
const REVEAL_STEP_MS = 70
const REVEAL_MAX_MS = 700

export default function MessageContent({ content, reveal = false }: MessageContentProps) {
  const blocks = useMemo(() => parseMarkdown(content), [content])
  const animate = reveal && content.length <= REVEAL_MAX_CHARS
  const step = animate ? Math.min(REVEAL_STEP_MS, REVEAL_MAX_MS / Math.max(1, blocks.length)) : 0

  return (
    <div className="j-md">
      {blocks.map((b, i) =>
        renderBlock(b, i, animate ? { animationDelay: `${Math.round(i * step)}ms` } : undefined, animate ? 'j-reveal' : ''),
      )}
    </div>
  )
}
