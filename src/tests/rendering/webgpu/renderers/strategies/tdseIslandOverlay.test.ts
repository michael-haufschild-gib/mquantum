/**
 * Tests for the TDSE island-overlay injection.
 *
 * Validates the pure `computeIslandOverlayFields` function which resolves the
 * analog-Hawking quantum-extremal island parameters from the page-curve store
 * snapshot and current BEC config. Exercises every precondition branch so any
 * future regression in the shader-side plumbing fails loudly at the CPU layer
 * before ever hitting the GPU.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { type BecConfig, DEFAULT_BEC_CONFIG } from '@/lib/geometry/extended/bec'
import { DEFAULT_TDSE_CONFIG, type TdseConfig } from '@/lib/geometry/extended/tdse'
import {
  applyIslandOverlay,
  computeIslandOverlayFields,
  type IslandOverlaySnapshot,
} from '@/rendering/webgpu/renderers/strategies/tdseIslandOverlay'
import { usePageCurveStore } from '@/stores/diagnostics/pageCurveStore'

function mkBec(overrides: Partial<BecConfig> = {}): BecConfig {
  // Canonical "Sonic Horizon (Waterfall)" params — kept in lock-step with
  // DEFAULT_BEC_CONFIG so the horizon actually materializes:
  //   c_s0 = √(g·n₀/m) = √5 ≈ 2.236; peak v_s ≈ 3 > c_s0 ⇒ horizon present.
  // See the hawkingVmax=3.5 rationale in DEFAULT_BEC_CONFIG for why Vmax
  // sits comfortably above the sound speed.
  return {
    ...DEFAULT_BEC_CONFIG,
    latticeDim: 3,
    gridSize: [64, 64, 64],
    spacing: [0.15, 0.15, 0.15],
    mass: 1.0,
    hbar: 1.0,
    dt: 0.002,
    stepsPerFrame: 4,
    interactionStrength: 500,
    trapOmega: 1.0,
    trapAnisotropy: [1, 1, 1],
    initialCondition: 'blackHoleAnalog',
    hawkingVmax: 3.5,
    hawkingLh: 0.6,
    hawkingDeltaN: 0.3,
    fieldView: 'density',
    autoScale: true,
    diagnosticsEnabled: true,
    diagnosticsInterval: 5,
    needsReset: false,
    observablesEnabled: false,
    ...overrides,
  }
}

/** A snapshot that satisfies every precondition — the default "on" state. */
const ACTIVE_SNAPSHOT: IslandOverlaySnapshot = {
  islandOverlayEnabled: true,
  lastIslandRadius: 1.5,
  islandBoost: 2.3,
}

describe('computeIslandOverlayFields', () => {
  it('returns null when the overlay toggle is off', () => {
    expect(
      computeIslandOverlayFields(mkBec(), { ...ACTIVE_SNAPSHOT, islandOverlayEnabled: false })
    ).toBeNull()
  })

  it('returns null when the BEC initialCondition is not blackHoleAnalog', () => {
    expect(
      computeIslandOverlayFields(mkBec({ initialCondition: 'thomasFermi' }), ACTIVE_SNAPSHOT)
    ).toBeNull()
  })

  it('returns null when lastIslandRadius is zero', () => {
    expect(
      computeIslandOverlayFields(mkBec(), { ...ACTIVE_SNAPSHOT, lastIslandRadius: 0 })
    ).toBeNull()
  })

  it('returns null when lastIslandRadius is negative', () => {
    expect(
      computeIslandOverlayFields(mkBec(), { ...ACTIVE_SNAPSHOT, lastIslandRadius: -0.1 })
    ).toBeNull()
  })

  it('returns null when lastIslandRadius is non-finite', () => {
    expect(
      computeIslandOverlayFields(mkBec(), { ...ACTIVE_SNAPSHOT, lastIslandRadius: NaN })
    ).toBeNull()
    expect(
      computeIslandOverlayFields(mkBec(), { ...ACTIVE_SNAPSHOT, lastIslandRadius: Infinity })
    ).toBeNull()
  })

  it('returns null when the BEC params lack a horizon (vMax < c_s0)', () => {
    // c_s0 ≈ √5 ≈ 2.236 under the canonical g=500, n0=0.01, mass=1. With
    // vMax = 0.5 the peak |v_s| is well below c_s0 so the waterfall has
    // no Mach-1 crossing on (0, L/2) and hawkingReadout returns NaN for
    // horizonX0.
    const bec = mkBec({ hawkingVmax: 0.5 })
    expect(computeIslandOverlayFields(bec, ACTIVE_SNAPSHOT)).toBeNull()
  })

  it('returns the full island-overlay field bundle for the success case', () => {
    const fields = computeIslandOverlayFields(mkBec(), ACTIVE_SNAPSHOT)
    if (fields === null) {
      throw new Error('expected non-null fields when every precondition passes')
    }
    expect(fields.islandOverlayEnabled).toBe(true)
    expect(fields.islandRadiusWs).toBe(1.5)
    expect(fields.islandBoost).toBe(2.3)
    expect(Number.isFinite(fields.islandCenterX0)).toBe(true)
    // Horizon is in the positive-x half-space by construction.
    expect(fields.islandCenterX0).toBeGreaterThan(0)
  })

  it('propagates islandBoost verbatim (no clamping at this layer)', () => {
    // Clamping lives in usePageCurveStore.setIslandBoost; this layer trusts
    // its input so a future double-clamp cannot silently override user values.
    const fields = computeIslandOverlayFields(mkBec(), { ...ACTIVE_SNAPSHOT, islandBoost: 3.9 })
    expect(fields?.islandBoost).toBe(3.9)
  })
})

/**
 * Integration-ish tests for the live-store wrapper {@link applyIslandOverlay}.
 * Confirms that the TDSE-side config receives the correct island fields when
 * the store is activated — protecting the shader's uniform-buffer wiring from
 * a silent regression if `computeIslandOverlayFields` is ever restructured.
 */
describe('applyIslandOverlay (store-reading wrapper)', () => {
  beforeEach(() => {
    usePageCurveStore.setState(usePageCurveStore.getInitialState())
  })
  afterEach(() => {
    usePageCurveStore.setState(usePageCurveStore.getInitialState())
  })

  it('returns the input config unchanged when the store is at defaults', () => {
    const input: TdseConfig = { ...DEFAULT_TDSE_CONFIG, needsReset: false }
    const result = applyIslandOverlay(input, mkBec())
    expect(result).toBe(input)
  })

  it('spreads the island bundle into the config when the overlay is active', () => {
    // Populate the store as a running simulation would.
    usePageCurveStore.getState().setIslandOverlayEnabled(true)
    usePageCurveStore.getState().setIslandBoost(2.3)
    // `lastIslandRadius` is produced by pushSample; synthesize one that
    // yields a non-zero radius so the overlay activates.
    usePageCurveStore.getState().pushSample({
      t: 0.1,
      tH: 0.5,
      areaH: 100,
      cs0: 2.236,
      supersonicExtent: 2.0,
    })
    usePageCurveStore.getState().pushSample({
      t: 0.2,
      tH: 0.5,
      areaH: 100,
      cs0: 2.236,
      supersonicExtent: 2.0,
    })
    // Force a non-zero islandRadius since accumulation may still be sub-SBH.
    // If the natural rate didn't cross, force lastIslandRadius via direct
    // state mutation — the wrapper must still propagate it.
    usePageCurveStore.setState({ lastIslandRadius: 1.5 })

    const input: TdseConfig = { ...DEFAULT_TDSE_CONFIG, needsReset: false }
    const result = applyIslandOverlay(input, mkBec())
    expect(result).not.toBe(input)
    expect(result.islandOverlayEnabled).toBe(true)
    expect(result.islandRadiusWs).toBe(1.5)
    expect(result.islandBoost).toBe(2.3)
    expect(result.islandCenterX0).toBeGreaterThan(0)
  })
})
