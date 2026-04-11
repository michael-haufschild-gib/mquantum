/**
 * Tests for measurement store state management.
 *
 * Verifies:
 * - Enable/disable measurement mode
 * - Adding measurements and statistics computation
 * - Partial measurement axis selection
 * - Collapse state machine: pending -> collapsing -> complete
 * - Cooldown timer
 * - Clear measurements
 * - Parameter clamping
 */
import { beforeEach, describe, expect, it } from 'vitest'

import { useMeasurementStore } from '@/stores/measurementStore'

describe('measurementStore', () => {
  beforeEach(() => {
    useMeasurementStore.setState(useMeasurementStore.getInitialState())
  })

  it('starts in disabled state with no measurements', () => {
    const state = useMeasurementStore.getState()
    expect(state.enabled).toBe(false)
    expect(state.measurements).toHaveLength(0)
    expect(state.totalCount).toBe(0)
    expect(state.isCollapsing).toBe(false)
    expect(state.pendingMeasurement).toBeNull()
  })

  it('toggles enabled state', () => {
    useMeasurementStore.getState().setEnabled(true)
    expect(useMeasurementStore.getState().enabled).toBe(true)
    useMeasurementStore.getState().setEnabled(false)
    expect(useMeasurementStore.getState().enabled).toBe(false)
  })

  it('clamps collapse width to [0.05, 5]', () => {
    useMeasurementStore.getState().setCollapseWidth(0.01)
    expect(useMeasurementStore.getState().collapseWidth).toBe(0.05)

    useMeasurementStore.getState().setCollapseWidth(10)
    expect(useMeasurementStore.getState().collapseWidth).toBe(5)

    useMeasurementStore.getState().setCollapseWidth(0.5)
    expect(useMeasurementStore.getState().collapseWidth).toBe(0.5)
  })

  it('clamps autoEvolveFrames to [1, 300]', () => {
    useMeasurementStore.getState().setAutoEvolveFrames(0)
    expect(useMeasurementStore.getState().autoEvolveFrames).toBe(1)

    useMeasurementStore.getState().setAutoEvolveFrames(500)
    expect(useMeasurementStore.getState().autoEvolveFrames).toBe(300)

    useMeasurementStore.getState().setAutoEvolveFrames(15.7)
    expect(useMeasurementStore.getState().autoEvolveFrames).toBe(15)
  })

  it('sets measure axis for partial measurement', () => {
    useMeasurementStore.getState().setMeasureAxis(0)
    expect(useMeasurementStore.getState().measureAxis).toBe(0)

    useMeasurementStore.getState().setMeasureAxis(null)
    expect(useMeasurementStore.getState().measureAxis).toBeNull()
  })

  describe('measurement state machine', () => {
    it('transitions: request -> collapse -> complete', () => {
      const store = useMeasurementStore.getState()
      store.setAutoEvolveFrames(10)

      // Request measurement
      store.requestMeasurement([1, 2, 3])
      let state = useMeasurementStore.getState()
      expect(state.pendingMeasurement).toEqual({ clickPosition: [1, 2, 3] })
      expect(state.isCollapsing).toBe(false)

      // Start collapse
      state.startCollapse()
      state = useMeasurementStore.getState()
      expect(state.isCollapsing).toBe(true)
      expect(state.pendingMeasurement).toBeNull()

      // Complete measurement
      state.completeMeasurement([0.5, -0.3, 1.2], 0.042, null)
      state = useMeasurementStore.getState()
      expect(state.isCollapsing).toBe(false)
      expect(state.measurements).toHaveLength(1)
      expect(state.measurements[0]!.position).toEqual([0.5, -0.3, 1.2])
      expect(state.measurements[0]!.density).toBe(0.042)
      expect(state.measurements[0]!.measuredAxis).toBeNull()
      expect(state.totalCount).toBe(1)
      expect(state.cooldownFrames).toBe(10) // autoEvolveFrames
    })

    it('records partial measurement with axis info', () => {
      useMeasurementStore.getState().completeMeasurement([0, 0.5, 0], 0.1, 1)
      const state = useMeasurementStore.getState()
      expect(state.measurements[0]!.measuredAxis).toBe(1)
    })
  })

  describe('cooldown', () => {
    it('decrements cooldown each tick', () => {
      useMeasurementStore.setState({ cooldownFrames: 5 })
      useMeasurementStore.getState().tickCooldown()
      expect(useMeasurementStore.getState().cooldownFrames).toBe(4)
    })

    it('does not go below zero', () => {
      useMeasurementStore.setState({ cooldownFrames: 0 })
      useMeasurementStore.getState().tickCooldown()
      expect(useMeasurementStore.getState().cooldownFrames).toBe(0)
    })
  })

  describe('statistics', () => {
    it('computes position mean and std for accumulated measurements', () => {
      const store = useMeasurementStore.getState()
      // Three 1D measurements at positions 1, 2, 3
      store.addMeasurement([1], 0.1)
      store.addMeasurement([2], 0.1)
      store.addMeasurement([3], 0.1)

      const state = useMeasurementStore.getState()
      expect(state.positionMean[0]).toBeCloseTo(2.0) // mean of 1,2,3
      // std = sqrt((1+4+9)/3 - 4) = sqrt(14/3 - 4) = sqrt(2/3)
      expect(state.positionStd[0]).toBeCloseTo(Math.sqrt(2 / 3))
    })

    it('computes multi-dimensional statistics', () => {
      const store = useMeasurementStore.getState()
      store.addMeasurement([0, 10], 0.1)
      store.addMeasurement([2, 20], 0.1)

      const state = useMeasurementStore.getState()
      expect(state.positionMean[0]).toBeCloseTo(1)
      expect(state.positionMean[1]).toBeCloseTo(15)
    })
  })

  describe('clearMeasurements', () => {
    it('resets all measurement state', () => {
      const store = useMeasurementStore.getState()
      store.addMeasurement([1, 2], 0.5)
      store.addMeasurement([3, 4], 0.5)
      useMeasurementStore.setState({ isCollapsing: true, cooldownFrames: 5 })

      useMeasurementStore.getState().clearMeasurements()
      const state = useMeasurementStore.getState()
      expect(state.measurements).toHaveLength(0)
      expect(state.totalCount).toBe(0)
      expect(state.positionMean).toHaveLength(0)
      expect(state.positionStd).toHaveLength(0)
      expect(state.isCollapsing).toBe(false)
      expect(state.cooldownFrames).toBe(0)
      expect(state.pendingMeasurement).toBeNull()
    })
  })

  describe('addMeasurement (test-only seam)', () => {
    // `addMeasurement` bypasses the collapse state machine so tests can
    // seed records without running a real GPU readback. Not "legacy" —
    // the production collapse path (`completeMeasurement`) and the test
    // seam coexist deliberately. See the `@internal` docblock on the store.
    it('caps at MAX_MEASUREMENTS (1000) while keeping cumulative totalCount', () => {
      const store = useMeasurementStore.getState()
      for (let i = 0; i < 1005; i++) {
        store.addMeasurement([i], 0.01)
      }
      const state = useMeasurementStore.getState()
      expect(state.measurements.length).toBe(1000)
      // Sliced buffer should retain the *most recent* 1000 entries, not the
      // first 1000. Guard against an off-by-one that would rotate the
      // wrong side of the ring out.
      expect(state.measurements[0]!.position[0]).toBe(5)
      expect(state.measurements[999]!.position[0]).toBe(1004)
      expect(state.totalCount).toBe(1005)
    })

    it('does not mutate isCollapsing or cooldownFrames', () => {
      // Regression guard: this is the defining property that separates
      // `addMeasurement` from `completeMeasurement`. If this invariant
      // breaks, e2e tests that pre-seed records will start fighting the
      // state machine (cooldown blocks further clicks, isCollapsing
      // blocks UI).
      useMeasurementStore.setState({ isCollapsing: true, cooldownFrames: 7 })
      useMeasurementStore.getState().addMeasurement([1, 2, 3], 0.5)
      const state = useMeasurementStore.getState()
      expect(state.isCollapsing).toBe(true)
      expect(state.cooldownFrames).toBe(7)
    })
  })
})
