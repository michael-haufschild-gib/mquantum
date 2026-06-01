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
import { composeWignerCacheComputeShader } from '@/rendering/webgpu/shaders/schroedinger/compute/composeWignerCache'
import { generateEmissionPreBlock } from '@/rendering/webgpu/shaders/schroedinger/volume/emission.wgsl'
import { COLOR_ALGORITHM_INDICES } from '@/rendering/webgpu/shaders/schroedinger/volume/emissionConstants'
import {
  composeSkyboxFragmentShader,
  composeSkyboxVertexShader,
} from '@/rendering/webgpu/shaders/skybox/compose'

/** Verify fragment or vertex WGSL shader and check for GLSL leakage. */
function verifyWgsl(wgsl: string, isFragment: boolean = true): void {
  expect(wgsl).toBeValidWGSL(isFragment ? 'fragment' : 'vertex')
  expect(wgsl).toHaveNoGLSLLeakage()
}

/** Verify compute WGSL shader with additional compute-specific checks. */
function verifyWgslCompute(wgsl: string): void {
  expect(wgsl).toBeValidWGSL('compute')
  expect(wgsl).toHaveNoGLSLLeakage()
  expect(wgsl).toMatch(/@workgroup_size\s*\(\s*\d+/)
  expect(wgsl).toMatch(/texture_storage_3d/)
}

function verifyNoGlslLeakage(wgsl: string): void {
  expect(wgsl).toHaveNoGLSLLeakage()
}

describe('WGSL Shader Compilation - Schroedinger', () => {
  const dimensions = [3, 4, 5, 6, 7, 8, 9, 10, 11]

  for (const dimension of dimensions) {
    it(`composes WGSL fragment shader for dimension ${dimension}`, () => {
      const { wgsl, features } = composeSchroedingerShader({
        dimension,

        temporal: true,

        quantumMode: 'hydrogenND',
      })

      verifyWgsl(wgsl, true)
      verifyNoGlslLeakage(wgsl)
      expect(features).toContain(`${dimension}D Quantum`)
      expect(features).toContain('Hydrogen ND')
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

        quantumMode,
      })

      verifyWgsl(wgsl, true)
    }
  })

  it('includes momentum representation uniforms in composed shaders', () => {
    const { wgsl } = composeSchroedingerShader({
      dimension: 4,
      temporal: false,

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

      quantumMode: 'harmonicOscillator',
    })

    verifyWgsl(wgsl, true)
    // HO momentum is handled by CPU uniform transformation (1/ω + coefficient phase rotation),
    // so the shader only has the position-mode evaluator — no momentum branching.
    expect(wgsl).toContain('fn evalHarmonicOscillatorPsi(')
    expect(wgsl).not.toContain('fn evalHarmonicOscillatorPsiMomentum(')
    expect(wgsl).toContain('return evalHarmonicOscillatorPsi(xND, t, uniforms);')
  })

  it('compiles true 2D hydrogen with circular harmonics', () => {
    const { wgsl } = composeSchroedingerShader({
      dimension: 2,
      temporal: false,

      quantumMode: 'hydrogenND',
    })

    verifyWgsl(wgsl, true)
    // 2D evaluator uses circular harmonics, not spherical
    expect(wgsl).toContain('evalHydrogenNDPsi2D')
    expect(wgsl).toContain('evalCircularHarmonic')
    expect(wgsl).toContain('ACTUAL_DIM: i32 = 2')
  })

  it('compiles hydrogenNDCoupled at dim=2 using uncoupled evaluator', () => {
    const { wgsl } = composeSchroedingerShader({
      dimension: 2,
      temporal: false,

      quantumMode: 'hydrogenNDCoupled',
    })

    verifyWgsl(wgsl, true)
    // At dim=2, coupled mode falls back to uncoupled (no hyperspherical harmonics)
    expect(wgsl).toContain('evalHydrogenNDPsi2D')
    expect(wgsl).not.toContain('cartesianToHyperspherical')
  })

  it('routes hydrogen-ND psi through momentum evaluator when enabled', () => {
    const { wgsl } = composeSchroedingerShader({
      dimension: 6,
      temporal: false,

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

  it('specializes 2D harmonic-oscillator render shader with matching helper and dispatch', () => {
    const { wgsl, modules } = composeSchroedingerShader({
      dimension: 2,
      temporal: false,
      quantumMode: 'harmonicOscillator',
    })

    verifyWgsl(wgsl, true)
    expect(modules).toContain('HO ND 2D')
    expect(wgsl).toContain('fn hoND2D(')
    expect(wgsl).toContain('return hoND2D(xND, termIdx, uniforms);')
    expect(wgsl).not.toContain('fn hoND3D(')
  })

  it('uses a finite aspect fallback in true 2D fragment coordinate mapping', () => {
    const { wgsl } = composeSchroedingerShader({
      dimension: 2,
      temporal: false,
      quantumMode: 'harmonicOscillator',
    })

    verifyWgsl(wgsl, true)
    expect(wgsl).toContain('var aspect = 1.0;')
    expect(wgsl).toContain('if (camera.resolution.x > 0.0 && camera.resolution.y > 0.0) {')
    expect(wgsl).not.toContain('let aspect = camera.resolution.x / camera.resolution.y;')
  })

  it('scales 2D contour anti-aliasing by camera zoom', () => {
    const { wgsl } = composeSchroedingerShader({
      dimension: 2,
      temporal: false,
      quantumMode: 'harmonicOscillator',
      isosurface: true,
      nodal: true,
    })

    verifyWgsl(wgsl, true)
    const expectedPixelSize =
      '2.0 * uniforms.boundingRadius * modelPixelScale / max(camera.resolution.y, 1.0)'
    expect(wgsl).toContain(
      'let modelPixelScale = max(length((camera.modelMatrix * vec4f(1.0, 0.0, 0.0, 0.0)).xyz), 1e-6);'
    )
    const pixelSizeMatches = wgsl.match(
      new RegExp(expectedPixelSize.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')
    )
    expect(pixelSizeMatches?.length ?? 0).toBeGreaterThanOrEqual(2)
  })

  it('uses post-modulated density for 2D isoline neighbor gradients', () => {
    const { wgsl } = composeSchroedingerShader({
      dimension: 2,
      temporal: false,
      quantumMode: 'harmonicOscillator',
      isosurface: true,
    })

    verifyWgsl(wgsl, true)
    expect(wgsl).toContain(
      'let rho_r = sampleDensityWithPhase(pos + vec3f(eps, 0.0, 0.0), animTime, uniforms).x;'
    )
    expect(wgsl).toContain(
      'let rho_u = sampleDensityWithPhase(pos + vec3f(0.0, eps, 0.0), animTime, uniforms).x;'
    )
    expect(wgsl).not.toContain(
      'let rho_r = sampleDensity(pos + vec3f(eps, 0.0, 0.0), animTime, uniforms);'
    )
  })

  it('specializes hydrogen-ND family by excluding HO ND modules', () => {
    const { wgsl, modules } = composeSchroedingerShader({
      dimension: 7,

      temporal: false,

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
    // Algorithm 5 (Blackbody) uses no color modules — cosine and oklab excluded
    const { wgsl, modules } = composeSchroedingerShader({
      dimension: 4,

      temporal: false,

      quantumMode: 'harmonicOscillator',
      colorAlgorithm: 5,
    })

    verifyWgsl(wgsl, true)
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

      quantumMode: 'harmonicOscillator',
    })

    const invPiMatches = wgsl.match(/\bconst\s+INV_PI\s*:/g) ?? []
    expect(invPiMatches).toHaveLength(1)
  })

  it('uses physical wavefunction-based nodal classification', () => {
    const { wgsl } = composeSchroedingerShader({
      dimension: 4,

      temporal: false,

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

      quantumMode: 'harmonicOscillator',
    })

    expect(wgsl).toContain('let worldOffset = cameraRight * (jitterOffset.x * pixelSizeX) -')
    expect(wgsl).toContain('cameraUp * (jitterOffset.y * pixelSizeY);')
    expect(wgsl).not.toContain('* pixelSize * 2.0')
  })

  it('keeps temporal jitter finite on degenerate resize frames', () => {
    const { wgsl } = composeSchroedingerShader({
      dimension: 4,
      temporalAccumulation: true,
      quantumMode: 'harmonicOscillator',
    })

    expect(wgsl).toContain(
      'let nonNanResolution = select(vec2f(1.0), camera.resolution, camera.resolution == camera.resolution);'
    )
    expect(wgsl).toContain('let safeResolution = max(nonNanResolution, vec2f(1.0));')
    expect(wgsl).toContain('/ safeResolution.y;')
    expect(wgsl).toContain('safeResolution.x;')
    expect(wgsl).not.toContain('/ camera.resolution.y;')
    expect(wgsl).not.toContain('camera.resolution.x;')
  })

  it('uses box intersection for free scalar field bounding volume', () => {
    const { wgsl } = composeSchroedingerShader({
      dimension: 3,
      temporal: false,

      quantumMode: 'harmonicOscillator',
      isFreeScalar: true,
    })

    verifyWgsl(wgsl, true)
    expect(wgsl).toContain('const IS_FREE_SCALAR: bool = true;')
    expect(wgsl).toContain('fn intersectBox(')
    expect(wgsl).toContain('tSphere = intersectBox(ro, rd, schroedinger.boundingRadius);')
  })

  it('composes isosurface mode for free scalar field with density grid', () => {
    const { wgsl, features } = composeSchroedingerShader({
      dimension: 3,
      isosurface: true,
      temporalAccumulation: false,
      useDensityGrid: true,
      densityGridSize: 64,
      densityGridHasPhase: true,
      quantumMode: 'harmonicOscillator',
      termCount: 1,
      nodal: false,
      phaseMateriality: false,
      interference: false,
      uncertaintyBoundary: false,
      isFreeScalar: true,
      colorAlgorithm: 4,
    })

    verifyWgsl(wgsl, true)
    expect(wgsl).toContain('const IS_FREE_SCALAR: bool = true;')
    expect(wgsl).toContain('Main Fragment Shader - Isosurface Mode')
    expect(wgsl).toContain('struct FragmentOutput')
    expect(wgsl).toContain('fn intersectBox(')
    expect(wgsl).toContain('sampleDensityFromGrid')
    expect(wgsl).toContain('computePBRSpecular')
    expect(features).toContain('Isosurface Mode')
  })

  it('composes volumetric mode for free scalar field with density grid', () => {
    const { wgsl, features } = composeSchroedingerShader({
      dimension: 3,
      isosurface: false,
      temporalAccumulation: false,
      useDensityGrid: true,
      densityGridSize: 64,
      densityGridHasPhase: true,
      quantumMode: 'harmonicOscillator',
      termCount: 1,
      nodal: false,
      phaseMateriality: false,
      interference: false,
      uncertaintyBoundary: false,
      isFreeScalar: true,
      colorAlgorithm: 4,
    })

    verifyWgsl(wgsl, true)
    expect(wgsl).toContain('const IS_FREE_SCALAR: bool = true;')
    expect(wgsl).toContain('Main Fragment Shader - Volumetric Mode')
    expect(wgsl).toContain('fn intersectBox(')
    expect(wgsl).toContain('volumeRaymarchGrid')
    expect(features).toContain('Volumetric Mode')
    // Volumetric mode should NOT have FragmentOutput struct (single output)
    expect(wgsl).not.toContain('struct FragmentOutput')
  })

  it('composes grid-only mode for hydrogen ND without unresolved hydrogenRadial', () => {
    // Regression: grid-only stubs exclude hydrogenRadialBlock, but
    // radialProbabilityBlock called hydrogenRadial() → unresolved symbol.
    const { wgsl, features } = composeSchroedingerShader({
      dimension: 3,
      isosurface: false,
      temporalAccumulation: false,
      useDensityGrid: true,
      densityGridSize: 64,
      quantumMode: 'hydrogenND',
      nodal: false,
      phaseMateriality: false,
      interference: false,
      uncertaintyBoundary: false,
      probabilityCurrentEnabled: false,
      crossSectionEnabled: false,
      colorAlgorithm: 11, // radialDistance — non-phase, enables gridOnly
    })

    verifyWgsl(wgsl, true)
    expect(features).toContain('Grid-Only (inline raymarch excluded)')
    expect(features).toContain('Hydrogen ND')
    // Radial probability overlay must use stub (no hydrogenRadial in grid-only)
    expect(wgsl).not.toContain('fn hydrogenRadial(')
  })

  it('uses the D-dimensional hydrogen radial function for radial probability overlay', () => {
    const { wgsl } = composeSchroedingerShader({
      dimension: 5,
      isosurface: false,
      temporalAccumulation: false,
      useDensityGrid: false,
      quantumMode: 'hydrogenND',
      nodal: false,
      phaseMateriality: false,
      interference: false,
      uncertaintyBoundary: false,
      probabilityCurrentEnabled: false,
      crossSectionEnabled: false,
    })

    verifyWgsl(wgsl, true)
    expect(wgsl).toContain('const HYDROGEN_ND_DIMENSION: i32 = 5;')
    expect(wgsl).toMatch(
      /fn computeRadialProbabilityOverlay[\s\S]*HYDROGEN_ND_DIMENSION == 3[\s\S]*R = hydrogenRadialND\(/
    )
  })

  it('keeps radial probability from being optimized out in hydrogen density-grid path', () => {
    const { wgsl, features } = composeSchroedingerShader({
      dimension: 5,
      isosurface: false,
      temporalAccumulation: false,
      useDensityGrid: true,
      densityGridSize: 64,
      quantumMode: 'hydrogenND',
      nodal: false,
      phaseMateriality: false,
      interference: false,
      uncertaintyBoundary: false,
      probabilityCurrentEnabled: false,
      radialProbabilityEnabled: true,
      crossSectionEnabled: false,
      colorAlgorithm: 11, // radialDistance — non-phase
    })

    verifyWgsl(wgsl, true)
    expect(features).not.toContain('Grid-Only (inline raymarch excluded)')
    expect(wgsl).not.toContain('Quantum Math Stubs (grid-only)')
    expect(wgsl).toContain('fn hydrogenRadialND(')
    expect(wgsl).toContain('R = hydrogenRadialND(')
  })

  it('keeps born-null weave from being optimized out in density-grid path', () => {
    const { wgsl, features } = composeSchroedingerShader({
      dimension: 3,
      isosurface: false,
      temporalAccumulation: false,
      useDensityGrid: true,
      densityGridSize: 64,
      quantumMode: 'harmonicOscillator',
      nodal: false,
      phaseMateriality: false,
      interference: false,
      uncertaintyBoundary: false,
      probabilityCurrentEnabled: false,
      radialProbabilityEnabled: false,
      bornNullWeaveEnabled: true,
      crossSectionEnabled: false,
      colorAlgorithm: 11, // radialDistance — non-phase
    })

    verifyWgsl(wgsl, true)
    expect(features).not.toContain('Grid-Only (inline raymarch excluded)')
    expect(wgsl).not.toContain('Quantum Math Stubs (grid-only)')
    expect(wgsl).toContain('fn isBornNullWeaveActive(')
    expect(wgsl).toContain('fn applyBornNullWeaveRaymarchHQ(')
  })

  it('keeps phase shimmer from being optimized out in density-grid path', () => {
    const { wgsl, features } = composeSchroedingerShader({
      dimension: 3,
      isosurface: false,
      temporalAccumulation: false,
      useDensityGrid: true,
      densityGridSize: 64,
      quantumMode: 'harmonicOscillator',
      nodal: false,
      phaseMateriality: false,
      interference: false,
      uncertaintyBoundary: false,
      probabilityCurrentEnabled: false,
      radialProbabilityEnabled: false,
      bornNullWeaveEnabled: false,
      phaseShimmerEnabled: true,
      crossSectionEnabled: false,
      colorAlgorithm: 11,
    })

    verifyWgsl(wgsl, true)
    expect(features).not.toContain('Grid-Only (inline raymarch excluded)')
    expect(wgsl).not.toContain('Quantum Math Stubs (grid-only)')
    expect(wgsl).toContain('fn sampleDensityWithPhaseComponents(')
    expect(wgsl).toContain('uniforms.phaseShimmerEnabled')
  })

  it('keeps hydrogen phase animation from being optimized out in density-grid path', () => {
    const { wgsl, features } = composeSchroedingerShader({
      dimension: 5,
      isosurface: false,
      temporalAccumulation: false,
      useDensityGrid: true,
      densityGridSize: 64,
      quantumMode: 'hydrogenND',
      nodal: false,
      phaseMateriality: false,
      interference: false,
      uncertaintyBoundary: false,
      probabilityCurrentEnabled: false,
      radialProbabilityEnabled: false,
      bornNullWeaveEnabled: false,
      phaseAnimationEnabled: true,
      crossSectionEnabled: false,
      colorAlgorithm: 11,
    })

    verifyWgsl(wgsl, true)
    expect(features).not.toContain('Grid-Only (inline raymarch excluded)')
    expect(wgsl).not.toContain('Quantum Math Stubs (grid-only)')
    expect(wgsl).toContain('fn evalPsiWithSpatialPhase(')
    expect(wgsl).toContain('uniforms.phaseAnimationEnabled')
  })

  it('does not fall back to pure-state inline raymarching in density-matrix mode', () => {
    const { wgsl, features } = composeSchroedingerShader({
      dimension: 3,
      isosurface: false,
      temporalAccumulation: false,
      useDensityGrid: true,
      useDensityMatrix: true,
      densityGridSize: 64,
      quantumMode: 'harmonicOscillator',
      nodal: false,
      phaseMateriality: false,
      interference: false,
      uncertaintyBoundary: false,
      probabilityCurrentEnabled: false,
      radialProbabilityEnabled: false,
      bornNullWeaveEnabled: false,
      phaseAnimationEnabled: false,
      crossSectionEnabled: false,
      colorAlgorithm: 16,
    })

    verifyWgsl(wgsl, true)
    expect(features).not.toContain('Grid-Only (inline raymarch excluded)')
    expect(wgsl).toContain('No inline fallback in density matrix mode')
    expect(wgsl).not.toContain('if (!IS_FREE_SCALAR && volumeResult.alpha < 0.01)')
  })

  it('uses sphere intersection for non-free-scalar modes', () => {
    const { wgsl } = composeSchroedingerShader({
      dimension: 3,
      temporal: false,

      quantumMode: 'harmonicOscillator',
    })

    verifyWgsl(wgsl, true)
    expect(wgsl).toContain('const IS_FREE_SCALAR: bool = false;')
    expect(wgsl).toContain('fn intersectBox(')
    expect(wgsl).toContain('tSphere = intersectSphere(ro, rd, schroedinger.boundingRadius);')
  })

  it('emits HAS_BINARY_SIGN_PHASE = true for FSF, Wigner, and AdS modes', () => {
    // Free scalar field writes phase = {0, π} based on sign(fieldValue).
    // Color algorithm 9 (Diverging) uses sin/cos(phase) to recover the
    // sign; `sin(π) ≈ 0` collapses the whole cube to neutral. The shader
    // composer must flag these modes so the algorithm falls back to
    // cos-based extraction. Regression: previously the flag did not
    // exist and FSF + useImag rendered gray.
    const fsf = composeSchroedingerShader({
      dimension: 3,
      temporal: false,
      quantumMode: 'harmonicOscillator',
      // isFreeScalar = compute-grid mode (all compute modes set it).
      // isFreeScalarField = strictly the FSF mode — this is what drives
      // HAS_BINARY_SIGN_PHASE. See composeConfig.ts field docs.
      isFreeScalar: true,
      isFreeScalarField: true,
    })
    expect(fsf.wgsl).toContain('const HAS_BINARY_SIGN_PHASE: bool = true;')

    const wigner = composeSchroedingerShader({
      dimension: 2,
      temporal: false,
      quantumMode: 'harmonicOscillator',
      isWigner: true,
    })
    expect(wigner.wgsl).toContain('const HAS_BINARY_SIGN_PHASE: bool = true;')

    const ads = composeSchroedingerShader({
      dimension: 3,
      temporal: false,
      // AdS rides on the shared HO shader composition path at runtime —
      // `rendererConfigUtils` narrows the shader `quantumMode` to
      // `'harmonicOscillator'` for AdS and carries the AdS-ness through
      // the explicit `isAds` flag instead.
      quantumMode: 'harmonicOscillator',
      isAds: true,
    })
    expect(ads.wgsl).toContain('const IS_ADS: bool = true;')
    expect(ads.wgsl).toContain('const HAS_BINARY_SIGN_PHASE: bool = true;')
  })

  it('emits HAS_BINARY_SIGN_PHASE = false for continuous-phase modes', () => {
    // Analytical modes (HO, hydrogen) compute ψ = Re + i·Im and write a
    // continuous phase = atan2(Im, Re), so sin(phase) carries genuine
    // Im(ψ) information. These modes must NOT trigger the fallback.
    const ho = composeSchroedingerShader({
      dimension: 3,
      temporal: false,
      quantumMode: 'harmonicOscillator',
    })
    expect(ho.wgsl).toContain('const HAS_BINARY_SIGN_PHASE: bool = false;')
    expect(ho.wgsl).toContain('const IS_ADS: bool = false;')
  })
})

describe('WGSL Color Algorithm Specialization', () => {
  const allAlgorithms = COLOR_ALGORITHM_INDICES

  for (const alg of allAlgorithms) {
    it(`produces valid WGSL for colorAlgorithm=${alg}`, () => {
      const { wgsl } = composeSchroedingerShader({
        dimension: 4,
        temporal: false,

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

        quantumMode: 'harmonicOscillator',
        colorAlgorithm: alg,
      })

      expect(modules).not.toContain('Color Selector')
    }
    // Also check default (Mixed)
    const { modules } = composeSchroedingerShader({
      dimension: 4,
      temporal: false,

      quantumMode: 'harmonicOscillator',
    })
    expect(modules).not.toContain('Color Selector')
  })

  it('excludes Cosine module for non-cosine algorithms (3, 4, 5, 6, 7, 8, 9, 10, 11)', () => {
    // 3=Phase(HSL), 4=Mixed(HSL), 5=Blackbody(none), 6=PhaseCyclicUniform(Oklab),
    // 7=PhaseDiverging(HSL), 8=DomainColoringPsi(HSL), 9=Diverging(HSL),
    // 10=RelativePhase(HSL), 11=Energy(HSL)
    const nonCosineAlgorithms = [3, 4, 5, 6, 7, 8, 9, 10, 11] as const
    for (const alg of nonCosineAlgorithms) {
      const { modules, wgsl } = composeSchroedingerShader({
        dimension: 4,
        temporal: false,

        quantumMode: 'harmonicOscillator',
        colorAlgorithm: alg,
      })

      expect(modules).not.toContain('Color (Cosine)')
      expect(wgsl).not.toContain('fn cosinePalette(')
    }
  })

  it('excludes Oklab module for non-Oklab algorithms', () => {
    // All except 0 (LCH) and 6 (PhaseCyclicUniform)
    const nonOklabAlgorithms = [1, 2, 3, 4, 5, 7, 8, 9, 10, 11] as const
    for (const alg of nonOklabAlgorithms) {
      const { modules, wgsl } = composeSchroedingerShader({
        dimension: 4,
        temporal: false,

        quantumMode: 'harmonicOscillator',
        colorAlgorithm: alg,
      })

      expect(modules).not.toContain('Color (Oklab)')
      expect(wgsl).not.toContain('fn oklab2rgb(')
    }
  })

  it('includes Cosine module for cosine algorithms (1, 2)', () => {
    // 1=MultiSource, 2=Radial
    const cosineAlgorithms = [1, 2] as const
    for (const alg of cosineAlgorithms) {
      const { modules, wgsl } = composeSchroedingerShader({
        dimension: 4,
        temporal: false,

        quantumMode: 'harmonicOscillator',
        colorAlgorithm: alg,
      })

      expect(modules).toContain('Color (Cosine)')
      expect(wgsl).toContain('fn cosinePalette(')
    }
  })

  it('includes Oklab module for Oklab-based algorithms (0, 6)', () => {
    for (const alg of [0, 6] as const) {
      const { modules, wgsl } = composeSchroedingerShader({
        dimension: 4,
        temporal: false,

        quantumMode: 'harmonicOscillator',
        colorAlgorithm: alg,
      })

      expect(modules).toContain('Color (Oklab)')
      expect(wgsl).toContain('fn oklab2rgb(')
    }
  })

  it('defaults to Mixed (4) algorithm when colorAlgorithm is omitted', () => {
    const { modules, features } = composeSchroedingerShader({
      dimension: 4,
      temporal: false,

      quantumMode: 'harmonicOscillator',
    })

    expect(modules).toContain('Color (HSL)')
    expect(modules).not.toContain('Color (Cosine)')
    expect(modules).not.toContain('Color (Oklab)')
    expect(features).toContain('Color: Mixed')
  })

  it('always includes HSL module', () => {
    for (const alg of allAlgorithms) {
      const { modules } = composeSchroedingerShader({
        dimension: 4,
        temporal: false,

        quantumMode: 'harmonicOscillator',
        colorAlgorithm: alg,
      })

      expect(modules).toContain('Color (HSL)')
    }
  })

  it('works with hydrogenND + colorAlgorithm', () => {
    // 0=LCH, 2=Radial, 4=Mixed
    for (const alg of [0, 2, 4] as const) {
      const { wgsl } = composeSchroedingerShader({
        dimension: 5,
        temporal: false,

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

      quantumMode: 'harmonicOscillator',
      colorAlgorithm: 4,
    })

    expect(features).toContain('Color: Mixed')
  })

  it('adds domain-coloring feature tag when colorAlgorithm=8', () => {
    const { features } = composeSchroedingerShader({
      dimension: 4,
      temporal: false,

      quantumMode: 'harmonicOscillator',
      colorAlgorithm: 8,
    })

    expect(features).toContain('Color: Domain Coloring Psi')
  })

  it('adds diverging feature tag when colorAlgorithm=9', () => {
    const { features } = composeSchroedingerShader({
      dimension: 4,
      temporal: false,

      quantumMode: 'harmonicOscillator',
      colorAlgorithm: 9,
    })

    expect(features).toContain('Color: Diverging')
  })

  it('sources signed phase diverging wing colors from uniforms (algorithm 7)', () => {
    const { wgsl } = composeSchroedingerShader({
      dimension: 4,
      temporal: false,

      quantumMode: 'harmonicOscillator',
      colorAlgorithm: 7,
    })

    expect(wgsl).toContain('uniforms.divergingNeutralParams.xyz')
    expect(wgsl).toContain('uniforms.divergingPositiveParams.xyz')
    expect(wgsl).toContain('uniforms.divergingNegativeParams.xyz')
  })

  it('adds relative-phase feature tag when colorAlgorithm=10', () => {
    const { features } = composeSchroedingerShader({
      dimension: 4,
      temporal: false,

      quantumMode: 'harmonicOscillator',
      colorAlgorithm: 10,
    })

    expect(features).toContain('Color: Relative Phase')
  })

  it('adds radial distance feature tag when colorAlgorithm=11', () => {
    const { features } = composeSchroedingerShader({
      dimension: 4,
      temporal: false,

      quantumMode: 'harmonicOscillator',
      colorAlgorithm: 11,
    })

    expect(features).toContain('Color: Radial Distance')
  })

  it('uses density-grid relative-phase channel for colorAlgorithm=10', () => {
    const { wgsl } = composeSchroedingerShader({
      dimension: 4,
      temporal: false,

      quantumMode: 'harmonicOscillator',
      isosurface: true,
      useDensityGrid: true,
      densityGridHasPhase: true,
      colorAlgorithm: 10,
    })

    expect(wgsl).toContain('const COLOR_ALGORITHM: i32 = 10;')
    // Only analytical modes (0, 1, 7) actually write relativePhase into the
    // density grid's A channel; every other mode packs overlay alpha, total
    // density, coherenceFraction, or potential overlay. The relativePhase
    // palette runtime-gates to that whitelist and falls back to spatial
    // phase (B) everywhere else — see isosurfaceSampling.ts.
    expect(wgsl).toContain('(COLOR_ALGORITHM == 10)')
    expect(wgsl).toContain('schroedinger.quantumMode == 0')
    expect(wgsl).toContain('schroedinger.quantumMode == 1')
    expect(wgsl).toContain('schroedinger.quantumMode == 7')
    expect(wgsl).toContain('select(gridColor.b, gridColor.a, useRelPhase)')
  })

  it('does not emit derivative ops in domainColoringPsi emission path', () => {
    const { wgsl } = composeSchroedingerShader({
      dimension: 4,
      temporal: false,

      quantumMode: 'harmonicOscillator',
      colorAlgorithm: 8,
    })

    expect(wgsl).not.toContain('fwidth(')
  })

  it('quantumWalk + domainColoringPsi uses log-based lightness, not linear rho', () => {
    const { wgsl } = composeSchroedingerShader({
      dimension: 3,
      useDensityGrid: true,
      densityGridHasPhase: true,
      densityGridSize: 96,
      isFreeScalar: true,
      isQuantumWalk: true,
      colorAlgorithm: 8,
      nodal: false,
      phaseMateriality: false,
      interference: false,
      uncertaintyBoundary: false,
      crossSectionEnabled: false,
      probabilityCurrentEnabled: false,
    })

    expect(wgsl).toContain('const IS_QUANTUM_WALK: bool = true')
    expect(wgsl).toContain('const COLOR_ALGORITHM: i32 = 8')
    // Log-based modulusValue: (logModulus + 8) / 8 provides good dynamic range
    expect(wgsl).toContain('clamp((logModulus + 8.0) / 8.0, 0.0, 1.0)')
    // Must NOT contain linear rho branch for QW (causes black output)
    expect(wgsl).not.toContain('select(rho, sqrt(rho), modulusMode)')
  })

  it('quantumWalk + phaseDensity uses log-compressed normalized, not linear rho', () => {
    const { wgsl } = composeSchroedingerShader({
      dimension: 3,
      useDensityGrid: true,
      densityGridHasPhase: true,
      densityGridSize: 96,
      isFreeScalar: true,
      isQuantumWalk: true,
      colorAlgorithm: 22,
      nodal: false,
      phaseMateriality: false,
      interference: false,
      uncertaintyBoundary: false,
      crossSectionEnabled: false,
      probabilityCurrentEnabled: false,
    })

    expect(wgsl).toContain('const IS_QUANTUM_WALK: bool = true')
    expect(wgsl).toContain('const COLOR_ALGORITHM: i32 = 22')
    // Uses log-compressed 'normalized' for brightness (not linear rho)
    expect(wgsl).toContain('let brightness = clamp(normalized, 0.0, 1.0)')
    // Must NOT contain IS_QUANTUM_WALK-gated linear rho select
    expect(wgsl).not.toContain('select(normalized, rho, IS_QUANTUM_WALK)')
  })

  it('always adds color feature tag (compile-time specialization)', () => {
    const { features } = composeSchroedingerShader({
      dimension: 4,
      temporal: false,

      quantumMode: 'harmonicOscillator',
    })

    expect(features.some((f) => f.startsWith('Color:'))).toBe(true)
  })

  it('splits emission into 3 blocks in modules list', () => {
    const { modules } = composeSchroedingerShader({
      dimension: 4,
      temporal: false,

      quantumMode: 'harmonicOscillator',
      colorAlgorithm: 4,
    })

    expect(modules).toContain('Volume Emission (Pre)')
    expect(modules).toContain('Volume Emission (Color)')
    expect(modules).toContain('Volume Emission (Post)')
    expect(modules).not.toContain('Volume Emission')
  })
})

describe('WGSL Emission Pre-Block Conditional Inclusion', () => {
  it('algorithm 5 (Blackbody) includes blackbody(), excludes PHASE_HUE_INFLUENCE and applyDistributionS', () => {
    const block = generateEmissionPreBlock(5, false)
    expect(block).toContain('fn blackbody(')
    expect(block).not.toContain('PHASE_HUE_INFLUENCE')
    expect(block).not.toContain('fn applyDistributionS(')
  })

  it('blackbody() is always included (WGSL requires symbol resolution in dead branches)', () => {
    // blackbody is referenced in main.wgsl.ts and main2D.wgsl.ts behind
    // FEATURE_PHASE_MATERIALITY guards, so it must always be defined
    for (const alg of COLOR_ALGORITHM_INDICES) {
      const block = generateEmissionPreBlock(alg, false)
      expect(block).toContain('fn blackbody(')
    }
  })

  it('algorithm 3 (Phase) includes PHASE_HUE_INFLUENCE, excludes applyDistributionS', () => {
    const block = generateEmissionPreBlock(3, false)
    expect(block).toContain('PHASE_HUE_INFLUENCE')
    expect(block).toContain('fn blackbody(') // always included
    expect(block).not.toContain('fn applyDistributionS(')
  })

  it('algorithm 5 does NOT include PHASE_HUE_INFLUENCE', () => {
    const block = generateEmissionPreBlock(5, false)
    expect(block).not.toContain('PHASE_HUE_INFLUENCE')
  })

  it('algorithm 0 (LCH) includes applyDistributionS, excludes PHASE_HUE_INFLUENCE', () => {
    const block = generateEmissionPreBlock(0, false)
    expect(block).toContain('fn applyDistributionS(')
    expect(block).not.toContain('PHASE_HUE_INFLUENCE')
  })

  it('applyDistributionS wraps cycles instead of saturating before fract', () => {
    const block = generateEmissionPreBlock(1, false)
    expect(block).toContain('return fract(curved * cycles + offset);')
    expect(block).not.toContain('fract(clamp(')
  })

  it('algorithm 4 (Mixed) does NOT include applyDistributionS', () => {
    const block = generateEmissionPreBlock(4, false)
    expect(block).not.toContain('fn applyDistributionS(')
  })

  it('henyeyGreenstein included in 3D, excluded in 2D', () => {
    const block3D = generateEmissionPreBlock(4, false)
    expect(block3D).toContain('fn henyeyGreenstein(')

    const block2D = generateEmissionPreBlock(4, true)
    expect(block2D).not.toContain('fn henyeyGreenstein(')
  })

  it('2D + algorithm 4 + no phaseMateriality emits minimal block (header + blackbody + PHASE_HUE_INFLUENCE)', () => {
    const block = generateEmissionPreBlock(4, true)
    expect(block).toContain('fn blackbody(')
    expect(block).not.toContain('fn henyeyGreenstein(')
    expect(block).not.toContain('fn applyDistributionS(')
    expect(block).toContain('PHASE_HUE_INFLUENCE')
  })

  it('dead COLOR_ALG_* constants are removed', () => {
    // Walk the shared algorithm registry so newer COLOR_ALG_* ids stay covered.
    for (const alg of COLOR_ALGORITHM_INDICES) {
      const block = generateEmissionPreBlock(alg, false)
      expect(block).not.toContain('COLOR_ALG_')
    }
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

  it('specializes 2D harmonic-oscillator density compute shader with matching helper and dispatch', () => {
    const { wgsl, modules } = composeDensityGridComputeShader({
      dimension: 2,
      quantumMode: 'harmonicOscillator',
    })

    verifyWgslCompute(wgsl)
    expect(modules).toContain('HO ND 2D')
    expect(wgsl).toContain('fn hoND2D(')
    expect(wgsl).toContain('return hoND2D(xND, termIdx, uniforms);')
    expect(wgsl).not.toContain('fn hoND3D(')
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

  it('uses uncoupled hydrogen evaluator for 2D coupled density compute shader', () => {
    const { wgsl, modules } = composeDensityGridComputeShader({
      dimension: 2,
      quantumMode: 'hydrogenNDCoupled',
    })

    verifyWgslCompute(wgsl)
    expect(modules).toContain('Hydrogen ND 2D')
    expect(modules).toContain('Hydrogen ND Dispatch')
    expect(wgsl).toContain('const ACTUAL_DIM: i32 = 2;')
    expect(wgsl).toContain('evalHydrogenNDPsi2D')
    expect(wgsl).not.toContain('cartesianToHyperspherical')
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

    expect(wgsl.length).toBeGreaterThan(100)
    expect(wgsl).toMatch(/@compute/)
    expect(wgsl).toMatch(/@workgroup_size\s*\(\s*256/)
    expect(wgsl).toContain('fn main(')
    expect(wgsl).toContain('eigenCacheOut')
    expect(wgsl).toContain('computeHo1D')
    expect(wgsl).toContain('computeHo1DDeriv')
    expect(wgsl).toContain('const EIGEN_CACHE_SAMPLES: u32 = 2048u;')
    expect(wgsl).toContain(
      'const WORKGROUPS_PER_FUNC: u32 = (EIGEN_CACHE_SAMPLES + WORKGROUP_SIZE - 1u) / WORKGROUP_SIZE;'
    )
    expect(features).toContain('Eigenfunction Cache Compute')
  })

  it('composes HO shader with eigenfunction cache enabled', () => {
    const { wgsl, modules, features } = composeSchroedingerShader({
      dimension: 4,
      temporal: false,

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
    expect(wgsl).toContain('const USE_ROBUST_EIGEN_INTERPOLATION: bool = true;')
    expect(wgsl).toContain('fn lookupEigenfunction(')
    expect(wgsl).toContain('fn ho1DCached(')
    expect(wgsl).toContain('fn sampleDensityWithAnalyticalGradient(')
    expect(wgsl).toContain('var<storage, read> eigenCache')
    expect(wgsl).toContain('var<uniform> eigenMeta')
  })

  it('allows disabling analytical gradient while keeping eigencache enabled', () => {
    const { wgsl } = composeSchroedingerShader({
      dimension: 4,
      temporal: false,

      quantumMode: 'harmonicOscillator',
      useEigenfunctionCache: true,
      useAnalyticalGradient: false,
    })

    verifyWgsl(wgsl, true)
    expect(wgsl).toContain('const USE_EIGENFUNCTION_CACHE: bool = true;')
    expect(wgsl).toContain('const USE_ANALYTICAL_GRADIENT: bool = false;')
  })

  it('toggles robust eigencache interpolation define independently', () => {
    const { wgsl: robustOn } = composeSchroedingerShader({
      dimension: 4,
      temporal: false,

      quantumMode: 'harmonicOscillator',
      useEigenfunctionCache: true,
      useRobustEigenInterpolation: true,
    })
    const { wgsl: robustOff } = composeSchroedingerShader({
      dimension: 4,
      temporal: false,

      quantumMode: 'harmonicOscillator',
      useEigenfunctionCache: true,
      useRobustEigenInterpolation: false,
    })

    expect(robustOn).toContain('const USE_ROBUST_EIGEN_INTERPOLATION: bool = true;')
    expect(robustOff).toContain('const USE_ROBUST_EIGEN_INTERPOLATION: bool = false;')
  })

  it('composes HO shader with cache and unrolled terms', () => {
    const termCounts = [1, 2, 4, 8] as const
    for (const termCount of termCounts) {
      const { wgsl, modules } = composeSchroedingerShader({
        dimension: 3,
        temporal: false,

        quantumMode: 'harmonicOscillator',
        useEigenfunctionCache: true,
        termCount,
      })

      verifyWgsl(wgsl, true)
      expect(modules).toContain(`HO ND 3D`)
      // Cached variant should use hoNDOptimized which routes through cache
      expect(wgsl).toContain('hoND3DCached')
      if (termCount > 1) {
        expect(wgsl).toContain(`if (${termCount - 1} < uniforms.termCount)`)
      }
    }
  })

  it('guards inactive cached analytical-gradient terms in unrolled shaders', () => {
    const { wgsl } = composeSchroedingerShader({
      dimension: 3,
      temporal: false,

      quantumMode: 'harmonicOscillator',
      useEigenfunctionCache: true,
      useAnalyticalGradient: true,
      termCount: 4,
    })

    verifyWgsl(wgsl, true)
    expect(wgsl).toContain('if (1 < uniforms.termCount) { // Term 1')
    expect(wgsl).toContain('if (3 < uniforms.termCount) { // Term 3')
  })

  it('composes HO shader with cache across all dimensions', () => {
    for (const dimension of [3, 5, 7, 11]) {
      const { wgsl } = composeSchroedingerShader({
        dimension,
        temporal: false,

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
    expect(wgsl).toContain('const USE_ROBUST_EIGEN_INTERPOLATION: bool = true;')
    // Cached hydrogen ND variant should be present
    expect(wgsl).toContain('evalHydrogenNDPsi5DCached')
    expect(wgsl).toContain('ho1DCached')
  })

  it('includes cache bindings for hydrogen ND 3D (0 entries, harmless)', () => {
    const { wgsl, modules } = composeSchroedingerShader({
      dimension: 3,
      temporal: false,

      quantumMode: 'hydrogenND',
      useEigenfunctionCache: true,
    })

    verifyWgsl(wgsl, true)
    // Cache is always enabled — 3D hydrogen has 0 entries but bindings are present
    expect(modules).toContain('Eigenfunction Cache Lookup')
    expect(wgsl).toContain('const USE_EIGENFUNCTION_CACHE: bool = true;')
    // No analytical gradient for hydrogen (3D core isn't HO)
    expect(wgsl).toContain('const USE_ANALYTICAL_GRADIENT: bool = false;')
    expect(wgsl).toContain('const USE_ROBUST_EIGEN_INTERPOLATION: bool = true;')
    // No cached variant — no extra dims to cache
    expect(wgsl).not.toContain('evalHydrogenNDPsi3DCached')
  })

  it('composes hydrogen ND with cache across all higher dimensions', () => {
    for (const dimension of [4, 6, 8, 11]) {
      const { wgsl } = composeSchroedingerShader({
        dimension,
        temporal: false,

        quantumMode: 'hydrogenND',
        useEigenfunctionCache: true,
      })

      verifyWgsl(wgsl, true)
      expect(wgsl).toContain(`evalHydrogenNDPsi${dimension}DCached`)
      expect(wgsl).toContain('const USE_EIGENFUNCTION_CACHE: bool = true;')
      expect(wgsl).toContain('const USE_ANALYTICAL_GRADIENT: bool = false;')
      expect(wgsl).toContain('const USE_ROBUST_EIGEN_INTERPOLATION: bool = true;')
    }
  })

  it('composes isosurface mode with cache', () => {
    const { wgsl } = composeSchroedingerShader({
      dimension: 3,
      isosurface: true,

      quantumMode: 'harmonicOscillator',
      useEigenfunctionCache: true,
    })

    verifyWgsl(wgsl, true)
    // Isosurface mode should still have analytical gradient for normals
    expect(wgsl).toContain('computeAnalyticalGradient')
  })
})

describe('WGSL Shader Compilation - Skybox', () => {
  const modes = [
    'aurora',
    'nebula',
    'crystalline',
    'horizon',
    'ocean',
    'twilight',
    'classic',
  ] as const

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

  it('guards ocean palette-derived normalization against zero vectors', () => {
    const { wgsl } = composeSkyboxFragmentShader({
      mode: 'ocean',
      effects: { sun: false, vignette: false },
    })

    expect(wgsl).toContain('fn safeNormalizeOcean(')
    expect(wgsl).not.toMatch(/normalize\s*\(\s*userSurface\s*-\s*userDeep\b/)
    expect(wgsl).not.toMatch(/normalize\s*\(\s*userMid\s*\+/)
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

describe('WGSL Shader Compilation - Wigner Cache', () => {
  it('composes Wigner cache compute shader for HO mode', () => {
    const { wgsl, features } = composeWignerCacheComputeShader({
      dimension: 3,
      quantumMode: 'harmonicOscillator',
    })

    expect(wgsl.length).toBeGreaterThan(100)
    expect(wgsl).toMatch(/@compute/)
    expect(wgsl).toMatch(/@workgroup_size\s*\(\s*16\s*,\s*16/)
    expect(wgsl).toContain('fn main(')
    expect(wgsl).toContain('wignerCacheOut')
    expect(wgsl).toContain('evaluateWignerMarginalHO')
    expect(wgsl).toContain('WignerGridParams')
    expect(features).toContain('Wigner Cache Compute')
    expect(features).toContain('Harmonic Oscillator')
  })

  it('composes Wigner cache compute shader for hydrogen ND mode', () => {
    const { wgsl, features } = composeWignerCacheComputeShader({
      dimension: 4,
      quantumMode: 'hydrogenND',
    })

    expect(wgsl).toMatch(/@compute/)
    expect(wgsl).toContain('wignerHydrogenRadial')
    expect(wgsl).toContain('fn hydrogenRadial(')
    expect(features).toContain('Hydrogen ND')
  })

  it('composes fragment shader with Wigner cache enabled', () => {
    const { wgsl, features } = composeSchroedingerShader({
      dimension: 3,
      isWigner: true,
      useWignerCache: true,
      quantumMode: 'harmonicOscillator',
    })

    verifyWgsl(wgsl, true)
    verifyNoGlslLeakage(wgsl)
    expect(features).toContain('Wigner Cache')
    expect(wgsl).toContain('wignerCacheTexture')
    expect(wgsl).toContain('wignerCacheSampler')
    expect(wgsl).toContain('textureSampleLevel')
  })

  it('suppresses eigenfunction cache bindings in Wigner mode', () => {
    const { wgsl, features } = composeSchroedingerShader({
      dimension: 4,
      isWigner: true,
      useWignerCache: true,
      quantumMode: 'hydrogenND',
      useEigenfunctionCache: true,
    })

    verifyWgsl(wgsl, true)
    verifyNoGlslLeakage(wgsl)
    expect(features).not.toContain('Eigenfunction Cache')
    expect(wgsl).toContain('wignerCacheTexture')
    expect(wgsl).toContain('wignerCacheSampler')
    expect(wgsl).toContain('const USE_EIGENFUNCTION_CACHE: bool = false;')
    expect(wgsl).not.toContain('var<storage, read> eigenCache')
    expect(wgsl).not.toContain('var<uniform> eigenMeta')
  })

  it('suppresses eigenfunction cache bindings in native 2D mode', () => {
    const { wgsl, features } = composeSchroedingerShader({
      dimension: 2,
      isWigner: false,
      quantumMode: 'harmonicOscillator',
      useEigenfunctionCache: true,
    })

    verifyWgsl(wgsl, true)
    verifyNoGlslLeakage(wgsl)
    expect(features).not.toContain('Eigenfunction Cache')
    expect(wgsl).toContain('const USE_EIGENFUNCTION_CACHE: bool = false;')
    expect(wgsl).not.toContain('var<storage, read> eigenCache')
    expect(wgsl).not.toContain('var<uniform> eigenMeta')
  })

  it('composes fragment shader with Wigner inline evaluation', () => {
    const { wgsl, features } = composeSchroedingerShader({
      dimension: 3,
      isWigner: true,
      useWignerCache: false,
      quantumMode: 'harmonicOscillator',
    })

    verifyWgsl(wgsl, true)
    verifyNoGlslLeakage(wgsl)
    expect(features).not.toContain('Wigner Cache')
    expect(wgsl).not.toContain('wignerCacheTexture')
    expect(wgsl).toContain('evaluateWignerMarginalHO')
  })
})
