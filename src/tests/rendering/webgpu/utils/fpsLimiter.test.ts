import { describe, expect, it } from 'vitest'

import { evaluateFpsLimit } from '@/rendering/webgpu/utils/fpsLimiter'

describe('evaluateFpsLimit', () => {
  it('renders when maxFps is disabled (0)', () => {
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

  it('renders on first frame with valid maxFps', () => {
    const result = evaluateFpsLimit({ nowMs: 0, throttleAnchorMs: 0, maxFps: 60 })
    expect(result.shouldRender).toBe(true)
  })

  it('skips frame when called too soon at 30fps', () => {
    // 30 fps = 33.33ms interval
    const first = evaluateFpsLimit({ nowMs: 0, throttleAnchorMs: 0, maxFps: 30 })
    expect(first.shouldRender).toBe(true)

    // 10ms later — too soon for 30fps
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

  it('handles NaN nowMs by treating it as 0', () => {
    const result = evaluateFpsLimit({ nowMs: NaN, throttleAnchorMs: 0, maxFps: 60 })
    expect(result.shouldRender).toBe(true)
    expect(result.nextThrottleAnchorMs).toBeCloseTo(1000 / 60, 1)
  })

  it('handles NaN throttleAnchorMs by treating it as 0', () => {
    const result = evaluateFpsLimit({ nowMs: 100, throttleAnchorMs: NaN, maxFps: 60 })
    expect(result.shouldRender).toBe(true)
  })

  it('catches up after large frame gap (skipped intervals)', () => {
    // Start at t=0, 60fps (16.67ms interval)
    const first = evaluateFpsLimit({ nowMs: 0, throttleAnchorMs: 0, maxFps: 60 })
    // Jump to t=200ms — several frames were missed
    const second = evaluateFpsLimit({
      nowMs: 200,
      throttleAnchorMs: first.nextThrottleAnchorMs,
      maxFps: 60,
    })
    expect(second.shouldRender).toBe(true)
    // Anchor should be in the future relative to now
    expect(second.nextThrottleAnchorMs).toBeGreaterThan(200)
  })

  it('maintains consistent long-run average for non-divisor FPS', () => {
    // Test 45fps (not a divisor of typical 60Hz/144Hz displays)
    const targetFps = 45
    let anchor = 0
    let rendered = 0
    const duration = 2000 // 2 seconds

    for (let t = 0; t < duration; t += 7) {
      // ~143 Hz tick rate
      const result = evaluateFpsLimit({ nowMs: t, throttleAnchorMs: anchor, maxFps: targetFps })
      if (result.shouldRender) rendered++
      anchor = result.nextThrottleAnchorMs
    }

    const actualFps = (rendered * 1000) / duration
    // Allow 10% tolerance
    expect(actualFps).toBeGreaterThan(targetFps * 0.9)
    expect(actualFps).toBeLessThan(targetFps * 1.1)
  })
})
