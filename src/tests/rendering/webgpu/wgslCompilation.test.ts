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

// Import shader composers for Schroedinger
import {
  composeSchroedingerShader,
  composeSchroedingerVertexShader,
} from '@/rendering/webgpu/shaders/schroedinger/compose'
import { composeDensityGridComputeShader } from '@/rendering/webgpu/shaders/schroedinger/compute/compose'
import {
  composeSkyboxFragmentShader,
  composeSkyboxVertexShader,
} from '@/rendering/webgpu/shaders/skybox/compose'

/**
 * Removes comments from WGSL code for syntax checking.
 * This prevents false positives from GLSL terms mentioned in comments.
 * @param code
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
 * Verifies WGSL does not have common GLSL->WGSL porting mistakes.
 * Note: Many math functions (mod, clamp, etc.) are the same in both languages.
 * @param wgsl
 */
function verifyNoGlslLeakage(wgsl: string): void {
  // GLSL atan(y, x) vs WGSL atan2(y, x)
  const atanTwoArgPattern = /\batan\s*\([^,)]+,[^)]+\)/g
  const matches = wgsl.match(atanTwoArgPattern)
  if (matches) {
    // Filter out atan2 calls which are correct
    const wrongAtanCalls = matches.filter((m) => !m.includes('atan2'))
    expect(wrongAtanCalls.length).toBe(0)
  }
}

/**
 * Verifies that a compute shader string is valid WGSL syntax.
 * @param wgsl - The WGSL compute shader code to verify
 */
function verifyWgslCompute(wgsl: string): void {
  expect(typeof wgsl).toBe('string')
  expect(wgsl.length).toBeGreaterThan(100)

  // Remove comments for syntax checking
  const codeWithoutComments = removeComments(wgsl)

  // WGSL syntax checks
  expect(wgsl).toMatch(/fn\s+\w+\s*\(/)

  // Must not contain GLSL-specific syntax
  expect(codeWithoutComments).not.toContain('void main()')
  expect(codeWithoutComments).not.toContain('gl_FragColor')
  expect(codeWithoutComments).not.toMatch(/\bprecision\s+(highp|mediump|lowp)/)
  expect(codeWithoutComments).not.toMatch(/\btexture2D\s*\(/)

  // Should have @group/@binding decorators for resources
  if (codeWithoutComments.includes('var<uniform>')) {
    expect(wgsl).toMatch(/@group\s*\(\s*\d+\s*\)\s*@binding\s*\(\s*\d+\s*\)/)
  }

  // Compute shaders should have @compute entry point
  expect(wgsl).toMatch(/@compute/)

  // Should have @workgroup_size decorator
  expect(wgsl).toMatch(/@workgroup_size\s*\(\s*\d+/)

  // Should have texture_storage_3d for output
  expect(wgsl).toMatch(/texture_storage_3d/)
}

describe('WGSL Shader Compilation - Schroedinger', () => {
  const dimensions = [3, 4, 5, 6, 7, 8, 9, 10, 11]

  for (const dimension of dimensions) {
    it(`composes WGSL fragment shader for dimension ${dimension}`, () => {
      const { wgsl, features } = composeSchroedingerShader({
        dimension,
        shadows: false,
        temporal: true,
        ambientOcclusion: false,
        sss: false,
        quantumMode: 'hydrogenND',
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
    const modes = ['harmonicOscillator', 'hydrogenND'] as const

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

  it('supports density grid acceleration mode', () => {
    const { wgsl, features } = composeSchroedingerShader({
      dimension: 4,
      shadows: false,
      temporal: false,
      ambientOcclusion: false,
      sss: false,
      quantumMode: 'harmonicOscillator',
      useDensityGrid: true,
    })

    verifyWgsl(wgsl, true)
    expect(features).toContain('Density Grid Compute')
    // Should include the grid sampling functions
    expect(wgsl).toContain('sampleDensityFromGrid')
    expect(wgsl).toContain('densityGridTex')
  })

  it('keeps runtime color modules when compile-time colorAlgorithm is provided', () => {
    const { wgsl } = composeSchroedingerShader({
      dimension: 4,
      shadows: false,
      temporal: false,
      ambientOcclusion: false,
      sss: false,
      quantumMode: 'harmonicOscillator',
      colorAlgorithm: 0,
    })

    verifyWgsl(wgsl, true)
    expect(wgsl).not.toContain('fn getColorByAlgorithm')
    expect(wgsl).toContain('struct ColorUniforms')
    expect(wgsl).toContain('fn cosinePalette(')
    expect(wgsl).toContain('fn oklab2rgb(')
  })

  it('uses normalized harmonic oscillator basis (no visual damping)', () => {
    const { wgsl } = composeSchroedingerShader({
      dimension: 4,
      shadows: false,
      temporal: false,
      ambientOcclusion: false,
      sss: false,
      quantumMode: 'harmonicOscillator',
    })

    verifyWgsl(wgsl, true)
    expect(wgsl).toContain('const HO_NORM: array<f32, 7>')
    expect(wgsl).not.toContain('0.15 * f32(n * n)')
  })

  it('does not redeclare shared constants in composed Schrödinger shader', () => {
    const { wgsl } = composeSchroedingerShader({
      dimension: 4,
      shadows: false,
      temporal: false,
      ambientOcclusion: false,
      sss: false,
      quantumMode: 'harmonicOscillator',
    })

    const invPiMatches = wgsl.match(/\bconst\s+INV_PI\s*:/g) ?? []
    expect(invPiMatches).toHaveLength(1)
  })

  it('uses physical wavefunction-based nodal classification', () => {
    const { wgsl } = composeSchroedingerShader({
      dimension: 4,
      shadows: false,
      temporal: false,
      ambientOcclusion: false,
      sss: false,
      quantumMode: 'harmonicOscillator',
    })

    verifyWgsl(wgsl, true)
    expect(wgsl).toContain('fn computePhysicalNodalField(')
    expect(wgsl).not.toContain('fn computeNodalIntensity(')
  })

  it('uses half-pixel temporal jitter offsets for quarter-res reprojection', () => {
    const { wgsl } = composeSchroedingerShader({
      dimension: 4,
      shadows: false,
      temporalAccumulation: true,
      ambientOcclusion: false,
      sss: false,
      quantumMode: 'harmonicOscillator',
    })

    expect(wgsl).toContain('let worldOffset = cameraRight * (jitterOffset.x * pixelSizeX) -')
    expect(wgsl).toContain('cameraUp * (jitterOffset.y * pixelSizeY);')
    expect(wgsl).not.toContain('* pixelSize * 2.0')
  })
})

describe('WGSL Shader Compilation - Schroedinger Density Grid Compute', () => {
  const dimensions = [3, 4, 5, 6, 7, 8, 9, 10, 11]

  for (const dimension of dimensions) {
    it(`composes WGSL compute shader for dimension ${dimension}`, () => {
      const { wgsl, features } = composeDensityGridComputeShader({
        dimension,
        quantumMode: 'harmonicOscillator',
      })

      verifyWgslCompute(wgsl)
      verifyNoGlslLeakage(wgsl)
      expect(features).toBeDefined()
      expect(features).toContain('Density Grid Compute')
    })
  }

  it('supports different quantum modes', () => {
    const modes = ['harmonicOscillator', 'hydrogenND'] as const

    for (const quantumMode of modes) {
      const { wgsl } = composeDensityGridComputeShader({
        dimension: 4,
        quantumMode,
      })

      verifyWgslCompute(wgsl)
    }
  })

  it('supports unrolled HO superposition', () => {
    const termCounts = [1, 2, 3, 4, 5, 6, 7, 8] as const

    for (const termCount of termCounts) {
      const { wgsl, features } = composeDensityGridComputeShader({
        dimension: 4,
        quantumMode: 'harmonicOscillator',
        termCount,
      })

      verifyWgslCompute(wgsl)
      expect(features).toContain(`HO ${termCount}-term unrolled`)
    }
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

describe('WGSL Cross-Object Verification', () => {
  it('all vertex shaders are valid', () => {
    const vertexShaders = [
      composeSchroedingerVertexShader(),
      composeSkyboxVertexShader({ sun: false, vignette: false }),
    ]

    for (const wgsl of vertexShaders) {
      verifyWgsl(wgsl, false)
      verifyNoGlslLeakage(wgsl)
    }
  })
})
