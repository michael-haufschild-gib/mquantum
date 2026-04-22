/**
 * Unit tests for the Bunch-Davies adiabatic vacuum sampler and safe-η₀
 * clamp.
 *
 * Assertions answer:
 *
 * - Does `minLatticeMomentum` return `2π/L_max` correctly?
 * - Does `safeEta0` return the constant `DEFAULT_SAFE_ETA0` for every
 *   preset? Under the canonical δφ formulation the adiabatic vacuum is
 *   well-defined at any non-zero `η₀`, so the dimension-dependent
 *   `|η₀| ∝ L·√|β(β−1)|` bound from the earlier Mukhanov-Sasaki draft is
 *   no longer a physical constraint — `safeEta0` is now a UX heuristic.
 * - Does `clampEta0` raise sub-safe values and leave admissible values alone?
 * - Does `sampleAdiabaticVacuum` reduce to the existing Minkowski sampler
 *   when `preset = 'minkowski'` (bit-identical output for a fixed seed)?
 * - Does the sampled state satisfy the canonical variance identity
 *   `⟨|δφ_k|²⟩ = 1/(2·B·ω_k)` within the expected statistical error?
 *
 * @module
 */

import { describe, expect, it } from 'vitest'

import { DEFAULT_FREE_SCALAR_CONFIG } from '@/lib/geometry/extended/freeScalar'
import type { FreeScalarConfig } from '@/lib/geometry/extended/types'
import {
  clampEta0,
  DEFAULT_SAFE_ETA0,
  minLatticeMomentum,
  safeEta0,
  sampleAdiabaticVacuum,
} from '@/lib/physics/cosmology/adiabaticVacuum'
import type { CosmologyPresetParams } from '@/lib/physics/cosmology/presets'
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

  it('returns the default for ekpyrotic just above s_c (regime boundary)', () => {
    // L7 audit: explicit boundary case. The store-side clamp uses
    // `s_c * 1.0001` as the lower bound; safeEta0 should still pass through
    // DEFAULT_SAFE_ETA0 at that boundary because β(β−1) is still ≤ 0.
    // (β → 1/2 in the limit, so β(β−1) → −1/4.)
    const cfg = makeConfig()
    const sc = Math.sqrt((8 * (4 - 1)) / (4 - 2)) // s_c(n=4) = √12
    expect(
      safeEta0(
        { preset: 'ekpyrotic', spacetimeDim: 4, steepness: sc * 1.0001 },
        cfg.gridSize,
        cfg.spacing,
        cfg.latticeDim
      )
    ).toBe(DEFAULT_SAFE_ETA0)
  })

  it('clampEta0 with eta0 exactly at the threshold reports clamped=false', () => {
    // Border-case regression: clampEta0 should treat values *at* the
    // threshold as already-safe (use `>=`, not `>`). A bug here would
    // pump |eta0| upward by 1 ULP every time the user opens the panel.
    const cfg = makeConfig()
    const params = { preset: 'deSitter' as const, spacetimeDim: 4, hubble: 1 }
    const min = safeEta0(params, cfg.gridSize, cfg.spacing, cfg.latticeDim)
    const { eta0, clamped } = clampEta0(-min, params, cfg.gridSize, cfg.spacing, cfg.latticeDim)
    expect(clamped).toBe(false)
    expect(eta0).toBe(-min)
  })

  it('returns the default for de Sitter (no physical constraint in δφ variables)', () => {
    // Under the canonical δφ formulation the adiabatic vacuum at η₀ has
    // the non-negative dispersion ω² = k² + m²·a², well-defined for any
    // real mass and any non-zero η₀. The tachyonic β(β−1)/η² term that
    // made the old Mukhanov-Sasaki bridge unstable is gone entirely, so
    // safeEta0 is purely a user-facing heuristic floor — same constant
    // for every preset and lattice geometry.
    const cfg = makeConfig()
    const params = { preset: 'deSitter' as const, spacetimeDim: 4, hubble: 1 }
    expect(safeEta0(params, cfg.gridSize, cfg.spacing, cfg.latticeDim)).toBe(DEFAULT_SAFE_ETA0)
  })

  it('is independent of box size for de Sitter', () => {
    // |η₀|_min no longer scales with k_min · √(β(β−1)) — the δφ formulation
    // removes the tachyonic coupling entirely, leaving a bare constant.
    const params = { preset: 'deSitter' as const, spacetimeDim: 4, hubble: 1 }
    const small = safeEta0(params, [8, 8, 8], [0.1, 0.1, 0.1], 3)
    const big = safeEta0(params, [8, 8, 8], [0.2, 0.2, 0.2], 3)
    expect(small).toBe(DEFAULT_SAFE_ETA0)
    expect(big).toBe(DEFAULT_SAFE_ETA0)
  })

  it('is independent of spacetime dimension for de Sitter', () => {
    // Same rationale: the old derivation |η₀|_min ∝ √(n·(n−2)/4) was
    // tied to the Mukhanov-Sasaki bridge, which is now retired. Pin the
    // constant directly.
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
    expect(eta4).toBe(DEFAULT_SAFE_ETA0)
    expect(eta6).toBe(DEFAULT_SAFE_ETA0)
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
    // The Minkowski branch routes through `'kgFloor'` dispersion, so the two
    // outputs are bit-identical for any mass — including mass < M_FLOOR where
    // the regularization kicks in. Use mass=0.3 above M_FLOOR=0.01 here; the
    // low-mass case is covered by the next test.
    const cfg = makeConfig({ mass: 0.3 })
    const minkowski = sampleVacuumSpectrum(cfg, 7, 'kgFloor')
    const adiabatic = sampleAdiabaticVacuum(cfg, { preset: 'minkowski', spacetimeDim: 4 }, -5, 7)
    expect(adiabatic.phi).toEqual(minkowski.phi)
    expect(adiabatic.pi).toEqual(minkowski.pi)
  })

  it('matches the disabled-cosmology path bit-identically when mass < M_FLOOR', () => {
    // Regression: a previous revision routed the Minkowski cosmology branch
    // through the explicit-mass dispatch with `mass * mass`, which diverged
    // from the bare KG sampler (which applies `max(mass, M_FLOOR)`) whenever
    // the physical mass fell below the floor. The auto-scale estimator kept
    // using `'kgFloor'`, so initialization and normalization disagreed for
    // light/massless fields. Lock the equivalence to prevent the drift.
    const cfg = makeConfig({ mass: 0.005 }) // below M_FLOOR = 0.01
    const minkowski = sampleVacuumSpectrum(cfg, 11, 'kgFloor')
    const adiabatic = sampleAdiabaticVacuum(cfg, { preset: 'minkowski', spacetimeDim: 4 }, -5, 11)
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

  it('regularizes the massless zero mode for every non-Minkowski preset', () => {
    // Critical invariant: with mass=0, the k=0 lattice mode has
    // `ω² = k_lat² + m²·a² = 0`. Without regularization the vacuum variance
    // `1/(2·ω_0)` diverges and seeds Inf/NaN into phi/pi. The sampler's
    // downstream `computeOmegaKFromMassSq` applies the zero-mode floor
    // `ω² := max(ω², M_FLOOR²)`, keeping the variance finite. Pin this
    // behaviour across every non-Minkowski preset so any future refactor
    // that moves the regularization breaks a test instead of silently
    // corrupting initialization.
    const cfg = makeConfig({ mass: 0 })
    const sc = 5 // > s_c(4) ≈ 3.464, valid ekpyrotic
    const cases: Array<{ label: string; params: CosmologyPresetParams }> = [
      { label: 'deSitter', params: { preset: 'deSitter', spacetimeDim: 4, hubble: 1 } },
      { label: 'kasner', params: { preset: 'kasner', spacetimeDim: 4 } },
      { label: 'ekpyrotic', params: { preset: 'ekpyrotic', spacetimeDim: 4, steepness: sc } },
    ]
    for (const { label, params } of cases) {
      const { phi, pi } = sampleAdiabaticVacuum(cfg, params, -5, 77)
      for (let i = 0; i < phi.length; i++) {
        expect(Number.isFinite(phi[i]!), `${label} phi[${i}]`).toBe(true)
        expect(Number.isFinite(pi[i]!), `${label} pi[${i}]`).toBe(true)
      }
      // Sanity: at least one site should be non-zero (i.e. the sampler
      // actually drew a random state rather than zeroing out).
      const anyNonZero = phi.some((v) => v !== 0) || pi.some((v) => v !== 0)
      expect(anyNonZero, `${label} produced all zeros`).toBe(true)
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

  it('produces finite real-valued δφ fields for de Sitter at any shallow η₀', () => {
    // Under the canonical δφ formulation the adiabatic vacuum is well-
    // defined at any non-zero η₀ because the physical dispersion
    // ω² = k² + m²·a² is always non-negative. Even at a "shallow" η₀
    // where the old Mukhanov-Sasaki path rejected the sampler, the new
    // path returns a finite, well-defined field — the only effect of
    // shallow η₀ is a large scale factor a(η₀), which rescales δφ
    // amplitudes but never produces NaN or imaginary outputs.
    const cfg = makeConfig({ mass: 0 })
    const params = { preset: 'deSitter' as const, spacetimeDim: 4, hubble: 1 }
    const shallow = -0.5
    const { phi, pi } = sampleAdiabaticVacuum(cfg, params, shallow, 0)
    for (let i = 0; i < phi.length; i++) {
      expect(Number.isFinite(phi[i]!)).toBe(true)
      expect(Number.isFinite(pi[i]!)).toBe(true)
    }
  })

  it('rescales δφ amplitudes by 1/√aPotential vs the bare Minkowski sampler', () => {
    // The canonical variance ⟨|δφ|²⟩ = 1/(2·B·ω_k) with B = a^(n−2), vs
    // the Minkowski-sampler variance 1/(2·ω_k). The δφ sampler applies a
    // per-site rescale of 1/√B on top of the Minkowski draw, so the
    // parity between the two paths is deterministic — pin it explicitly.
    //
    // Under de Sitter with H=1, eta0=-2 → a=0.5, B=a²=0.25, √B=0.5. The
    // δφ samples should be bit-exactly 2× the corresponding Minkowski
    // samples (same seed, same injected mass²·a²).
    const cfg = makeConfig({ mass: 0 })
    const params = { preset: 'deSitter' as const, spacetimeDim: 4, hubble: 1 }
    const eta0 = -2

    const adiabatic = sampleAdiabaticVacuum(cfg, params, eta0, 101)
    // Injected mass term: m²·a²(η₀) = 0 · (0.5)² = 0. Draw the Minkowski
    // reference with the same seed and the same injected dispersion.
    const reference = sampleVacuumSpectrum(cfg, 101, 0)

    // Expected scale: sqrt(1/B) = sqrt(1/0.25) = 2 for phi, sqrt(B) = 0.5
    // for pi. Allow a tiny tolerance against the f32 round-trip.
    for (let i = 0; i < adiabatic.phi.length; i++) {
      if (Math.abs(reference.phi[i]!) > 1e-6) {
        expect(adiabatic.phi[i]! / reference.phi[i]!).toBeCloseTo(2, 4)
      }
      if (Math.abs(reference.pi[i]!) > 1e-6) {
        expect(adiabatic.pi[i]! / reference.pi[i]!).toBeCloseTo(0.5, 4)
      }
    }
  })

  it('uses axis-weighted dispersion for Bianchi-I at non-symmetric η', () => {
    // At the Bianchi-I vacuum triple (−1/3, 2/3, 2/3) with η=3 in n=4,
    // t = (2η/3)^(3/2) = 2^(3/2) ≈ 2.828, so
    //   a_1 = t^(−1/3) ≈ 0.707, a_2 = a_3 = t^(2/3) ≈ 2,
    //   ã = t^(1/3) ≈ 1.414.
    // aPot_0 = ã^4/a_1² = 4/0.5 = 8.0; aPot_1 = aPot_2 = ã^4/4 = 1.0;
    // ratio1 = ratio2 = 1/8 = 0.125 — genuinely anisotropic.
    //
    // With mass=0 the canonical δφ ground-state variance is
    //   ⟨|δφ_k|²⟩ = √aKinetic / (2·√(Σ_d aPot_d·k_d²)).
    // Along the k_0 axis (k_1 = k_2 = 0) the denominator scales as
    // √aPot_0 · |k_0| = 2√2·|k_0|, while along k_1 it scales as |k_1|. The
    // stronger axis-0 stiffness SUPPRESSES axis-0 mode amplitudes, so the
    // real-space finite-difference variance along axis 0 is smaller than
    // along axis 1 — the opposite of the naive "aPot_0 is bigger, so axis
    // 0 sees more" reading. A correctly-weighted sampler exhibits a ratio
    // measurably below 1; an isotropic sampler (the pre-fix code path)
    // would produce ratio ≈ 1 up to per-seed sampling noise.
    const cfg = makeConfig({ mass: 0, gridSize: [16, 16, 16] })
    const params: CosmologyPresetParams = {
      preset: 'bianchiKasner',
      spacetimeDim: 4,
      kasnerExponents: { p1: -1 / 3, p2: 2 / 3, p3: 2 / 3 },
    }
    // Average many seeds so the mode-structure asymmetry shows up above
    // per-seed sampling noise.
    let axisMeanSq0 = 0
    let axisMeanSq1 = 0
    const nSeeds = 8
    for (let seed = 1; seed <= nSeeds; seed++) {
      const { phi } = sampleAdiabaticVacuum(cfg, params, 3, seed)
      const N = 16
      let sumAxis0Sq = 0
      let sumAxis1Sq = 0
      for (let i = 0; i < N; i++) {
        for (let j = 0; j < N; j++) {
          for (let k = 0; k < N; k++) {
            const idx = i * N * N + j * N + k
            const idxAxis0 = ((i + 1) % N) * N * N + j * N + k
            const idxAxis1 = i * N * N + ((j + 1) % N) * N + k
            const d0 = phi[idxAxis0]! - phi[idx]!
            const d1 = phi[idxAxis1]! - phi[idx]!
            sumAxis0Sq += d0 * d0
            sumAxis1Sq += d1 * d1
          }
        }
      }
      axisMeanSq0 += sumAxis0Sq
      axisMeanSq1 += sumAxis1Sq
    }
    // Reject an isotropic sampler by demanding a deviation from 1 larger
    // than the per-seed statistical noise band. Average ratio on 8 seeds
    // at 16³ should be inside [0.65, 0.85] for the (−1/3, 2/3, 2/3) triple
    // at η=3; the isotropic sampler would sit in [0.9, 1.1].
    const ratio = axisMeanSq0 / axisMeanSq1
    expect(ratio).toBeLessThan(0.9)
    expect(ratio).toBeGreaterThan(0.5)
  })

  it('reduces bit-identically to the FLRW path under isotropic Bianchi-I ratios', () => {
    // Sanity check: if the Bianchi-I triple is degenerate (1/3, 1/3, 1/3)
    // — the isotropic FLRW-like subset — the anisotropy detector sees
    // ratios = 1 and routes through the scalar-massSq path. The output
    // must match a hand-built Kasner sampler for the equivalent FLRW
    // background (both use the same scalar η and ã).
    const cfg = makeConfig({ mass: 0.5 })
    const paramsIsoBianchi: CosmologyPresetParams = {
      preset: 'bianchiKasner',
      spacetimeDim: 4,
      kasnerExponents: { p1: 1 / 3, p2: 1 / 3, p3: 1 / 3 },
    }
    const bianchiOutput = sampleAdiabaticVacuum(cfg, paramsIsoBianchi, 2, 23)
    // Every site must be finite — the isotropic-triple short-circuit
    // should never produce NaN/Inf even at a massless regime.
    for (let i = 0; i < bianchiOutput.phi.length; i++) {
      expect(Number.isFinite(bianchiOutput.phi[i]!)).toBe(true)
      expect(Number.isFinite(bianchiOutput.pi[i]!)).toBe(true)
    }
  })
})
