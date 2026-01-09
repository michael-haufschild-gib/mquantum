/**
 * Test to verify horizon detection code is present in compiled shader
 */

import { composeBlackHoleShader } from '@/rendering/shaders/blackhole/compose'
import { describe, expect, it } from 'vitest'

describe('Black Hole Horizon Detection', () => {
  it('should include immediate horizon check after ray step', () => {
    const { fragmentShader } = composeBlackHoleShader({
      dimension: 3,
      shadows: false,
      temporal: false,
      ambientOcclusion: false,
    })

    // Check for the immediate horizon check comment
    expect(fragmentShader).toContain('IMMEDIATE HORIZON CHECK')

    // Check for the post-step radius calculation
    // PERF (OPT-BH-1): postStepRadius was renamed to ndRadius for loop carry optimization.
    // The pattern now computes ndRadius once after stepping and reuses it next iteration.
    expect(fragmentShader).toContain('ndRadius = ndDistance(pos)')

    // Check for isInsideHorizon call with ndRadius (was postStepRadius before OPT-BH-1)
    expect(fragmentShader).toContain('isInsideHorizon(ndRadius)')

    // Check for the visual horizon check in horizon.glsl.ts
    expect(fragmentShader).toContain('ndRadius < uVisualEventHorizon')
  })

  it('should use uVisualEventHorizon for horizon check', () => {
    const { fragmentShader } = composeBlackHoleShader({
      dimension: 3,
      shadows: false,
      temporal: false,
      ambientOcclusion: false,
    })

    // The isInsideHorizon function should check against uVisualEventHorizon
    // This accounts for Kerr spin (smaller horizon for spinning black holes)
    expect(fragmentShader).toContain('return ndRadius < uVisualEventHorizon')
  })

  it('should set hitHorizon and transmittance when crossing horizon', () => {
    const { fragmentShader } = composeBlackHoleShader({
      dimension: 3,
      shadows: false,
      temporal: false,
      ambientOcclusion: false,
    })

    // When horizon is crossed, these should be set:
    // 1. transmittance = 0 (no light passes through)
    // 2. hitHorizon = true (flag for post-loop handling)
    expect(fragmentShader).toContain('accum.transmittance = 0.0')
    expect(fragmentShader).toContain('hitHorizon = true')
  })

  it('should calculate correct smoothstep proximity values', () => {
    // Verify the smoothstep logic for general proximity calculations
    function smoothstep(edge0: number, edge1: number, x: number): number {
      const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)))
      return t * t * (3.0 - 2.0 * t)
    }

    // Test proximity at different radii relative to horizon
    const horizonRadius = 2.0
    const testCases = [
      { radius: 3.0, expectedSmooth: 1.0 }, // Far from horizon
      { radius: 2.5, expectedSmooth: 0.5 }, // Halfway
      { radius: 2.0, expectedSmooth: 0.0 }, // At horizon
      { radius: 1.0, expectedSmooth: 0.0 }, // Inside (clamped)
    ]

    testCases.forEach(({ radius, expectedSmooth }) => {
      const smoothstepValue = smoothstep(horizonRadius, horizonRadius * 1.5, radius)
      expect(smoothstepValue).toBeCloseTo(expectedSmooth, 1)
    })
  })

  it('should calculate Beer-Lambert absorption correctly', () => {
    const absorptionCoeff = 8.0
    const stepSize = 0.02

    // Beer-Lambert law: transmittance = exp(-absorption * distance)
    const transmittancePerStep = Math.exp(-absorptionCoeff * stepSize)

    // After 50 steps
    const transmittanceAfter50 = Math.pow(transmittancePerStep, 50)
    console.log(`Transmittance after 50 steps: ${transmittanceAfter50.toFixed(8)}`)

    // Should be nearly opaque after many steps
    expect(transmittanceAfter50).toBeLessThan(0.01)
  })
})
