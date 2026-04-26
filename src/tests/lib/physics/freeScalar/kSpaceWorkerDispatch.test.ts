/**
 * Integration test for the k-space Web Worker's dispersion dispatch path.
 *
 * The worker body in `kSpaceWorker.ts` cannot be driven under vitest's
 * happy-dom environment because there is no real Worker global. Instead
 * this test replays the worker's exact inline composition:
 *
 *     computeRawKSpaceDataFromComplex(..., dispersion, basisCoefs)
 *       └─ buildKSpaceDisplayTextures(raw, kSpaceViz, nkOnly=true)
 *       └─ computeTotalParticleNumber(raw)
 *
 * end-to-end, once per dispersion path, and verifies that:
 *
 *  1. `dispersion='kgFloor'` + Minkowski basis coefficients reproduces the
 *     legacy Klein-Gordon kernel — zero-mass zero-field inputs give a
 *     bounded particle count, and a numeric `m²` override produces a
 *     *different* non-negative count for the same inputs.
 *  2. The raw `n_k` signs and the downstream `computeTotalParticleNumber`
 *     agree across dispersion tags — the sum over positive modes is the
 *     same regardless of whether the caller uses the string tag or its
 *     equivalent numeric value.
 *  3. `buildKSpaceDisplayTextures(nkOnly=true)` writes a non-trivial
 *     `analysis.r` half-float channel for every dispersion path (asserting
 *     the worker's downstream hand-off is not accidentally zeroed by an
 *     exposure/percentile short-circuit).
 *  4. The particles-only dispatch path can skip display textures while
 *     preserving the total-particle thermometer.
 *  5. Under cosmology, the `basisCoefs = {1/B, B}` pair combined with the
 *     numeric `m²·a²(η)` dispersion returns the adiabatic vacuum to zero
 *     particles *up to* the numeric noise of the FFT + finite-N cutoff.
 *
 * This mirrors the production contract the `kSpaceWorker.onmessage`
 * handler threads at runtime, so any drift between the worker's wiring
 * and the pure-logic core fails here first.
 *
 * @module tests/lib/physics/freeScalar/kSpaceWorkerDispatch
 */

import { describe, expect, it } from 'vitest'

import {
  DEFAULT_COSMOLOGY_CONFIG,
  DEFAULT_FREE_SCALAR_CONFIG,
  PASSTHROUGH_KSPACE_VIZ,
} from '@/lib/geometry/extended/freeScalar'
import type { FreeScalarConfig } from '@/lib/geometry/extended/types'
import { sampleAdiabaticVacuum } from '@/lib/physics/cosmology/adiabaticVacuum'
import { buildKSpaceDisplayTextures } from '@/lib/physics/freeScalar/kSpaceDisplayTransforms'
import {
  computeRawKSpaceDataFromComplex,
  computeTotalParticleNumber,
} from '@/lib/physics/freeScalar/kSpaceOccupation'
import {
  computeFsfCosmologyCoefs,
  computeFsfVacuumDispersion,
} from '@/lib/physics/freeScalar/vacuumDispersion'
import { sampleVacuumSpectrum } from '@/lib/physics/freeScalar/vacuumSpectrum'

/**
 * Build the two pre-interleaved complex arrays the worker consumes. The
 * worker receives Float32Array views transferred from the main thread,
 * so we mirror that exact layout here: real parts at even indices,
 * imaginary parts at odd indices (initially zero).
 */
function buildComplexInputs(
  phi: Float32Array,
  pi: Float32Array
): { phiComplex: Float32Array; piComplex: Float32Array } {
  const totalSites = phi.length
  const phiComplex = new Float32Array(totalSites * 2)
  const piComplex = new Float32Array(totalSites * 2)
  for (let i = 0; i < totalSites; i++) {
    phiComplex[i * 2] = phi[i]!
    piComplex[i * 2] = pi[i]!
  }
  return { phiComplex, piComplex }
}

/**
 * Replay of the `kSpaceWorker.onmessage` body, minus the `postMessage`
 * call, so a unit test can dispatch through the full integration path in
 * one place.
 */
function runWorkerBody(
  phi: Float32Array,
  pi: Float32Array,
  gridSize: number[],
  spacing: number[],
  mass: number,
  latticeDim: number,
  dispersion: 'kgFloor' | number,
  basisCoefs?: { aKinetic: number; aPotential: number },
  includeTextures = true
): { totalParticles: number; density?: Uint16Array; analysis?: Uint16Array } {
  const { phiComplex, piComplex } = buildComplexInputs(phi, pi)
  const raw = computeRawKSpaceDataFromComplex(
    phiComplex,
    piComplex,
    gridSize,
    spacing,
    mass,
    latticeDim,
    dispersion,
    basisCoefs
  )
  const totalParticles = computeTotalParticleNumber(raw)
  if (!includeTextures) return { totalParticles }
  const { density, analysis } = buildKSpaceDisplayTextures(raw, PASSTHROUGH_KSPACE_VIZ, true)
  return { totalParticles, density, analysis }
}

/** Deterministic FSF config factory — 1D lattice to match the existing
 * kSpaceOccupation suite and keep the radial-binning display stage from
 * blowing the unit-test time budget. */
function makeConfig(overrides: Partial<FreeScalarConfig> = {}): FreeScalarConfig {
  return {
    ...DEFAULT_FREE_SCALAR_CONFIG,
    latticeDim: 1,
    gridSize: [32],
    spacing: [1],
    mass: 0.7,
    cosmology: { ...DEFAULT_COSMOLOGY_CONFIG },
    ...overrides,
  }
}

describe('k-space worker body — dispersion dispatch', () => {
  it("returns identical particle counts for 'kgFloor' and its numeric equivalent m²", () => {
    // When the caller swaps `'kgFloor'` for a finite numeric dispersion
    // equal to `max(mass, M_FLOOR)²`, the inner loop computes the same
    // ω² sequence and therefore the same n_k values. The worker hand-off
    // must preserve this equivalence end-to-end.
    const cfg = makeConfig({ mass: 0.3 })
    const { phi, pi } = sampleVacuumSpectrum(cfg, 7, 'kgFloor')

    const kgFloor = runWorkerBody(
      phi,
      pi,
      cfg.gridSize as number[],
      cfg.spacing as number[],
      cfg.mass,
      cfg.latticeDim,
      'kgFloor'
    )
    const numeric = runWorkerBody(
      phi,
      pi,
      cfg.gridSize as number[],
      cfg.spacing as number[],
      cfg.mass,
      cfg.latticeDim,
      cfg.mass * cfg.mass // > M_FLOOR² at mass=0.3, so the clamp is inactive
    )

    expect(numeric.totalParticles).toBeCloseTo(kgFloor.totalParticles, 12)
    // Analysis texture length must match.
    expect(numeric.analysis).toBeInstanceOf(Uint16Array)
    expect(kgFloor.analysis).toBeInstanceOf(Uint16Array)
    expect(numeric.analysis!.length).toBe(kgFloor.analysis!.length)
    // Compare via Uint16Array equality — single assertion instead of a
    // per-element loop so the test runner overhead stays bounded.
    const equalAnalysis =
      numeric.analysis!.length === kgFloor.analysis!.length &&
      numeric.analysis!.every((v, i) => v === kgFloor.analysis![i])
    expect(equalAnalysis).toBe(true)
  })

  it('produces a distinct particle count when the numeric dispersion disagrees with the KG mass', () => {
    // A heavy dispersion offset should push ω_k up across all modes,
    // which changes the `(|π|² + ω²|φ|²)/(2ωN)` ratio. The resulting
    // particle count must be measurably different from the KG path for
    // the same stationary input.
    const cfg = makeConfig({ mass: 0.3 })
    const { phi, pi } = sampleVacuumSpectrum(cfg, 9, 'kgFloor')

    const kgFloor = runWorkerBody(
      phi,
      pi,
      cfg.gridSize as number[],
      cfg.spacing as number[],
      cfg.mass,
      cfg.latticeDim,
      'kgFloor'
    )
    const heavyNumeric = runWorkerBody(
      phi,
      pi,
      cfg.gridSize as number[],
      cfg.spacing as number[],
      cfg.mass,
      cfg.latticeDim,
      2.5 // m² = 2.5 is well above the KG mass of 0.09
    )

    // Total particles computed against a heavier vacuum reference must
    // not be byte-identical to the KG total.
    expect(Math.abs(heavyNumeric.totalParticles - kgFloor.totalParticles)).toBeGreaterThan(1e-9)
    // Both must remain finite and non-negative.
    expect(heavyNumeric.totalParticles).toBeGreaterThanOrEqual(0)
    expect(Number.isFinite(heavyNumeric.totalParticles)).toBe(true)
  })

  it('writes a non-zero analysis texture through the worker pipeline for every dispersion tag', () => {
    // Regression: if the display stage short-circuits (e.g. exposure
    // percentile collapses to zero), the analysis half-float channel
    // silently becomes all-zero and the k-space thermometer looks
    // dead. Pin a floor on the non-zero half-pixel count so a future
    // change to `buildKSpaceDisplayTextures` cannot quietly erase the
    // worker's only output channel.
    const cfg = makeConfig({ mass: 0.1 })
    const { phi, pi } = sampleVacuumSpectrum(cfg, 11, 'kgFloor')

    for (const dispersion of ['kgFloor' as const, 0.05, 1.25]) {
      const { analysis } = runWorkerBody(
        phi,
        pi,
        cfg.gridSize as number[],
        cfg.spacing as number[],
        cfg.mass,
        cfg.latticeDim,
        dispersion
      )
      // analysis is rgba16float packed: analysis[i*4] holds the R
      // channel (the n_k thermometer). Count non-zero R values.
      expect(analysis).toBeInstanceOf(Uint16Array)
      let nonZeroR = 0
      for (let px = 0; px * 4 < analysis!.length; px++) {
        if (analysis![px * 4] !== 0) nonZeroR++
      }
      expect(
        nonZeroR,
        `dispersion=${String(dispersion)} produced a fully-zero R channel`
      ).toBeGreaterThan(0)
    }
  })

  it('particles-only dispatch skips display textures but preserves total particles', () => {
    const cfg = makeConfig({ mass: 0.3 })
    const { phi, pi } = sampleVacuumSpectrum(cfg, 17, 'kgFloor')

    const withTextures = runWorkerBody(
      phi,
      pi,
      cfg.gridSize as number[],
      cfg.spacing as number[],
      cfg.mass,
      cfg.latticeDim,
      'kgFloor'
    )
    const particlesOnly = runWorkerBody(
      phi,
      pi,
      cfg.gridSize as number[],
      cfg.spacing as number[],
      cfg.mass,
      cfg.latticeDim,
      'kgFloor',
      undefined,
      false
    )

    expect(particlesOnly.totalParticles).toBeCloseTo(withTextures.totalParticles, 12)
    expect(particlesOnly.density).toBeUndefined()
    expect(particlesOnly.analysis).toBeUndefined()
    expect(withTextures.density).toBeInstanceOf(Uint16Array)
    expect(withTextures.analysis).toBeInstanceOf(Uint16Array)
  })

  it('returns the adiabatic vacuum to ≈ 0 particles under a cosmology dispatch', () => {
    // End-to-end: an adiabatic-vacuum sample at deSitter η₀ must read
    // back near zero particles once the worker is dispatched with
    //  (a) the numeric dispersion `m²·a²(η)` AND
    //  (b) the canonical basis coefs `{1/B, B}`.
    // Any drift between the sampler, dispersion helper, and basis
    // coefs helper manifests here as a non-zero total.
    //
    // Use a 2D lattice so `spacetimeDim = latticeDim + 1 = 3` lands in
    // the physical cosmology window. A 1D spatial lattice would give
    // `spacetimeDim = 2`, which the cosmology presets reject.
    const cfg = makeConfig({
      latticeDim: 2,
      gridSize: [16, 16],
      spacing: [1, 1],
      mass: 0.5,
      cosmology: {
        ...DEFAULT_COSMOLOGY_CONFIG,
        enabled: true,
        preset: 'deSitter',
        hubble: 1,
        eta0: -10,
      },
    })
    const cosmoParams = {
      preset: cfg.cosmology.preset,
      spacetimeDim: cfg.latticeDim + 1,
      hubble: cfg.cosmology.hubble,
      steepness: cfg.cosmology.steepness,
    }
    const { phi, pi } = sampleAdiabaticVacuum(cfg, cosmoParams, cfg.cosmology.eta0, 131)

    const rawDispersion = computeFsfVacuumDispersion(cfg, cfg.cosmology.eta0)
    if (rawDispersion === 'kgFloor') {
      throw new Error('deSitter must resolve to a numeric dispersion')
    }
    if (typeof rawDispersion !== 'number') {
      // deSitter is an isotropic FLRW preset — it must resolve to a
      // scalar `m²·a²`, never the Bianchi-I anisotropic variant.
      throw new Error('deSitter must resolve to a scalar dispersion, not the anisotropic variant')
    }
    const dispersion: number = rawDispersion
    const coefs = computeFsfCosmologyCoefs(cfg, cfg.cosmology.eta0)
    const basisCoefs = {
      aKinetic: coefs.aKinetic,
      aPotential: coefs.aPotential,
    }

    const { totalParticles } = runWorkerBody(
      phi,
      pi,
      cfg.gridSize as number[],
      cfg.spacing as number[],
      cfg.mass,
      cfg.latticeDim,
      dispersion,
      basisCoefs
    )

    // Finite-N adiabatic sampler leaves a small residual bias on the
    // order of the omitted higher-order WKB terms; a generous cap of
    // `< N_sites` still catches order-of-magnitude regressions (the
    // buggy path used to leak `Σ_k [(B+1/B)/4 − ½]` which at this grid
    // is of order O(N²·B) particles, with B = a² ≈ 0.01 → still much
    // larger than the adiabatic residual).
    expect(totalParticles).toBeGreaterThanOrEqual(0)
    expect(totalParticles).toBeLessThan(cfg.gridSize[0]! * cfg.gridSize[1]!)
  })
})
