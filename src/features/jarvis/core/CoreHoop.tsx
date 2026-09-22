import { classifyShot } from '../logic/basketballPhysics.ts'
import type { Vec2 } from '../logic/interactionState.ts'
import { DEFAULT_SHOT_CONFIG } from '../logic/basketballPhysics.ts'

// The basketball interaction's target — a technical, HUD-style reticle, not
// a literal orange hoop, to match the Core's own visual language. Drawn in
// the same 0..100 "stage percent" space basketballPhysics.ts works in
// (viewBox 0 0 100 100, non-uniform scale on purpose: it must line up with
// useCoreInteraction's own width/height-independent percent conversion, not
// with a square aspect ratio).
//
// This SVG is a sibling of `.j-core`, not a child of it, so it stays fixed
// in place while the Core itself flies toward it (JarvisCore.tsx wraps both
// in a shared, static, stage-filling parent).
const { x: rimX, y: rimY } = DEFAULT_SHOT_CONFIG.rim
const { x: launchX, y: launchY } = DEFAULT_SHOT_CONFIG.launch

export interface CoreHoopProps {
  dragDelta?: Vec2 // present while aiming — draws a live trajectory preview
}

// Always rendered while the Core is interactive — a permanent, low-key
// target, not something that only appears mid-aim; that would make the
// basketball interaction hard to discover.
export default function CoreHoop({ dragDelta }: CoreHoopProps) {
  const preview = dragDelta ? classifyShot(dragDelta).trajectory : null
  const path = preview ? `M${preview.map((s) => `${s.x.toFixed(1)} ${s.y.toFixed(1)}`).join(' L')}` : null

  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="j-hoop-svg" aria-hidden="true" focusable="false">
      <line className="j-hoop-backboard" x1={rimX + 2} y1={rimY - 7} x2={rimX + 2} y2={rimY + 5} />
      <circle className="j-hoop-rim" cx={rimX} cy={rimY} r="3.4" />
      <line className="j-hoop-tick" x1={rimX - 6} y1={rimY} x2={rimX - 3.6} y2={rimY} />
      <line className="j-hoop-tick" x1={rimX + 3.6} y1={rimY} x2={rimX + 6} y2={rimY} />
      {path && <path className="j-hoop-trajectory" d={path} />}
      {!path && <circle className="j-hoop-launch" cx={launchX} cy={launchY} r="1.4" />}
    </svg>
  )
}
