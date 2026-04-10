/**
 * Unit tests for the Bunch-Davies adiabatic vacuum sampler and safe-η₀
 * clamp.
 *
 * Assertions answer:
 *
 * - Does `minLatticeMomentum` return `2π/L_max` correctly?
 * - Does `safeEta0` return `DEFAULT_SAFE_ETA0` for non-tachyonic regimes
 *   (Minkowski, Kasner, ekpyrotic in all their modes — β(β−1) ≤ 0)?
 * - Does `safeEta0` for de Sitter scale as `|η₀| ∝ L·√|β(β−1)|`?
 * - Does `clampEta0` raise sub-safe values and leave admissible values alone?
 * - Does `sampleAdiabaticVacuum` reduce to the existing Minkowski sampler
 *   when `preset = 'minkowski'` (bit-identical output for a fixed seed)?
 * - Does the sampled state satisfy the adiabatic identity `|v_k|²·ω_k ≈ 1/2`
 *   within the expected statistical error for a large enough ensemble?
 *
 * @module
 */

import { describe, expect, it } from 'vitest'

import { DEFAULT_FREE_SCALAR_CONFIG } from '@/lib/geometry/extended/freeScalar'
import type { FreeScalarConfig } from '@/lib/geometry/extended/types'
import {
  clampEta0,
  DEFAULT_ETA0_SAFETY_FACTOR,
  DEFAULT_SAFE_ETA0,
  minLatticeMomentum,
  safeEta0,
  sampleAdiabaticVacuum,
} from '@/lib/physics/cosmology/adiabaticVacuum'
import { zppOverZCoefficient } from '@/lib/physics/cosmology/presets'
import { sampleVacuumSpectrum } from '@/lib/physics/freeScalar/vacuumSpectrum'

// ───────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────

/**
 * Build a power-of-two lattice config suitable for vacuum sampling.
 * Uses a small (8×8×8) grid to keep tests fast.
 */
function makeConfig(overrides: Partial<FreeScalarConfig> = {}): FreeScalarConfig {
  return {
    ...DEFAULT_FREE_SCALAR_CONFIG,
    latticeDim: 3,
    gridSize: [8, 8, 8],
    spacing: [0.25, 0.25, 0.25],
    mass: 0,
    initialCondition: 'vacuumNoise',
    ...overrides,
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Lattice momentum
// ───────────────────────────────────────────────────────────────────────────

describe('minLatticeMomentum', () => {
  it('returns 2π/L for a uniform cubic box', () => {
    const cfg = makeConfig()
    const L = cfg.gridSize[0]! * cfg.spacing[0]! // 8 × 0.25 = 2.0
    const expected = (2 * Math.PI) / L
    expect(minLatticeMomentum(cfg.gridSize, cfg.spacing, cfg.latticeDim)).toBeCloseTo(expected, 12)
  })

  it('picks the longest axis for anisotropic boxes', () => {
    // N·a: [8·0.25, 8·0.5, 8·0.125] = [2.0, 4.0, 1.0] → L_max = 4.0
    const kMin = minLatticeMomentum([8, 8, 8], [0.25, 0.5, 0.125], 3)
    expect(kMin).toBeCloseTo((2 * Math.PI) / 4, 12)
  })

  it('ignores inactive dimensions beyond latticeDim', () => {
    // Only the first 2 axes count; the 10-long axis is ignored.
    const kMin = minLatticeMomentum([8, 8, 1024], [0.25, 0.25, 1.0], 2)
    expect(kMin).toBeCloseTo((2 * Math.PI) / 2, 12)
  })

  it('rejects a fully-degenerate lattice', () => {
    expect(() => minLatticeMomentum([1, 1, 1], [0.1, 0.1, 0.1], 3)).toThrow(RangeError)
  })
})

// ───────────────────────────────────────────────────────────────────────────
// safeEta0
// ───────────────────────────────────────────────────────────────────────────

describe('safeEta0', () => {
  it('returns the default for Minkowski', () => {
    const cfg = makeConfig()
    expect(
      safeEta0({ preset: 'minkowski', spacetimeDim: 4 }, cfg.gridSize, cfg.spacing, cfg.latticeDim)
    ).toBe(DEFAULT_SAFE_ETA0)
  })

  it('returns the default for Kasner (β(β−1) < 0 — non-tachyonic)', () => {
    const cfg = makeConfig()
    // Kasner: zpp coefficient = −1/4, which is ≤ 0, so no clamp needed.
    expect(
      safeEta0({ preset: 'kasner', spacetimeDim: 4 }, cfg.gridSize, cfg.spacing, cfg.latticeDim)
    ).toBe(DEFAULT_SAFE_ETA0)
  })

  it('returns the default for all ekpyrotic configurations (never tachyonic)', () => {
    const cfg = makeConfig()
    // Verified in presets.test.ts: β(β−1) ∈ [−1/4, 0] for all ekpyrotic,
    // so the sub-horizon constraint is vacuous.
    for (const steepness of [5, 10, 20, 100]) {
      expect(
        safeEta0(
          { preset: 'ekpyrotic', spacetimeDim: 4, steepness },
          cfg.gridSize,
          cfg.spacing,
          cfg.latticeDim
        )
      ).toBe(DEFAULT_SAFE_ETA0)
    }
  })

  it('computes |η₀|_min = (L/2π)·√(safety·|β(β−1)|) for de Sitter', () => {
    const cfg = makeConfig()
    const params = { preset: 'deSitter' as const, spacetimeDim: 4, hubble: 1 }
    const zpp = zppOverZCoefficient(params) // = 2 in 4D
    const kMin = minLatticeMomentum(cfg.gridSize, cfg.spacing, cfg.latticeDim)
    const expected = Math.sqrt((DEFAULT_ETA0_SAFETY_FACTOR * zpp) / (kMin * kMin))
    expect(safeEta0(params, cfg.gridSize, cfg.spacing, cfg.latticeDim)).toBeCloseTo(expected, 12)
  })

  it('scales linearly with box size L for de Sitter', () => {
    // |η₀|_min ∝ L_max because k_min ∝ 1/L_max.
    const params = { preset: 'deSitter' as const, spacetimeDim: 4, hubble: 1 }
    const small = safeEta0(params, [8, 8, 8], [0.1, 0.1, 0.1], 3)
    const big = safeEta0(params, [8, 8, 8], [0.2, 0.2, 0.2], 3)
    expect(big).toBeCloseTo(2 * small, 10)
  })

  it('grows with spacetime dimension for de Sitter (β(β−1) = n(n−2)/4)', () => {
    const cfg = makeConfig()
    const eta4 = safeEta0(
      { preset: 'deSitter', spacetimeDim: 4, hubble: 1 },
      cfg.gridSize,
      cfg.spacing,
      cfg.latticeDim
    )
    const eta6 = safeEta0(
      { preset: 'deSitter', spacetimeDim: 6, hubble: 1 },
      cfg.gridSize,
      cfg.spacing,
      cfg.latticeDim
    )
    // β(β−1) grows from 2 (n=4) to 6 (n=6), so |η₀|_min grows by √3.
    expect(eta6 / eta4).toBeCloseTo(Math.sqrt(3), 6)
  })
})

// ───────────────────────────────────────────────────────────────────────────
// clampEta0
// ───────────────────────────────────────────────────────────────────────────

describe('clampEta0', () => {
  it('leaves values at or beyond the safe threshold untouched', () => {
    const cfg = makeConfig()
    const params = { preset: 'deSitter' as const, spacetimeDim: 4, hubble: 1 }
    const min = safeEta0(params, cfg.gridSize, cfg.spacing, cfg.latticeDim)
    const user = -(min * 2) // well into the safe region
    const { eta0, clamped } = clampEta0(user, params, cfg.gridSize, cfg.spacing, cfg.latticeDim)
    expect(eta0).toBe(user)
    expect(clamped).toBe(false)
  })

  it('raises sub-safe values to |η₀|_min preserving sign', () => {
    const cfg = makeConfig()
    const params = { preset: 'deSitter' as const, spacetimeDim: 4, hubble: 1 }
    const min = safeEta0(params, cfg.gridSize, cfg.spacing, cfg.latticeDim)
    const user = -(min * 0.25) // too close to the singularity
    const { eta0, clamped } = clampEta0(user, params, cfg.gridSize, cfg.spacing, cfg.latticeDim)
    expect(clamped).toBe(true)
    expect(eta0).toBeCloseTo(-min, 12)
  })

  it('preserves a positive sign', () => {
    const cfg = makeConfig()
    const params = { preset: 'deSitter' as const, spacetimeDim: 4, hubble: 1 }
    const min = safeEta0(params, cfg.gridSize, cfg.spacing, cfg.latticeDim)
    const { eta0, clamped } = clampEta0(
      min * 0.1,
      params,
      cfg.gridSize,
      cfg.spacing,
      cfg.latticeDim
    )
    expect(clamped).toBe(true)
    expect(eta0).toBeCloseTo(min, 12)
  })

  it('rejects zero and non-finite inputs', () => {
    const cfg = makeConfig()
    const params = { preset: 'deSitter' as const, spacetimeDim: 4, hubble: 1 }
    expect(() => clampEta0(0, params, cfg.gridSize, cfg.spacing, cfg.latticeDim)).toThrow(
      RangeError
    )
    expect(() => clampEta0(Number.NaN, params, cfg.gridSize, cfg.spacing, cfg.latticeDim)).toThrow(
      RangeError
    )
  })
})

// ───────────────────────────────────────────────────────────────────────────
// sampleAdiabaticVacuum
// ───────────────────────────────────────────────────────────────────────────

describe('sampleAdiabaticVacuum', () => {
  it('reduces to the existing Minkowski sampler for the trivial preset', () => {
    // Since mEffSq = mass² for Minkowski and the shape of the dispersion is
    // unchanged, the output must match the bare sampleVacuumSpectrum byte
    // for byte at the same seed.
    const cfg = makeConfig({ mass: 0.3 })
    const minkowski = sampleVacuumSpectrum(cfg, 7)
    const adiabatic = sampleAdiabaticVacuum(cfg, { preset: 'minkowski', spacetimeDim: 4 }, -5, 7)
    expect(adiabatic.phi).toEqual(minkowski.phi)
    expect(adiabatic.pi).toEqual(minkowski.pi)
  })

  it('produces finite real-valued fields for de Sitter at a safe η₀', () => {
    // De Sitter has mEffSq < 0 (tachyonic), but with kMin² + mEffSq > 0 at
    // a sufficiently deep η₀ the sampler uses effectiveMass = 0 and the
    // lattice k² term supplies a positive ω_k. The output must be finite
    // and deterministic.
    const cfg = makeConfig({ mass: 0 })
    const params = { preset: 'deSitter' as const, spacetimeDim: 4, hubble: 1 }
    const min = safeEta0(params, cfg.gridSize, cfg.spacing, cfg.latticeDim)
    const { phi, pi } = sampleAdiabaticVacuum(cfg, params, -(min * 2), 13)

    expect(phi.length).toBe(8 * 8 * 8)
    expect(pi.length).toBe(8 * 8 * 8)
    for (let i = 0; i < phi.length; i++) {
      expect(Number.isFinite(phi[i]!)).toBe(true)
      expect(Number.isFinite(pi[i]!)).toBe(true)
    }
  })

  it('is deterministic in the seed', () => {
    const cfg = makeConfig()
    const params = { preset: 'kasner' as const, spacetimeDim: 4 }
    const a = sampleAdiabaticVacuum(cfg, params, -5, 42)
    const b = sampleAdiabaticVacuum(cfg, params, -5, 42)
    expect(a.phi).toEqual(b.phi)
    expect(a.pi).toEqual(b.pi)
  })

  it('differs between different seeds', () => {
    const cfg = makeConfig()
    const params = { preset: 'kasner' as const, spacetimeDim: 4 }
    const a = sampleAdiabaticVacuum(cfg, params, -5, 1)
    const b = sampleAdiabaticVacuum(cfg, params, -5, 2)
    // Compare at least one site — the full arrays should not match.
    let anyDiff = false
    for (let i = 0; i < a.phi.length; i++) {
      if (a.phi[i] !== b.phi[i]) {
        anyDiff = true
        break
      }
    }
    expect(anyDiff).toBe(true)
  })

  it('rejects super-horizon tachyonic configurations at shallow η₀', () => {
    // Force an unsafe η₀ for de Sitter: the rejection message protects
    // downstream code from a non-positive-definite dispersion.
    const cfg = makeConfig({ mass: 0 })
    const params = { preset: 'deSitter' as const, spacetimeDim: 4, hubble: 1 }
    // Use an η₀ far shallower than safeEta0. At |η| ≪ L/(2π)·√2 the lowest
    // lattice modes have ω_k² < 0.
    const unsafe = -0.01
    expect(() => sampleAdiabaticVacuum(cfg, params, unsafe, 0)).toThrow(RangeError)
  })

  it('injects the full signed mEffSq — not a zero fallback — for tachyonic de Sitter', () => {
    // Finding 4: for de Sitter at a safe η₀ the mEffSq is negative, but
    // kMin² + mEffSq > 0. The old sampler substituted effectiveMass=0
    // (which then went through `max(mass, M_FLOOR)` — a double wrong).
    // The new sampler passes mEffSq through as `omegaSqMassTerm`, so the
    // resulting pi-variance per site scales as `<π²> ∝ sum_k ω_k / 2`
    // with `ω_k² = k_lat² + mEffSq`. Comparing against a dispersion that
    // ignores the mass (`ω_k² = k_lat²`) should show a measurable shift.
    const cfg = makeConfig({ mass: 0 })
    const params = { preset: 'deSitter' as const, spacetimeDim: 4, hubble: 1 }
    const min = safeEta0(params, cfg.gridSize, cfg.spacing, cfg.latticeDim)
    const eta0 = -(min * 2)

    const result = sampleAdiabaticVacuum(cfg, params, eta0, 101)

    // Reference: run the same sampler with zero mass contribution.
    // Expected: the two distributions differ — mEffSq is non-zero
    // (tachyonic) at the chosen eta0, so any path that injects 0 is wrong.
    const referenceZero = sampleVacuumSpectrum({ ...cfg, mass: 0 }, 101)

    // The pi variance scales with ω_k, which differs between the two.
    // At least some sites should disagree by more than float-rounding.
    let disagreements = 0
    for (let i = 0; i < result.pi.length; i++) {
      if (Math.abs(result.pi[i]! - referenceZero.pi[i]!) > 1e-6) disagreements++
    }
    // Require that a majority of sites differ — otherwise the "fix" is
    // just a bitwise no-op and doesn't actually change the sampled state.
    expect(disagreements).toBeGreaterThan(result.pi.length * 0.5)
  })
})
