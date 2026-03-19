/**
 * CPU-side performance microbenchmarks.
 *
 * Measures hot-path functions that run per-frame or per-state-change.
 * Use these baselines to verify optimization impact.
 *
 * Run: npx vitest run src/tests/rendering/perf-microbenchmarks.test.ts
 */

import { describe, expect, it } from 'vitest'

import { computeBoundingRadius } from '@/lib/geometry/extended/schroedinger/boundingRadius'
import {
  flattenPresetForUniforms,
  generateQuantumPreset,
} from '@/lib/geometry/extended/schroedinger/presets'
import { WebGPUCamera } from '@/rendering/webgpu/core/WebGPUCamera'
import {
  assembleShaderBlocks,
  type ShaderBlock,
} from '@/rendering/webgpu/shaders/shared/compose-helpers'

// ─── Helpers ────────────────────────────────────────────────────────────────

function benchmarkSync(
  fn: () => void,
  iterations: number
): { totalMs: number; avgUs: number; opsPerSec: number } {
  // Warmup
  for (let i = 0; i < Math.min(iterations, 100); i++) fn()

  const start = performance.now()
  for (let i = 0; i < iterations; i++) fn()
  const totalMs = performance.now() - start
  const avgUs = (totalMs / iterations) * 1000
  const opsPerSec = Math.round((iterations / totalMs) * 1000)
  return { totalMs, avgUs, opsPerSec }
}

// ─── Benchmarks ─────────────────────────────────────────────────────────────

describe('CPU microbenchmarks', () => {
  it('WebGPUCamera.updateMatrices (per-frame during camera motion)', () => {
    const camera = new WebGPUCamera()
    const iterations = 10_000

    const result = benchmarkSync(() => {
      // Simulate orbit: dirty + getMatrices triggers updateMatrices
      camera.orbit(0.01, 0.005)
      camera.getMatrices()
    }, iterations)

    console.log(
      `  Camera.updateMatrices: ${result.avgUs.toFixed(2)} μs/call, ` +
        `${result.opsPerSec.toLocaleString()} ops/sec (${iterations} iterations, ${result.totalMs.toFixed(1)}ms total)`
    )
    // Sanity: should be under 50μs per call
    expect(result.avgUs).toBeLessThan(50)
  })

  it('generateQuantumPreset (per-preset-change)', () => {
    const iterations = 1_000

    const result = benchmarkSync(() => {
      generateQuantumPreset(42, 5, 4, 6, 0.01)
    }, iterations)

    console.log(
      `  generateQuantumPreset: ${result.avgUs.toFixed(2)} μs/call, ` +
        `${result.opsPerSec.toLocaleString()} ops/sec`
    )
    expect(result.avgUs).toBeLessThan(500)
  })

  it('flattenPresetForUniforms (per-preset-change)', () => {
    const preset = generateQuantumPreset(42, 5, 4, 6, 0.01)
    const iterations = 10_000

    const result = benchmarkSync(() => {
      flattenPresetForUniforms(preset)
    }, iterations)

    console.log(
      `  flattenPresetForUniforms: ${result.avgUs.toFixed(2)} μs/call, ` +
        `${result.opsPerSec.toLocaleString()} ops/sec`
    )
    expect(result.avgUs).toBeLessThan(100)
  })

  it('computeBoundingRadius (per-state-change)', () => {
    const preset = generateQuantumPreset(42, 5, 4, 6, 0.01)
    const iterations = 5_000

    const result = benchmarkSync(() => {
      computeBoundingRadius(
        'harmonicOscillator',
        preset,
        5,
        4,
        1.0,
        undefined,
        undefined,
        'position',
        1.0
      )
    }, iterations)

    console.log(
      `  computeBoundingRadius: ${result.avgUs.toFixed(2)} μs/call, ` +
        `${result.opsPerSec.toLocaleString()} ops/sec`
    )
    expect(result.avgUs).toBeLessThan(200)
  })

  it('assembleShaderBlocks (per-pipeline-creation)', () => {
    // Create realistic shader blocks
    const blocks: ShaderBlock[] = [
      {
        name: 'defines',
        content: 'const DIMENSION: i32 = 5;\nconst TEMPORAL_ENABLED: bool = false;',
      },
      {
        name: 'uniforms',
        content: 'struct CameraUniforms { viewMatrix: mat4x4f, projMatrix: mat4x4f };',
      },
      {
        name: 'math',
        content: 'fn intersectSphere(ro: vec3f, rd: vec3f, r: f32) -> vec2f { return vec2f(0.0); }',
      },
      { name: 'sdf', content: 'fn sampleDensity(p: vec3f, t: f32) -> f32 { return 0.0; }' },
      {
        name: 'color',
        content: 'fn computeColor(rho: f32, phase: f32) -> vec3f { return vec3f(1.0); }',
      },
      {
        name: 'lighting',
        content: 'fn computeLighting(n: vec3f, v: vec3f) -> vec3f { return vec3f(1.0); }',
      },
      { name: 'integration', content: 'fn volumeRaymarch() -> vec4f { return vec4f(0.0); }' },
      { name: 'main', content: '@fragment fn main() -> @location(0) vec4f { return vec4f(1.0); }' },
    ]
    const iterations = 5_000

    const result = benchmarkSync(() => {
      assembleShaderBlocks(blocks)
    }, iterations)

    console.log(
      `  assembleShaderBlocks (8 blocks): ${result.avgUs.toFixed(2)} μs/call, ` +
        `${result.opsPerSec.toLocaleString()} ops/sec`
    )
    expect(result.avgUs).toBeLessThan(200)
  })

  it('Camera.getState (per-frame in store getter)', () => {
    const camera = new WebGPUCamera()
    const iterations = 100_000

    const result = benchmarkSync(() => {
      camera.getState()
    }, iterations)

    console.log(
      `  Camera.getState: ${result.avgUs.toFixed(2)} μs/call, ` +
        `${result.opsPerSec.toLocaleString()} ops/sec`
    )
    // Should be essentially free now (no spread copy)
    expect(result.avgUs).toBeLessThan(1)
  })

  it('Camera.getMatrices (per-frame, clean - no recompute)', () => {
    const camera = new WebGPUCamera()
    // Force initial compute
    camera.getMatrices()
    const iterations = 100_000

    const result = benchmarkSync(() => {
      camera.getMatrices()
    }, iterations)

    console.log(
      `  Camera.getMatrices (clean): ${result.avgUs.toFixed(2)} μs/call, ` +
        `${result.opsPerSec.toLocaleString()} ops/sec`
    )
    // Clean path should be near-zero (just dirty flag check + return)
    expect(result.avgUs).toBeLessThan(1)
  })
})
