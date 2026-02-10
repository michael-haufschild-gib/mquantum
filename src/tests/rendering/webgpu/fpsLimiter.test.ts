import { describe, expect, it } from 'vitest'
import { evaluateFpsLimit } from '@/rendering/webgpu/utils/fpsLimiter'

interface SimulationArgs {
  maxFps: number
  displayFps: number
  durationSeconds: number
}

function runLimiterSimulation({
  maxFps,
  displayFps,
  durationSeconds,
}: SimulationArgs): { renderedFrames: number; achievedFps: number } {
  const tickMs = 1000 / displayFps
  const durationMs = durationSeconds * 1000

  let throttleAnchorMs = 0
  let renderedFrames = 0

  for (let nowMs = tickMs; nowMs <= durationMs + 1e-9; nowMs += tickMs) {
    const decision = evaluateFpsLimit({
      nowMs,
      throttleAnchorMs,
      maxFps,
    })

    throttleAnchorMs = decision.nextThrottleAnchorMs
    if (decision.shouldRender) {
      renderedFrames++
    }
  }

  return {
    renderedFrames,
    achievedFps: renderedFrames / durationSeconds,
  }
}

describe('evaluateFpsLimit', () => {
  it('renders continuously when max FPS limiting is disabled', () => {
    const decision = evaluateFpsLimit({
      nowMs: 100,
      throttleAnchorMs: 50,
      maxFps: 0,
    })

    expect(decision.shouldRender).toBe(true)
    expect(decision.nextThrottleAnchorMs).toBe(100)
  })

  it('skips frame when elapsed time is below the target interval', () => {
    const decision = evaluateFpsLimit({
      nowMs: 10,
      throttleAnchorMs: 16,
      maxFps: 60,
    })

    expect(decision.shouldRender).toBe(false)
    expect(decision.nextThrottleAnchorMs).toBe(16)
  })

  it('achieves ~45 FPS on a 60 Hz cadence instead of collapsing to 30 FPS', () => {
    const result = runLimiterSimulation({
      maxFps: 45,
      displayFps: 60,
      durationSeconds: 4,
    })

    expect(result.achievedFps).toBeGreaterThan(44.5)
    expect(result.achievedFps).toBeLessThan(45.5)
  })

  it('achieves ~50 FPS on a 60 Hz cadence', () => {
    const result = runLimiterSimulation({
      maxFps: 50,
      displayFps: 60,
      durationSeconds: 4,
    })

    expect(result.achievedFps).toBeGreaterThan(49.5)
    expect(result.achievedFps).toBeLessThan(50.5)
  })

  it('does not exceed the display cadence when target FPS is above refresh rate', () => {
    const result = runLimiterSimulation({
      maxFps: 120,
      displayFps: 60,
      durationSeconds: 4,
    })

    expect(result.achievedFps).toBeGreaterThan(59.5)
    expect(result.achievedFps).toBeLessThan(60.5)
  })
})
