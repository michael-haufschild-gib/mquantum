/**
 * Tests for environmentStore
 * Verifies environment (skybox/background) state management
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { useEnvironmentStore } from '@/stores/environmentStore'
import { SKYBOX_INITIAL_STATE } from '@/stores/slices/skyboxSlice'

describe('environmentStore', () => {
  beforeEach(() => {
    // Reset store state before each test
    useEnvironmentStore.setState({
      ...SKYBOX_INITIAL_STATE,
      skyboxVersion: 0,
    })
  })

  describe('skybox slice', () => {
    describe('skybox selection', () => {
      it('should initialize with canonical derived fields for none selection', () => {
        const state = useEnvironmentStore.getState()
        expect(state.skyboxSelection).toBe('none')
        expect(state.skyboxEnabled).toBe(false)
        expect(state.skyboxMode).toBe('classic')
        expect(state.skyboxTexture).toBe('none')
      })

      it('should set skybox selection and derive state', () => {
        const { setSkyboxSelection } = useEnvironmentStore.getState()

        setSkyboxSelection('space_blue')

        const state = useEnvironmentStore.getState()
        expect(state.skyboxSelection).toBe('space_blue')
        expect(state.skyboxEnabled).toBe(true)
        expect(state.skyboxMode).toBe('classic')
        expect(state.skyboxTexture).toBe('space_blue')
      })

      it('should disable skybox when selection is none', () => {
        const { setSkyboxSelection } = useEnvironmentStore.getState()

        setSkyboxSelection('none')

        expect(useEnvironmentStore.getState().skyboxEnabled).toBe(false)
      })

      it('should set procedural mode correctly', () => {
        const { setSkyboxSelection } = useEnvironmentStore.getState()

        setSkyboxSelection('procedural_aurora')

        const state = useEnvironmentStore.getState()
        expect(state.skyboxEnabled).toBe(true)
        expect(state.skyboxMode).toBe('procedural_aurora')
      })
    })

    describe('skybox properties', () => {
      it('should set skybox intensity with clamping', () => {
        const { setSkyboxIntensity } = useEnvironmentStore.getState()

        setSkyboxIntensity(5)
        expect(useEnvironmentStore.getState().skyboxIntensity).toBe(5)

        setSkyboxIntensity(-1)
        expect(useEnvironmentStore.getState().skyboxIntensity).toBe(0)

        setSkyboxIntensity(15)
        expect(useEnvironmentStore.getState().skyboxIntensity).toBe(10)
      })

      it('should normalize skybox rotation to [0, 2π)', () => {
        const { setSkyboxRotation } = useEnvironmentStore.getState()

        setSkyboxRotation(Math.PI)
        expect(useEnvironmentStore.getState().skyboxRotation).toBeCloseTo(Math.PI)

        setSkyboxRotation(3 * Math.PI)
        expect(useEnvironmentStore.getState().skyboxRotation).toBeCloseTo(Math.PI)

        setSkyboxRotation(-Math.PI / 2)
        expect(useEnvironmentStore.getState().skyboxRotation).toBeCloseTo(1.5 * Math.PI)
      })

      it('should set skybox animation mode', () => {
        const { setSkyboxAnimationMode } = useEnvironmentStore.getState()

        setSkyboxAnimationMode('cinematic')
        expect(useEnvironmentStore.getState().skyboxAnimationMode).toBe('cinematic')
      })

      it('should set skybox animation speed with clamping', () => {
        const { setSkyboxAnimationSpeed } = useEnvironmentStore.getState()

        setSkyboxAnimationSpeed(2)
        expect(useEnvironmentStore.getState().skyboxAnimationSpeed).toBe(2)

        setSkyboxAnimationSpeed(-1)
        expect(useEnvironmentStore.getState().skyboxAnimationSpeed).toBe(0)

        setSkyboxAnimationSpeed(10)
        expect(useEnvironmentStore.getState().skyboxAnimationSpeed).toBe(5)
      })

      it('should ignore non-finite numeric skybox updates', () => {
        const { setSkyboxIntensity, setSkyboxRotation, setSkyboxAnimationSpeed } =
          useEnvironmentStore.getState()

        setSkyboxIntensity(2)
        setSkyboxRotation(Math.PI / 3)
        setSkyboxAnimationSpeed(1.5)

        setSkyboxIntensity(Number.NaN)
        setSkyboxIntensity(Number.POSITIVE_INFINITY)
        setSkyboxRotation(Number.NaN)
        setSkyboxRotation(Number.NEGATIVE_INFINITY)
        setSkyboxAnimationSpeed(Number.NaN)
        setSkyboxAnimationSpeed(Number.POSITIVE_INFINITY)

        expect(useEnvironmentStore.getState().skyboxIntensity).toBe(2)
        expect(useEnvironmentStore.getState().skyboxRotation).toBeCloseTo(Math.PI / 3)
        expect(useEnvironmentStore.getState().skyboxAnimationSpeed).toBe(1.5)
      })

      it('should set skybox high quality', () => {
        const { setSkyboxHighQuality } = useEnvironmentStore.getState()

        setSkyboxHighQuality(true)
        expect(useEnvironmentStore.getState().skyboxHighQuality).toBe(true)

        setSkyboxHighQuality(false)
        expect(useEnvironmentStore.getState().skyboxHighQuality).toBe(false)
      })

      it('should set skybox loading state', () => {
        const { setSkyboxLoading } = useEnvironmentStore.getState()

        setSkyboxLoading(true)
        expect(useEnvironmentStore.getState().skyboxLoading).toBe(true)

        setSkyboxLoading(false)
        expect(useEnvironmentStore.getState().skyboxLoading).toBe(false)
      })

      it('keeps unified skybox selection and derived fields in sync for direct setters', () => {
        const { setSkyboxSelection, setSkyboxEnabled, setSkyboxMode, setSkyboxTexture } =
          useEnvironmentStore.getState()

        setSkyboxSelection('space_blue')
        setSkyboxMode('procedural_aurora')

        let state = useEnvironmentStore.getState()
        expect(state.skyboxSelection).toBe('procedural_aurora')
        expect(state.skyboxEnabled).toBe(true)
        expect(state.skyboxMode).toBe('procedural_aurora')
        expect(state.skyboxTexture).toBe('space_blue')

        setSkyboxTexture('space_red')
        state = useEnvironmentStore.getState()
        expect(state.skyboxSelection).toBe('space_red')
        expect(state.skyboxEnabled).toBe(true)
        expect(state.skyboxMode).toBe('classic')
        expect(state.skyboxTexture).toBe('space_red')

        setSkyboxEnabled(false)
        state = useEnvironmentStore.getState()
        expect(state.skyboxSelection).toBe('none')
        expect(state.skyboxEnabled).toBe(false)
        expect(state.skyboxMode).toBe('classic')
        expect(state.skyboxTexture).toBe('none')

        setSkyboxEnabled(true)
        state = useEnvironmentStore.getState()
        expect(state.skyboxSelection).toBe('space_blue')
        expect(state.skyboxEnabled).toBe(true)
        expect(state.skyboxMode).toBe('classic')
        expect(state.skyboxTexture).toBe('space_blue')
      })
    })

    describe('procedural settings', () => {
      it('should merge procedural settings', () => {
        const { setProceduralSettings } = useEnvironmentStore.getState()

        const initial = useEnvironmentStore.getState().proceduralSettings

        setProceduralSettings({ scale: 2.0 })

        const updated = useEnvironmentStore.getState().proceduralSettings
        expect(updated.scale).toBe(2.0)
        // Other settings should be preserved
        expect(updated.complexity).toBe(initial.complexity)
      })

      it('ignores non-finite procedural numeric updates while applying valid fields', () => {
        const { setProceduralSettings } = useEnvironmentStore.getState()
        const initial = useEnvironmentStore.getState().proceduralSettings

        setProceduralSettings({
          scale: 2.2,
          hue: Number.NaN,
          saturation: Number.POSITIVE_INFINITY,
          sunPosition: [1, Number.NaN, 3],
          aurora: {
            curtainHeight: 0.75,
            waveFrequency: Number.NaN,
          },
          ocean: {
            causticIntensity: initial.ocean.causticIntensity,
            depthGradient: initial.ocean.depthGradient,
            bubbleDensity: 0.9,
            surfaceShimmer: Number.POSITIVE_INFINITY,
          },
          distribution: {
            power: 1.2,
            cycles: Number.NaN,
            offset: 0.25,
          },
          cosineCoefficients: {
            a: [0.1, 0.2, 0.3],
            b: [Number.POSITIVE_INFINITY, 0.2, 0.3],
            c: [0.4, 0.5, 0.6],
            d: [0.7, 0.8, 0.9],
          },
        })

        const updated = useEnvironmentStore.getState().proceduralSettings
        expect(updated.scale).toBe(2.2)
        expect(updated.hue).toBe(initial.hue)
        expect(updated.saturation).toBe(initial.saturation)

        expect(updated.sunPosition).toEqual(initial.sunPosition)

        expect(updated.aurora.curtainHeight).toBe(0.75)
        expect(updated.aurora.waveFrequency).toBe(initial.aurora.waveFrequency)

        expect(updated.ocean.bubbleDensity).toBe(0.9)
        expect(updated.ocean.surfaceShimmer).toBe(initial.ocean.surfaceShimmer)

        expect(updated.distribution.power).toBe(1.2)
        expect(updated.distribution.cycles).toBe(initial.distribution.cycles)
        expect(updated.distribution.offset).toBe(0.25)

        expect(updated.cosineCoefficients.a).toEqual([0.1, 0.2, 0.3])
        expect(updated.cosineCoefficients.b).toEqual(initial.cosineCoefficients.b)
        expect(updated.cosineCoefficients.c).toEqual([0.4, 0.5, 0.6])
        expect(updated.cosineCoefficients.d).toEqual([0.7, 0.8, 0.9])
      })
    })

    describe('background color', () => {
      it('should set background color', () => {
        const { setBackgroundColor } = useEnvironmentStore.getState()

        setBackgroundColor('#ff0000')
        expect(useEnvironmentStore.getState().backgroundColor).toBe('#ff0000')

        setBackgroundColor('#00ff00')
        expect(useEnvironmentStore.getState().backgroundColor).toBe('#00ff00')
      })
    })

    describe('version tracking', () => {
      it('should bump skybox version when skybox settings change', () => {
        const { setSkyboxIntensity } = useEnvironmentStore.getState()

        expect(useEnvironmentStore.getState().skyboxVersion).toBe(0)
        setSkyboxIntensity(2)
        expect(useEnvironmentStore.getState().skyboxVersion).toBe(1)
      })

      it('should bump all versions manually', () => {
        const { bumpAllVersions } = useEnvironmentStore.getState()

        expect(useEnvironmentStore.getState().skyboxVersion).toBe(0)
        bumpAllVersions()
        expect(useEnvironmentStore.getState().skyboxVersion).toBe(1)
      })
    })

    describe('reset', () => {
      it('should reset skybox settings to defaults', () => {
        const { setSkyboxSelection, setSkyboxIntensity, resetSkyboxSettings } =
          useEnvironmentStore.getState()

        setSkyboxSelection('space_blue')
        setSkyboxIntensity(5)

        resetSkyboxSettings()

        const state = useEnvironmentStore.getState()
        expect(state.skyboxSelection).toBe(SKYBOX_INITIAL_STATE.skyboxSelection)
        expect(state.skyboxEnabled).toBe(SKYBOX_INITIAL_STATE.skyboxEnabled)
        expect(state.skyboxMode).toBe(SKYBOX_INITIAL_STATE.skyboxMode)
        expect(state.skyboxTexture).toBe(SKYBOX_INITIAL_STATE.skyboxTexture)
        expect(state.skyboxIntensity).toBe(SKYBOX_INITIAL_STATE.skyboxIntensity)
      })

      it('should reset background color to default', () => {
        const { setBackgroundColor, resetSkyboxSettings } = useEnvironmentStore.getState()

        setBackgroundColor('#ff0000')

        resetSkyboxSettings()

        const state = useEnvironmentStore.getState()
        expect(state.backgroundColor).toBe(SKYBOX_INITIAL_STATE.backgroundColor)
      })
    })
  })
})
