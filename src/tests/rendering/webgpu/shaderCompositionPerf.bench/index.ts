/**
 * Shader Composition Performance Benchmarks
 *
 * Measures the CPU-side cost of composing WGSL shader strings.
 * This runs every time a mode/config changes.
 *
 * Run: pnpm exec vitest bench --run src/tests/rendering/webgpu/shaderCompositionPerf.bench
 */

import { describe } from 'vitest'

import { composeSchroedingerShader } from '@/rendering/webgpu/shaders/schroedinger/compose'
import { benchmark } from '@/tests/benchmark'

describe('Shader composition performance', () => {
  benchmark('composeSchroedingerShader HO 3D', () => {
    composeSchroedingerShader({ dimension: 3, quantumMode: 'harmonicOscillator' })
  })

  benchmark('composeSchroedingerShader HO 5D (8 terms, cached)', () => {
    composeSchroedingerShader({
      dimension: 5,
      quantumMode: 'harmonicOscillator',
      termCount: 8,
      useEigenfunctionCache: true,
    })
  })

  benchmark('composeSchroedingerShader Hydrogen 7D', () => {
    composeSchroedingerShader({ dimension: 7, quantumMode: 'hydrogenND' })
  })

  benchmark('composeSchroedingerShader Hydrogen 11D coupled', () => {
    composeSchroedingerShader({ dimension: 11, quantumMode: 'hydrogenNDCoupled' })
  })

  benchmark('composeSchroedingerShader HO 3D isosurface + cache', () => {
    composeSchroedingerShader({
      dimension: 3,
      quantumMode: 'harmonicOscillator',
      isosurface: true,
      useEigenfunctionCache: true,
      termCount: 4,
    })
  })

  // Also measure output size
  benchmark('composeSchroedingerShader HO 3D (measure output)', () => {
    const result = composeSchroedingerShader({ dimension: 3, quantumMode: 'harmonicOscillator' })
    // Side effect to prevent dead code elimination
    if (result.wgsl.length < 0) throw new Error('unreachable')
  })
})
