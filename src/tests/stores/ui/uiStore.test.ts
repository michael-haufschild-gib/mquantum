/**
 * Tests for UI Store
 *
 * Tests the UI-related state and actions in the UI slice.
 * Note: maxFps tests have been moved to performanceStore.test.ts
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { UI_INITIAL_STATE } from '@/stores/slices/uiSlice'
import { useUIStore } from '@/stores/ui/uiStore'

describe('uiStore.bufferVisualization', () => {
  beforeEach(() => {
    useUIStore.setState(UI_INITIAL_STATE)
  })

  afterEach(() => {
    useUIStore.setState(UI_INITIAL_STATE)
  })

  describe('Temporal Buffer Toggle', () => {
    it('enables the temporal buffer preview when toggled on', () => {
      useUIStore.getState().setShowTemporalDepthBuffer(true)
      expect(useUIStore.getState().showTemporalDepthBuffer).toBe(true)
    })

    it('disables the temporal buffer preview when toggled off', () => {
      useUIStore.getState().setShowTemporalDepthBuffer(true)
      useUIStore.getState().setShowTemporalDepthBuffer(false)
      expect(useUIStore.getState().showTemporalDepthBuffer).toBe(false)
    })
  })

  describe('Runtime UI boundary guards', () => {
    it('ignores non-boolean toggle payloads', () => {
      const store = useUIStore.getState()

      store.setShowAxisHelper(false)
      store.setShowPerfMonitor(true)
      store.setPerfMonitorExpanded(true)
      store.setShowTemporalDepthBuffer(true)

      store.setShowAxisHelper('false' as never)
      store.setShowPerfMonitor('false' as never)
      store.setPerfMonitorExpanded('false' as never)
      store.setShowTemporalDepthBuffer('false' as never)

      const next = useUIStore.getState()
      expect(next.showAxisHelper).toBe(false)
      expect(next.showPerfMonitor).toBe(true)
      expect(next.perfMonitorExpanded).toBe(true)
      expect(next.showTemporalDepthBuffer).toBe(true)
    })

    it('ignores invalid performance monitor tab identifiers', () => {
      const store = useUIStore.getState()

      store.setPerfMonitorTab('shader')
      store.setPerfMonitorTab('gpu' as never)

      expect(useUIStore.getState().perfMonitorTab).toBe('shader')
    })
  })

  describe('Animation Bias', () => {
    it('clamps animation bias to [0, 1]', () => {
      useUIStore.getState().setAnimationBias(-1)
      expect(useUIStore.getState().animationBias).toBe(0)

      useUIStore.getState().setAnimationBias(2)
      expect(useUIStore.getState().animationBias).toBe(1)

      useUIStore.getState().setAnimationBias(0.4)
      expect(useUIStore.getState().animationBias).toBe(0.4)
    })

    it('ignores non-finite animation bias updates', () => {
      useUIStore.getState().setAnimationBias(0.4)
      useUIStore.getState().setAnimationBias(Number.NaN)
      useUIStore.getState().setAnimationBias(Number.POSITIVE_INFINITY)
      useUIStore.getState().setAnimationBias(Number.NEGATIVE_INFINITY)
      expect(useUIStore.getState().animationBias).toBe(0.4)
    })
  })
})
