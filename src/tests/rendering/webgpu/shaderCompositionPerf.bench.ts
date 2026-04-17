/**
 * Shader Composition Performance Benchmarks
 *
 * Measures the CPU-side cost of composing WGSL shader strings.
 * This runs every time a mode/config changes.
 *
 * Run: pnpm exec vitest bench src/tests/rendering/webgpu/shaderCompositionPerf.bench.ts
 */

import { bench, describe } from 'vitest'

import { composeSchroedingerShader } from '@/rendering/webgpu/shaders/schroedinger/compose'

describe('Shader composition performance', () => {
  bench('composeSchroedingerShader HO 3D', () => {
    composeSchroedingerShader({ dimension: 3, quantumMode: 'harmonicOscillator' })
  })

  bench('composeSchroedingerShader HO 5D (8 terms, cached)', () => {
    composeSchroedingerShader({
      dimension: 5,
      quantumMode: 'harmonicOscillator',
      termCount: 8,
      useEigenfunctionCache: true,
    })
  })

  bench('composeSchroedingerShader Hydrogen 7D', () => {
    composeSchroedingerShader({ dimension: 7, quantumMode: 'hydrogenND' })
  })

  bench('composeSchroedingerShader Hydrogen 11D coupled', () => {
    composeSchroedingerShader({ dimension: 11, quantumMode: 'hydrogenNDCoupled' })
  })

  bench('composeSchroedingerShader HO 3D isosurface + cache', () => {
    composeSchroedingerShader({
      dimension: 3,
      quantumMode: 'harmonicOscillator',
      isosurface: true,
      useEigenfunctionCache: true,
      termCount: 4,
    })
  })

  // Also measure output size
  bench('composeSchroedingerShader HO 3D (measure output)', () => {
    const result = composeSchroedingerShader({ dimension: 3, quantumMode: 'harmonicOscillator' })
    // Side effect to prevent dead code elimination
    if (result.wgsl.length < 0) throw new Error('unreachable')
  })
})
