/**
 * Tests for `FreeScalarFieldComputePass.advanceSimEta` (cosmological clock)
 * and the saved-state resume path that overrides `cosmology.eta0` from a
 * `_runtimeMeta.simEta` save record.
 */

import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/physics/freeScalar/vacuumSpectrum', () => ({
  estimateVacuumEnergyVisualScale: vi.fn(() => 1),
  estimateVacuumMaxPhi: vi.fn(() => 1),
  estimateVacuumMaxPi: vi.fn(() => 1),
  sampleVacuumSpectrum: vi.fn(() => ({ phi: new Float32Array(0), pi: new Float32Array(0) })),
}))

import { DEFAULT_FREE_SCALAR_CONFIG } from '@/lib/geometry/extended/freeScalar'
import { FreeScalarFieldComputePass } from '@/rendering/webgpu/passes/FreeScalarFieldComputePass'
import {
  computeAdiabaticSubsteps,
  projectSimEta,
  resolveFsfSubstepCoefs,
} from '@/rendering/webgpu/passes/fsfCosmologyStepping'

describe('FreeScalarFieldComputePass.advanceSimEta (cosmology clock direction)', () => {
  it('advances η toward 0⁻ by ADDING dt on the η < 0 branch', () => {
    const pass = new FreeScalarFieldComputePass()
    const next = pass._testAdvanceSimEta(-5, 0.1)
    // The inflationary convention is η ∈ (-∞, 0); moving forward in time
    // must *increase* η toward 0⁻, so -5 → -4.9, not -5.1.
    expect(next).toBeCloseTo(-4.9, 10)
  })

  it('advances η away from 0 by ADDING dt on the η > 0 branch (Bianchi-I)', () => {
    const pass = new FreeScalarFieldComputePass()
    const next = pass._testAdvanceSimEta(5, 0.1)
    // Bianchi-I uses η > 0; conformal time increases with physical time,
    // moving away from the singularity at η = 0.
    expect(next).toBeCloseTo(5.1, 10)
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

  it('rejects non-finite simEta inputs and clears any stale pending value', () => {
    // Validation guard: a corrupt save file with NaN/Infinity must not
    // poison the cosmological clock. Invalid input CLEARS any previously
    // staged value so a partial mid-load blob cannot resurrect stale
    // pending state from an earlier load attempt. The resume path then
    // falls back to `config.cosmology.eta0`.
    const pass = new FreeScalarFieldComputePass()
    const internal = pass as unknown as { pendingLoadedSimEta: number | null }

    pass.setLoadedRuntimeSimEta(Number.NaN)
    expect(internal.pendingLoadedSimEta).toBeNull()
    pass.setLoadedRuntimeSimEta(Number.POSITIVE_INFINITY)
    expect(internal.pendingLoadedSimEta).toBeNull()

    // Clear-stale: a previously-set valid value is wiped by subsequent
    // invalid input rather than sticking around.
    pass.setLoadedRuntimeSimEta(-4.0)
    expect(internal.pendingLoadedSimEta).toBe(-4.0)
    pass.setLoadedRuntimeSimEta(Number.NaN)
    expect(internal.pendingLoadedSimEta).toBeNull()
  })

  it('rejects exactly zero (the cosmological singularity) and clears stale pending', () => {
    // η = 0 is the Big Bang / horizon-crossing singularity for power-law
    // backgrounds. Allowing it would let `computeCosmologyAt` throw on
    // the very first frame after resume. Zero is also treated as invalid
    // for clear-stale purposes — a previously-staged value is wiped.
    const pass = new FreeScalarFieldComputePass()
    const internal = pass as unknown as { pendingLoadedSimEta: number | null }

    pass.setLoadedRuntimeSimEta(0)
    expect(internal.pendingLoadedSimEta).toBeNull()

    pass.setLoadedRuntimeSimEta(-1.5)
    expect(internal.pendingLoadedSimEta).toBe(-1.5)
    pass.setLoadedRuntimeSimEta(0)
    expect(internal.pendingLoadedSimEta).toBeNull()
  })
})

describe('FreeScalarFieldComputePass.setLoadedRuntimePreheatingState', () => {
  // Preheating-drive save/reload: the time-dependent Hamiltonian
  //   m²_eff(t) = m₀² · (1 + A · sin(Ω·(clock − ref)))
  // is only consistent with the saved phi/pi field if the drive phase
  // at reload equals the phase at save. These tests cover the staging
  // half of that contract — the load path fills a pending slot that the
  // next `willReinitialize` pass consumes.
  type PreheatingSlot = { ref: number; time: number } | null
  const getSlot = (pass: FreeScalarFieldComputePass): PreheatingSlot =>
    (pass as unknown as { pendingLoadedPreheating: PreheatingSlot }).pendingLoadedPreheating

  it('stores finite preheating (ref, time) pair for the resume path', () => {
    const pass = new FreeScalarFieldComputePass()
    expect(getSlot(pass)).toBeNull()

    pass.setLoadedRuntimePreheatingState(-5, 12.75)
    expect(getSlot(pass)).toEqual({ ref: -5, time: 12.75 })
  })

  it('accepts an explicit zero ref (fresh-start anchor)', () => {
    // 0 is a valid drive anchor under Minkowski — the drive starts at
    // phase `sin(0) = 0` and grows from there. The zero-rejection rule
    // used by `setLoadedRuntimeSimEta` (η=0 is the singularity) does
    // NOT apply here.
    const pass = new FreeScalarFieldComputePass()
    pass.setLoadedRuntimePreheatingState(0, 0)
    expect(getSlot(pass)).toEqual({ ref: 0, time: 0 })
  })

  it('rejects inputs if either field is non-finite and clears stale pending', () => {
    // Validation guard: a corrupt save with a NaN scalar must not poison
    // the drive state. Either value being non-finite CLEARS the pending
    // slot (rather than leaving a prior good value to be consumed on the
    // next reinit) so the pass falls back to the fresh-reset phase-0
    // anchor instead of replaying stale pending state.
    const pass = new FreeScalarFieldComputePass()

    pass.setLoadedRuntimePreheatingState(Number.NaN, 3.5)
    expect(getSlot(pass)).toBeNull()

    pass.setLoadedRuntimePreheatingState(-2.5, Number.POSITIVE_INFINITY)
    expect(getSlot(pass)).toBeNull()

    // A fully-valid pair still lands.
    pass.setLoadedRuntimePreheatingState(-1, 2)
    expect(getSlot(pass)).toEqual({ ref: -1, time: 2 })

    // Clear-stale: a subsequent invalid pair wipes the previously-staged
    // pair rather than leaving it behind.
    pass.setLoadedRuntimePreheatingState(-1, Number.NaN)
    expect(getSlot(pass)).toBeNull()
  })
})

describe('resolveFsfSubstepCoefs (midpoint eval for time-dependent H)', () => {
  it('evaluates cosmology coefs at the substep midpoint', () => {
    // Probe the midpoint evaluation: pass a mock `evaluateCosmologyCoefs`
    // that returns a linear function of η, so we can read back which η
    // the resolver invoked it at. Pre-fix behaviour would call at
    // η_start + subDt (endpoint); midpoint eval calls at
    // η_start + subDt/2.
    const etaStart = -5
    const subDt = 0.1
    const etasSeen: number[] = []
    const config = {
      ...DEFAULT_FREE_SCALAR_CONFIG,
      cosmology: { ...DEFAULT_FREE_SCALAR_CONFIG.cosmology, enabled: true },
    }
    let currentEta = etaStart
    const clock = {
      advanceSimEta: (dt: number) => {
        currentEta += dt
        return currentEta
      },
      preheatingTime: 0,
      preheatingReferenceEta: 0,
    }
    // Return the η at which we were evaluated; the resolver reads the
    // aKinetic slot so use that as the carrier.
    const evaluateCosmologyCoefs = (eta: number) => {
      etasSeen.push(eta)
      return { aKinetic: eta, aPotential: 1, aFull: 1, aPotentialRatio1: 1, aPotentialRatio2: 1 }
    }
    resolveFsfSubstepCoefs(config, subDt, true, false, clock, evaluateCosmologyCoefs)
    // Exactly one eval per resolver call, at the midpoint.
    expect(etasSeen).toHaveLength(1)
    expect(etasSeen[0]).toBeCloseTo(etaStart + subDt / 2, 12)
    // Clock advanced by full subDt (midpoint eval ≠ reduced advance).
    expect(currentEta).toBeCloseTo(etaStart + subDt, 12)
  })

  it('evaluates preheating drive at the substep midpoint under Minkowski', () => {
    // Minkowski + preheating: the drive runs on its own counter. We
    // still want midpoint eval so the Mathieu phase stencil is centered.
    const subDt = 0.2
    const preheatingTime = 10
    const config = {
      ...DEFAULT_FREE_SCALAR_CONFIG,
      preheating: { enabled: true, amplitude: 0.5, frequency: 4.4 },
    }
    const clock = {
      advanceSimEta: () => 0,
      preheatingTime,
      preheatingReferenceEta: 0,
    }
    const evaluateCosmologyCoefs = () => ({
      aKinetic: 1,
      aPotential: 1,
      aFull: 1,
      aPotentialRatio1: 1,
      aPotentialRatio2: 1,
    })
    const r = resolveFsfSubstepCoefs(config, subDt, false, true, clock, evaluateCosmologyCoefs)
    // massSquaredScale = 1 + 0.5·sin(4.4·(preheatingTime + subDt/2 - 0))
    const expectedMid = 1 + 0.5 * Math.sin(4.4 * (preheatingTime + subDt / 2))
    expect(r.coefs.massSquaredScale).toBeCloseTo(expectedMid, 10)
    // preheatingTime advanced by full subDt — the return is the endpoint
    // clock, not the midpoint (the counter must track physical time so a
    // pause/resume lands back on the same phase).
    expect(r.preheatingTime).toBeCloseTo(preheatingTime + subDt, 12)
  })

  it('produces identity coefs under Minkowski + preheating-off', () => {
    // Regression: the midpoint eval must not perturb the cosmology-off,
    // preheating-off fast path. Every coef collapses to 1.
    const config = { ...DEFAULT_FREE_SCALAR_CONFIG }
    const clock = {
      advanceSimEta: () => 0,
      preheatingTime: 0,
      preheatingReferenceEta: 0,
    }
    const evaluateCosmologyCoefs = () => ({
      aKinetic: 1,
      aPotential: 1,
      aFull: 1,
      aPotentialRatio1: 1,
      aPotentialRatio2: 1,
    })
    const r = resolveFsfSubstepCoefs(config, 0.1, false, false, clock, evaluateCosmologyCoefs)
    expect(r.coefs.aKinetic).toBe(1)
    expect(r.coefs.aPotential).toBe(1)
    expect(r.coefs.aFull).toBe(1)
    expect(r.coefs.massSquaredScale).toBe(1)
    expect(r.coefs.aPotentialRatio1).toBe(1)
    expect(r.coefs.aPotentialRatio2).toBe(1)
  })
})
