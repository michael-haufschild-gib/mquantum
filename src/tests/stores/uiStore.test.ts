/**
 * Tests for UI Store
 *
 * Tests the UI-related state and actions in the UI slice.
 * Note: maxFps tests have been moved to performanceStore.test.ts
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useUIStore } from '@/stores/uiStore';
import { UI_INITIAL_STATE } from '@/stores/slices/uiSlice';

describe('uiStore.bufferVisualization', () => {
  beforeEach(() => {
    useUIStore.setState(UI_INITIAL_STATE);
  });

  afterEach(() => {
    useUIStore.setState(UI_INITIAL_STATE)
  })

  describe('Mutual Exclusivity', () => {
    it('enabling showDepthBuffer should disable other buffer visualizations', () => {
      // First enable normal buffer
      useUIStore.getState().setShowNormalBuffer(true)
      expect(useUIStore.getState().showNormalBuffer).toBe(true)

      // Enable depth buffer - should disable normal buffer
      useUIStore.getState().setShowDepthBuffer(true)
      const state = useUIStore.getState()
      expect(state.showDepthBuffer).toBe(true)
      expect(state.showNormalBuffer).toBe(false)
      expect(state.showTemporalDepthBuffer).toBe(false)
    })

    it('enabling showNormalBuffer should disable other buffer visualizations', () => {
      // First enable depth buffer
      useUIStore.getState().setShowDepthBuffer(true)
      expect(useUIStore.getState().showDepthBuffer).toBe(true)

      // Enable normal buffer - should disable depth buffer
      useUIStore.getState().setShowNormalBuffer(true)
      const state = useUIStore.getState()
      expect(state.showDepthBuffer).toBe(false)
      expect(state.showNormalBuffer).toBe(true)
      expect(state.showTemporalDepthBuffer).toBe(false)
    })

    it('enabling showTemporalDepthBuffer should disable other buffer visualizations', () => {
      // First enable depth and normal buffers
      useUIStore.getState().setShowDepthBuffer(true)
      useUIStore.getState().setShowNormalBuffer(true) // This also disables depth
      expect(useUIStore.getState().showNormalBuffer).toBe(true)

      // Enable temporal depth - should disable normal buffer
      useUIStore.getState().setShowTemporalDepthBuffer(true)
      const state = useUIStore.getState()
      expect(state.showDepthBuffer).toBe(false)
      expect(state.showNormalBuffer).toBe(false)
      expect(state.showTemporalDepthBuffer).toBe(true)
    })

    it('disabling a buffer should not affect other buffers', () => {
      // Enable depth buffer
      useUIStore.getState().setShowDepthBuffer(true)
      expect(useUIStore.getState().showDepthBuffer).toBe(true)

      // Disable depth buffer - others should remain false
      useUIStore.getState().setShowDepthBuffer(false)
      const state = useUIStore.getState()
      expect(state.showDepthBuffer).toBe(false)
      expect(state.showNormalBuffer).toBe(false)
      expect(state.showTemporalDepthBuffer).toBe(false)
    })
  })
})
