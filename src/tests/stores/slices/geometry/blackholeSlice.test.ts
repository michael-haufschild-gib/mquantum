/**
 * Tests for blackholeSlice
 *
 * Tests the black hole state management functionality including:
 * - Basic parameter updates
 * - Quality preset application
 * - Animation controls
 * - Dimension-aware initialization
 */

import { DEFAULT_BLACK_HOLE_CONFIG } from '@/lib/geometry/extended/types'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'
import { beforeEach, describe, expect, it } from 'vitest'

describe('blackholeSlice', () => {
  beforeEach(() => {
    useExtendedObjectStore.getState().reset()
  })

  describe('basic parameter actions', () => {
    it('should set horizon radius with clamping', () => {
      const { setBlackHoleHorizonRadius } = useExtendedObjectStore.getState()

      setBlackHoleHorizonRadius(2.0)
      expect(useExtendedObjectStore.getState().blackhole.horizonRadius).toBe(2.0)

      // Test clamping - too low (min is 0.05)
      setBlackHoleHorizonRadius(0.01)
      expect(useExtendedObjectStore.getState().blackhole.horizonRadius).toBe(0.05)

      // Test clamping - too high (max is 20)
      setBlackHoleHorizonRadius(30)
      expect(useExtendedObjectStore.getState().blackhole.horizonRadius).toBe(20)
    })

    it('should set gravity strength with clamping', () => {
      const { setBlackHoleGravityStrength } = useExtendedObjectStore.getState()

      setBlackHoleGravityStrength(1.5)
      expect(useExtendedObjectStore.getState().blackhole.gravityStrength).toBe(1.5)

      // Test clamping - too low (min is 0)
      setBlackHoleGravityStrength(-0.5)
      expect(useExtendedObjectStore.getState().blackhole.gravityStrength).toBe(0)

      // Test clamping - too high (max is 10)
      setBlackHoleGravityStrength(15)
      expect(useExtendedObjectStore.getState().blackhole.gravityStrength).toBe(10)
    })

    it('should set manifold intensity with clamping', () => {
      const { setBlackHoleManifoldIntensity } = useExtendedObjectStore.getState()

      setBlackHoleManifoldIntensity(2.0)
      expect(useExtendedObjectStore.getState().blackhole.manifoldIntensity).toBe(2.0)

      // Test clamping - too low (min is 0)
      setBlackHoleManifoldIntensity(-1)
      expect(useExtendedObjectStore.getState().blackhole.manifoldIntensity).toBe(0)

      // Test clamping - too high (max is 20)
      setBlackHoleManifoldIntensity(25)
      expect(useExtendedObjectStore.getState().blackhole.manifoldIntensity).toBe(20)
    })

    it('should set base color', () => {
      const { setBlackHoleBaseColor } = useExtendedObjectStore.getState()

      setBlackHoleBaseColor('#ff0000')
      expect(useExtendedObjectStore.getState().blackhole.baseColor).toBe('#ff0000')
    })

    it('should set palette mode', () => {
      const { setBlackHolePaletteMode } = useExtendedObjectStore.getState()

      setBlackHolePaletteMode('heatmap')
      expect(useExtendedObjectStore.getState().blackhole.paletteMode).toBe('heatmap')

      setBlackHolePaletteMode('shellOnly')
      expect(useExtendedObjectStore.getState().blackhole.paletteMode).toBe('shellOnly')
    })

    it('should set bloom boost with clamping', () => {
      const { setBlackHoleBloomBoost } = useExtendedObjectStore.getState()

      setBlackHoleBloomBoost(2.0)
      expect(useExtendedObjectStore.getState().blackhole.bloomBoost).toBe(2.0)

      // Test clamping
      setBlackHoleBloomBoost(-1)
      expect(useExtendedObjectStore.getState().blackhole.bloomBoost).toBe(0)

      setBlackHoleBloomBoost(10)
      expect(useExtendedObjectStore.getState().blackhole.bloomBoost).toBe(5.0)
    })
  })

  describe('photon shell actions', () => {
    it('should set photon shell width with clamping', () => {
      const { setBlackHolePhotonShellWidth } = useExtendedObjectStore.getState()

      setBlackHolePhotonShellWidth(0.1)
      expect(useExtendedObjectStore.getState().blackhole.photonShellWidth).toBe(0.1)

      // Test clamping
      setBlackHolePhotonShellWidth(-0.1)
      expect(useExtendedObjectStore.getState().blackhole.photonShellWidth).toBe(0)

      setBlackHolePhotonShellWidth(1)
      expect(useExtendedObjectStore.getState().blackhole.photonShellWidth).toBe(0.3)
    })

    it('should set shell glow strength', () => {
      const { setBlackHoleShellGlowStrength } = useExtendedObjectStore.getState()

      setBlackHoleShellGlowStrength(5.0)
      expect(useExtendedObjectStore.getState().blackhole.shellGlowStrength).toBe(5.0)
    })

    it('should set shell glow color', () => {
      const { setBlackHoleShellGlowColor } = useExtendedObjectStore.getState()

      setBlackHoleShellGlowColor('#00ff00')
      expect(useExtendedObjectStore.getState().blackhole.shellGlowColor).toBe('#00ff00')
    })
  })

  describe('doppler actions', () => {
    it('should toggle doppler effect', () => {
      const { setBlackHoleDopplerEnabled } = useExtendedObjectStore.getState()

      setBlackHoleDopplerEnabled(true)
      expect(useExtendedObjectStore.getState().blackhole.dopplerEnabled).toBe(true)

      setBlackHoleDopplerEnabled(false)
      expect(useExtendedObjectStore.getState().blackhole.dopplerEnabled).toBe(false)
    })

    it('should set doppler strength', () => {
      const { setBlackHoleDopplerStrength } = useExtendedObjectStore.getState()

      setBlackHoleDopplerStrength(1.5)
      expect(useExtendedObjectStore.getState().blackhole.dopplerStrength).toBe(1.5)
    })
  })

  describe('Keplerian rotation actions', () => {
    it('should set Keplerian differential with clamping', () => {
      const { setBlackHoleKeplerianDifferential } = useExtendedObjectStore.getState()

      setBlackHoleKeplerianDifferential(0.5)
      expect(useExtendedObjectStore.getState().blackhole.keplerianDifferential).toBe(0.5)

      // Test clamping - too low (min is 0)
      setBlackHoleKeplerianDifferential(-0.5)
      expect(useExtendedObjectStore.getState().blackhole.keplerianDifferential).toBe(0)

      // Test clamping - too high (max is 1)
      setBlackHoleKeplerianDifferential(1.5)
      expect(useExtendedObjectStore.getState().blackhole.keplerianDifferential).toBe(1)
    })
  })

  describe('animation actions', () => {
    it('should toggle pulse animation', () => {
      const { setBlackHolePulseEnabled } = useExtendedObjectStore.getState()

      setBlackHolePulseEnabled(true)
      expect(useExtendedObjectStore.getState().blackhole.pulseEnabled).toBe(true)

      setBlackHolePulseEnabled(false)
      expect(useExtendedObjectStore.getState().blackhole.pulseEnabled).toBe(false)
    })

    it('should set pulse speed and amount', () => {
      const { setBlackHolePulseSpeed, setBlackHolePulseAmount } = useExtendedObjectStore.getState()

      setBlackHolePulseSpeed(0.5)
      expect(useExtendedObjectStore.getState().blackhole.pulseSpeed).toBe(0.5)

      setBlackHolePulseAmount(0.3)
      expect(useExtendedObjectStore.getState().blackhole.pulseAmount).toBe(0.3)
    })
  })

  describe('lensing actions', () => {
    it('should set lensing parameters', () => {
      const { setBlackHoleDimensionEmphasis, setBlackHoleDistanceFalloff, setBlackHoleBendScale } =
        useExtendedObjectStore.getState()

      setBlackHoleDimensionEmphasis(0.5)
      expect(useExtendedObjectStore.getState().blackhole.dimensionEmphasis).toBe(0.5)

      setBlackHoleDistanceFalloff(2.0)
      expect(useExtendedObjectStore.getState().blackhole.distanceFalloff).toBe(2.0)

      setBlackHoleBendScale(1.5)
      expect(useExtendedObjectStore.getState().blackhole.bendScale).toBe(1.5)
    })

    it('should set ray bending mode', () => {
      const { setBlackHoleRayBendingMode } = useExtendedObjectStore.getState()

      setBlackHoleRayBendingMode('orbital')
      expect(useExtendedObjectStore.getState().blackhole.rayBendingMode).toBe('orbital')

      setBlackHoleRayBendingMode('spiral')
      expect(useExtendedObjectStore.getState().blackhole.rayBendingMode).toBe('spiral')
    })
  })

  describe('deferred lensing actions', () => {
    it('should toggle deferred lensing', () => {
      const { setBlackHoleDeferredLensingEnabled } = useExtendedObjectStore.getState()

      setBlackHoleDeferredLensingEnabled(true)
      expect(useExtendedObjectStore.getState().blackhole.deferredLensingEnabled).toBe(true)

      setBlackHoleDeferredLensingEnabled(false)
      expect(useExtendedObjectStore.getState().blackhole.deferredLensingEnabled).toBe(false)
    })

    it('should set deferred lensing strength with clamping', () => {
      const { setBlackHoleDeferredLensingStrength } = useExtendedObjectStore.getState()

      setBlackHoleDeferredLensingStrength(1.5)
      expect(useExtendedObjectStore.getState().blackhole.deferredLensingStrength).toBe(1.5)

      // Test clamping - too low (min is 0)
      setBlackHoleDeferredLensingStrength(-0.5)
      expect(useExtendedObjectStore.getState().blackhole.deferredLensingStrength).toBe(0)

      // Test clamping - too high (max is 2)
      setBlackHoleDeferredLensingStrength(5)
      expect(useExtendedObjectStore.getState().blackhole.deferredLensingStrength).toBe(2)
    })

    it('should set deferred lensing chromatic aberration with clamping', () => {
      const { setBlackHoleDeferredLensingChromaticAberration } = useExtendedObjectStore.getState()

      setBlackHoleDeferredLensingChromaticAberration(0.5)
      expect(useExtendedObjectStore.getState().blackhole.deferredLensingChromaticAberration).toBe(
        0.5
      )

      // Test clamping - too low (min is 0)
      setBlackHoleDeferredLensingChromaticAberration(-0.2)
      expect(useExtendedObjectStore.getState().blackhole.deferredLensingChromaticAberration).toBe(0)

      // Test clamping - too high (max is 1)
      setBlackHoleDeferredLensingChromaticAberration(1.5)
      expect(useExtendedObjectStore.getState().blackhole.deferredLensingChromaticAberration).toBe(1)
    })

    it('should set deferred lensing radius with clamping', () => {
      const { setBlackHoleDeferredLensingRadius } = useExtendedObjectStore.getState()

      setBlackHoleDeferredLensingRadius(5.0)
      expect(useExtendedObjectStore.getState().blackhole.deferredLensingRadius).toBe(5.0)

      // Test clamping - too low (min is 0)
      setBlackHoleDeferredLensingRadius(-1)
      expect(useExtendedObjectStore.getState().blackhole.deferredLensingRadius).toBe(0)

      // Test clamping - too high (max is 10)
      setBlackHoleDeferredLensingRadius(15)
      expect(useExtendedObjectStore.getState().blackhole.deferredLensingRadius).toBe(10)
    })
  })

  describe('manifold actions', () => {
    it('should set manifold type', () => {
      const { setBlackHoleManifoldType } = useExtendedObjectStore.getState()

      setBlackHoleManifoldType('disk')
      expect(useExtendedObjectStore.getState().blackhole.manifoldType).toBe('disk')

      setBlackHoleManifoldType('sheet')
      expect(useExtendedObjectStore.getState().blackhole.manifoldType).toBe('sheet')

      setBlackHoleManifoldType('autoByN')
      expect(useExtendedObjectStore.getState().blackhole.manifoldType).toBe('autoByN')
    })

    it('should set swirl amount', () => {
      const { setBlackHoleSwirlAmount } = useExtendedObjectStore.getState()

      setBlackHoleSwirlAmount(1.0)
      expect(useExtendedObjectStore.getState().blackhole.swirlAmount).toBe(1.0)
    })
  })

  describe('cross-section parameters', () => {
    it('should set parameter values', () => {
      const { setBlackHoleParameterValue } = useExtendedObjectStore.getState()

      setBlackHoleParameterValue(0, 1.5)
      expect(useExtendedObjectStore.getState().blackhole.parameterValues[0]).toBe(1.5)

      setBlackHoleParameterValue(1, -0.5)
      expect(useExtendedObjectStore.getState().blackhole.parameterValues[1]).toBe(-0.5)
    })

    it('should reset parameters', () => {
      const { setBlackHoleParameterValue, resetBlackHoleParameters } =
        useExtendedObjectStore.getState()

      // Set some values
      setBlackHoleParameterValue(0, 1.5)
      setBlackHoleParameterValue(1, -0.5)

      // Reset
      resetBlackHoleParameters()

      // All should be 0
      const { parameterValues } = useExtendedObjectStore.getState().blackhole
      expect(parameterValues[0]).toBe(0)
      expect(parameterValues[1]).toBe(0)
    })
  })

  describe('config operations', () => {
    it('should get black hole config', () => {
      const { getBlackHoleConfig } = useExtendedObjectStore.getState()

      const config = getBlackHoleConfig()
      expect(config).toBeDefined()
      expect(config.horizonRadius).toBe(DEFAULT_BLACK_HOLE_CONFIG.horizonRadius)
    })

    it('should set partial config', () => {
      const { setBlackHoleConfig } = useExtendedObjectStore.getState()

      setBlackHoleConfig({
        horizonRadius: 2.0,
        gravityStrength: 1.5,
      })

      const { blackhole } = useExtendedObjectStore.getState()
      expect(blackhole.horizonRadius).toBe(2.0)
      expect(blackhole.gravityStrength).toBe(1.5)
      // Other values should remain unchanged
      expect(blackhole.manifoldIntensity).toBe(DEFAULT_BLACK_HOLE_CONFIG.manifoldIntensity)
    })

    it('should initialize for dimension', () => {
      const { initializeBlackHoleForDimension } = useExtendedObjectStore.getState()

      // Initialize for 5D
      initializeBlackHoleForDimension(5)

      // Should have 2 parameter values for 5D (5 - 3 = 2)
      const { parameterValues } = useExtendedObjectStore.getState().blackhole
      expect(parameterValues.length).toBeGreaterThanOrEqual(2)
    })
  })

  describe('integer parameter actions', () => {
    it('should floor maxSteps to integer and clamp', () => {
      const { setBlackHoleMaxSteps } = useExtendedObjectStore.getState()

      // Float should be floored
      setBlackHoleMaxSteps(64.9)
      expect(useExtendedObjectStore.getState().blackhole.maxSteps).toBe(64)

      setBlackHoleMaxSteps(100.1)
      expect(useExtendedObjectStore.getState().blackhole.maxSteps).toBe(100)

      // Clamping should still work
      setBlackHoleMaxSteps(10) // below min 16
      expect(useExtendedObjectStore.getState().blackhole.maxSteps).toBe(16)

      setBlackHoleMaxSteps(600) // above max 512
      expect(useExtendedObjectStore.getState().blackhole.maxSteps).toBe(512)

      // Edge case: clamp then floor
      setBlackHoleMaxSteps(520.9) // clamped to 512, then floored to 512
      expect(useExtendedObjectStore.getState().blackhole.maxSteps).toBe(512)
    })

    it('should floor shadowSteps to integer and clamp', () => {
      const { setBlackHoleShadowSteps } = useExtendedObjectStore.getState()

      // Float should be floored
      setBlackHoleShadowSteps(32.7)
      expect(useExtendedObjectStore.getState().blackhole.shadowSteps).toBe(32)

      // Clamping should still work
      setBlackHoleShadowSteps(2) // below min 4
      expect(useExtendedObjectStore.getState().blackhole.shadowSteps).toBe(4)

      setBlackHoleShadowSteps(100) // above max 64
      expect(useExtendedObjectStore.getState().blackhole.shadowSteps).toBe(64)
    })

    it('should floor motionBlurSamples to integer and clamp', () => {
      const { setBlackHoleMotionBlurSamples } = useExtendedObjectStore.getState()

      // Float should be floored
      setBlackHoleMotionBlurSamples(4.9)
      expect(useExtendedObjectStore.getState().blackhole.motionBlurSamples).toBe(4)

      // Clamping should still work
      setBlackHoleMotionBlurSamples(0) // below min 1
      expect(useExtendedObjectStore.getState().blackhole.motionBlurSamples).toBe(1)

      setBlackHoleMotionBlurSamples(20) // above max 8
      expect(useExtendedObjectStore.getState().blackhole.motionBlurSamples).toBe(8)
    })
  })

  describe('lighting actions', () => {
    it('should set lighting mode', () => {
      const { setBlackHoleLightingMode } = useExtendedObjectStore.getState()

      setBlackHoleLightingMode('fakeLit')
      expect(useExtendedObjectStore.getState().blackhole.lightingMode).toBe('fakeLit')

      setBlackHoleLightingMode('emissiveOnly')
      expect(useExtendedObjectStore.getState().blackhole.lightingMode).toBe('emissiveOnly')
    })

    it('should set roughness and specular', () => {
      const { setBlackHoleRoughness, setBlackHoleSpecular } = useExtendedObjectStore.getState()

      setBlackHoleRoughness(0.8)
      expect(useExtendedObjectStore.getState().blackhole.roughness).toBe(0.8)

      setBlackHoleSpecular(0.3)
      expect(useExtendedObjectStore.getState().blackhole.specular).toBe(0.3)
    })
  })
})
