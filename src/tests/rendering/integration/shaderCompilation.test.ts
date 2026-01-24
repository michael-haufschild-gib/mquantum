/**
 * Shader Compilation Integration Tests
 *
 * Tests that all object type shaders compose correctly and produce
 * valid GLSL 3.00 ES code.
 *
 * NOTE: This suite does NOT perform real GPU compilation. Vitest runs with a
 * mocked WebGL context in `src/tests/setup.ts`. Real WebGL2 compilation/linking
 * is enforced by Playwright via `scripts/playwright/object-types-rendering.spec.ts`.
 *
 * @module tests/rendering/integration/shaderCompilation.test
 */

import { describe, expect, it } from 'vitest'

// Import shader composers for each object type
import { composeMandelbulbShader } from '@/rendering/shaders/mandelbulb/compose'
import { composeJuliaShader } from '@/rendering/shaders/julia/compose'
import { composeSchroedingerShader } from '@/rendering/shaders/schroedinger/compose'
import { composeBlackHoleShader } from '@/rendering/shaders/blackhole/compose'

/**
 * Static checks for GLSL ES 3.00 compliance and common pitfalls.
 * These are intentionally minimal: the authoritative compile/link gate is E2E.
 * @param fragmentShader
 */
function verifyGlsl3(fragmentShader: string): void {
  expect(typeof fragmentShader).toBe('string')
  expect(fragmentShader.length).toBeGreaterThan(500)

  // Must declare precision in fragment shaders
  expect(fragmentShader).toContain('precision highp float')

  // Must have entry point
  expect(fragmentShader).toContain('void main()')

  // Must not contain legacy WebGL1 keywords (check actual declarations, not comments)
  expect(fragmentShader).not.toContain('gl_FragColor')
  expect(fragmentShader).not.toMatch(
    /\bvarying\s+(highp\s+|mediump\s+|lowp\s+)?(vec|mat|float|int)/
  )
  expect(fragmentShader).not.toMatch(
    /\battribute\s+(highp\s+|mediump\s+|lowp\s+)?(vec|mat|float|int)/
  )

  // texture2D is forbidden in GLSL3
  expect(fragmentShader).not.toMatch(/\btexture2D\s*\(/)
}

describe('Shader Compilation - Mandelbulb', () => {
  const dimensions = [3, 4, 7, 11]
  for (const dimension of dimensions) {
    it(`composes GLSL3 for dimension ${dimension}`, () => {
      const { glsl } = composeMandelbulbShader({
        dimension,
        shadows: false,
        temporal: false,
        ambientOcclusion: true,
        sss: false,
      })

      verifyGlsl3(glsl)
      // Uses layout(location=...) for MRT outputs
      expect(glsl).toContain('layout(location = 0) out vec4')
    })
  }

  it('should compose shader with all features enabled', () => {
    const { glsl } = composeMandelbulbShader({
      dimension: 4,
      shadows: true,
      temporal: true,
      ambientOcclusion: true,
      sss: true,
    })

    expect(glsl).toContain('#define USE_SHADOWS')
    expect(glsl).toContain('#define USE_TEMPORAL')
    expect(glsl).toContain('#define USE_AO')
    expect(glsl).toContain('#define USE_SSS')
  })
})

describe('Shader Compilation - Quaternion Julia', () => {
  it('composes GLSL3 for Julia set', () => {
    const { glsl } = composeJuliaShader({
      dimension: 4,
      shadows: false,
      temporal: false,
      ambientOcclusion: true,
      sss: false,
    })

    verifyGlsl3(glsl)
    expect(glsl).toContain('layout(location = 0) out vec4')
  })
})

describe('Shader Compilation - Schroedinger', () => {
  const dimensions = [3, 4, 7, 11]

  for (const dimension of dimensions) {
    it(`composes GLSL3 for dimension ${dimension}`, () => {
      const { glsl } = composeSchroedingerShader({
        dimension,
        shadows: false,
        temporal: true,
        ambientOcclusion: false,
        sss: false,
      })

      verifyGlsl3(glsl)
      expect(glsl).toContain('layout(location = 0) out vec4')
    })
  }
})

describe('Shader Compilation - Black Hole', () => {
  it('composes GLSL3 for black hole', () => {
    // Black hole compose returns { fragmentShader, features } not { glsl }
    const { fragmentShader } = composeBlackHoleShader({
      dimension: 3,
      shadows: false,
      temporal: false,
      ambientOcclusion: false,
    })

    verifyGlsl3(fragmentShader)
  })

  it('should include gravitational lensing code', () => {
    const { fragmentShader } = composeBlackHoleShader({
      dimension: 3,
      shadows: false,
      temporal: false,
      ambientOcclusion: false,
    })

    // Black hole should have lensing/distortion code
    expect(fragmentShader).toContain('uHorizonRadius') // Event horizon radius uniform
    expect(fragmentShader).toContain('uGravityStrength') // Lensing intensity
  })
})

describe('Shader Feature Flags', () => {
  it('should conditionally include shadow code', () => {
    const { glsl: withShadows } = composeMandelbulbShader({
      dimension: 4,
      shadows: true,
      temporal: false,
      ambientOcclusion: false,
      sss: false,
    })

    const { glsl: withoutShadows } = composeMandelbulbShader({
      dimension: 4,
      shadows: false,
      temporal: false,
      ambientOcclusion: false,
      sss: false,
    })

    expect(withShadows).toContain('#define USE_SHADOWS')
    expect(withoutShadows).not.toContain('#define USE_SHADOWS')
  })

  it('should conditionally include temporal reprojection code', () => {
    const { glsl: withTemporal } = composeSchroedingerShader({
      dimension: 4,
      shadows: false,
      temporal: true,
      ambientOcclusion: false,
      sss: false,
    })

    const { glsl: withoutTemporal } = composeSchroedingerShader({
      dimension: 4,
      shadows: false,
      temporal: false,
      ambientOcclusion: false,
      sss: false,
    })

    expect(withTemporal).toContain('#define USE_TEMPORAL')
    expect(withoutTemporal).not.toContain('#define USE_TEMPORAL')
  })
})
