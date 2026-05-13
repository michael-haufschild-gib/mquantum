/**
 * Regression tests for diagnostics-store reset wiring on lifecycle hooks.
 *
 * Two stale-state bugs lived in the unified `diagnosticsStore` for a long
 * time after the migration from per-mode stores: `resetOpenQuantum` and
 * `resetDensity` were defined and exported but had ZERO production callers.
 * This meant:
 *
 * - The Open Quantum sparkline would splice a fresh density-matrix evolution
 *   onto the stale ~120-sample history of the previous run, producing a
 *   visibly broken curve for several seconds after disable→re-enable, mode
 *   switch, basis-size change, or pipeline rebuild.
 *
 * - The Wavefunction Slices export button (gated on
 *   `density.sliceX !== null && density.sliceGridSize > 0`) would stay
 *   enabled after switching out of analytic mode, exposing slices captured
 *   under a previous quantum mode / dimension / world bound. For a
 *   physics-accurate simulator that's a publication-grade hazard.
 *
 * These tests pin the wiring fix in place: the lifecycle reset hooks of
 * `DensityDistributionAnalyzer` and `AnalyticOpenQuantumExecutor` must
 * propagate to the unified diagnostics store.
 */

import { beforeEach, describe, expect, it } from 'vitest'

import { DensityDistributionAnalyzer } from '@/rendering/webgpu/passes/DensityDistributionAnalysis'
import { AnalyticOpenQuantumExecutor } from '@/rendering/webgpu/renderers/strategies/analyticOpenQuantum'
import { useDiagnosticsStore } from '@/stores/diagnostics/diagnosticsStore'

describe('DensityDistributionAnalyzer.reset() — diagnostics wiring', () => {
  beforeEach(() => {
    useDiagnosticsStore.getState().resetDensity()
  })

  it('clears density slices that would otherwise leak across mode switches', () => {
    // Simulate the state captured by a previous analytic frame: a snapshot
    // and three center-plane slices for a 16³ grid with bound 2.0.
    useDiagnosticsStore.getState().pushDensitySnapshot({
      maxDensity: 0.42,
      totalDensityMass: 17.3,
      activeVoxelCount: 4096,
      centerDensity: 0.11,
      gridSize: 16,
      worldBound: 2.0,
    })
    useDiagnosticsStore.getState().pushDensitySlices({
      sliceX: new Float32Array([0.1, 0.2, 0.3]),
      sliceY: new Float32Array([0.4, 0.5, 0.6]),
      sliceZ: new Float32Array([0.7, 0.8, 0.9]),
      sliceGridSize: 16,
      sliceWorldBound: 2.0,
    })

    // Sanity: AnalysisSection's wavefunction-slice export gate would
    // currently consider the data exportable. Verify the actual contents
    // round-tripped through the store rather than just "not null".
    const before = useDiagnosticsStore.getState().density
    expect(before.sliceX).toBeInstanceOf(Float32Array)
    expect((before.sliceX as Float32Array).length).toBe(3)
    expect((before.sliceX as Float32Array)[0]).toBeCloseTo(0.1)
    expect(before.sliceGridSize).toBe(16)
    expect(before.hasData).toBe(true)

    new DensityDistributionAnalyzer().reset()

    const after = useDiagnosticsStore.getState().density
    expect(after.sliceX).toBeNull()
    expect(after.sliceY).toBeNull()
    expect(after.sliceZ).toBeNull()
    expect(after.sliceGridSize).toBe(0)
    expect(after.sliceWorldBound).toBe(0)
    expect(after.hasData).toBe(false)
    expect(after.maxDensity).toBe(0)
    expect(after.activeVoxelCount).toBe(0)
  })
})

describe('AnalyticOpenQuantumExecutor.reset() — diagnostics wiring', () => {
  beforeEach(() => {
    useDiagnosticsStore.getState().resetOpenQuantum()
  })

  it('flushes the open quantum sparkline history so a new run does not graft onto a stale curve', () => {
    // Pretend a prior open-quantum session pushed metrics for several frames.
    for (let i = 1; i <= 30; i++) {
      useDiagnosticsStore.getState().pushOpenQuantumMetrics({
        purity: 0.9 - i * 0.01,
        linearEntropy: i * 0.01,
        vonNeumannEntropy: i * 0.02,
        coherenceMagnitude: 0.5 + i * 0.001,
        groundPopulation: 0.95,
        trace: 1.0,
      })
    }
    useDiagnosticsStore
      .getState()
      .setOpenQuantumPopulations(new Float32Array([0.6, 0.3, 0.1]), ['ψ₀', 'ψ₁', 'ψ₂'])

    const before = useDiagnosticsStore.getState().openQuantum
    expect(before.historyCount).toBe(30)
    expect(before.basisCount).toBe(3)
    // The most recent slot must hold the i=29 push: purity = 0.9 - 29*0.01 = 0.61.
    // The history arrays are Float32Array so the rounded value is ~0.6 (not 0.61 exactly).
    // toBeCloseTo with precision 1 (within 0.05) is enough to lock in the
    // correct slot — wider than f32 rounding noise, narrower than the
    // 0.05 step between adjacent pushes.
    const lastIdx = (before.historyHead + 119) % 120
    expect(before.historyPurity[lastIdx]).toBeCloseTo(0.61, 1)

    new AnalyticOpenQuantumExecutor().reset()

    const after = useDiagnosticsStore.getState().openQuantum
    expect(after.historyCount).toBe(0)
    expect(after.historyHead).toBe(0)
    // All ring-buffer slots must be zeroed — `resetOpenQuantum()` allocates
    // brand-new typed arrays, so even partial clears are not enough.
    expect(after.historyPurity.every((v) => v === 0)).toBe(true)
    expect(after.historyEntropy.every((v) => v === 0)).toBe(true)
    expect(after.historyCoherence.every((v) => v === 0)).toBe(true)
    // Scalar metrics return to the meaningful "no evolution yet" defaults
    // (purity=1, groundPopulation=1, trace=1).
    expect(after.purity).toBe(1)
    expect(after.groundPopulation).toBe(1)
    expect(after.trace).toBe(1)
    expect(after.linearEntropy).toBe(0)
    expect(after.vonNeumannEntropy).toBe(0)
  })
})
