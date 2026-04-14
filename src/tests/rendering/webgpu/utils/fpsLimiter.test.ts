import { describe, expect, it } from 'vitest'

import { evaluateFpsLimit } from '@/rendering/webgpu/utils/fpsLimiter'

interface SimulationArgs {
  maxFps: number
  displayFps: number
  durationSeconds: number
}

/**
 * Simulate the rAF loop's throttle decision over a run at a fixed display cadence.
 * Matches the production pattern in {@link useSceneFrameLoop}.
 */
function runLimiterSimulation({ maxFps, displayFps, durationSeconds }: SimulationArgs): {
  renderedFrames: number
  achievedFps: number
} {
  const tickMs = 1000 / displayFps
  const durationMs = durationSeconds * 1000

  let throttleAnchorMs = 0
  let renderedFrames = 0

  const frameCount = Math.floor(durationMs / tickMs)
  for (let frame = 1; frame <= frameCount; frame++) {
    const nowMs = frame * tickMs
    const decision = evaluateFpsLimit({ nowMs, throttleAnchorMs, maxFps })
    throttleAnchorMs = decision.nextThrottleAnchorMs
    if (decision.shouldRender) renderedFrames++
  }

  return {
    renderedFrames,
    achievedFps: renderedFrames / durationSeconds,
  }
}

describe('evaluateFpsLimit — unthrottled modes', () => {
  it('renders when maxFps is 0 (disabled)', () => {
    const result = evaluateFpsLimit({ nowMs: 100, throttleAnchorMs: 0, maxFps: 0 })
    expect(result.shouldRender).toBe(true)
    expect(result.nextThrottleAnchorMs).toBe(100)
  })

  it('renders when maxFps is negative', () => {
    const result = evaluateFpsLimit({ nowMs: 100, throttleAnchorMs: 0, maxFps: -30 })
    expect(result.shouldRender).toBe(true)
  })

  it('renders when maxFps is NaN', () => {
    const result = evaluateFpsLimit({ nowMs: 100, throttleAnchorMs: 0, maxFps: NaN })
    expect(result.shouldRender).toBe(true)
  })

  it('renders when maxFps is Infinity', () => {
    const result = evaluateFpsLimit({ nowMs: 100, throttleAnchorMs: 0, maxFps: Infinity })
    expect(result.shouldRender).toBe(true)
  })
})

describe('evaluateFpsLimit — throttling decisions', () => {
  it('renders on the first frame with a valid maxFps', () => {
    const result = evaluateFpsLimit({ nowMs: 0, throttleAnchorMs: 0, maxFps: 60 })
    expect(result.shouldRender).toBe(true)
  })

  it('skips a frame when called too soon at 30fps', () => {
    const first = evaluateFpsLimit({ nowMs: 0, throttleAnchorMs: 0, maxFps: 30 })
    expect(first.shouldRender).toBe(true)

    // 10ms later — too soon for 30fps (33.33ms interval)
    const second = evaluateFpsLimit({
      nowMs: 10,
      throttleAnchorMs: first.nextThrottleAnchorMs,
      maxFps: 30,
    })
    expect(second.shouldRender).toBe(false)
  })

  it('renders when enough time has passed at 30fps', () => {
    const first = evaluateFpsLimit({ nowMs: 0, throttleAnchorMs: 0, maxFps: 30 })
    const second = evaluateFpsLimit({
      nowMs: 34,
      throttleAnchorMs: first.nextThrottleAnchorMs,
      maxFps: 30,
    })
    expect(second.shouldRender).toBe(true)
  })

  it('returns the existing anchor unchanged when skipping a frame', () => {
    // Regression: when shouldRender=false the anchor must not drift backward,
    // otherwise the next frame would always render.
    const result = evaluateFpsLimit({ nowMs: 10, throttleAnchorMs: 16, maxFps: 60 })
    expect(result.shouldRender).toBe(false)
    expect(result.nextThrottleAnchorMs).toBe(16)
  })

  it('catches up after a large frame gap without freezing', () => {
    const first = evaluateFpsLimit({ nowMs: 0, throttleAnchorMs: 0, maxFps: 60 })
    const second = evaluateFpsLimit({
      nowMs: 200,
      throttleAnchorMs: first.nextThrottleAnchorMs,
      maxFps: 60,
    })
    expect(second.shouldRender).toBe(true)
    expect(second.nextThrottleAnchorMs).toBeGreaterThan(200)
  })
})

describe('evaluateFpsLimit — NaN / Infinity recovery', () => {
  it('handles NaN nowMs by treating it as 0', () => {
    const result = evaluateFpsLimit({ nowMs: NaN, throttleAnchorMs: 0, maxFps: 60 })
    expect(result.shouldRender).toBe(true)
    expect(result.nextThrottleAnchorMs).toBeCloseTo(1000 / 60, 1)
  })

  it('handles NaN throttleAnchorMs by treating it as 0', () => {
    const result = evaluateFpsLimit({ nowMs: 100, throttleAnchorMs: NaN, maxFps: 60 })
    expect(result.shouldRender).toBe(true)
  })

  it('recovers from an Infinity anchor instead of freezing renders', () => {
    const decision = evaluateFpsLimit({
      nowMs: 100,
      throttleAnchorMs: Number.POSITIVE_INFINITY,
      maxFps: 60,
    })
    expect(decision.shouldRender).toBe(true)
    expect(Number.isFinite(decision.nextThrottleAnchorMs)).toBe(true)
  })
})

describe('evaluateFpsLimit — long-run cadence', () => {
  it('achieves ~45 FPS on a 60 Hz cadence instead of collapsing to 30', () => {
    const result = runLimiterSimulation({ maxFps: 45, displayFps: 60, durationSeconds: 4 })
    expect(result.achievedFps).toBeGreaterThan(44.5)
    expect(result.achievedFps).toBeLessThan(45.5)
  })

  it('achieves ~50 FPS on a 60 Hz cadence', () => {
    const result = runLimiterSimulation({ maxFps: 50, displayFps: 60, durationSeconds: 4 })
    expect(result.achievedFps).toBeGreaterThan(49.5)
    expect(result.achievedFps).toBeLessThan(50.5)
  })

  it('does not exceed the display cadence when target FPS exceeds refresh rate', () => {
    const result = runLimiterSimulation({ maxFps: 120, displayFps: 60, durationSeconds: 4 })
    expect(result.achievedFps).toBeGreaterThan(59.5)
    expect(result.achievedFps).toBeLessThan(60.5)
  })

  it('maintains consistent long-run average for non-divisor FPS (45fps @ ~143Hz tick)', () => {
    const targetFps = 45
    let anchor = 0
    let rendered = 0
    const duration = 2000

    for (let t = 0; t < duration; t += 7) {
      const result = evaluateFpsLimit({ nowMs: t, throttleAnchorMs: anchor, maxFps: targetFps })
      if (result.shouldRender) rendered++
      anchor = result.nextThrottleAnchorMs
    }

    const actualFps = (rendered * 1000) / duration
    // Tighter than ±10% — catches meaningful throttling regressions
    expect(Math.abs(actualFps - targetFps)).toBeLessThan(2)
  })
})
