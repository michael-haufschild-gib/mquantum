/**
 * Tests for postProcessingStore
 * Verifies post-processing effects state management
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { usePostProcessingStore } from '@/stores/postProcessingStore'
import { POST_PROCESSING_INITIAL_STATE } from '@/stores/slices/postProcessingSlice'

describe('postProcessingStore', () => {
  beforeEach(() => {
    usePostProcessingStore.setState({ ...POST_PROCESSING_INITIAL_STATE })
  })

  describe('bloom v2', () => {
    it('should toggle bloom enabled', () => {
      const { setBloomEnabled } = usePostProcessingStore.getState()

      setBloomEnabled(true)
      expect(usePostProcessingStore.getState().bloomEnabled).toBe(true)

      setBloomEnabled(false)
      expect(usePostProcessingStore.getState().bloomEnabled).toBe(false)
    })

    it('should set bloom mode', () => {
      const { setBloomMode } = usePostProcessingStore.getState()
      setBloomMode('convolution')
      expect(usePostProcessingStore.getState().bloomMode).toBe('convolution')
      setBloomMode('gaussian')
      expect(usePostProcessingStore.getState().bloomMode).toBe('gaussian')
    })

    it('should clamp bloom gain to [0, 3]', () => {
      const { setBloomGain } = usePostProcessingStore.getState()
      setBloomGain(2.75)
      expect(usePostProcessingStore.getState().bloomGain).toBe(2.75)
      setBloomGain(-10)
      expect(usePostProcessingStore.getState().bloomGain).toBe(0)
      setBloomGain(99)
      expect(usePostProcessingStore.getState().bloomGain).toBe(3)
    })

    it('should clamp threshold to [0, 5]', () => {
      const { setBloomThreshold } = usePostProcessingStore.getState()
      setBloomThreshold(2.5)
      expect(usePostProcessingStore.getState().bloomThreshold).toBe(2.5)
      setBloomThreshold(-99)
      expect(usePostProcessingStore.getState().bloomThreshold).toBe(0)
      setBloomThreshold(99)
      expect(usePostProcessingStore.getState().bloomThreshold).toBe(5)
    })

    it('should clamp knee to [0, 5]', () => {
      const { setBloomKnee } = usePostProcessingStore.getState()
      setBloomKnee(0.25)
      expect(usePostProcessingStore.getState().bloomKnee).toBe(0.25)
      setBloomKnee(-1)
      expect(usePostProcessingStore.getState().bloomKnee).toBe(0)
      setBloomKnee(10)
      expect(usePostProcessingStore.getState().bloomKnee).toBe(5)
    })

    it('should enforce contiguous band prefix when enabling/disabling bands', () => {
      const store = usePostProcessingStore.getState()

      store.setBloomBandEnabled(3, false)
      let bands = usePostProcessingStore.getState().bloomBands
      expect(bands[3]!.enabled).toBe(false)
      expect(bands[4]!.enabled).toBe(false)

      store.setBloomBandEnabled(3, true)
      bands = usePostProcessingStore.getState().bloomBands
      expect(bands[0]!.enabled).toBe(true)
      expect(bands[1]!.enabled).toBe(true)
      expect(bands[2]!.enabled).toBe(true)
      expect(bands[3]!.enabled).toBe(true)
    })

    it('should clamp band weight/size and validate tint', () => {
      const store = usePostProcessingStore.getState()

      store.setBloomBandWeight(0, 2.75)
      expect(usePostProcessingStore.getState().bloomBands[0]!.weight).toBe(2.75)
      store.setBloomBandWeight(0, -10)
      expect(usePostProcessingStore.getState().bloomBands[0]!.weight).toBe(0)
      store.setBloomBandWeight(0, 99)
      expect(usePostProcessingStore.getState().bloomBands[0]!.weight).toBe(4)

      store.setBloomBandSize(1, 1.5)
      expect(usePostProcessingStore.getState().bloomBands[1]!.size).toBe(1.5)
      store.setBloomBandSize(1, -10)
      expect(usePostProcessingStore.getState().bloomBands[1]!.size).toBe(0.25)
      store.setBloomBandSize(1, 99)
      expect(usePostProcessingStore.getState().bloomBands[1]!.size).toBe(4)

      const originalTint = usePostProcessingStore.getState().bloomBands[2]!.tint
      store.setBloomBandTint(2, '#22AAFF')
      expect(usePostProcessingStore.getState().bloomBands[2]!.tint).toBe('#22AAFF')
      store.setBloomBandTint(2, 'invalid')
      expect(usePostProcessingStore.getState().bloomBands[2]!.tint).toBe('#22AAFF')
      expect(usePostProcessingStore.getState().bloomBands[2]!.tint).not.toBe(originalTint)
    })

    it('should set all 5 band sizes uniformly via setBloomRadius', () => {
      const { setBloomRadius } = usePostProcessingStore.getState()
      setBloomRadius(2.5)
      const bands = usePostProcessingStore.getState().bloomBands
      expect(bands).toHaveLength(5)
      for (const band of bands) {
        expect(band.size).toBe(2.5)
      }
    })

    it('should clamp setBloomRadius to [0.25, 4]', () => {
      const { setBloomRadius } = usePostProcessingStore.getState()

      setBloomRadius(0.1)
      expect(usePostProcessingStore.getState().bloomBands[0]!.size).toBe(0.25)

      setBloomRadius(10)
      expect(usePostProcessingStore.getState().bloomBands[0]!.size).toBe(4)
    })

    it('should preserve non-size band properties when using setBloomRadius', () => {
      const store = usePostProcessingStore.getState()
      store.setBloomBandWeight(0, 3.0)
      store.setBloomBandTint(1, '#FF0000')
      store.setBloomBandEnabled(2, false)

      store.setBloomRadius(1.5)

      const bands = usePostProcessingStore.getState().bloomBands
      expect(bands[0]!.weight).toBe(3.0)
      expect(bands[1]!.tint).toBe('#FF0000')
      expect(bands[2]!.enabled).toBe(false)
      for (const band of bands) {
        expect(band.size).toBe(1.5)
      }
    })

    it('should clamp convolution settings and validate tint', () => {
      const store = usePostProcessingStore.getState()

      store.setBloomConvolutionRadius(2.5)
      expect(usePostProcessingStore.getState().bloomConvolutionRadius).toBe(2.5)
      store.setBloomConvolutionRadius(0)
      expect(usePostProcessingStore.getState().bloomConvolutionRadius).toBe(0.5)

      store.setBloomConvolutionResolutionScale(0.75)
      expect(usePostProcessingStore.getState().bloomConvolutionResolutionScale).toBe(0.75)
      store.setBloomConvolutionResolutionScale(2)
      expect(usePostProcessingStore.getState().bloomConvolutionResolutionScale).toBe(1)

      store.setBloomConvolutionBoost(3.5)
      expect(usePostProcessingStore.getState().bloomConvolutionBoost).toBe(3.5)
      store.setBloomConvolutionBoost(10)
      expect(usePostProcessingStore.getState().bloomConvolutionBoost).toBe(4)

      store.setBloomConvolutionTint('#334455')
      expect(usePostProcessingStore.getState().bloomConvolutionTint).toBe('#334455')
      store.setBloomConvolutionTint('bad')
      expect(usePostProcessingStore.getState().bloomConvolutionTint).toBe('#334455')
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
