/**
 * WebGPU WGSL Shader Compilation Tests
 *
 * Tests that all WebGPU shaders compose correctly and produce valid WGSL code.
 *
 * NOTE: This suite does NOT perform real GPU compilation. Vitest runs with a
 * mocked WebGPU context. Real WebGPU compilation would require a browser environment.
 * These tests verify the string composition produces syntactically correct WGSL.
 *
 * @module tests/rendering/webgpu/wgslCompilation.test
 */

import { describe, expect, it } from 'vitest'

// Import shader composers for each object type
import {
  composeMandelbulbShader,
  composeMandelbulbVertexShader,
} from '@/rendering/webgpu/shaders/mandelbulb/compose'
import {
  composeJuliaShader,
  composeJuliaVertexShader,
} from '@/rendering/webgpu/shaders/julia/compose'
import {
  composeSchroedingerShader,
  composeSchroedingerVertexShader,
} from '@/rendering/webgpu/shaders/schroedinger/compose'
import {
  composeBlackHoleShader,
  composeBlackHoleVertexShader,
} from '@/rendering/webgpu/shaders/blackhole/compose'
import {
  composeSkyboxFragmentShader,
  composeSkyboxVertexShader,
} from '@/rendering/webgpu/shaders/skybox/compose'
import {
  composeGroundPlaneFragmentShader,
  composeGroundPlaneVertexShader,
} from '@/rendering/webgpu/shaders/groundplane/compose'

/**
 * Removes comments from WGSL code for syntax checking.
 * This prevents false positives from GLSL terms mentioned in comments.
 */
function removeComments(code: string): string {
  // Remove single-line comments
  let result = code.replace(/\/\/.*$/gm, '')
  // Remove multi-line comments
  result = result.replace(/\/\*[\s\S]*?\*\//g, '')
  return result
}

/**
 * Verifies that a shader string is valid WGSL syntax.
 * @param wgsl - The WGSL shader code to verify
 * @param isFragment - Whether this is a fragment shader (vs vertex)
 */
function verifyWgsl(wgsl: string, isFragment: boolean = true): void {
  expect(typeof wgsl).toBe('string')
  expect(wgsl.length).toBeGreaterThan(100)

  // Remove comments for syntax checking (GLSL terms may appear in comments)
  const codeWithoutComments = removeComments(wgsl)

  // WGSL syntax checks
  // Must use WGSL function syntax
  expect(wgsl).toMatch(/fn\s+\w+\s*\(/)

  // Must not contain GLSL-specific syntax (check code without comments)
  expect(codeWithoutComments).not.toContain('void main()')
  expect(codeWithoutComments).not.toContain('gl_FragColor')
  expect(codeWithoutComments).not.toMatch(/\bprecision\s+(highp|mediump|lowp)/)
  expect(codeWithoutComments).not.toMatch(/\bvarying\s+(highp|mediump|lowp|vec|mat|float|int)/)
  expect(codeWithoutComments).not.toMatch(/\battribute\s+(highp|mediump|lowp|vec|mat|float|int)/)
  expect(codeWithoutComments).not.toMatch(/\btexture2D\s*\(/)

  // Should have @group/@binding decorators for resources
  if (codeWithoutComments.includes('var<uniform>')) {
    expect(wgsl).toMatch(/@group\s*\(\s*\d+\s*\)\s*@binding\s*\(\s*\d+\s*\)/)
  }

  // Fragment shaders should have @fragment entry point
  if (isFragment) {
    expect(wgsl).toMatch(/@fragment/)
  } else {
    expect(wgsl).toMatch(/@vertex/)
  }
}

/**
 * Verifies WGSL does not have common GLSL→WGSL porting mistakes.
 * Note: Many math functions (mod, clamp, etc.) are the same in both languages.
 */
function verifyNoGlslLeakage(wgsl: string): void {
  // Note: mod() is valid in both GLSL and WGSL, so we don't check for it

  // GLSL atan(y, x) vs WGSL atan2(y, x)
  // Note: WGSL uses atan2, GLSL uses atan(y,x) for two-arg version
  // This check verifies we're using atan2 not atan(a,b) for two-argument calls
  // However, atan(x) with one arg is valid in WGSL
  // Match atan followed by ( and two args separated by comma (but not atan2)
  const atanTwoArgPattern = /\batan\s*\([^,)]+,[^)]+\)/g
  const matches = wgsl.match(atanTwoArgPattern)
  if (matches) {
    // Filter out atan2 calls which are correct
    const wrongAtanCalls = matches.filter((m) => !m.includes('atan2'))
    expect(wrongAtanCalls.length).toBe(0)
  }
}

describe('WGSL Shader Compilation - Mandelbulb', () => {
  const dimensions = [3, 4, 5, 6, 7, 8, 9, 10, 11]

  for (const dimension of dimensions) {
    it(`composes WGSL fragment shader for dimension ${dimension}`, () => {
      const { wgsl, features } = composeMandelbulbShader({
        dimension,
        shadows: false,
        temporal: false,
        ambientOcclusion: true,
        sss: false,
      })

      verifyWgsl(wgsl, true)
      verifyNoGlslLeakage(wgsl)
      expect(features).toBeDefined()
    })
  }

  it('composes WGSL vertex shader', () => {
    const wgsl = composeMandelbulbVertexShader()
    verifyWgsl(wgsl, false)
    verifyNoGlslLeakage(wgsl)
  })

  it('composes shader with all features enabled', () => {
    const { wgsl, features } = composeMandelbulbShader({
      dimension: 4,
      shadows: true,
      temporal: true,
      ambientOcclusion: true,
      sss: true,
    })

    verifyWgsl(wgsl, true)

    // Feature flags should be reflected (ao is short for ambientOcclusion)
    expect(features.shadows).toBe(true)
    expect(features.temporal).toBe(true)
    expect(features.ao).toBe(true)
    expect(features.sss).toBe(true)
  })
})

describe('WGSL Shader Compilation - Quaternion Julia', () => {
  const dimensions = [3, 4, 5, 6, 7, 8, 9, 10, 11]

  for (const dimension of dimensions) {
    it(`composes WGSL fragment shader for dimension ${dimension}`, () => {
      const { wgsl, features } = composeJuliaShader({
        dimension,
        shadows: false,
        temporal: false,
        ambientOcclusion: true,
        sss: false,
      })

      verifyWgsl(wgsl, true)
      verifyNoGlslLeakage(wgsl)
      expect(features).toBeDefined()
    })
  }

  it('composes WGSL vertex shader', () => {
    const wgsl = composeJuliaVertexShader()
    verifyWgsl(wgsl, false)
    verifyNoGlslLeakage(wgsl)
  })
})

describe('WGSL Shader Compilation - Schrödinger', () => {
  const dimensions = [3, 4, 5, 6, 7, 8, 9, 10, 11]

  for (const dimension of dimensions) {
    it(`composes WGSL fragment shader for dimension ${dimension}`, () => {
      const { wgsl, features } = composeSchroedingerShader({
        dimension,
        shadows: false,
        temporal: true,
        ambientOcclusion: false,
        sss: false,
        quantumMode: 'hydrogen',
      })

      verifyWgsl(wgsl, true)
      verifyNoGlslLeakage(wgsl)
      expect(features).toBeDefined()
    })
  }

  it('composes WGSL vertex shader', () => {
    const wgsl = composeSchroedingerVertexShader()
    verifyWgsl(wgsl, false)
    verifyNoGlslLeakage(wgsl)
  })

  it('supports different quantum modes', () => {
    const modes = ['hydrogen', 'harmonicOscillator', 'hydrogenND'] as const

    for (const quantumMode of modes) {
      const { wgsl } = composeSchroedingerShader({
        dimension: 4,
        shadows: false,
        temporal: false,
        ambientOcclusion: false,
        sss: false,
        quantumMode,
      })

      verifyWgsl(wgsl, true)
    }
  })
})

describe('WGSL Shader Compilation - Black Hole', () => {
  it('composes WGSL fragment shader', () => {
    const { wgsl, features } = composeBlackHoleShader({
      dimension: 3,
      shadows: false,
      temporal: false,
      ambientOcclusion: false,
    })

    verifyWgsl(wgsl, true)
    verifyNoGlslLeakage(wgsl)
    expect(features).toBeDefined()
  })

  it('composes WGSL vertex shader', () => {
    const wgsl = composeBlackHoleVertexShader()
    verifyWgsl(wgsl, false)
    verifyNoGlslLeakage(wgsl)
  })

  it('includes gravitational lensing uniforms', () => {
    const { wgsl } = composeBlackHoleShader({
      dimension: 3,
      shadows: false,
      temporal: false,
      ambientOcclusion: false,
    })

    // Should have black hole specific uniforms
    expect(wgsl).toContain('horizonRadius')
    expect(wgsl).toContain('gravityStrength')
  })
})

describe('WGSL Shader Compilation - Skybox', () => {
  const modes = ['aurora', 'nebula', 'crystalline', 'horizon', 'ocean', 'twilight', 'classic'] as const

  for (const mode of modes) {
    it(`composes WGSL fragment shader for ${mode} mode`, () => {
      const { wgsl, features } = composeSkyboxFragmentShader({
        mode,
        effects: { sun: false, vignette: false },
      })

      verifyWgsl(wgsl, true)
      verifyNoGlslLeakage(wgsl)
      expect(features).toContain(`Mode: ${mode}`)
    })
  }

  it('composes WGSL vertex shader', () => {
    const wgsl = composeSkyboxVertexShader({
      sun: false,
      vignette: false,
    })
    verifyWgsl(wgsl, false)
    verifyNoGlslLeakage(wgsl)
  })

  it('supports sun and vignette effects', () => {
    const { wgsl, features } = composeSkyboxFragmentShader({
      mode: 'aurora',
      effects: { sun: true, vignette: true },
    })

    verifyWgsl(wgsl, true)
    expect(features).toContain('Sun Glow')
    expect(features).toContain('Vignette')
  })
})

describe('WGSL Shader Compilation - Ground Plane', () => {
  it('composes WGSL fragment shader', () => {
    const { wgsl, features } = composeGroundPlaneFragmentShader({
      shadows: true,
    })

    verifyWgsl(wgsl, true)
    verifyNoGlslLeakage(wgsl)
    expect(features).toBeDefined()
    expect(features.length).toBeGreaterThan(0)
  })

  it('composes WGSL vertex shader', () => {
    const wgsl = composeGroundPlaneVertexShader()
    verifyWgsl(wgsl, false)
    verifyNoGlslLeakage(wgsl)
  })

  it('supports shadow feature toggle', () => {
    const { wgsl: withShadows, features: featuresWithShadows } = composeGroundPlaneFragmentShader({
      shadows: true,
    })

    const { wgsl: withoutShadows, features: featuresWithoutShadows } = composeGroundPlaneFragmentShader({
      shadows: false,
    })

    // Both should be valid WGSL
    verifyWgsl(withShadows, true)
    verifyWgsl(withoutShadows, true)

    // Features arrays should reflect the configuration
    expect(featuresWithShadows).toContain('Shadow Maps')
    expect(featuresWithoutShadows).not.toContain('Shadow Maps')
  })
})

describe('WGSL Cross-Object Verification', () => {
  it('all object shaders produce unique output', () => {
    const shaders = [
      composeMandelbulbShader({ dimension: 4, shadows: false, temporal: false, ambientOcclusion: false, sss: false }).wgsl,
      composeJuliaShader({ dimension: 4, shadows: false, temporal: false, ambientOcclusion: false, sss: false }).wgsl,
      composeSchroedingerShader({ dimension: 4, shadows: false, temporal: false, ambientOcclusion: false, sss: false, quantumMode: 'hydrogen' }).wgsl,
      composeBlackHoleShader({ dimension: 3, shadows: false, temporal: false, ambientOcclusion: false }).wgsl,
    ]

    // All should be different
    const uniqueShaders = new Set(shaders)
    expect(uniqueShaders.size).toBe(shaders.length)
  })

  it('all vertex shaders are valid', () => {
    const vertexShaders = [
      composeMandelbulbVertexShader(),
      composeJuliaVertexShader(),
      composeSchroedingerVertexShader(),
      composeBlackHoleVertexShader(),
      composeSkyboxVertexShader({ sun: false, vignette: false }),
      composeGroundPlaneVertexShader(),
    ]

    for (const wgsl of vertexShaders) {
      verifyWgsl(wgsl, false)
      verifyNoGlslLeakage(wgsl)
    }
  })
})
