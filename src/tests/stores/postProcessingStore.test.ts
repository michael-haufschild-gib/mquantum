/**
 * Tests for postProcessingStore
 * Verifies post-processing effects state management
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { usePostProcessingStore } from '@/stores/postProcessingStore'
import { POST_PROCESSING_INITIAL_STATE } from '@/stores/slices/postProcessingSlice'

describe('postProcessingStore', () => {
  beforeEach(() => {
    // Reset store state before each test
    usePostProcessingStore.setState({ ...POST_PROCESSING_INITIAL_STATE })
  })

  describe('bloom', () => {
    it('should toggle bloom enabled', () => {
      const { setBloomEnabled } = usePostProcessingStore.getState()

      setBloomEnabled(true)
      expect(usePostProcessingStore.getState().bloomEnabled).toBe(true)

      setBloomEnabled(false)
      expect(usePostProcessingStore.getState().bloomEnabled).toBe(false)
    })

    it('should set bloom intensity with clamping', () => {
      const { setBloomIntensity } = usePostProcessingStore.getState()

      setBloomIntensity(1)
      expect(usePostProcessingStore.getState().bloomIntensity).toBe(1)

      setBloomIntensity(-1)
      expect(usePostProcessingStore.getState().bloomIntensity).toBe(0)

      setBloomIntensity(5)
      expect(usePostProcessingStore.getState().bloomIntensity).toBe(2)
    })

    it('should set bloom threshold with clamping', () => {
      const { setBloomThreshold } = usePostProcessingStore.getState()

      setBloomThreshold(0.5)
      expect(usePostProcessingStore.getState().bloomThreshold).toBe(0.5)

      setBloomThreshold(-0.5)
      expect(usePostProcessingStore.getState().bloomThreshold).toBe(0)

      setBloomThreshold(1.5)
      expect(usePostProcessingStore.getState().bloomThreshold).toBe(1)
    })

    it('should set bloom radius with clamping', () => {
      const { setBloomRadius } = usePostProcessingStore.getState()

      setBloomRadius(0.5)
      expect(usePostProcessingStore.getState().bloomRadius).toBe(0.5)
    })

    it('should set bloom smoothing with clamping', () => {
      const { setBloomSmoothing } = usePostProcessingStore.getState()

      setBloomSmoothing(0.5)
      expect(usePostProcessingStore.getState().bloomSmoothing).toBe(0.5)
    })

    it('should set bloom levels with clamping and rounding', () => {
      const { setBloomLevels } = usePostProcessingStore.getState()

      setBloomLevels(3)
      expect(usePostProcessingStore.getState().bloomLevels).toBe(3)

      setBloomLevels(0)
      expect(usePostProcessingStore.getState().bloomLevels).toBe(1)

      setBloomLevels(10)
      expect(usePostProcessingStore.getState().bloomLevels).toBe(5)

      setBloomLevels(2.7)
      expect(usePostProcessingStore.getState().bloomLevels).toBe(3)
    })
  })

  describe('anti-aliasing', () => {
    it('should set anti-aliasing method', () => {
      const { setAntiAliasingMethod } = usePostProcessingStore.getState()

      setAntiAliasingMethod('smaa')
      expect(usePostProcessingStore.getState().antiAliasingMethod).toBe('smaa')

      setAntiAliasingMethod('fxaa')
      expect(usePostProcessingStore.getState().antiAliasingMethod).toBe('fxaa')

      setAntiAliasingMethod('none')
      expect(usePostProcessingStore.getState().antiAliasingMethod).toBe('none')
    })
  })

  describe('cinematic', () => {
    it('should toggle cinematic enabled', () => {
      const { setCinematicEnabled } = usePostProcessingStore.getState()

      setCinematicEnabled(true)
      expect(usePostProcessingStore.getState().cinematicEnabled).toBe(true)
    })

    it('should set cinematic aberration with clamping', () => {
      const { setCinematicAberration } = usePostProcessingStore.getState()

      setCinematicAberration(0.05)
      expect(usePostProcessingStore.getState().cinematicAberration).toBe(0.05)

      setCinematicAberration(0.5)
      expect(usePostProcessingStore.getState().cinematicAberration).toBe(0.1)
    })

    it('should set cinematic vignette with clamping', () => {
      const { setCinematicVignette } = usePostProcessingStore.getState()

      setCinematicVignette(1.5)
      expect(usePostProcessingStore.getState().cinematicVignette).toBe(1.5)

      setCinematicVignette(5)
      expect(usePostProcessingStore.getState().cinematicVignette).toBe(3.0)
    })

    it('should set cinematic grain with clamping', () => {
      const { setCinematicGrain } = usePostProcessingStore.getState()

      setCinematicGrain(0.1)
      expect(usePostProcessingStore.getState().cinematicGrain).toBe(0.1)

      setCinematicGrain(0.5)
      expect(usePostProcessingStore.getState().cinematicGrain).toBe(0.2)
    })
  })

  describe('depth buffer', () => {
    it('should set object only depth', () => {
      const { setObjectOnlyDepth } = usePostProcessingStore.getState()

      setObjectOnlyDepth(true)
      expect(usePostProcessingStore.getState().objectOnlyDepth).toBe(true)

      setObjectOnlyDepth(false)
      expect(usePostProcessingStore.getState().objectOnlyDepth).toBe(false)
    })
  })

  describe('frame blending', () => {
    it('should toggle frame blending enabled', () => {
      const { setFrameBlendingEnabled } = usePostProcessingStore.getState()

      setFrameBlendingEnabled(true)
      expect(usePostProcessingStore.getState().frameBlendingEnabled).toBe(true)

      setFrameBlendingEnabled(false)
      expect(usePostProcessingStore.getState().frameBlendingEnabled).toBe(false)
    })

    it('should set frame blending factor with clamping', () => {
      const { setFrameBlendingFactor } = usePostProcessingStore.getState()

      setFrameBlendingFactor(0.5)
      expect(usePostProcessingStore.getState().frameBlendingFactor).toBe(0.5)

      setFrameBlendingFactor(-0.5)
      expect(usePostProcessingStore.getState().frameBlendingFactor).toBe(0)

      setFrameBlendingFactor(1.5)
      expect(usePostProcessingStore.getState().frameBlendingFactor).toBe(1)
    })
  })
})
