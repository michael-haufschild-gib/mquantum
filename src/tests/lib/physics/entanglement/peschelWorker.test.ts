/**
 * Tests for the Peschel worker's pure-logic entry point.
 *
 * `runPeschelCompute` is the exported function the Worker calls from its
 * onmessage handler. Unit-testing it directly bypasses the Worker runtime
 * (happy-dom has no Worker support) while still exercising the full
 * request → response contract: epoch threading, length sweep shape,
 * modular-spectrum construction, cosmology trajectory handoff.
 *
 * @module tests/lib/physics/entanglement/peschelWorker
 */

import { beforeEach, describe, expect, it } from 'vitest'

import {
  type PeschelWorkerRequest,
  resetPeschelCacheForTests,
  runPeschelCompute,
} from '@/lib/physics/entanglement/peschelWorker'

/** Build a well-formed request with sensible defaults. */
function makeReq(overrides: Partial<PeschelWorkerRequest> = {}): PeschelWorkerRequest {
  return {
    type: 'compute',
    epoch: 1,
    gridSize: [64],
    spacing: [1],
    latticeDim: 1,
    massSq: 0,
    subsystemLength: 16,
    ...overrides,
  }
}

describe('runPeschelCompute — shape and contract', () => {
  beforeEach(() => {
    // Cache is module-level; reset before every test so cache-hit/miss
    // assertions below are deterministic across shared test state.
    resetPeschelCacheForTests()
  })

  it('echoes the request epoch verbatim in the response', () => {
    const req = makeReq({ epoch: 42 })
    const resp = runPeschelCompute(req)
    expect(resp.epoch).toBe(42)
    expect(resp.type).toBe('result')
  })

  it('echoes the request subsystemLength verbatim in the response', () => {
    // Regression for round-4 review finding: the response carried no
    // field identifying which subsystem length the modular payload was
    // computed for, so the UI could label stale modular values as the
    // current L_A. The response now echoes `subsystemLength` so the
    // consumer can detect and badge stale single-cut readouts.
    const req = makeReq({ subsystemLength: 7 })
    const resp = runPeschelCompute(req)
    expect(resp.subsystemLength).toBe(7)
  })

  it('scans L = 1..N/2 and preserves order', () => {
    const req = makeReq({ gridSize: [32] })
    const resp = runPeschelCompute(req)
    expect(resp.half).toBe(16)
    expect(resp.lengths).toHaveLength(16)
    for (let i = 0; i < 16; i++) expect(resp.lengths[i]).toBe(i + 1)
    expect(resp.entropies).toHaveLength(16)
    // Monotonic non-decreasing S(L_A) on the massless case
    const tol = 1e-9
    for (let i = 1; i < resp.entropies.length; i++) {
      expect(resp.entropies[i]! - resp.entropies[i - 1]!).toBeGreaterThanOrEqual(-tol)
    }
  })

  it('returns the central-charge fit for the massless sweep', () => {
    const req = makeReq({ gridSize: [128], massSq: 0 })
    const resp = runPeschelCompute(req)
    expect(Number.isFinite(resp.fit.c)).toBe(true)
    // Same window as fitCentralCharge — checked in peschelEntropy.test.ts
    // for the spec; here we verify the worker's hand-off preserves it.
    expect(resp.fit.c).toBeGreaterThan(0.85)
    expect(resp.fit.c).toBeLessThan(1.15)
    expect(resp.fit.rSquared).toBeGreaterThan(0.99)
  })

  it('returns the modular spectrum when subsystemLength ≥ 2', () => {
    const req = makeReq({ gridSize: [64], subsystemLength: 16 })
    const resp = runPeschelCompute(req)
    if (!resp.modular) {
      throw new Error('expected modular spectrum to be present')
    }
    expect(resp.modular.nu).toHaveLength(16)
    // Per the computeEntanglementSpectrum contract: ν sorted ascending,
    // ν_min ≥ 0.5, and totalEntropy equals the scalar peschelEntropy.
    for (let i = 1; i < resp.modular.nu.length; i++) {
      expect(resp.modular.nu[i]!).toBeGreaterThanOrEqual(resp.modular.nu[i - 1]!)
    }
    expect(resp.modular.nu[0]!).toBeGreaterThanOrEqual(0.5 - 1e-9)
    expect(resp.modular.entanglementGap).toBeGreaterThanOrEqual(0)
  })

  it('returns null modular when subsystemLength < 2', () => {
    const resp = runPeschelCompute(makeReq({ subsystemLength: 1 }))
    expect(resp.modular).toBeNull()
  })

  it('omits the trajectory when the request has no cosmology payload', () => {
    const resp = runPeschelCompute(makeReq({ cosmology: undefined }))
    expect(resp.trajectory).toBeNull()
  })

  it('returns a non-empty Minkowski trajectory when cosmology.preset = minkowski', () => {
    const req = makeReq({
      gridSize: [32],
      subsystemLength: 8,
      massSq: 0.25,
      cosmology: {
        mass: 0.5,
        params: { preset: 'minkowski', spacetimeDim: 4 },
        etaSweep: [-10, -5, -2, -1],
      },
    })
    const resp = runPeschelCompute(req)
    if (!resp.trajectory) {
      throw new Error('expected Minkowski trajectory to be present')
    }
    expect(resp.trajectory.etas).toHaveLength(4)
    // Minkowski: a(η) = 1 everywhere → entropies constant across η.
    for (let i = 1; i < resp.trajectory.entropies.length; i++) {
      expect(resp.trajectory.entropies[i]!).toBeCloseTo(resp.trajectory.entropies[0]!, 12)
    }
  })

  it('reuses the cached length sweep when only subsystemLength changes', () => {
    // Regression for round-4 review finding: scrubbing the L_A slider
    // used to re-run the entire O((N/2)⁴) length sweep even though its
    // outputs (`lengths`, `entropies`, `fit`) are independent of the
    // selection. The worker now caches the sweep keyed by
    // `(gridSize, spacing, latticeDim, massSq)` and L_A-only changes
    // skip the expensive `buildLatticeSliceCorrelators` /
    // `computeEntropySpectrum` / `fitCentralCharge` pipeline entirely.
    //
    // We verify this by checking **reference equality** on the three
    // cached payloads: the worker stashes the exact array objects in
    // its sweep cache and returns them verbatim on a cache hit. Two
    // fresh builds would produce structurally equal but reference-
    // distinct arrays, so `toBe` (not `toEqual`) pins the optimisation.
    const first = runPeschelCompute(makeReq({ gridSize: [32], subsystemLength: 8 }))
    const second = runPeschelCompute(makeReq({ gridSize: [32], subsystemLength: 12 }))

    expect(second.lengths).toBe(first.lengths)
    expect(second.entropies).toBe(first.entropies)
    expect(second.fit).toBe(first.fit)

    // But the modular payloads differ because they come from the
    // subsystem eigen decomposition at the new L_A.
    expect(first.subsystemLength).toBe(8)
    expect(second.subsystemLength).toBe(12)
    expect(first.modular?.nu.length).toBe(8)
    expect(second.modular?.nu.length).toBe(12)
  })

  it('rebuilds the sweep when lattice geometry or effective mass changes', () => {
    // Cache key must invalidate when any of (gridSize, spacing,
    // latticeDim, massSq) changes. Each invalidation replaces the
    // stashed arrays with freshly-built ones, so reference-equality
    // flips to false exactly on the boundaries that should miss.
    const a = runPeschelCompute(makeReq({ gridSize: [32], spacing: [1], massSq: 0 }))

    // Different massSq → miss: new array instances.
    const b = runPeschelCompute(makeReq({ gridSize: [32], spacing: [1], massSq: 0.25 }))
    expect(b.entropies).not.toBe(a.entropies)

    // Repeat the exact key → hit: same instance as `b`.
    const c = runPeschelCompute(makeReq({ gridSize: [32], spacing: [1], massSq: 0.25 }))
    expect(c.entropies).toBe(b.entropies)
    expect(c.fit).toBe(b.fit)

    // Different gridSize → miss.
    const d = runPeschelCompute(makeReq({ gridSize: [16], spacing: [1], massSq: 0.25 }))
    expect(d.entropies).not.toBe(c.entropies)

    // Different spacing → miss.
    const e = runPeschelCompute(makeReq({ gridSize: [16], spacing: [2], massSq: 0.25 }))
    expect(e.entropies).not.toBe(d.entropies)
  })

  it('delivers a monotonically decreasing de Sitter entropy trajectory for a massive field', () => {
    const req = makeReq({
      gridSize: [32],
      subsystemLength: 8,
      massSq: 0.25, // m = 0.5, pre-squared
      cosmology: {
        mass: 0.5,
        params: { preset: 'deSitter', spacetimeDim: 4, hubble: 1 },
        etaSweep: [-20, -10, -5, -2, -1, -0.5, -0.2, -0.1],
      },
    })
    const resp = runPeschelCompute(req)
    if (!resp.trajectory) {
      throw new Error('expected deSitter trajectory to be present')
    }
    expect(resp.trajectory.etas).toHaveLength(8)
    const tol = 1e-9
    for (let i = 1; i < resp.trajectory.entropies.length; i++) {
      expect(resp.trajectory.entropies[i]! - resp.trajectory.entropies[i - 1]!).toBeLessThanOrEqual(
        tol
      )
    }
  })
})
