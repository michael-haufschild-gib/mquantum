/**
 * Tests for densityDiagnosticsStore.
 *
 * Bugs caught:
 * - pushSnapshot not setting hasData
 * - Reset leaving stale slice references
 * - pushSlices updating independently of pushSnapshot
 */

import { beforeEach, describe, expect, it } from 'vitest'

import { useDensityDiagnosticsStore } from '@/stores/densityDiagnosticsStore'

describe('densityDiagnosticsStore', () => {
  beforeEach(() => {
    useDensityDiagnosticsStore.getState().reset()
  })

  describe('initial state', () => {
    it('starts with hasData=false and null slices', () => {
      const state = useDensityDiagnosticsStore.getState()
      expect(state.hasData).toBe(false)
      expect(state.maxDensity).toBe(0)
      expect(state.sliceX).toBeNull()
      expect(state.sliceY).toBeNull()
      expect(state.sliceZ).toBeNull()
    })
  })

  describe('pushSnapshot', () => {
    it('sets hasData=true and stores all snapshot fields', () => {
      useDensityDiagnosticsStore.getState().pushSnapshot({
        maxDensity: 1.5,
        totalDensityMass: 100.0,
        activeVoxelCount: 500,
        centerDensity: 0.3,
        gridSize: 64,
        worldBound: 5.0,
      })

      const state = useDensityDiagnosticsStore.getState()
      expect(state.hasData).toBe(true)
      expect(state.maxDensity).toBe(1.5)
      expect(state.totalDensityMass).toBe(100.0)
      expect(state.activeVoxelCount).toBe(500)
      expect(state.centerDensity).toBe(0.3)
      expect(state.gridSize).toBe(64)
      expect(state.worldBound).toBe(5.0)
    })

    it('overwrites previous snapshot completely', () => {
      useDensityDiagnosticsStore.getState().pushSnapshot({
        maxDensity: 1.5,
        totalDensityMass: 100.0,
        activeVoxelCount: 500,
        centerDensity: 0.3,
        gridSize: 64,
        worldBound: 5.0,
      })
      useDensityDiagnosticsStore.getState().pushSnapshot({
        maxDensity: 2.0,
        totalDensityMass: 200.0,
        activeVoxelCount: 1000,
        centerDensity: 0.6,
        gridSize: 128,
        worldBound: 10.0,
      })

      const state = useDensityDiagnosticsStore.getState()
      expect(state.maxDensity).toBe(2.0)
      expect(state.gridSize).toBe(128)
    })
  })

  describe('pushSlices', () => {
    it('stores typed array slice data', () => {
      const sliceX = new Float32Array([0.1, 0.5, 0.9, 0.5, 0.1])
      const sliceY = new Float32Array([0.2, 0.6, 1.0, 0.6, 0.2])

      useDensityDiagnosticsStore.getState().pushSlices({
        sliceX,
        sliceY,
        sliceZ: null,
        sliceGridSize: 5,
        sliceWorldBound: 3.0,
      })

      const state = useDensityDiagnosticsStore.getState()
      expect(state.sliceX).toBe(sliceX)
      expect(state.sliceY).toBe(sliceY)
      expect(state.sliceZ).toBeNull()
      expect(state.sliceGridSize).toBe(5)
    })

    it('does not affect hasData or snapshot fields', () => {
      useDensityDiagnosticsStore.getState().pushSlices({
        sliceX: new Float32Array(4),
        sliceY: new Float32Array(4),
        sliceZ: new Float32Array(4),
        sliceGridSize: 4,
        sliceWorldBound: 2.0,
      })

      // hasData should still be false (only pushSnapshot sets it)
      expect(useDensityDiagnosticsStore.getState().hasData).toBe(false)
    })
  })

  describe('reset', () => {
    it('clears all fields including slices', () => {
      useDensityDiagnosticsStore.getState().pushSnapshot({
        maxDensity: 5.0,
        totalDensityMass: 500.0,
        activeVoxelCount: 2000,
        centerDensity: 1.0,
        gridSize: 128,
        worldBound: 10.0,
      })
      useDensityDiagnosticsStore.getState().pushSlices({
        sliceX: new Float32Array(10),
        sliceY: new Float32Array(10),
        sliceZ: new Float32Array(10),
        sliceGridSize: 10,
        sliceWorldBound: 5.0,
      })

      useDensityDiagnosticsStore.getState().reset()

      const state = useDensityDiagnosticsStore.getState()
      expect(state.hasData).toBe(false)
      expect(state.maxDensity).toBe(0)
      expect(state.sliceX).toBeNull()
      expect(state.sliceGridSize).toBe(0)
    })
  })
})
