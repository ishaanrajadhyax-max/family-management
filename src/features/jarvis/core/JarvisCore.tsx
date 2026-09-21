import { useEffect, useRef } from 'react'
import { useCoreState } from '../hooks/useCoreState'
import { useReducedMotion } from '../hooks/useMotionPreference'
import { readCoreLevel } from '../logic/coreStore.ts'
import { CORE_LABEL } from '../logic/coreState.ts'

const C = 200 // centre of the 400x400 drawing

const polar = (radius: number, deg: number) => {
  const rad = ((deg - 90) * Math.PI) / 180
  return [C + radius * Math.cos(rad), C + radius * Math.sin(rad)] as const
}

// Fixed geometry, built once.
const TICKS = Array.from({ length: 120 }, (_, i) => {
  const long = i % 10 === 0
  const [x1, y1] = polar(long ? 184 : 188, i * 3)
  const [x2, y2] = polar(196, i * 3)
  return { x1, y1, x2, y2, long }
})

const arc = (radius: number, from: number, to: number) => {
  const [x1, y1] = polar(radius, from)
  const [x2, y2] = polar(radius, to)
  return `M${x1.toFixed(2)} ${y1.toFixed(2)} A${radius} ${radius} 0 ${to - from > 180 ? 1 : 0} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`
}
const ARCS = [arc(166, 8, 84), arc(166, 98, 152), arc(166, 188, 262), arc(166, 278, 340)]
const SCAN_ARC = arc(134, 0, 70)

// Radial bars around the inner disc. Each has a fixed variation so the ring reads
// as a spectrum; the height of all of them scales with the one real level value.
const BARS = Array.from({ length: 72 }, (_, i) => ({
  deg: i * 5,
  k: 0.5 + 0.5 * Math.abs(Math.sin(i * 2.399)),
  delay: -((i * 37) % 1200),
}))
const MARKERS = [0, 90, 180, 270]

// The Jarvis Core. It draws whatever the core store says — idle, listening,
// thinking, speaking, error, attention — and, while listening or speaking,
// follows the real audio level through one CSS variable (--lvl) updated at most
// once per frame, without re-rendering React.
export default function JarvisCore() {
  const { state, detail } = useCoreState()
  const reduced = useReducedMotion()
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    el.style.setProperty('--lvl', '0')
    el.dataset.level = 'none'
    if (reduced || (state !== 'speaking' && state !== 'listening')) return

    let raf = 0
    let smooth = 0
    const tick = () => {
      if (!document.hidden) {
        const raw = readCoreLevel()
        const live = raw !== null
        if ((el.dataset.level === 'live') !== live) el.dataset.level = live ? 'live' : 'none'
        const target = raw ?? 0
        smooth += (target - smooth) * (target > smooth ? 0.55 : 0.16) // quick attack, slower release
        el.style.setProperty('--lvl', smooth.toFixed(3))
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [state, reduced])

  return (
    <div ref={rootRef} className="j-core" data-state={state} role="img" aria-label={`Jarvis core: ${CORE_LABEL[state].toLowerCase()}${detail ? `, ${detail.toLowerCase()}` : ''}`}>
      <svg viewBox="0 0 400 400" className="j-core-svg" aria-hidden="true" focusable="false">
        <defs>
          <radialGradient id="j-core-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--core)" stopOpacity="0.55" />
            <stop offset="55%" stopColor="var(--core)" stopOpacity="0.16" />
            <stop offset="100%" stopColor="var(--core)" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="j-core-disc" cx="50%" cy="42%" r="60%">
            <stop offset="0%" stopColor="var(--core)" stopOpacity="0.32" />
            <stop offset="70%" stopColor="#031019" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#020a10" stopOpacity="0.95" />
          </radialGradient>
        </defs>

        <circle className="j-core-halo" cx={C} cy={C} r="196" fill="url(#j-core-glow)" />

        <g className="j-core-ticks">
          {TICKS.map((t, i) => (
            <line key={i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} className={t.long ? 'long' : undefined} />
          ))}
        </g>

        <circle className="j-core-dash" cx={C} cy={C} r="176" />

        <g className="j-core-arcs">
          {ARCS.map((d, i) => (
            <path key={i} d={d} />
          ))}
        </g>

        <circle className="j-core-thin" cx={C} cy={C} r="150" />
        {MARKERS.map((deg) => {
          const [x, y] = polar(150, deg)
          return <rect key={deg} className="j-core-marker" x={x - 3} y={y - 3} width="6" height="6" transform={`rotate(45 ${x} ${y})`} />
        })}

        <path className="j-core-scan" d={SCAN_ARC} />

        <g className="j-core-bars">
          {BARS.map((b, i) => (
            <g key={i} transform={`rotate(${b.deg} ${C} ${C})`}>
              <rect
                className="j-core-bar"
                x={C - 1.5}
                y={C - 122 - 28}
                width="3"
                height="28"
                rx="1.5"
                style={{ '--k': b.k, '--d': `${b.delay}ms` } as React.CSSProperties}
              />
            </g>
          ))}
        </g>

        <circle className="j-core-disc" cx={C} cy={C} r="108" fill="url(#j-core-disc)" />
        <circle className="j-core-inner" cx={C} cy={C} r="100" />
        <circle className="j-core-attn" cx={C} cy={C} r="112" />

        <text className="j-core-word" x={C} y={C - 6} textAnchor="middle">
          JARVIS
        </text>
        <text className="j-core-state" x={C} y={C + 18} textAnchor="middle">
          CORE // {CORE_LABEL[state]}
        </text>
        {detail && (
          <text className="j-core-detail" x={C} y={C + 36} textAnchor="middle">
            {detail}
          </text>
        )}
      </svg>
    </div>
  )
}
