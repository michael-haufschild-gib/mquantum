/**
 * Tests for `FreeScalarFieldComputePass.advanceSimEta` (cosmological clock)
 * and the saved-state resume path that overrides `cosmology.eta0` from a
 * `_runtimeMeta.simEta` save record.
 */

import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/physics/freeScalar/vacuumSpectrum', () => ({
  estimateVacuumMaxEnergy: vi.fn(() => 1),
  estimateVacuumMaxPhi: vi.fn(() => 1),
  estimateVacuumMaxPi: vi.fn(() => 1),
  sampleVacuumSpectrum: vi.fn(() => ({ phi: new Float32Array(0), pi: new Float32Array(0) })),
}))

import {
  computeAdiabaticSubsteps,
  FreeScalarFieldComputePass,
  projectSimEta,
} from '@/rendering/webgpu/passes/FreeScalarFieldComputePass'

describe('FreeScalarFieldComputePass.advanceSimEta (cosmology clock direction)', () => {
  it('advances η toward 0⁻ by ADDING dt on the η < 0 branch', () => {
    const pass = new FreeScalarFieldComputePass()
    const next = pass._testAdvanceSimEta(-5, 0.1)
    // The inflationary convention is η ∈ (-∞, 0); moving forward in time
    // must *increase* η toward 0⁻, so -5 → -4.9, not -5.1.
    expect(next).toBeCloseTo(-4.9, 10)
  })

  it('advances η toward 0⁺ by SUBTRACTING dt on the (unusual) η > 0 branch', () => {
    const pass = new FreeScalarFieldComputePass()
    const next = pass._testAdvanceSimEta(5, 0.1)
    expect(next).toBeCloseTo(4.9, 10)
  })

  it('monotonically reduces |η| across many steps on the η < 0 branch', () => {
    const pass = new FreeScalarFieldComputePass()
    let eta = -2
    const dt = 0.05
    for (let i = 0; i < 10; i++) {
      const nextEta = pass._testAdvanceSimEta(eta, dt)
      expect(Math.abs(nextEta)).toBeLessThan(Math.abs(eta))
      expect(nextEta).toBeLessThan(0) // never crossed into η > 0
      eta = nextEta
    }
  })

  it('clamps at the ETA_FLOOR when dt would cross the singularity', () => {
    const pass = new FreeScalarFieldComputePass()
    // η = -0.005 with dt = 0.01 would overshoot to +0.005 — must clamp to
    // -COSMOLOGY_ETA_FLOOR (1e-2). Pin the inequality below the floor
    // rather than at an exact value so the test keeps working if the
    // floor is ever retuned.
    const next = pass._testAdvanceSimEta(-5e-3, 1e-2)
    expect(next).toBeLessThan(0)
    expect(Math.abs(next)).toBeGreaterThanOrEqual(1e-2 - 1e-12)
  })
})

describe('projectSimEta (pure CFL-preview helper)', () => {
  // These tests pin the contract between the CFL preview in the leapfrog
  // loop and the mutating runtime clock. If they drift, the adaptive
  // sub-step count is computed from coefficients at a `simEta` that does
  // not match the one used by `advanceSimEta` a moment later — which is
  // exactly the bug that produced the "fade → dark → flash → NaN" trace
  // in `scripts/playwright-output/fsf-desitter-autoscale-flash.json`.

  it('does not mutate any state (pure function)', () => {
    const before = projectSimEta(-5, 0.1)
    const again = projectSimEta(-5, 0.1)
    expect(before).toBe(again)
    // Call on the class path too: verify `advanceSimEta` did mutate so
    // the comparison is meaningful — i.e. the pure helper genuinely
    // isn't touching shared state.
    const pass = new FreeScalarFieldComputePass()
    pass._testAdvanceSimEta(-5, 0.1)
    // Mutating the instance must not influence a subsequent pure call.
    expect(projectSimEta(-5, 0.1)).toBe(before)
  })

  it('matches advanceSimEta bit-for-bit on the interior branch', () => {
    // The mutating method delegates to projectSimEta, so they must agree
    // for any input that doesn't hit the floor. Use values that are safely
    // inside the interior for dt = 0.05.
    const pass = new FreeScalarFieldComputePass()
    const inputs: [number, number][] = [
      [-10, 0.05],
      [-5, 0.1],
      [-1, 0.02],
      [5, 0.1],
      [-0.5, 0.005],
    ]
    for (const [eta, dt] of inputs) {
      const mutating = pass._testAdvanceSimEta(eta, dt)
      const pure = projectSimEta(eta, dt)
      expect(pure).toBe(mutating)
    }
  })

  it('matches advanceSimEta at the floor-clamp boundary', () => {
    const pass = new FreeScalarFieldComputePass()
    // Step that would overshoot zero — must clamp to the ETA floor.
    const mutating = pass._testAdvanceSimEta(-5e-3, 1e-2)
    const pure = projectSimEta(-5e-3, 1e-2)
    expect(pure).toBe(mutating)
    expect(pure).toBeLessThan(0)
    expect(Math.abs(pure)).toBeGreaterThanOrEqual(1e-2 - 1e-12)
  })

  it('projects the de Sitter floor-crossing step to the ETA floor', () => {
    // Starting at simEta = -0.005 with dtFull = 0.005, the next outer
    // step would land at η = 0 → the CFL preview must see the clamp
    // jump so nSub covers the post-jump frequency.
    const projected = projectSimEta(-5e-3, 5e-3)
    expect(projected).toBe(-1e-2)
  })

  it('stays put when already at the floor', () => {
    // Once we've hit the floor, further steps do not move simEta away
    // from it. The CFL preview therefore sees the same coefs at both
    // endpoints — nSubStart == nSubEnd, no unnecessary over-substepping.
    const projected = projectSimEta(-1e-2, 5e-3)
    expect(projected).toBe(-1e-2)
  })

  it('advances the far-past step by a full dt without clamping', () => {
    // At simEta = -10 with dtFull = 0.005, the projection must simply
    // add dt — this is where the leapfrog spends most of its time and
    // where a(η) is small so the CFL preview should produce nSub=1.
    const projected = projectSimEta(-10, 5e-3)
    expect(projected).toBe(-9.995)
  })
})

describe('computeAdiabaticSubsteps (scale-factor rate-of-change bound)', () => {
  // The adiabatic safety guards against non-adiabatic pumping of mode
  // oscillators when the cosmology coefficients change too quickly over
  // a single outer leapfrog step — the mechanism that produced the 92×
  // energy jump at the de Sitter floor crossing in the autoscale-flash
  // trace. Under `a(η) ∝ |η|^q` the zero-mode frequency `ω₀ ≈ m·a`
  // changes by roughly the fractional change in `a`, so the helper
  // returns `ceil((Δa/a_avg) / 0.1)` = `ceil(Δa/a_avg · 10)`.

  /**
   * Build a coef pair from a pair of scale factors, using the N=4
   * identities `aPotential = a²` and `aFull = a⁴`.
   */
  function coefsFor(a: number): { aFull: number; aPotential: number } {
    return { aFull: a ** 4, aPotential: a ** 2 }
  }

  it('returns 1 when the scale factor is constant (Minkowski / stuck at floor)', () => {
    expect(computeAdiabaticSubsteps(coefsFor(1), coefsFor(1))).toBe(1)
    expect(computeAdiabaticSubsteps(coefsFor(100), coefsFor(100))).toBe(1)
  })

  it('returns 1 when the fractional change is below the 10% safety threshold', () => {
    // Δa/a_avg = 0.01/1.005 ≈ 0.01 — well under 0.1 → nSub = 1.
    expect(computeAdiabaticSubsteps(coefsFor(1.0), coefsFor(1.01))).toBe(1)
    // Exactly at the boundary (Δa/a_avg = 0.0952 < 0.1) — still nSub = 1.
    expect(computeAdiabaticSubsteps(coefsFor(1.0), coefsFor(1.1))).toBe(1)
  })

  it('sub-steps when the fractional change exceeds the 10% threshold', () => {
    // a: 1 → 1.5 gives Δa/a_avg = 0.5/1.25 = 0.4 → ceil(4) = 4.
    expect(computeAdiabaticSubsteps(coefsFor(1.0), coefsFor(1.5))).toBe(4)
    // a: 10 → 100 (de Sitter late-time jump): Δ/avg = 90/55 ≈ 1.636 →
    // ceil(16.36) = 17.
    expect(computeAdiabaticSubsteps(coefsFor(10), coefsFor(100))).toBe(17)
  })

  it('is symmetric in its arguments — reversing direction gives the same nSub', () => {
    // For contracting backgrounds (ekpyrotic/Kasner past attractor) the
    // "end" has the smaller a; the helper must still see the same
    // fractional change since Δa is absolute.
    expect(computeAdiabaticSubsteps(coefsFor(100), coefsFor(10))).toBe(
      computeAdiabaticSubsteps(coefsFor(10), coefsFor(100))
    )
  })

  it('is bounded even for runaway jumps', () => {
    // Fractional change `Δa/a_avg` is mathematically bounded above by 2
    // (approached when one endpoint tends to zero), so the adiabatic
    // requirement can never demand more than `ceil(2/0.1) = 20`
    // sub-steps — which is well under the `COSMOLOGY_MAX_SUBSTEPS = 32`
    // hard cap. The cap is only ever hit by the CFL branch, not the
    // adiabatic one. This test pins that bound so a future tightening
    // of `COSMOLOGY_ADIABATIC_SAFETY` cannot silently push the adiabatic
    // estimate above the stall-prevention ceiling.
    const nSub = computeAdiabaticSubsteps(coefsFor(1), coefsFor(10000))
    expect(nSub).toBeLessThanOrEqual(32)
    expect(nSub).toBeLessThanOrEqual(20)
    expect(nSub).toBeGreaterThan(1)
  })

  it('degenerates to 1 when both coefs are at the identity fallback', () => {
    // The identity fallback (aFull = 1, aPotential = 1) is returned by
    // `computeFsfCosmologyCoefs` under Minkowski and on the error path.
    // The helper must treat it as "no adiabatic pressure" rather than
    // throwing or producing a spurious nSub.
    const identity = { aFull: 1, aPotential: 1 }
    expect(computeAdiabaticSubsteps(identity, identity)).toBe(1)
  })

  it('returns 1 when the coefs are degenerate (aPotential = 0)', () => {
    // The cosmology error-fallback path can return zero/negative
    // coefficients. The helper must not NaN — it should fall back to
    // the trivial "no substepping" answer.
    const degenerate = { aFull: 0, aPotential: 0 }
    expect(computeAdiabaticSubsteps(degenerate, degenerate)).toBe(1)
  })

  it('subdivides the de Sitter floor-crossing step enough to stay adiabatic', () => {
    // The exact scenario that blew up the autoscale-flash trace: the
    // last pre-floor outer step covers η: -0.015 → -0.01 with H=1, so
    // a: 66.67 → 100. Adiabatic nSub must be at least 4 (0.4/0.1 = 4)
    // — otherwise the mode oscillators are driven out of their
    // instantaneous ground state.
    const nSub = computeAdiabaticSubsteps(coefsFor(66.667), coefsFor(100))
    expect(nSub).toBeGreaterThanOrEqual(4)
  })
})

describe('FreeScalarFieldComputePass.setLoadedRuntimeSimEta', () => {
  it('stores a finite simEta override that the resume path can consume', () => {
    // L7 audit: the cosmology save format carries `simEta` so a resumed
    // simulation picks up where the user left off. The setter accepts only
    // finite, non-zero values; the resume path then prefers it over
    // `config.cosmology.eta0`.
    const pass = new FreeScalarFieldComputePass()
    const internal = pass as unknown as { pendingLoadedSimEta: number | null }

    expect(internal.pendingLoadedSimEta).toBeNull()
    pass.setLoadedRuntimeSimEta(-3.25)
    expect(internal.pendingLoadedSimEta).toBe(-3.25)
  })

  it('rejects non-finite simEta inputs silently', () => {
    // Validation guard: a corrupt save file with NaN/Infinity must not
    // poison the cosmological clock. The setter is a no-op in that case
    // so the resume path falls back to `config.cosmology.eta0`.
    const pass = new FreeScalarFieldComputePass()
    const internal = pass as unknown as { pendingLoadedSimEta: number | null }

    pass.setLoadedRuntimeSimEta(Number.NaN)
    expect(internal.pendingLoadedSimEta).toBeNull()
    pass.setLoadedRuntimeSimEta(Number.POSITIVE_INFINITY)
    expect(internal.pendingLoadedSimEta).toBeNull()
  })

  it('rejects exactly zero (the cosmological singularity)', () => {
    // η = 0 is the Big Bang / horizon-crossing singularity for power-law
    // backgrounds. Allowing it would let `computeCosmologyAt` throw on
    // the very first frame after resume.
    const pass = new FreeScalarFieldComputePass()
    const internal = pass as unknown as { pendingLoadedSimEta: number | null }

    pass.setLoadedRuntimeSimEta(0)
    expect(internal.pendingLoadedSimEta).toBeNull()
  })
})
