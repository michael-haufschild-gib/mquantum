/**
 * Cosmology / Free Scalar Field integration tests.
 *
 * Under the canonical δφ formulation, Minkowski cosmology must reduce
 * bit-identically to the cosmology-disabled FSF path: the three
 * cosmology coefficients `(aKinetic, aPotential, aFull)` all collapse to
 * 1, and the canonical Hamiltonian is the flat-space Klein-Gordon
 * Hamiltonian. These tests pin that property end-to-end across the
 * public API, plus spot-check the adiabatic vacuum sampler's de Sitter
 * branch against the analytic Bunch-Davies prediction.
 *
 * Lives in `tests/integration/` because it crosses module boundaries
 * (vacuumSpectrum + cosmology adiabatic vacuum + uniforms helpers).
 *
 * @module tests/integration/cosmologyFsf
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  DEFAULT_COSMOLOGY_CONFIG,
  DEFAULT_FREE_SCALAR_CONFIG,
} from '@/lib/geometry/extended/freeScalar'
import type { FreeScalarConfig } from '@/lib/geometry/extended/types'
import { logger } from '@/lib/logger'
import { sampleAdiabaticVacuum } from '@/lib/physics/cosmology/adiabaticVacuum'
import { computeCosmologyAt } from '@/lib/physics/cosmology/background'
import { M_FLOOR, sampleVacuumSpectrum } from '@/lib/physics/freeScalar/vacuumSpectrum'
import {
  __resetFsfCosmologyWarnDedupForTests,
  computeFsfCosmologyCoefs,
  computeFsfDiagnostics,
  FSF_IDENTITY_COSMO_COEFS,
  FSF_IDENTITY_HAMILTONIAN_COEFS,
} from '@/rendering/webgpu/passes/FreeScalarFieldComputePassUniforms'

/** Build a small power-of-2 lattice config that's fast to sample. */
function makeFsfConfig(overrides: Partial<FreeScalarConfig> = {}): FreeScalarConfig {
  return {
    ...DEFAULT_FREE_SCALAR_CONFIG,
    latticeDim: 3,
    gridSize: [8, 8, 8],
    spacing: [0.25, 0.25, 0.25],
    mass: 0.7, // > M_FLOOR=0.01 so the kgFloor branch matches the explicit-mass branch
    initialCondition: 'vacuumNoise',
    vacuumSeed: 17,
    cosmology: { ...DEFAULT_COSMOLOGY_CONFIG },
    ...overrides,
  }
}

describe('Minkowski cosmology preset is bit-identical to disabled FSF', () => {
  it('sampleAdiabaticVacuum(Minkowski) === sampleVacuumSpectrum(kgFloor) for mass > M_FLOOR', () => {
    // The Minkowski preset has `aPotential = 1` (identity rescale) and the
    // injected dispersion is `mass²`. The bare KG sampler uses
    // `max(mass, M_FLOOR)²`. As long as `mass > M_FLOOR` the two
    // dispersions are identical and the byte-equality holds.
    const cfg = makeFsfConfig({ mass: 0.7 })
    const minkowski = sampleVacuumSpectrum(cfg, cfg.vacuumSeed, 'kgFloor')
    const adiabatic = sampleAdiabaticVacuum(
      cfg,
      { preset: 'minkowski', spacetimeDim: cfg.latticeDim + 1 },
      -10,
      cfg.vacuumSeed
    )
    expect(adiabatic.phi).toEqual(minkowski.phi)
    expect(adiabatic.pi).toEqual(minkowski.pi)
  })

  it('computeFsfCosmologyCoefs(Minkowski) === identity for any η, mass, dim', () => {
    // The compute pass dispatches per-frame coefs through
    // computeFsfCosmologyCoefs. Under the Minkowski preset the answer is
    // identity for every input, so the canonical δφ integrator degenerates
    // to the flat-space Klein-Gordon pipeline bit-identically.
    const cfg = makeFsfConfig({
      mass: 0.7,
      cosmology: { ...DEFAULT_COSMOLOGY_CONFIG, enabled: true, preset: 'minkowski', eta0: -10 },
    })
    for (const eta of [-10, -1e6, 0]) {
      const coefs = computeFsfCosmologyCoefs(cfg, eta)
      expect(coefs.aKinetic).toBe(1)
      expect(coefs.aPotential).toBe(1)
      expect(coefs.aFull).toBe(1)
    }
  })

  it('cosmology=disabled and Minkowski preset produce identical diagnostics', () => {
    // The diagnostics path receives the cosmology coefs struct directly.
    // For both "cosmology disabled" and "Minkowski" the struct is identity,
    // so the per-term Hamiltonian contributions (kinetic, gradient, mass,
    // potential) match exactly.
    const cfg = makeFsfConfig({ mass: 0.7 })
    const { phi, pi } = sampleVacuumSpectrum(cfg, cfg.vacuumSeed, 'kgFloor')

    const cfgCosmo: FreeScalarConfig = {
      ...cfg,
      cosmology: { ...DEFAULT_COSMOLOGY_CONFIG, enabled: true, preset: 'minkowski', eta0: -10 },
    }

    const disabledDiag = computeFsfDiagnostics(phi, pi, cfg, FSF_IDENTITY_HAMILTONIAN_COEFS)
    const cosmoDiag = computeFsfDiagnostics(phi, pi, cfgCosmo, {
      ...computeFsfCosmologyCoefs(cfgCosmo, -10),
      massSquaredScale: 1,
    })

    // Every numeric field of the diagnostics snapshot must agree to f32
    // precision — they're computed from the same buffers with the same mass.
    expect(cosmoDiag.totalEnergy).toBe(disabledDiag.totalEnergy)
    expect(cosmoDiag.totalNorm).toBe(disabledDiag.totalNorm)
    expect(cosmoDiag.maxPhi).toBe(disabledDiag.maxPhi)
    expect(cosmoDiag.maxPi).toBe(disabledDiag.maxPi)
    expect(cosmoDiag.meanPhi).toBe(disabledDiag.meanPhi)
    expect(cosmoDiag.variancePhi).toBe(disabledDiag.variancePhi)
  })

  it('Kasner cosmology produces non-identity coefs (regression guard)', () => {
    // Sanity check: the bit-identity above is non-trivial because cosmology
    // is doing real work in the non-Minkowski branches. Kasner at (n=4, η=-2):
    //   q = 1/(n-2) = 1/2 → a(η) = |η|^(1/2) = √2 ≈ 1.4142
    //   aPotential = a^(n-2) = a² = |η| = 2
    //   aKinetic   = a^(-(n-2)) = 1/2
    //   aFull      = a^n = |η|² = 4
    const cfg = makeFsfConfig({
      mass: 0.5,
      cosmology: { ...DEFAULT_COSMOLOGY_CONFIG, enabled: true, preset: 'kasner', eta0: -2 },
    })
    const coefs = computeFsfCosmologyCoefs(cfg, -2)
    expect(coefs.aPotential).toBeCloseTo(2, 10)
    expect(coefs.aKinetic).toBeCloseTo(0.5, 10)
    expect(coefs.aFull).toBeCloseTo(4, 10)
  })
})

describe('de Sitter Bunch-Davies sample variance — primary sanity check', () => {
  // The plan calls this the "primary sanity check" for the δφ bridge. We
  // can't fully reproduce the textbook horizon-crossing spectrum without
  // GPU evolution, but we can pin the initial-time variance to the analytic
  // Bunch-Davies prediction at η = η₀:
  //
  //     ⟨δφ_x²⟩ = (1/N) Σ_k 1/(2·B·ω_k),  ω_k² = k_lat² + m²·a²(η₀)
  //
  // where B = a^(n−2). The canonical δφ variance = 1/(2·B·ω_k) per mode,
  // and after IFFT the per-site variance is the `(1/N)` average.

  it('matches analytic Bunch-Davies variance to within ensemble tolerance', () => {
    const N = 8
    const a = 0.25
    const cfg = makeFsfConfig({
      mass: 0,
      gridSize: [N, N, N],
      spacing: [a, a, a],
    })
    const params = { preset: 'deSitter' as const, spacetimeDim: 4, hubble: 1 }
    const eta0 = -2
    const numSeeds = 80
    const total = N * N * N

    // Analytic prediction: ⟨δφ²⟩ = (1/N) Σ_k 1/(2·B·ω_k) with the same
    // M_FLOOR regularization the sampler applies to the zero mode. Under
    // de Sitter at η=-2 (H=1, n=4): a = 0.5, B = a² = 0.25.
    const snap = computeCosmologyAt(eta0, params)
    const B = snap.aPotential
    const massSq = 0 // massless
    let expectedVar = 0
    for (let kx = 0; kx < N; kx++) {
      for (let ky = 0; ky < N; ky++) {
        for (let kz = 0; kz < N; kz++) {
          let omegaSq = massSq
          for (const k of [kx, ky, kz]) {
            const sk = (2 * Math.sin((Math.PI * k) / N)) / a
            omegaSq += sk * sk
          }
          // Mirror the M_FLOOR² zero-mode regularization in
          // computeOmegaKFromMassSq.
          if (omegaSq < M_FLOOR * M_FLOOR) omegaSq = M_FLOOR * M_FLOOR
          expectedVar += 1 / (2 * B * Math.sqrt(omegaSq))
        }
      }
    }
    expectedVar /= total

    // Measured: ensemble average of ⟨δφ_x²⟩ across many seeds.
    let measuredVar = 0
    for (let seed = 1; seed <= numSeeds; seed++) {
      const { phi } = sampleAdiabaticVacuum(cfg, params, eta0, seed)
      for (let i = 0; i < total; i++) measuredVar += phi[i]! * phi[i]!
    }
    measuredVar /= numSeeds * total

    // 25% tolerance covers ensemble fluctuations at 80 seeds across 512
    // independent k-modes. Tighter than this would be flaky.
    expect(measuredVar / expectedVar).toBeGreaterThan(0.75)
    expect(measuredVar / expectedVar).toBeLessThan(1.25)
  })

  it('de Sitter π_δφ has variance B · ω_k / 2 (rescaled from the Minkowski sampler)', () => {
    // The canonical conjugate momentum satisfies ⟨|π_δφ,k|²⟩ = B · ω_k / 2,
    // which is the Minkowski variance times B. Ensemble-averaged check.
    const N = 8
    const a = 0.25
    const cfg = makeFsfConfig({
      mass: 0,
      gridSize: [N, N, N],
      spacing: [a, a, a],
    })
    const params = { preset: 'deSitter' as const, spacetimeDim: 4, hubble: 1 }
    const eta0 = -2
    const numSeeds = 80
    const total = N * N * N

    const snap = computeCosmologyAt(eta0, params)
    const B = snap.aPotential
    let expectedVar = 0
    for (let kx = 0; kx < N; kx++) {
      for (let ky = 0; ky < N; ky++) {
        for (let kz = 0; kz < N; kz++) {
          let omegaSq = 0
          for (const k of [kx, ky, kz]) {
            const sk = (2 * Math.sin((Math.PI * k) / N)) / a
            omegaSq += sk * sk
          }
          if (omegaSq < M_FLOOR * M_FLOOR) omegaSq = M_FLOOR * M_FLOOR
          expectedVar += (B * Math.sqrt(omegaSq)) / 2
        }
      }
    }
    expectedVar /= total

    let measuredVar = 0
    for (let seed = 1; seed <= numSeeds; seed++) {
      const { pi } = sampleAdiabaticVacuum(cfg, params, eta0, seed)
      for (let i = 0; i < total; i++) measuredVar += pi[i]! * pi[i]!
    }
    measuredVar /= numSeeds * total

    expect(measuredVar / expectedVar).toBeGreaterThan(0.75)
    expect(measuredVar / expectedVar).toBeLessThan(1.25)
  })
})

describe('computeFsfCosmologyCoefs invalid-parameter fallback is deduplicated', () => {
  beforeEach(() => {
    __resetFsfCosmologyWarnDedupForTests()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('logs the fallback warning at most once per unique error key', () => {
    // The per-substep cosmology update calls computeFsfCosmologyCoefs up to
    // stepsPerFrame · substepCap times per rendered frame. An unguarded
    // warn would spam the dev console. Verify the dedup set collapses
    // repeated identical fallbacks to one emitted warning.
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {})

    // Build a cosmology config with deSitter but invalid hubble = 0 —
    // scaleFactorAmplitude throws RangeError. The fallback path catches it,
    // logs once, and returns identity coefs.
    const badConfig: FreeScalarConfig = {
      ...DEFAULT_FREE_SCALAR_CONFIG,
      mass: 0.5,
      cosmology: {
        ...DEFAULT_COSMOLOGY_CONFIG,
        enabled: true,
        preset: 'deSitter',
        hubble: 0,
        eta0: -10,
      },
    }

    // Call 50 times — the dedup must collapse to one warning.
    for (let i = 0; i < 50; i++) {
      const coefs = computeFsfCosmologyCoefs(badConfig, -10 - i * 0.001)
      expect(coefs).toBe(FSF_IDENTITY_COSMO_COEFS)
    }

    expect(warnSpy).toHaveBeenCalledTimes(1)
  })

  it('still warns once per UNIQUE error key (different presets)', () => {
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {})

    const deSitterBad: FreeScalarConfig = {
      ...DEFAULT_FREE_SCALAR_CONFIG,
      mass: 0.5,
      cosmology: {
        ...DEFAULT_COSMOLOGY_CONFIG,
        enabled: true,
        preset: 'deSitter',
        hubble: 0,
        eta0: -10,
      },
    }
    const ekpyroticBad: FreeScalarConfig = {
      ...DEFAULT_FREE_SCALAR_CONFIG,
      mass: 0.5,
      cosmology: {
        ...DEFAULT_COSMOLOGY_CONFIG,
        enabled: true,
        preset: 'ekpyrotic',
        steepness: 1, // < s_c(n=4) ≈ 3.46 — invalid
        hubble: 1,
        eta0: -10,
      },
    }

    computeFsfCosmologyCoefs(deSitterBad, -10)
    computeFsfCosmologyCoefs(deSitterBad, -10) // dedup
    computeFsfCosmologyCoefs(ekpyroticBad, -10) // new key
    computeFsfCosmologyCoefs(ekpyroticBad, -10) // dedup

    expect(warnSpy).toHaveBeenCalledTimes(2)
  })
})

describe('cosmology adiabatic vacuum integration with diagnostics', () => {
  it('produces a finite canonical Hamiltonian for de Sitter at the safe η₀', () => {
    // End-to-end smoke: build a de Sitter config, sample the adiabatic
    // vacuum, push the resulting buffers through computeFsfDiagnostics with
    // the corresponding cosmology coefs, and verify the reported total
    // energy is finite and non-negative. In the canonical δφ formulation
    // the Hamiltonian is ½(aKinetic·π² + aPotential·(∇φ)² + m²·aFull·φ²)
    // — strictly non-negative for real mass.
    const cfg = makeFsfConfig({
      mass: 0,
      cosmology: { enabled: true, preset: 'deSitter', steepness: 5, hubble: 1, eta0: -10 },
    })
    const { phi, pi } = sampleAdiabaticVacuum(
      cfg,
      {
        preset: 'deSitter',
        spacetimeDim: cfg.latticeDim + 1,
        steepness: cfg.cosmology.steepness,
        hubble: cfg.cosmology.hubble,
      },
      cfg.cosmology.eta0,
      cfg.vacuumSeed
    )
    const coefs = computeFsfCosmologyCoefs(cfg, cfg.cosmology.eta0)
    const snapshot = computeFsfDiagnostics(phi, pi, cfg, { ...coefs, massSquaredScale: 1 })

    expect(Number.isFinite(snapshot.totalEnergy)).toBe(true)
    expect(Number.isFinite(snapshot.totalNorm)).toBe(true)
    expect(snapshot.totalNorm).toBeGreaterThanOrEqual(0)
    // Canonical Hamiltonian with m=0 is ½(A·π² + B·(∇φ)²), which is a sum
    // of non-negative quantities — should be strictly non-negative.
    expect(snapshot.totalEnergy).toBeGreaterThanOrEqual(0)
    // Variance clamp must hold under cosmology too.
    expect(snapshot.variancePhi).toBeGreaterThanOrEqual(0)
  })
})
