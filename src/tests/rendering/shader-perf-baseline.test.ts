/**
 * Shader performance baseline measurements.
 *
 * Measures shader compilation time and WGSL output complexity
 * for all toggleable feature combinations. Used as baseline data
 * for the performance audit.
 *
 * @module tests/rendering/shader-perf-baseline
 */
import { describe, expect, it } from 'vitest'

import { composeSchroedingerShader } from '@/rendering/webgpu/shaders/schroedinger/compose'
import type { SchroedingerWGSLShaderConfig } from '@/rendering/webgpu/shaders/schroedinger/composeConfig'

/** Default config for analytical modes. */
function baseConfig(
  overrides: Partial<SchroedingerWGSLShaderConfig> = {}
): SchroedingerWGSLShaderConfig {
  return {
    dimension: 3,
    quantumMode: 'harmonicOscillator',
    termCount: 3,
    isosurface: false,
    temporalAccumulation: false,
    useDensityGrid: false,
    densityGridHasPhase: false,
    densityGridSize: 64,
    nodal: false,
    phaseMateriality: false,
    interference: false,
    uncertaintyBoundary: false,
    colorAlgorithm: 4,
    isWigner: false,
    useWignerCache: false,
    isFreeScalar: false,
    isQuantumWalk: false,
    isPauli: false,
    freeScalarAnalysis: false,
    useDensityMatrix: false,
    crossSectionEnabled: false,
    probabilityCurrentEnabled: false,
    useEigenfunctionCache: false,
    useAnalyticalGradient: false,
    useRobustEigenInterpolation: false,
    ...overrides,
  }
}

interface ShaderMetrics {
  compilationTimeMs: number
  wgslLength: number
  wgslLines: number
  moduleCount: number
  featureCount: number
}

function measureShader(config: SchroedingerWGSLShaderConfig): ShaderMetrics {
  const start = performance.now()
  const result = composeSchroedingerShader(config)
  const compilationTimeMs = performance.now() - start

  return {
    compilationTimeMs,
    wgslLength: result.wgsl.length,
    wgslLines: result.wgsl.split('\n').length,
    moduleCount: result.modules.length,
    featureCount: result.features.length,
  }
}

/**
 * Count function definitions in WGSL (fn keyword)
 */
function countFunctions(wgsl: string): number {
  return (wgsl.match(/\bfn\s+\w+\s*\(/g) || []).length
}

/**
 * Count texture sampling operations in WGSL
 */
function countTextureSamples(wgsl: string): number {
  return (wgsl.match(/\b(textureSample|textureLoad|textureStore)\b/g) || []).length
}

describe('shader compilation baseline — analytical modes', () => {
  const configs: Array<{ name: string; config: SchroedingerWGSLShaderConfig }> = [
    { name: 'HO 3D minimal (no features)', config: baseConfig() },
    {
      name: 'HO 3D all features',
      config: baseConfig({
        nodal: true,
        phaseMateriality: true,
        interference: true,
        uncertaintyBoundary: true,
        crossSectionEnabled: true,
        probabilityCurrentEnabled: true,
      }),
    },
    {
      name: 'HO 3D eigencache',
      config: baseConfig({
        useEigenfunctionCache: true,
        useAnalyticalGradient: true,
        useRobustEigenInterpolation: true,
      }),
    },
    {
      name: 'HO 3D eigencache + all features',
      config: baseConfig({
        useEigenfunctionCache: true,
        useAnalyticalGradient: true,
        useRobustEigenInterpolation: true,
        nodal: true,
        phaseMateriality: true,
        interference: true,
        uncertaintyBoundary: true,
        crossSectionEnabled: true,
        probabilityCurrentEnabled: true,
      }),
    },
    { name: 'HO 3D temporal', config: baseConfig({ temporalAccumulation: true }) },
    { name: 'HO 3D isosurface', config: baseConfig({ isosurface: true }) },
    {
      name: 'HO 3D isosurface temporal',
      config: baseConfig({ isosurface: true, temporalAccumulation: true }),
    },
    {
      name: 'HO 3D density grid',
      config: baseConfig({ useDensityGrid: true, densityGridHasPhase: true }),
    },
    {
      name: 'HO 3D density grid (grid-only)',
      config: baseConfig({
        useDensityGrid: true,
        densityGridHasPhase: false,
        nodal: false,
        phaseMateriality: false,
        interference: false,
        probabilityCurrentEnabled: false,
        colorAlgorithm: 11,
      }),
    },
    { name: 'HO 5D', config: baseConfig({ dimension: 5 }) },
    { name: 'HO 8D', config: baseConfig({ dimension: 8 }) },
    { name: 'HO 11D', config: baseConfig({ dimension: 11 }) },
    { name: 'HO 3D 1 term', config: baseConfig({ termCount: 1 }) },
    { name: 'HO 3D 8 terms', config: baseConfig({ termCount: 8 }) },
    { name: 'HO 2D', config: baseConfig({ dimension: 2 }) },
    { name: 'Wigner HO', config: baseConfig({ isWigner: true }) },
    { name: 'Wigner HO (cached)', config: baseConfig({ isWigner: true, useWignerCache: true }) },
    { name: 'Hydrogen 3D', config: baseConfig({ quantumMode: 'hydrogenND' }) },
    { name: 'Hydrogen 5D', config: baseConfig({ quantumMode: 'hydrogenND', dimension: 5 }) },
    {
      name: 'Hydrogen 3D all features',
      config: baseConfig({
        quantumMode: 'hydrogenND',
        nodal: true,
        phaseMateriality: true,
        interference: true,
        uncertaintyBoundary: true,
        crossSectionEnabled: true,
        probabilityCurrentEnabled: true,
      }),
    },
    {
      name: 'Hydrogen 3D eigencache',
      config: baseConfig({
        quantumMode: 'hydrogenND',
        useDensityGrid: true,
        densityGridHasPhase: true,
      }),
    },
    {
      name: 'Hydrogen ND Coupled 4D',
      config: baseConfig({
        quantumMode: 'hydrogenNDCoupled',
        dimension: 4,
      }),
    },
    // Color algorithm variants
    ...([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14] as const).map((alg) => ({
      name: `HO 3D color alg ${alg}`,
      config: baseConfig({ colorAlgorithm: alg }),
    })),
  ]

  const results: Array<{ name: string; metrics: ShaderMetrics; fnCount: number; texOps: number }> =
    []

  for (const { name, config } of configs) {
    it(`measures: ${name}`, () => {
      const metrics = measureShader(config)
      const result = composeSchroedingerShader(config)
      const fnCount = countFunctions(result.wgsl)
      const texOps = countTextureSamples(result.wgsl)

      results.push({ name, metrics, fnCount, texOps })

      // Validate shader compiles successfully
      expect(metrics.wgslLength).toBeGreaterThan(0)
      expect(metrics.wgslLines).toBeGreaterThan(0)
      expect(metrics.compilationTimeMs).toBeLessThan(100)
    })
  }

  it('reports baseline metrics', () => {
    // Sort by WGSL length descending — largest shaders are most expensive on GPU
    const sorted = [...results].sort((a, b) => b.metrics.wgslLength - a.metrics.wgslLength)

    const report = sorted.map(
      (r) =>
        `${r.name.padEnd(40)} | ${String(r.metrics.wgslLines).padStart(5)} lines | ` +
        `${String(r.metrics.wgslLength).padStart(7)} chars | ` +
        `${String(r.fnCount).padStart(3)} fns | ` +
        `${String(r.texOps).padStart(3)} tex | ` +
        `${r.metrics.compilationTimeMs.toFixed(2).padStart(7)}ms`
    )

    // Log as a structured block for analysis
    const header = 'Config'.padEnd(40) + ' | Lines | Chars   | Fns | Tex | CompileMs'
    const separator = '-'.repeat(header.length)

    // Emit as test metadata — captured in output
    console.log('\n=== SHADER BASELINE METRICS ===')
    console.log(header)
    console.log(separator)
    for (const line of report) {
      console.log(line)
    }
    console.log(separator)

    // Verify we measured all configs
    expect(results.length).toBe(configs.length)
  })
})

describe('feature interaction cost analysis', () => {
  it('measures marginal cost of each feature toggle', () => {
    const baseline = composeSchroedingerShader(baseConfig())
    const baselineLines = baseline.wgsl.split('\n').length
    const baselineFns = countFunctions(baseline.wgsl)

    const features: Array<{ name: string; override: Partial<SchroedingerWGSLShaderConfig> }> = [
      { name: 'nodal', override: { nodal: true } },
      { name: 'phaseMateriality', override: { phaseMateriality: true } },
      { name: 'interference', override: { interference: true } },
      { name: 'uncertaintyBoundary', override: { uncertaintyBoundary: true } },
      { name: 'crossSection', override: { crossSectionEnabled: true } },
      { name: 'probabilityCurrent', override: { probabilityCurrentEnabled: true } },
      {
        name: 'eigenfunctionCache',
        override: { useEigenfunctionCache: true, useAnalyticalGradient: true },
      },
      { name: 'temporalAccumulation', override: { temporalAccumulation: true } },
      { name: 'densityGrid', override: { useDensityGrid: true, densityGridHasPhase: true } },
      { name: 'isosurface', override: { isosurface: true } },
    ]

    const report: string[] = []
    for (const { name, override } of features) {
      const result = composeSchroedingerShader(baseConfig(override))
      const lines = result.wgsl.split('\n').length
      const fns = countFunctions(result.wgsl)
      const deltaLines = lines - baselineLines
      const deltaFns = fns - baselineFns
      report.push(
        `+${name.padEnd(25)} | ${String(deltaLines).padStart(5)} lines | ${String(deltaFns).padStart(3)} fns`
      )
    }

    console.log('\n=== FEATURE MARGINAL COST (vs minimal baseline) ===')
    console.log(`Baseline: ${baselineLines} lines, ${baselineFns} fns`)
    for (const line of report) {
      console.log(line)
    }

    expect(features.length).toBeGreaterThan(0)
  })

  it('measures psi evaluation cost per feature combo in volume raymarch', () => {
    // Count how many times evalPsi/sampleDensity are called in the fragment shader
    // for different feature configurations. Each evalPsi in the raymarch loop is
    // the dominant cost.
    const combos: Array<{ name: string; config: SchroedingerWGSLShaderConfig }> = [
      { name: 'minimal (1 psi/step)', config: baseConfig() },
      { name: '+nodal (5 psi/step via tetrahedral)', config: baseConfig({ nodal: true }) },
      {
        name: '+probCurrent (7 psi/step via finite diff)',
        config: baseConfig({ probabilityCurrentEnabled: true }),
      },
      {
        name: '+nodal+probCurrent (12 psi/step)',
        config: baseConfig({
          nodal: true,
          probabilityCurrentEnabled: true,
        }),
      },
      {
        name: '+eigencache (texture lookups)',
        config: baseConfig({
          useEigenfunctionCache: true,
          useAnalyticalGradient: true,
        }),
      },
    ]

    for (const { name, config } of combos) {
      const result = composeSchroedingerShader(config)
      const evalPsiCount = (result.wgsl.match(/\bevalPsi\b/g) || []).length
      const sampleDensityCount = (result.wgsl.match(/\bsampleDensity\b/g) || []).length
      const texLoadCount = (result.wgsl.match(/\btextureLoad\b/g) || []).length

      console.log(
        `${name.padEnd(45)} | evalPsi: ${String(evalPsiCount).padStart(3)} | ` +
          `sampleDensity: ${String(sampleDensityCount).padStart(3)} | ` +
          `textureLoad: ${String(texLoadCount).padStart(3)}`
      )
    }

    expect(combos.length).toBeGreaterThan(0)
  })
})
