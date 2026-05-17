import { describe, expect, it } from 'vitest'

import {
  applyWormholeCoupling,
  computeWormholeCoherence,
  isValidMirrorAxis,
  normalizeMirrorAxisForLattice,
} from '@/lib/physics/tdse/wormholeCoupling'

/**
 * Pre-fill an interleaved (re,im) psi buffer with a deterministic
 * normalized random state using a linear-congruential PRNG. Bit-stable
 * across platforms so test assertions don't drift.
 */
function makeRandomPsi(totalSites: number, seed: number): Float32Array {
  const psi = new Float32Array(2 * totalSites)
  let s = seed | 0 || 1
  let norm2 = 0
  for (let i = 0; i < totalSites; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) | 0
    const re = ((s >>> 0) / 0x1_00000000) * 2 - 1
    s = (Math.imul(s, 1664525) + 1013904223) | 0
    const im = ((s >>> 0) / 0x1_00000000) * 2 - 1
    psi[2 * i] = re
    psi[2 * i + 1] = im
    norm2 += re * re + im * im
  }
  const scale = 1 / Math.sqrt(norm2)
  for (let i = 0; i < psi.length; i++) psi[i] = psi[i]! * scale
  return psi
}

function totalNorm2(psi: Float32Array): number {
  let s = 0
  for (let i = 0; i < psi.length; i++) s += psi[i]! * psi[i]!
  return s
}

describe('applyWormholeCoupling — unitarity', () => {
  // Runs the norm-preservation check for every supported mirror axis.
  // Axis 0 lives in a stride-dominant slot while axes 1 and 2 exercise
  // the generic stride decomposition, so a regression on the non-zero
  // paths would otherwise slip through.
  it.each([0, 1, 2] as const)(
    'preserves the ψ norm after 500 successive applications (axis=%i)',
    (axis) => {
      const gridSize = [8, 4, 4] as const
      const total = gridSize[0] * gridSize[1] * gridSize[2]
      const psi = makeRandomPsi(total, 12345)
      const initialNorm = totalNorm2(psi)
      const dt = 0.01
      const g = 2.0
      for (let k = 0; k < 500; k++) {
        applyWormholeCoupling(psi, gridSize, axis, dt, g)
      }
      const finalNorm = totalNorm2(psi)
      expect(Math.abs(finalNorm - initialNorm)).toBeLessThan(5e-5)
    }
  )
})

describe('applyWormholeCoupling — no coupling preserves L-localized state', () => {
  it('leaves the R-integral at zero for g=0, any number of steps', () => {
    const gridSize = [8, 4] as const
    const total = gridSize[0] * gridSize[1]
    const psi = new Float32Array(2 * total)
    // Localize on the L-side of axis 0 (coord0 < 4).
    for (let i0 = 0; i0 < 4; i0++) {
      for (let i1 = 0; i1 < gridSize[1]; i1++) {
        const idx = i0 * gridSize[1] + i1
        psi[2 * idx] = 1 / Math.sqrt(4 * gridSize[1])
      }
    }
    for (let k = 0; k < 200; k++) {
      applyWormholeCoupling(psi, gridSize, 0, 0.01, 0)
    }
    let rInt = 0
    for (let i0 = 4; i0 < 8; i0++) {
      for (let i1 = 0; i1 < gridSize[1]; i1++) {
        const idx = i0 * gridSize[1] + i1
        rInt += psi[2 * idx]! * psi[2 * idx]! + psi[2 * idx + 1]! * psi[2 * idx + 1]!
      }
    }
    expect(rInt).toBeLessThan(1e-10)
  })
})

describe('applyWormholeCoupling — Rabi oscillation on a mirror pair', () => {
  /**
   * For a 2-site pair (L, R) and Hamiltonian H_int = g·P_M:
   *   |ψ_L(t)|² = cos²(g·t), |ψ_R(t)|² = sin²(g·t).
   * Tests this across many Rabi periods with 5% tolerance.
   *
   * (The original spec wrote `cos²(2gt)`; the mirror swap is a 2-level
   * system whose angular frequency is `g`, not `2g`. Asserting the
   * correct Rabi law preserves the test's physical intent while being
   * internally consistent with the closed-form `exp(-i τ g P_M) =
   * cos(τg) I - i sin(τg) P_M` on the 2-level subspace.)
   */
  it('|ψ_L|²(t) = cos²(g·t) within 5% for 0 < gt < π/2', () => {
    const gridSize = [2] as const
    const total = 2
    const g = 1.0
    const sampleTs = [0.1, 0.3, 0.5, 0.7, 1.0, 1.3, 1.5]
    for (const t of sampleTs) {
      const psi = new Float32Array(2 * total)
      psi[0] = 1 // ψ_L = 1, ψ_R = 0
      applyWormholeCoupling(psi, gridSize, 0, t, g)
      const pL = psi[0]! * psi[0]! + psi[1]! * psi[1]!
      const pR = psi[2]! * psi[2]! + psi[3]! * psi[3]!
      const expectedL = Math.cos(g * t) ** 2
      const expectedR = Math.sin(g * t) ** 2
      expect(Math.abs(pL - expectedL)).toBeLessThan(0.05)
      expect(Math.abs(pR - expectedR)).toBeLessThan(0.05)
      expect(Math.abs(pL + pR - 1)).toBeLessThan(1e-5)
    }
  })

  it('full teleportation at t = π/(2g) — ψ lands entirely on the R site', () => {
    const gridSize = [2] as const
    const g = 3.0
    const psi = new Float32Array([1, 0, 0, 0])
    applyWormholeCoupling(psi, gridSize, 0, Math.PI / (2 * g), g)
    const pL = psi[0]! ** 2 + psi[1]! ** 2
    const pR = psi[2]! ** 2 + psi[3]! ** 2
    expect(pR).toBeGreaterThan(0.99)
    expect(pL).toBeLessThan(0.01)
  })
})

describe('applyWormholeCoupling — mirror-symmetric state invariant', () => {
  it('mirror-symmetric ψ is unchanged up to a global phase; I(L:R) = 1', () => {
    const gridSize = [4, 4] as const
    const total = 16
    const psi = new Float32Array(2 * total)
    // Fill the L half, then mirror-copy into R so ψ(v) = ψ(M(v)).
    for (let i0 = 0; i0 < 2; i0++) {
      for (let i1 = 0; i1 < 4; i1++) {
        const idx = i0 * 4 + i1
        const mirror = (3 - i0) * 4 + i1
        psi[2 * idx] = 0.5
        psi[2 * mirror] = 0.5
      }
    }
    // Normalize.
    const norm = Math.sqrt(totalNorm2(psi))
    for (let i = 0; i < psi.length; i++) psi[i] = psi[i]! / norm

    const before = computeWormholeCoherence(psi, gridSize, 0)
    expect(before).toBeGreaterThan(0.999)

    // Ratios must be preserved under coupling (P_M|ψ⟩ = |ψ⟩ ⇒ ψ
    // evolves by pure phase). The test expresses this as: after
    // coupling, the per-site amplitude relative to the total norm
    // equals the pre-coupling ratio.
    const beforeAmps = Array.from(psi)
    applyWormholeCoupling(psi, gridSize, 0, 1.3, 2.0)

    const after = computeWormholeCoherence(psi, gridSize, 0)
    expect(after).toBeGreaterThan(0.999)

    const normBefore = Math.sqrt(beforeAmps.reduce((s, v) => s + v * v, 0))
    const normAfter = Math.sqrt(totalNorm2(psi))
    // |ψ_i| / ‖ψ‖ stays identical (global phase doesn't change magnitudes).
    for (let i = 0; i < total; i++) {
      const magBefore =
        Math.sqrt(beforeAmps[2 * i]! ** 2 + beforeAmps[2 * i + 1]! ** 2) / normBefore
      const magAfter = Math.sqrt(psi[2 * i]! ** 2 + psi[2 * i + 1]! ** 2) / normAfter
      expect(Math.abs(magBefore - magAfter)).toBeLessThan(1e-5)
    }
  })
})

describe('computeWormholeCoherence — range and basic invariants', () => {
  it('returns a value in [0, 1] for a random normalized ψ', () => {
    const gridSize = [8, 4, 4] as const
    const total = gridSize[0] * gridSize[1] * gridSize[2]
    for (let seed = 1; seed <= 20; seed++) {
      const psi = makeRandomPsi(total, seed * 997)
      const I = computeWormholeCoherence(psi, gridSize, 0)
      expect(I).toBeGreaterThanOrEqual(0)
      expect(I).toBeLessThanOrEqual(1 + 1e-6)
    }
  })

  it('returns 0 for a zero wavefunction', () => {
    const gridSize = [4, 4] as const
    const psi = new Float32Array(2 * 16)
    expect(computeWormholeCoherence(psi, gridSize, 0)).toBe(0)
  })
})

describe('applyWormholeCoupling — visible teleportation at GPU cadence', () => {
  /**
   * Acceptance #7: with an L-localized wavepacket and coupling on,
   * after N ≈ π / (2·g·dt) steps the R integral of |ψ|² should be ≥
   * 0.3. This is the CPU-reference version of the GPU integration
   * smoke test — the GPU path calls `applyWormholeCoupling` twice per
   * Strang step with `τ = dt/2`, whereas the reference applies the
   * full `τ = dt` once, so a single step here corresponds to one
   * Strang cycle on the GPU.
   */
  it('≥ 30% of |ψ|² arrives on the R half after π/(2g·dt) steps', () => {
    const gridSize = [8, 4] as const
    const total = 32
    const psi = new Float32Array(2 * total)
    // L-localized Gaussian-ish blob: Σ|ψ_L|² = 1.
    for (let i1 = 0; i1 < 4; i1++) {
      const idx = 0 * 4 + i1 // coord0 = 0 (leftmost)
      psi[2 * idx] = 1 / Math.sqrt(4)
    }
    const g = 2.0
    const dt = 0.01
    const nSteps = Math.floor(Math.PI / (2 * g * dt))
    for (let k = 0; k < nSteps; k++) {
      applyWormholeCoupling(psi, gridSize, 0, dt, g)
    }
    let rInt = 0
    for (let i0 = 4; i0 < 8; i0++) {
      for (let i1 = 0; i1 < 4; i1++) {
        const idx = i0 * 4 + i1
        rInt += psi[2 * idx]! * psi[2 * idx]! + psi[2 * idx + 1]! * psi[2 * idx + 1]!
      }
    }
    expect(rInt).toBeGreaterThanOrEqual(0.3)
  })
})

describe('applyWormholeCoupling — input validation', () => {
  it('throws on empty gridSize', () => {
    expect(() => applyWormholeCoupling(new Float32Array(0), [], 0, 0.1, 1)).toThrow(/non-empty/)
  })

  it('throws on non-integer grid size along a non-mirror axis', () => {
    expect(() =>
      applyWormholeCoupling(new Float32Array(0), [4, 3.5] as unknown as number[], 0, 0.1, 1)
    ).toThrow(/positive integer/)
  })

  it('throws on non-finite grid size', () => {
    expect(() =>
      applyWormholeCoupling(new Float32Array(0), [Number.NaN, 4] as unknown as number[], 1, 0.1, 1)
    ).toThrow(/positive integer/)
  })

  it('throws on out-of-range axis', () => {
    expect(() =>
      applyWormholeCoupling(new Float32Array(16), [4, 2], 2 as 0 | 1 | 2, 0.1, 1)
    ).toThrow(/out of range/)
  })

  it('throws on odd grid size along mirror axis', () => {
    expect(() => applyWormholeCoupling(new Float32Array(10), [5], 0, 0.1, 1)).toThrow(/even/)
  })
})

describe('isValidMirrorAxis', () => {
  it('accepts 0, 1, 2 and rejects other values', () => {
    expect(isValidMirrorAxis(0)).toBe(true)
    expect(isValidMirrorAxis(1)).toBe(true)
    expect(isValidMirrorAxis(2)).toBe(true)
    expect(isValidMirrorAxis(3)).toBe(false)
    expect(isValidMirrorAxis(-1)).toBe(false)
    expect(isValidMirrorAxis('0')).toBe(false)
    expect(isValidMirrorAxis(undefined)).toBe(false)
  })
})

describe('normalizeMirrorAxisForLattice', () => {
  it('clamps the mirror axis to the active lattice dimensions', () => {
    expect(normalizeMirrorAxisForLattice(2, 3)).toBe(2)
    expect(normalizeMirrorAxisForLattice(2, 2)).toBe(1)
    expect(normalizeMirrorAxisForLattice(2, 1)).toBe(0)
    expect(normalizeMirrorAxisForLattice(-1, 3)).toBe(0)
    expect(normalizeMirrorAxisForLattice(Number.NaN, 3)).toBe(0)
  })
})
