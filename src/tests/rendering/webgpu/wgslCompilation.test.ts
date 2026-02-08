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
import { composeEigenfunctionCacheComputeShader } from '@/rendering/webgpu/shaders/schroedinger/compute/composeEigenCache'
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
  
        temporal: true,
  
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
  
        temporal: false,
  
        sss: false,
        quantumMode,
      })

      verifyWgsl(wgsl, true)
    }
  })

  it('includes momentum representation uniforms in composed shaders', () => {
    const { wgsl } = composeSchroedingerShader({
      dimension: 4,
      temporal: false,
      sss: false,
      quantumMode: 'harmonicOscillator',
    })

    verifyWgsl(wgsl, true)
    expect(wgsl).toContain('const REPRESENTATION_POSITION: i32 = 0;')
    expect(wgsl).toContain('const REPRESENTATION_MOMENTUM: i32 = 1;')
    expect(wgsl).toContain('representationMode: i32')
    expect(wgsl).toContain('momentumDisplayMode: i32')
    expect(wgsl).toContain('momentumScale: f32')
    expect(wgsl).toContain('momentumHbar: f32')
  })

  it('HO psi block uses position-only path (momentum handled by CPU uniform transform)', () => {
    const { wgsl } = composeSchroedingerShader({
      dimension: 5,
      temporal: false,
      sss: false,
      quantumMode: 'harmonicOscillator',
    })

    verifyWgsl(wgsl, true)
    // HO momentum is handled by CPU uniform transformation (1/ω + coefficient phase rotation),
    // so the shader only has the position-mode evaluator — no momentum branching.
    expect(wgsl).toContain('fn evalHarmonicOscillatorPsi(')
    expect(wgsl).not.toContain('fn evalHarmonicOscillatorPsiMomentum(')
    expect(wgsl).toContain('return evalHarmonicOscillatorPsi(xND, t, uniforms);')
  })

  it('routes hydrogen-ND psi through momentum evaluator when enabled', () => {
    const { wgsl } = composeSchroedingerShader({
      dimension: 6,
      temporal: false,
      sss: false,
      quantumMode: 'hydrogenND',
    })

    verifyWgsl(wgsl, true)
    expect(wgsl).toContain('fn evalHydrogenNDMomentumSpatial(')
    expect(wgsl).toContain('fn evalHydrogenNDMomentumPsi(')
    expect(wgsl).toContain('return evalHydrogenNDMomentumPsi(xND, t, uniforms);')
  })

  it('adds momentum-mode probability-current safety throttling in volume integration', () => {
    const { wgsl } = composeSchroedingerShader({
      dimension: 5,
      temporal: false,
      sss: false,
      quantumMode: 'harmonicOscillator',
    })

    verifyWgsl(wgsl, true)
    expect(wgsl).toContain('uniforms.representationMode == REPRESENTATION_MOMENTUM')
    expect(wgsl).toContain('(i & 3) != 0')
    expect(wgsl).toContain('delta = max(delta, 0.02);')
  })

  it('specializes harmonic-oscillator family by excluding hydrogen modules', () => {
    const { wgsl, modules } = composeSchroedingerShader({
      dimension: 6,

      temporal: false,

      sss: false,
      quantumMode: 'harmonicOscillator',
    })

    verifyWgsl(wgsl, true)
    expect(modules).toContain('HO ND 6D')
    expect(modules).toContain('Hydrogen Family Fallbacks')
    expect(modules).not.toContain('Hydrogen ND Common')
    expect(modules).not.toContain('Hydrogen ND Dispatch')
    expect(modules).not.toContain('Laguerre Polynomials')
    expect(wgsl).toContain('return evalHarmonicOscillatorPsi(xND, t, uniforms);')
    expect(wgsl).not.toContain('return hydrogenNDOptimized(xND, t, uniforms);')
  })

  it('specializes hydrogen-ND family by excluding HO ND modules', () => {
    const { wgsl, modules } = composeSchroedingerShader({
      dimension: 7,

      temporal: false,

      sss: false,
      quantumMode: 'hydrogenND',
    })

    verifyWgsl(wgsl, true)
    expect(modules).toContain('Hydrogen ND Common')
    expect(modules).toContain('Hydrogen ND Dispatch')
    expect(modules).not.toContain('Hydrogen Family Fallbacks')
    expect(modules).not.toContain('HO ND 7D')
    expect(modules).not.toContain('HO ND Dispatch')
    expect(wgsl).toContain('return hydrogenNDOptimized(xND, t, uniforms);')
    expect(wgsl).not.toContain('fn evalHarmonicOscillatorPsi(')
  })

  it('specializes optional physics toggles via compile-time feature defines', () => {
    const { wgsl } = composeSchroedingerShader({
      dimension: 5,

      temporal: false,

      sss: false,
      nodal: false,
      uncertaintyBoundary: false,
      quantumMode: 'harmonicOscillator',
    })

    verifyWgsl(wgsl, true)
    expect(wgsl).toContain('const FEATURE_NODAL: bool = false;')
    expect(wgsl).toContain('const FEATURE_UNCERTAINTY_BOUNDARY: bool = false;')
  })

  it('emits FEATURE_UNCERTAINTY_BOUNDARY true by default and false when disabled', () => {
    // Default: enabled
    const { wgsl: enabledWgsl } = composeSchroedingerShader({
      dimension: 4,
      temporal: false,
      quantumMode: 'harmonicOscillator',
    })
    verifyWgsl(enabledWgsl, true)
    expect(enabledWgsl).toContain('const FEATURE_UNCERTAINTY_BOUNDARY: bool = true;')

    // Explicit: disabled
    const { wgsl: disabledWgsl } = composeSchroedingerShader({
      dimension: 4,
      temporal: false,
      uncertaintyBoundary: false,
      quantumMode: 'harmonicOscillator',
    })
    verifyWgsl(disabledWgsl, true)
    expect(disabledWgsl).toContain('const FEATURE_UNCERTAINTY_BOUNDARY: bool = false;')
    // Boundary emphasis calls are guarded by const bool — shader must still be valid
  })

  it('uses uncertainty boundary uniforms instead of legacy shimmer uniforms', () => {
    const { wgsl } = composeSchroedingerShader({
      dimension: 4,

      temporal: false,

      sss: false,
      quantumMode: 'harmonicOscillator',
    })

    verifyWgsl(wgsl, true)
    expect(wgsl).toContain('uncertaintyBoundaryEnabled')
    expect(wgsl).toContain('uncertaintyBoundaryStrength')
    expect(wgsl).toContain('uncertaintyConfidenceMass')
    expect(wgsl).toContain('uncertaintyBoundaryWidth')
    expect(wgsl).toContain('uncertaintyLogRhoThreshold')
    expect(wgsl).not.toContain('shimmerEnabled')
    expect(wgsl).not.toContain('shimmerStrength')
  })

  it('excludes unused color modules when compile-time colorAlgorithm is provided', () => {
    const { wgsl, modules } = composeSchroedingerShader({
      dimension: 4,

      temporal: false,

      sss: false,
      quantumMode: 'harmonicOscillator',
      colorAlgorithm: 0,
    })

    verifyWgsl(wgsl, true)
    // Algorithm 0 (Monochromatic) uses HSL only — cosine and oklab excluded
    expect(modules).toContain('Color (HSL)')
    expect(modules).not.toContain('Color (Cosine)')
    expect(modules).not.toContain('Color (Oklab)')
    expect(modules).not.toContain('Color Selector')
    expect(wgsl).not.toContain('fn cosinePalette(')
    expect(wgsl).not.toContain('fn oklab2rgb(')
    // computeBaseColor is specialized to single branch
    expect(wgsl).toContain('fn computeBaseColor(')
    expect(wgsl).not.toContain('uniforms.colorAlgorithm')
  })

  it('uses normalized harmonic oscillator basis (no visual damping)', () => {
    const { wgsl } = composeSchroedingerShader({
      dimension: 4,

      temporal: false,

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

      temporal: false,

      sss: false,
      quantumMode: 'harmonicOscillator',
    })

    const invPiMatches = wgsl.match(/\bconst\s+INV_PI\s*:/g) ?? []
    expect(invPiMatches).toHaveLength(1)
  })

  it('uses physical wavefunction-based nodal classification', () => {
    const { wgsl } = composeSchroedingerShader({
      dimension: 4,

      temporal: false,

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

      temporalAccumulation: true,

      sss: false,
      quantumMode: 'harmonicOscillator',
    })

    expect(wgsl).toContain('let worldOffset = cameraRight * (jitterOffset.x * pixelSizeX) -')
    expect(wgsl).toContain('cameraUp * (jitterOffset.y * pixelSizeY);')
    expect(wgsl).not.toContain('* pixelSize * 2.0')
  })

})

describe('WGSL Color Algorithm Specialization', () => {
  const allAlgorithms = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const

  for (const alg of allAlgorithms) {
    it(`produces valid WGSL for colorAlgorithm=${alg}`, () => {
      const { wgsl } = composeSchroedingerShader({
        dimension: 4,
        temporal: false,
        sss: false,
        quantumMode: 'harmonicOscillator',
        colorAlgorithm: alg,
      })

      verifyWgsl(wgsl, true)
      verifyNoGlslLeakage(wgsl)
      // Specialized: no runtime dispatch
      expect(wgsl).toContain('fn computeBaseColor(')
      expect(wgsl).not.toContain('let algorithm = uniforms.colorAlgorithm;')
    })
  }

  it('Color Selector block never appears in modules', () => {
    for (const alg of allAlgorithms) {
      const { modules } = composeSchroedingerShader({
        dimension: 4,
        temporal: false,
        sss: false,
        quantumMode: 'harmonicOscillator',
        colorAlgorithm: alg,
      })

      expect(modules).not.toContain('Color Selector')
    }
    // Also check undefined (runtime dispatch)
    const { modules } = composeSchroedingerShader({
      dimension: 4,
      temporal: false,
      sss: false,
      quantumMode: 'harmonicOscillator',
    })
    expect(modules).not.toContain('Color Selector')
  })

  it('excludes Cosine module for HSL-only algorithms (0, 1, 8, 9, 10)', () => {
    const hslOnlyAlgorithms = [0, 1, 8, 9, 10] as const
    for (const alg of hslOnlyAlgorithms) {
      const { modules, wgsl } = composeSchroedingerShader({
        dimension: 4,
        temporal: false,
        sss: false,
        quantumMode: 'harmonicOscillator',
        colorAlgorithm: alg,
      })

      expect(modules).not.toContain('Color (Cosine)')
      expect(wgsl).not.toContain('fn cosinePalette(')
    }
  })

  it('excludes Oklab module for non-Oklab algorithms', () => {
    const nonOklabAlgorithms = [0, 1, 2, 3, 4, 6, 7, 8, 9, 10] as const
    for (const alg of nonOklabAlgorithms) {
      const { modules, wgsl } = composeSchroedingerShader({
        dimension: 4,
        temporal: false,
        sss: false,
        quantumMode: 'harmonicOscillator',
        colorAlgorithm: alg,
      })

      expect(modules).not.toContain('Color (Oklab)')
      expect(wgsl).not.toContain('fn oklab2rgb(')
    }
  })

  it('includes Cosine module for cosine algorithms (2, 3, 4, 6, 7)', () => {
    const cosineAlgorithms = [2, 3, 4, 6, 7] as const
    for (const alg of cosineAlgorithms) {
      const { modules, wgsl } = composeSchroedingerShader({
        dimension: 4,
        temporal: false,
        sss: false,
        quantumMode: 'harmonicOscillator',
        colorAlgorithm: alg,
      })

      expect(modules).toContain('Color (Cosine)')
      expect(wgsl).toContain('fn cosinePalette(')
    }
  })

  it('includes Oklab module only for algorithm 5', () => {
    const { modules, wgsl } = composeSchroedingerShader({
      dimension: 4,
      temporal: false,
      sss: false,
      quantumMode: 'harmonicOscillator',
      colorAlgorithm: 5,
    })

    expect(modules).toContain('Color (Oklab)')
    expect(wgsl).toContain('fn oklab2rgb(')
  })

  it('includes all color modules when colorAlgorithm is undefined', () => {
    const { modules, wgsl } = composeSchroedingerShader({
      dimension: 4,
      temporal: false,
      sss: false,
      quantumMode: 'harmonicOscillator',
    })

    expect(modules).toContain('Color (HSL)')
    expect(modules).toContain('Color (Cosine)')
    expect(modules).toContain('Color (Oklab)')
    expect(wgsl).toContain('let algorithm = uniforms.colorAlgorithm;')
  })

  it('always includes HSL module', () => {
    for (const alg of allAlgorithms) {
      const { modules } = composeSchroedingerShader({
        dimension: 4,
        temporal: false,
        sss: false,
        quantumMode: 'harmonicOscillator',
        colorAlgorithm: alg,
      })

      expect(modules).toContain('Color (HSL)')
    }
  })

  it('works with hydrogenND + colorAlgorithm', () => {
    for (const alg of [2, 5, 9] as const) {
      const { wgsl } = composeSchroedingerShader({
        dimension: 5,
        temporal: false,
        sss: false,
        quantumMode: 'hydrogenND',
        colorAlgorithm: alg,
      })

      verifyWgsl(wgsl, true)
      expect(wgsl).toContain('fn computeBaseColor(')
    }
  })

  it('adds color feature tag when colorAlgorithm is specified', () => {
    const { features } = composeSchroedingerShader({
      dimension: 4,
      temporal: false,
      sss: false,
      quantumMode: 'harmonicOscillator',
      colorAlgorithm: 9,
    })

    expect(features).toContain('Color: Mixed')
  })

  it('does not add color feature tag when colorAlgorithm is undefined', () => {
    const { features } = composeSchroedingerShader({
      dimension: 4,
      temporal: false,
      sss: false,
      quantumMode: 'harmonicOscillator',
    })

    expect(features.some(f => f.startsWith('Color:'))).toBe(false)
  })

  it('splits emission into 3 blocks in modules list', () => {
    const { modules } = composeSchroedingerShader({
      dimension: 4,
      temporal: false,
      sss: false,
      quantumMode: 'harmonicOscillator',
      colorAlgorithm: 9,
    })

    expect(modules).toContain('Volume Emission (Pre)')
    expect(modules).toContain('Volume Emission (Color)')
    expect(modules).toContain('Volume Emission (Post)')
    expect(modules).not.toContain('Volume Emission')
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

  it('specializes compute harmonic family by excluding hydrogen modules', () => {
    const { wgsl, modules } = composeDensityGridComputeShader({
      dimension: 5,
      quantumMode: 'harmonicOscillator',
    })

    verifyWgslCompute(wgsl)
    expect(modules).toContain('HO ND 5D')
    expect(modules).toContain('HO ND Dispatch')
    expect(modules).not.toContain('Hydrogen ND Common')
    expect(modules).not.toContain('Hydrogen ND Dispatch')
    expect(modules).not.toContain('Laguerre Polynomials')
    expect(wgsl).toContain('return evalHarmonicOscillatorPsi(xND, t, uniforms);')
    expect(wgsl).not.toContain('return hydrogenNDOptimized(xND, t, uniforms);')
  })

  it('specializes compute hydrogen-ND family by excluding HO ND modules', () => {
    const { wgsl, modules } = composeDensityGridComputeShader({
      dimension: 8,
      quantumMode: 'hydrogenND',
    })

    verifyWgslCompute(wgsl)
    expect(modules).toContain('Hydrogen ND Common')
    expect(modules).toContain('Hydrogen ND Dispatch')
    expect(modules).not.toContain('HO ND 8D')
    expect(modules).not.toContain('HO ND Dispatch')
    expect(wgsl).toContain('return hydrogenNDOptimized(xND, t, uniforms);')
    expect(wgsl).not.toContain('fn evalHarmonicOscillatorPsi(')
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

describe('WGSL Shader Compilation - Eigenfunction Cache', () => {
  it('composes eigenfunction cache compute shader', () => {
    const { wgsl, features } = composeEigenfunctionCacheComputeShader()

    expect(typeof wgsl).toBe('string')
    expect(wgsl.length).toBeGreaterThan(100)
    expect(wgsl).toMatch(/@compute/)
    expect(wgsl).toMatch(/@workgroup_size\s*\(\s*256/)
    expect(wgsl).toContain('fn main(')
    expect(wgsl).toContain('eigenCacheOut')
    expect(wgsl).toContain('computeHo1D')
    expect(wgsl).toContain('computeHo1DDeriv')
    expect(features).toContain('Eigenfunction Cache Compute')
  })

  it('composes HO shader with eigenfunction cache enabled', () => {
    const { wgsl, modules, features } = composeSchroedingerShader({
      dimension: 4,
      temporal: false,
      sss: false,
      quantumMode: 'harmonicOscillator',
      useEigenfunctionCache: true,
    })

    verifyWgsl(wgsl, true)
    verifyNoGlslLeakage(wgsl)
    expect(features).toContain('Eigenfunction Cache')
    expect(modules).toContain('Eigenfunction Cache Lookup')
    expect(modules).toContain('Analytical Gradient')
    expect(wgsl).toContain('const USE_EIGENFUNCTION_CACHE: bool = true;')
    expect(wgsl).toContain('const USE_ANALYTICAL_GRADIENT: bool = true;')
    expect(wgsl).toContain('fn lookupEigenfunction(')
    expect(wgsl).toContain('fn ho1DCached(')
    expect(wgsl).toContain('fn sampleDensityWithAnalyticalGradient(')
    expect(wgsl).toContain('var<storage, read> eigenCache')
    expect(wgsl).toContain('var<uniform> eigenMeta')
  })

  it('composes HO shader with cache and unrolled terms', () => {
    const termCounts = [1, 2, 4, 8] as const
    for (const termCount of termCounts) {
      const { wgsl, modules } = composeSchroedingerShader({
        dimension: 3,
        temporal: false,
        sss: false,
        quantumMode: 'harmonicOscillator',
        useEigenfunctionCache: true,
        termCount,
      })

      verifyWgsl(wgsl, true)
      expect(modules).toContain(`HO ND 3D`)
      // Cached variant should use hoNDOptimized which routes through cache
      expect(wgsl).toContain('hoND3DCached')
    }
  })

  it('composes HO shader with cache across all dimensions', () => {
    for (const dimension of [3, 5, 7, 11]) {
      const { wgsl } = composeSchroedingerShader({
        dimension,
        temporal: false,
        sss: false,
        quantumMode: 'harmonicOscillator',
        useEigenfunctionCache: true,
      })

      verifyWgsl(wgsl, true)
      expect(wgsl).toContain(`hoND${dimension}DCached`)
      expect(wgsl).toContain('fn computeAnalyticalGradient(')
    }
  })

  it('includes cache but not analytical gradient for hydrogen ND (4D+)', () => {
    const { wgsl, modules } = composeSchroedingerShader({
      dimension: 5,
      temporal: false,
      sss: false,
      quantumMode: 'hydrogenND',
      useEigenfunctionCache: true,
    })

    verifyWgsl(wgsl, true)
    // Hydrogen ND 5D has extra dimensions → cache IS enabled for HO extra dims
    expect(modules).toContain('Eigenfunction Cache Lookup')
    expect(wgsl).toContain('const USE_EIGENFUNCTION_CACHE: bool = true;')
    // Analytical gradient function is included (WGSL needs symbol resolution) but NOT enabled
    expect(modules).toContain('Analytical Gradient')
    expect(wgsl).toContain('const USE_ANALYTICAL_GRADIENT: bool = false;')
    // Cached hydrogen ND variant should be present
    expect(wgsl).toContain('evalHydrogenNDPsi5DCached')
    expect(wgsl).toContain('ho1DCached')
  })

  it('includes cache bindings for hydrogen ND 3D (0 entries, harmless)', () => {
    const { wgsl, modules } = composeSchroedingerShader({
      dimension: 3,
      temporal: false,
      sss: false,
      quantumMode: 'hydrogenND',
      useEigenfunctionCache: true,
    })

    verifyWgsl(wgsl, true)
    // Cache is always enabled — 3D hydrogen has 0 entries but bindings are present
    expect(modules).toContain('Eigenfunction Cache Lookup')
    expect(wgsl).toContain('const USE_EIGENFUNCTION_CACHE: bool = true;')
    // No analytical gradient for hydrogen (3D core isn't HO)
    expect(wgsl).toContain('const USE_ANALYTICAL_GRADIENT: bool = false;')
    // No cached variant — no extra dims to cache
    expect(wgsl).not.toContain('evalHydrogenNDPsi3DCached')
  })

  it('composes hydrogen ND with cache across all higher dimensions', () => {
    for (const dimension of [4, 6, 8, 11]) {
      const { wgsl } = composeSchroedingerShader({
        dimension,
        temporal: false,
        sss: false,
        quantumMode: 'hydrogenND',
        useEigenfunctionCache: true,
      })

      verifyWgsl(wgsl, true)
      expect(wgsl).toContain(`evalHydrogenNDPsi${dimension}DCached`)
      expect(wgsl).toContain('const USE_EIGENFUNCTION_CACHE: bool = true;')
      expect(wgsl).toContain('const USE_ANALYTICAL_GRADIENT: bool = false;')
    }
  })

  it('composes isosurface mode with cache', () => {
    const { wgsl } = composeSchroedingerShader({
      dimension: 3,
      isosurface: true,
      sss: false,
      quantumMode: 'harmonicOscillator',
      useEigenfunctionCache: true,
    })

    verifyWgsl(wgsl, true)
    // Isosurface mode should still have analytical gradient for normals
    expect(wgsl).toContain('computeAnalyticalGradient')
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
