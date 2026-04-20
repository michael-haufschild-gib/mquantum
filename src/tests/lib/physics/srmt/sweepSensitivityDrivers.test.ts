/**
 * Unit tests for the Tier-3 sensitivity drivers that live in
 * `sweepSensitivityDrivers.ts`. Focus area is the `gridNphiCoupled`
 * kind — the joint `(Nφ, Nₐ)` grid-convergence sweep whose per-point
 * `gridNa` is co-scaled LINEARLY in `(Nφ − 1)` via
 * {@link coupledGridNaFor} so the explicit-leapfrog CFL term
 * `da²·8/dφ²/aMin² ≤ 4` stays satisfied across the sweep range.
 *
 * The existing `sweepDriver.test.ts` exercises the pre-coupling
 * sensitivity drivers (`runPhiRefSweep`, `runRankCapSweep`,
 * `runPhiExtentSweep`, `runGridNaSweep`, `runGridNphiSweep`); this file
 * isolates the coupled variant so the coupling contract is tested
 * without being buried inside a 900-line suite.
 */

import { describe, expect, it } from 'vitest'

import { DEFAULT_WHEELER_DEWITT_CONFIG } from '@/lib/geometry/extended/wheelerDeWitt'
import {
  coupledGridNaFor,
  runGridNphiCoupledSweep,
} from '@/lib/physics/srmt/sweepSensitivityDrivers'
import type { SrmtSweepConfig } from '@/lib/physics/srmt/sweepTypes'

function baseCoupledConfig(partial: Partial<SrmtSweepConfig> = {}): SrmtSweepConfig {
  return {
    kind: 'gridNphiCoupled',
    points: 2,
    clocks: ['a'],
    rankCap: 10,
    cutNormalized: 0.5,
    phiRef: 0.25,
    sweepMin: 32,
    sweepMax: 48,
    ...partial,
  }
}

describe('coupledGridNaFor', () => {
  it('produces Na that grows linearly in (Nφ − 1) inside the clamp window', () => {
    // Physics tuned so
    //   ceil(1 + (aMax − aMin)·(Nφ − 1) / (√2·phiExt·aMin))
    // stays strictly inside `clampGridNa`'s [64, 1024] range across the
    // test Nφ set. Δa=1.5, phiExt=0.5, aMin=0.5 → coefficient
    // 1.5/(√2·0.5·0.5) = 4.2426…
    const wdw = {
      ...DEFAULT_WHEELER_DEWITT_CONFIG,
      gridNa: 64,
      phiExtent: 0.5,
      aMin: 0.5,
      aMax: 2.0,
    }
    // ceil(1 + 4.2426·31) = ceil(132.52) = 133
    expect(coupledGridNaFor(32, wdw)).toBe(133)
    // ceil(1 + 4.2426·47) = ceil(200.40) = 201
    expect(coupledGridNaFor(48, wdw)).toBe(201)
    // Linear-in-(Nφ − 1) scaling: the ratio of `Na − 1` at two Nφ
    // values equals `(Nφ − 1)/(Nφ₀ − 1)` up to integer-ceil rounding.
    const ratio = (coupledGridNaFor(48, wdw) - 1) / (coupledGridNaFor(32, wdw) - 1)
    expect(ratio).toBeCloseTo((48 - 1) / (32 - 1), 2)
  })

  it('respects the wdwConfig.gridNa floor', () => {
    // Physics where the formula undershoots the caller's baseline.
    const wdw = {
      ...DEFAULT_WHEELER_DEWITT_CONFIG,
      gridNa: 256,
      phiExtent: 0.1,
      aMin: 10,
      aMax: 11,
    }
    // Raw formula at Nφ=32: ceil(1 + 1·31/(√2·0.1·10)) = ceil(22.92) = 23.
    // Floor=256 wins (baseline ≥ CFL bound).
    expect(coupledGridNaFor(32, wdw)).toBe(256)
  })

  it('does not saturate clampGridNa at default physics for Nφ ∈ [32, 64]', () => {
    // Regression guard for the prior Nφ² formula, which saturated at
    // 1024 for every Nφ ∈ [32, 64] under default physics and therefore
    // held `gridNa` constant across the coupled sweep. Under the correct
    // CFL-derived linear formula with phiExtent=3.5, Nφ=32 is below the
    // baseline (128 wins via Math.max floor) and Nφ=64 → 180 — both
    // safely below the upper clamp, confirming the coupling differentiates.
    const na32 = coupledGridNaFor(32, DEFAULT_WHEELER_DEWITT_CONFIG)
    const na64 = coupledGridNaFor(64, DEFAULT_WHEELER_DEWITT_CONFIG)
    expect(na32).toBe(128)
    expect(na64).toBe(180)
    expect(na32).toBeLessThan(1024)
    expect(na64).toBeLessThan(1024)
    expect(na64).toBeGreaterThan(na32)
  })
})

describe('runGridNphiCoupledSweep', () => {
  it('emits one point per unique Nφ with sweepValue=Nφ (not the derived Na)', () => {
    // Physics tuned so the CFL-derived linear coupling produces
    // distinct, non-floor-dominated Na values at Nφ=32 and Nφ=48
    // while keeping per-point solver cost tolerable for a unit test.
    // Δa=1, phiExt=0.5, aMin=0.5 → coefficient = 1/(√2·0.5·0.5) =
    // 2.8284…
    const wdw = {
      ...DEFAULT_WHEELER_DEWITT_CONFIG,
      gridNa: 64,
      phiExtent: 0.5,
      aMin: 0.5,
      aMax: 1.5,
      inflatonMass: 0.4,
      cosmologicalConstant: 0.0,
    }
    // Assert the coupling produces distinct per-point Na values before
    // the driver invokes the solver — this is the load-bearing check
    // that coupling is linear in (Nφ − 1) and not saturated.
    // ceil(1 + 2.8284·31) = ceil(88.68) = 89
    expect(coupledGridNaFor(32, wdw)).toBe(89)
    // ceil(1 + 2.8284·47) = ceil(133.93) = 134
    expect(coupledGridNaFor(48, wdw)).toBe(134)
    // 2 points across [32, 48] → {32, 48}, both unique integers.
    const result = runGridNphiCoupledSweep({
      wdwConfig: wdw,
      config: baseCoupledConfig({ sweepMin: 32, sweepMax: 48, points: 2 }),
    })
    expect(result.map((p) => p.sweepValue)).toEqual([32, 48])
    for (const p of result) {
      expect(Number.isFinite(p.quality.a!)).toBe(true)
    }
  })

  it('rejects wrong kind', () => {
    const wdw = DEFAULT_WHEELER_DEWITT_CONFIG
    expect(() =>
      runGridNphiCoupledSweep({
        wdwConfig: wdw,
        // Cast to satisfy the discriminated-union type on the test edge
        // — the driver throws at runtime on kind mismatch.
        config: { ...baseCoupledConfig(), kind: 'gridNphi' } as SrmtSweepConfig,
      })
    ).toThrow(/kind='gridNphiCoupled'/)
  })
})
