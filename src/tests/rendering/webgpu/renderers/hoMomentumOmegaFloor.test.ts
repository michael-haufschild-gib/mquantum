/**
 * The momentum representation reuses the HO position evaluators with
 * ω_k = s²/(ħ²ω) packed into the omega uniform. Those evaluators (ho1D, the
 * unrolled hoND variants, the eigenfunction-cache kernel and its CPU domain)
 * used to floor ω at 0.01 — a value the momentum transform reaches from the
 * UI (momentum scale 0.1, p-space ħ ≳ 1.1, or frequency spread 0.5). The
 * state was then drawn as a narrower Gaussian than the momentum bounding
 * radius (and the physics) prescribe, and stopped tracking ħ.
 */
import { describe, expect, it } from 'vitest'

import { computeHOMomentumBoundingRadius } from '@/lib/geometry/extended/schroedinger/boundingRadius'
import { generateQuantumPreset } from '@/lib/geometry/extended/schroedinger/presets'
import { SCHROEDINGER_LAYOUT } from '@/rendering/webgpu/renderers/schroedingerLayout'
import { applyHOMomentumTransform } from '@/rendering/webgpu/renderers/uniformPackingSupport'
import { composeEigenfunctionCacheComputeShader } from '@/rendering/webgpu/shaders/schroedinger/compute/composeEigenCache'
import {
  HO_OMEGA_FLOOR,
  HO_OMEGA_FLOOR_WGSL,
  ho1dBlock,
} from '@/rendering/webgpu/shaders/schroedinger/quantum/ho1d.wgsl'
import { hoND3dBlock } from '@/rendering/webgpu/shaders/schroedinger/quantum/hoNDVariants.wgsl'
import { MAX_DIM } from '@/rendering/webgpu/shaders/schroedinger/uniforms.wgsl'

const I = SCHROEDINGER_LAYOUT.index
/** Bounding-radius Gaussian margin (boundingRadius.ts GAUSSIAN_MARGIN). */
const BR_MARGIN = 2.5

function momentumOmegas(
  omega: readonly number[],
  dim: number,
  hbar: number,
  scale: number
): number[] {
  const ab = new ArrayBuffer(SCHROEDINGER_LAYOUT.totalSize)
  const floatView = new Float32Array(ab)
  const intView = new Int32Array(ab)
  for (let j = 0; j < MAX_DIM; j++) floatView[I.omega + j] = omega[j] ?? 1
  intView[I.termCount] = 1
  applyHOMomentumTransform(floatView, intView, dim, hbar, scale)
  return Array.from({ length: dim }, (_, j) => floatView[I.omega + j]!)
}

describe('HO momentum representation — omega floor', () => {
  const dim = 3
  // Store/UI extremes: momentumScale ∈ [0.1, 4], p-space ħ ∈ [0.01, 10],
  // frequencySpread ∈ [0, 0.5].
  const cases = [
    { seed: 7, spread: 0.01, hbar: 2, scale: 0.1 },
    { seed: 11, spread: 0.5, hbar: 1, scale: 0.1 },
    { seed: 42, spread: 0.5, hbar: 10, scale: 0.1 },
    { seed: 3, spread: 0.2, hbar: 6, scale: 0.5 },
  ]

  it('reachable momentum frequencies fall below the old 0.01 floor but stay above the guard', () => {
    let minOmegaK = Infinity
    for (const c of cases) {
      const preset = generateQuantumPreset(c.seed, dim, 2, 4, c.spread)
      for (const w of momentumOmegas(preset.omega, dim, c.hbar, c.scale)) {
        minOmegaK = Math.min(minOmegaK, w)
      }
    }
    expect(minOmegaK).toBeLessThan(0.01)
    // Worst reachable case is s²/(ħ²ω_max) = 0.01/(100·2.05) ≈ 4.9e-5.
    expect(minOmegaK).toBeGreaterThan(40 * HO_OMEGA_FLOOR)
  })

  it('renders the momentum state at the width the bounding radius was sized for', () => {
    for (const c of cases) {
      const preset = generateQuantumPreset(c.seed, dim, 2, 4, c.spread)
      const omegaK = momentumOmegas(preset.omega, dim, c.hbar, c.scale)
      // Extent of the drawn Gaussian: the shader evaluates with max(ω_k, floor).
      let renderedExtent = 2.0
      for (let j = 0; j < dim; j++) {
        const maxN = Math.max(...preset.quantumNumbers.map((row) => row[j] ?? 0))
        const omegaRendered = Math.max(omegaK[j]!, HO_OMEGA_FLOOR)
        renderedExtent = Math.max(
          renderedExtent,
          (Math.sqrt(2 * maxN + 1) + BR_MARGIN) / Math.sqrt(omegaRendered)
        )
      }
      const boundR = computeHOMomentumBoundingRadius(
        dim,
        preset.quantumNumbers,
        preset.omega,
        c.scale / c.hbar
      )
      expect(renderedExtent / boundR).toBeCloseTo(1, 4)
    }
  })

  it('every HO evaluator floors omega at HO_OMEGA_FLOOR, not 0.01', () => {
    expect(Number(HO_OMEGA_FLOOR_WGSL)).toBe(HO_OMEGA_FLOOR)
    const floorCall = `, ${HO_OMEGA_FLOOR_WGSL})`
    const cacheKernel = composeEigenfunctionCacheComputeShader().wgsl
    expect(ho1dBlock).toContain(`let omegaClamped = max(omega${floorCall};`)
    expect(cacheKernel).toContain(`let omegaClamped = max(omega${floorCall};`)
    expect(hoND3dBlock).toContain(`let omega_0 = max(getOmega(uniforms, 0)${floorCall};`)
    for (const src of [ho1dBlock, cacheKernel, hoND3dBlock]) {
      expect(src).not.toMatch(/max\((omega|getOmega\([^)]*\)), 0\.01\)/)
    }
  })
})
