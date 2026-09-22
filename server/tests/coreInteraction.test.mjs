// Pure logic behind the Core Interaction Engine: interaction state/store,
// the response picker, the response pools, and the basketball physics. No
// DOM, no React — imported the same way as the other frontend-logic tests in
// this project, via Node's native TypeScript support.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { IDLE_INTERACTION, isInteractionBusy } from '../../src/features/jarvis/logic/interactionState.ts'
import {
  getInteractionSnapshot,
  setInteractionSnapshot,
  resetInteraction,
  subscribeInteraction,
} from '../../src/features/jarvis/logic/interactionStore.ts'
import { pickResponse } from '../../src/features/jarvis/logic/responsePool.ts'
import { TAP_RESPONSES, SHOT_RESPONSES } from '../../src/features/jarvis/logic/coreResponses.ts'
import { computeTrajectory, classifyShot, DEFAULT_SHOT_CONFIG, FALLBACK_SHOT_DRAG } from '../../src/features/jarvis/logic/basketballPhysics.ts'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const JARVIS_SRC = path.join(HERE, '..', '..', 'src', 'features', 'jarvis')

// ------------------------------------------------------------- interaction state

test('interaction state: IDLE_INTERACTION is phase "none" with nothing else set', () => {
  assert.deepEqual(IDLE_INTERACTION, { phase: 'none' })
})

test('interaction state: busy phases are every phase except "none"', () => {
  const all = ['none', 'pressed', 'tap-react', 'grabbed', 'aiming', 'shooting', 'outcome', 'returning']
  for (const phase of all) assert.equal(isInteractionBusy(phase), phase !== 'none', phase)
})

// ------------------------------------------------------------- interaction store

test('interaction store: starts idle, updates on set, and notifies subscribers only on set (not on read)', () => {
  resetInteraction()
  assert.deepEqual(getInteractionSnapshot(), { phase: 'none' })

  const seen = []
  const unsubscribe = subscribeInteraction(() => seen.push(getInteractionSnapshot().phase))
  getInteractionSnapshot() // a read must not notify
  assert.equal(seen.length, 0)

  setInteractionSnapshot({ phase: 'tap-react', tapResponse: 'Ow, sir.' })
  assert.deepEqual(getInteractionSnapshot(), { phase: 'tap-react', tapResponse: 'Ow, sir.' })
  assert.deepEqual(seen, ['tap-react'])

  resetInteraction()
  assert.deepEqual(getInteractionSnapshot(), { phase: 'none' })
  assert.deepEqual(seen, ['tap-react', 'none'])

  unsubscribe()
  setInteractionSnapshot({ phase: 'grabbed' })
  assert.equal(seen.length, 2, 'unsubscribed listeners hear nothing')
  resetInteraction()
})

test('interaction store: completely independent of coreStore.ts — no shared module, no shared state (checked as actual imports/calls, not comment text)', () => {
  const storeSrc = fs.readFileSync(path.join(JARVIS_SRC, 'logic', 'interactionStore.ts'), 'utf8')
  const stateSrc = fs.readFileSync(path.join(JARVIS_SRC, 'logic', 'interactionState.ts'), 'utf8')
  const importsCoreStore = /^\s*import[^\n]*from\s*['"][^'"]*coreStore/m
  const callsSetCoreSignal = /setCoreSignal\s*\(/
  for (const src of [storeSrc, stateSrc]) {
    assert.doesNotMatch(src, importsCoreStore)
    assert.doesNotMatch(src, callsSetCoreSignal)
  }
})

test('INVARIANT: no interaction-engine file ever calls setCoreSignal — a game can never corrupt real Jarvis system state', () => {
  const files = [
    'logic/interactionState.ts',
    'logic/interactionStore.ts',
    'logic/responsePool.ts',
    'logic/coreResponses.ts',
    'logic/basketballPhysics.ts',
    'hooks/useCoreGesture.ts',
    'hooks/useCoreInteraction.ts',
    'hooks/useInteractionState.ts',
    'core/CoreInteractionLayer.tsx',
    'core/CoreHoop.tsx',
    'core/JarvisCore.tsx',
  ]
  for (const rel of files) {
    const full = path.join(JARVIS_SRC, rel)
    if (!fs.existsSync(full)) continue // some are written after this test file; re-run covers them
    const src = fs.readFileSync(full, 'utf8')
    assert.doesNotMatch(src, /setCoreSignal\s*\(/, rel)
  }
})

// ------------------------------------------------------------- response pool

test('pickResponse: always returns a member of the pool', () => {
  const pool = ['a', 'b', 'c']
  for (let i = 0; i < 50; i++) assert.ok(pool.includes(pickResponse(pool, undefined, () => i / 50)))
})

test('pickResponse: a single-item pool always returns that item, even asked to avoid it', () => {
  assert.equal(pickResponse(['only'], 'only'), 'only')
})

test('pickResponse: throws on an empty pool rather than returning undefined silently', () => {
  assert.throws(() => pickResponse([]), /empty/)
})

test('pickResponse: avoids repeating the given value when the pool allows it', () => {
  // A rigged random source that would pick index 0 every time if not for the avoid-repeat retry.
  const pool = ['x', 'y', 'z']
  let call = 0
  const random = () => (call++ === 0 ? 0 : 0.5) // first call points at 'x' (avoid), retry points at 'y'
  assert.equal(pickResponse(pool, 'x', random), 'y')
})

test('pickResponse: with a real random source, every pool member turns up over many draws (no dead entries)', () => {
  const pool = TAP_RESPONSES
  const seen = new Set()
  for (let i = 0; i < 500; i++) seen.add(pickResponse(pool))
  assert.equal(seen.size, pool.length)
})

// ------------------------------------------------------------- response pools (data)

test('response pools: tap responses match the specified lines exactly', () => {
  assert.deepEqual(TAP_RESPONSES, ['Ow, sir.', 'Easy, sir.', 'I felt that.', 'Really, sir?', 'That was unnecessary.'])
})

test('response pools: shot responses cover exactly made/close/miss/very_bad_miss, each with multiple lines, no duplicates within a pool', () => {
  assert.deepEqual(Object.keys(SHOT_RESPONSES).sort(), ['close', 'made', 'miss', 'very_bad_miss'])
  for (const [outcome, lines] of Object.entries(SHOT_RESPONSES)) {
    assert.ok(lines.length >= 3, `${outcome} needs several lines to avoid repetition`)
    assert.equal(new Set(lines).size, lines.length, `${outcome} has a duplicate line`)
  }
  assert.deepEqual(SHOT_RESPONSES.made, ['Good shot, sir.', 'Beautiful.', 'Nothing but net.'])
  assert.deepEqual(SHOT_RESPONSES.very_bad_miss, ['Sir... where exactly were you aiming?', "That wasn't even close.", 'You can do better than that, sir.'])
})

// ------------------------------------------------------------- basketball physics

test('physics: pure and deterministic — identical inputs give byte-identical outputs, every time', () => {
  const drag = { x: -12, y: 21 }
  const a = classifyShot(drag)
  const b = classifyShot(drag)
  const c = classifyShot({ ...drag })
  assert.deepEqual(a, b)
  assert.deepEqual(a, c)
  assert.equal(JSON.stringify(computeTrajectory(drag)), JSON.stringify(computeTrajectory(drag)))
})

test('physics: contains no actual call to Math.random anywhere (outcome must never depend on chance)', () => {
  const src = fs.readFileSync(path.join(JARVIS_SRC, 'logic', 'basketballPhysics.ts'), 'utf8')
  assert.doesNotMatch(src, /Math\.random\s*\(/)
})

// Canonical fixtures found by sweeping the DEFAULT_SHOT_CONFIG's velocity space
// for the actual scoring optimum, then nudging away from it — not guessed.
test('physics: a well-aimed, well-powered drag scores MADE', () => {
  const r = classifyShot({ x: -6.19, y: 24.29 })
  assert.equal(r.outcome, 'made')
  assert.ok(r.closestApproach <= DEFAULT_SHOT_CONFIG.rimRadius)
})

test('physics: a small aiming error lands CLOSE', () => {
  const r = classifyShot({ x: -3.79, y: 23.69 })
  assert.equal(r.outcome, 'close')
})

test('physics: a bigger aiming error lands an ordinary MISS', () => {
  const r = classifyShot({ x: -2.59, y: 23.39 })
  assert.equal(r.outcome, 'miss')
})

test('physics: a badly wrong drag direction is a VERY_BAD_MISS', () => {
  const r = classifyShot({ x: 20, y: -10 }) // dragged the wrong way entirely
  assert.equal(r.outcome, 'very_bad_miss')
})

test('physics: a barely-there drag is a VERY_BAD_MISS (too weak to reach the rim at all)', () => {
  const r = classifyShot({ x: -2, y: 3 })
  assert.equal(r.outcome, 'very_bad_miss')
  assert.ok(r.apexY > DEFAULT_SHOT_CONFIG.rim.y, 'never even reaches rim height')
})

test('physics: the four canonical outcomes are ordered by closeness, and MADE is the smallest distance of all', () => {
  const made = classifyShot({ x: -6.19, y: 24.29 })
  const close = classifyShot({ x: -3.79, y: 23.69 })
  const miss = classifyShot({ x: -2.59, y: 23.39 })
  assert.ok(made.closestApproach < close.closestApproach)
  assert.ok(close.closestApproach < miss.closestApproach)
})

test('physics: the fallback shot (keyboard/no-pointer path) is tuned to actually score', () => {
  const r = classifyShot(FALLBACK_SHOT_DRAG)
  assert.equal(r.outcome, 'made')
})

test('physics: trajectory samples start at the launch point and are monotonically increasing in time', () => {
  const traj = computeTrajectory({ x: -6.19, y: 24.29 })
  assert.ok(traj.length > 10)
  assert.equal(traj[0].t, 0)
  assert.equal(traj[0].x, DEFAULT_SHOT_CONFIG.launch.x)
  assert.equal(traj[0].y, DEFAULT_SHOT_CONFIG.launch.y)
  for (let i = 1; i < traj.length; i++) assert.ok(traj[i].t > traj[i - 1].t)
})

test('physics: gravity is really being applied — the ball always ends up below its own apex', () => {
  const traj = computeTrajectory({ x: -6.19, y: 24.29 })
  const apexY = Math.min(...traj.map((s) => s.y))
  assert.ok(traj.at(-1).y > apexY, 'the flight comes back down after its peak')
})

test('physics: a zero drag does not throw, divide by zero, or produce NaN/Infinity', () => {
  const r = classifyShot({ x: 0, y: 0 })
  assert.ok(Number.isFinite(r.closestApproach))
  assert.ok(Number.isFinite(r.apexY))
  assert.ok(r.trajectory.every((s) => Number.isFinite(s.x) && Number.isFinite(s.y) && Number.isFinite(s.t)))
})

test('physics: an absurdly large drag is capped by maxSpeed, not left to blow up the numbers', () => {
  const capped = classifyShot({ x: -6.19 * 1000, y: 24.29 * 1000 })
  const normal = classifyShot({ x: -6.19, y: 24.29 })
  assert.ok(capped.trajectory.every((s) => Number.isFinite(s.x) && Number.isFinite(s.y)))
  // A wildly overpowered shot should fly further/faster than the tuned one, but not
  // approach anything resembling an unbounded value.
  assert.ok(Math.abs(capped.trajectory.at(-1).x) < 100000)
  assert.notDeepEqual(capped, normal)
})

test('physics: outcome is symmetric under a mirrored config (sanity check that the geometry, not a hardcoded side, drives the result)', () => {
  const mirrored = {
    ...DEFAULT_SHOT_CONFIG,
    launch: { x: 100 - DEFAULT_SHOT_CONFIG.launch.x, y: DEFAULT_SHOT_CONFIG.launch.y },
    rim: { x: 100 - DEFAULT_SHOT_CONFIG.rim.x, y: DEFAULT_SHOT_CONFIG.rim.y },
  }
  const original = classifyShot({ x: -6.19, y: 24.29 }, DEFAULT_SHOT_CONFIG)
  const mirroredResult = classifyShot({ x: 6.19, y: 24.29 }, mirrored)
  assert.equal(original.outcome, mirroredResult.outcome)
  assert.ok(Math.abs(original.closestApproach - mirroredResult.closestApproach) < 1e-9)
})
