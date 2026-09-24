/**
 * Hydrogen ND extra-dimension early exit must not clip excited HO factors.
 *
 * Regression: the unrolled evaluators returned 0 once Σ_j u_j² > 18 (u = √ω·x),
 * a bound derived for the ground state. An n = 6 extra dimension still carries
 * ~3% of its peak density there, so the cut drew a hard shell whenever N-D
 * rotation brought the extra axes into view. The cut now widens by 2·Σ n_j.
 *
 * @module tests/rendering/webgpu/shaders/hydrogenNDVariantsExtraDimExit
 */

import { describe, expect, it } from 'vitest'

import {
  generateHydrogenNDCachedBlock,
  getHydrogenNDGeneratedBlock,
} from '@/rendering/webgpu/shaders/schroedinger/quantum/hydrogenNDVariants.wgsl'

function hermite(n: number, u: number): number {
  if (n === 0) return 1
  let h0 = 1
  let h1 = 2 * u
  for (let k = 1; k < n; k++) {
    const h2 = 2 * u * h1 - 2 * k * h0
    h0 = h1
    h1 = h2
  }
  return h1
}

/** |φ_n(u)|² up to the n-dependent normalization (cancels in peak ratios). */
function hoDensity(n: number, u: number): number {
  const v = hermite(n, u) * Math.exp(-0.5 * u * u)
  return v * v
}

/** Largest density beyond |u| = √cutSq relative to the state's peak density. */
function maxDensityBeyondCut(n: number, cutSq: number): number {
  let peak = 0
  for (let u = 0; u < 9; u += 1e-3) peak = Math.max(peak, hoDensity(n, u))
  let beyond = 0
  for (let u = Math.sqrt(cutSq); u < 12; u += 1e-3) beyond = Math.max(beyond, hoDensity(n, u))
  return beyond / peak
}

describe('hydrogen ND extra-dimension early exit', () => {
  it('the old flat Σu² > 18 cut clipped visible excited-state density', () => {
    expect(maxDensityBeyondCut(6, 18)).toBeGreaterThan(0.01)
  })

  it('the n-aware cut 18 + 2n leaves every supported state (n ≤ 6) below 1e-5 of peak', () => {
    for (let n = 0; n <= 6; n++) {
      expect(maxDensityBeyondCut(n, 18 + 2 * n)).toBeLessThan(1e-5)
    }
  })

  it('emits the n-aware threshold in both the plain and cached 5D evaluators', () => {
    for (const wgsl of [getHydrogenNDGeneratedBlock(5), generateHydrogenNDCachedBlock(5)]) {
      expect(wgsl).toContain(
        'let extraNSum = f32(getExtraDimN(uniforms, 0) + getExtraDimN(uniforms, 1));'
      )
      expect(wgsl).toContain('if (extraDistSq > 18.0 + 2.0 * extraNSum) {')
      expect(wgsl).not.toContain('if (extraDistSq > 18.0) {')
    }
  })

  it('keeps the 3D evaluator free of the extra-dimension exit', () => {
    expect(getHydrogenNDGeneratedBlock(3)).not.toContain('extraDistSq')
  })
})

// Regression: the momentum representation evolved with −½/n_eff² only, while
// the position representation adds the extra-dimension HO energies
// Σ ω_j (n_j + ½) — the two views rotated their phase at different rates.
describe('hydrogen ND momentum-representation energy', () => {
  it('includes the extra-dimension HO energies like the position representation', async () => {
    const { psiBlockHydrogenND } =
      await import('@/rendering/webgpu/shaders/schroedinger/quantum/psi.wgsl')
    const fnStart = psiBlockHydrogenND.indexOf('fn evalHydrogenNDMomentumPsi(')
    const fnBody = psiBlockHydrogenND.slice(fnStart, psiBlockHydrogenND.indexOf('\n}\n', fnStart))
    expect(fnBody).toContain(
      'extraEnergy += getExtraDimOmega(uniforms, i) * (f32(getExtraDimN(uniforms, i)) + 0.5);'
    )
    expect(fnBody).toContain('let energy = -0.5 / (nEff * nEff) + extraEnergy;')
  })
})
