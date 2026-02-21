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

  describe('bloom', () => {
    it('should toggle bloom enabled', () => {
      const { setBloomEnabled } = usePostProcessingStore.getState()

      setBloomEnabled(true)
      expect(usePostProcessingStore.getState().bloomEnabled).toBe(true)

      setBloomEnabled(false)
      expect(usePostProcessingStore.getState().bloomEnabled).toBe(false)
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

    it('should clamp bloom radius to [0.25, 4]', () => {
      const { setBloomRadius } = usePostProcessingStore.getState()
      setBloomRadius(2.5)
      expect(usePostProcessingStore.getState().bloomRadius).toBe(2.5)
      setBloomRadius(0.1)
      expect(usePostProcessingStore.getState().bloomRadius).toBe(0.25)
      setBloomRadius(10)
      expect(usePostProcessingStore.getState().bloomRadius).toBe(4)
    })

    it('ignores non-finite bloom updates', () => {
      const { setBloomGain, setBloomThreshold, setBloomKnee, setBloomRadius } =
        usePostProcessingStore.getState()

      setBloomGain(1.5)
      setBloomThreshold(2)
      setBloomKnee(0.8)
      setBloomRadius(1.25)

      setBloomGain(Number.NaN)
      setBloomThreshold(Number.POSITIVE_INFINITY)
      setBloomKnee(Number.NEGATIVE_INFINITY)
      setBloomRadius(Number.NaN)

      const state = usePostProcessingStore.getState()
      expect(state.bloomGain).toBe(1.5)
      expect(state.bloomThreshold).toBe(2)
      expect(state.bloomKnee).toBe(0.8)
      expect(state.bloomRadius).toBe(1.25)
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

    it('ignores non-finite cinematic updates', () => {
      const { setCinematicAberration, setCinematicVignette, setCinematicGrain } =
        usePostProcessingStore.getState()

      setCinematicAberration(0.03)
      setCinematicVignette(1.8)
      setCinematicGrain(0.07)

      setCinematicAberration(Number.NaN)
      setCinematicVignette(Number.POSITIVE_INFINITY)
      setCinematicGrain(Number.NEGATIVE_INFINITY)

      const state = usePostProcessingStore.getState()
      expect(state.cinematicAberration).toBe(0.03)
      expect(state.cinematicVignette).toBe(1.8)
      expect(state.cinematicGrain).toBe(0.07)
    })
  })

  describe('paper texture', () => {
    it('ignores non-finite paper numeric updates', () => {
      const {
        setPaperContrast,
        setPaperRoughness,
        setPaperFiber,
        setPaperFiberSize,
        setPaperCrumples,
        setPaperCrumpleSize,
        setPaperFolds,
        setPaperFoldCount,
        setPaperDrops,
        setPaperFade,
        setPaperSeed,
        setPaperIntensity,
      } = usePostProcessingStore.getState()

      setPaperContrast(0.5)
      setPaperRoughness(0.4)
      setPaperFiber(0.3)
      setPaperFiberSize(1.5)
      setPaperCrumples(0.6)
      setPaperCrumpleSize(1.1)
      setPaperFolds(0.2)
      setPaperFoldCount(9)
      setPaperDrops(0.7)
      setPaperFade(0.8)
      setPaperSeed(250)
      setPaperIntensity(0.9)

      setPaperContrast(Number.NaN)
      setPaperRoughness(Number.POSITIVE_INFINITY)
      setPaperFiber(Number.NEGATIVE_INFINITY)
      setPaperFiberSize(Number.NaN)
      setPaperCrumples(Number.POSITIVE_INFINITY)
      setPaperCrumpleSize(Number.NEGATIVE_INFINITY)
      setPaperFolds(Number.NaN)
      setPaperFoldCount(Number.POSITIVE_INFINITY)
      setPaperDrops(Number.NEGATIVE_INFINITY)
      setPaperFade(Number.NaN)
      setPaperSeed(Number.POSITIVE_INFINITY)
      setPaperIntensity(Number.NEGATIVE_INFINITY)

      const state = usePostProcessingStore.getState()
      expect(state.paperContrast).toBe(0.5)
      expect(state.paperRoughness).toBe(0.4)
      expect(state.paperFiber).toBe(0.3)
      expect(state.paperFiberSize).toBe(1.5)
      expect(state.paperCrumples).toBe(0.6)
      expect(state.paperCrumpleSize).toBe(1.1)
      expect(state.paperFolds).toBe(0.2)
      expect(state.paperFoldCount).toBe(9)
      expect(state.paperDrops).toBe(0.7)
      expect(state.paperFade).toBe(0.8)
      expect(state.paperSeed).toBe(250)
      expect(state.paperIntensity).toBe(0.9)
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

    it('ignores non-finite frame blending factor updates', () => {
      const { setFrameBlendingFactor } = usePostProcessingStore.getState()
      setFrameBlendingFactor(0.4)

      setFrameBlendingFactor(Number.NaN)
      setFrameBlendingFactor(Number.POSITIVE_INFINITY)
      setFrameBlendingFactor(Number.NEGATIVE_INFINITY)

      expect(usePostProcessingStore.getState().frameBlendingFactor).toBe(0.4)
    })
  })
})
