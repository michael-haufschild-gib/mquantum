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

    describe('background blend mode', () => {
      it('should set background blend mode', () => {
        const { setBackgroundBlendMode } = useEnvironmentStore.getState()

        setBackgroundBlendMode('screen')
        expect(useEnvironmentStore.getState().backgroundBlendMode).toBe('screen')

        setBackgroundBlendMode('multiply')
        expect(useEnvironmentStore.getState().backgroundBlendMode).toBe('multiply')

        setBackgroundBlendMode('overlay')
        expect(useEnvironmentStore.getState().backgroundBlendMode).toBe('overlay')

        setBackgroundBlendMode('add')
        expect(useEnvironmentStore.getState().backgroundBlendMode).toBe('add')

        setBackgroundBlendMode('normal')
        expect(useEnvironmentStore.getState().backgroundBlendMode).toBe('normal')
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
        expect(state.skyboxIntensity).toBe(SKYBOX_INITIAL_STATE.skyboxIntensity)
      })

      it('should reset background color and blend mode to defaults', () => {
        const { setBackgroundColor, setBackgroundBlendMode, resetSkyboxSettings } =
          useEnvironmentStore.getState()

        setBackgroundColor('#ff0000')
        setBackgroundBlendMode('screen')

        resetSkyboxSettings()

        const state = useEnvironmentStore.getState()
        expect(state.backgroundColor).toBe(SKYBOX_INITIAL_STATE.backgroundColor)
        expect(state.backgroundBlendMode).toBe(SKYBOX_INITIAL_STATE.backgroundBlendMode)
      })
    })
  })
})
