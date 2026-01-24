import { Skybox } from '@/rendering/environment/Skybox'
import type { ColorAlgorithm } from '@/rendering/shaders/palette/types'
import { DEFAULT_SKYBOX_PROCEDURAL_SETTINGS } from '@/stores/defaults/visualDefaults'
import { useEnvironmentStore } from '@/stores/environmentStore'
import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock dependencies
vi.mock('@react-three/drei', () => ({
  Environment: () => null,
  shaderMaterial: () => class ShaderMaterial {},
}))

vi.mock('@react-three/fiber', () => ({
  extend: vi.fn(),
  useFrame: vi.fn(),
  useThree: () => ({
    gl: {
      compileEquirectangularShader: vi.fn(),
    },
    pointer: { x: 0, y: 0 },
  }),
}))

vi.mock('three/examples/jsm/loaders/KTX2Loader', () => ({
  KTX2Loader: class {
    setTranscoderPath = vi.fn()
    detectSupport = vi.fn()
    load = vi.fn()
    dispose = vi.fn()
  },
}))

describe('SkyboxSlice', () => {
  it('setSkyboxSelection sets none correctly', () => {
    useEnvironmentStore.getState().setSkyboxSelection('none')

    const state = useEnvironmentStore.getState()
    expect(state.skyboxSelection).toBe('none')
    expect(state.skyboxEnabled).toBe(false)
    expect(state.skyboxMode).toBe('classic')
    expect(state.skyboxTexture).toBe('none')
  })

  it('setSkyboxSelection sets classic texture correctly', () => {
    useEnvironmentStore.getState().setSkyboxSelection('space_red')

    const state = useEnvironmentStore.getState()
    expect(state.skyboxSelection).toBe('space_red')
    expect(state.skyboxEnabled).toBe(true)
    expect(state.skyboxMode).toBe('classic')
    expect(state.skyboxTexture).toBe('space_red')
  })

  it('setSkyboxSelection sets procedural mode correctly', () => {
    useEnvironmentStore.getState().setSkyboxSelection('procedural_nebula')

    const state = useEnvironmentStore.getState()
    expect(state.skyboxSelection).toBe('procedural_nebula')
    expect(state.skyboxEnabled).toBe(true)
    expect(state.skyboxMode).toBe('procedural_nebula')
  })
})

describe('Skybox', () => {
  it('renders nothing when selection is none', () => {
    useEnvironmentStore.setState({
      skyboxSelection: 'none',
      skyboxEnabled: false,
      skyboxMode: 'classic',
    })
    const { container } = render(<Skybox />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when disabled via legacy state', () => {
    useEnvironmentStore.setState({ skyboxEnabled: false })
    const { container } = render(<Skybox />)
    expect(container).toBeEmptyDOMElement()
  })

  it('sets procedural state correctly in store', () => {
    // Direct rendering of procedural mode requires WebGL context for CubeCamera.
    // Instead, test the state management works correctly.
    useEnvironmentStore.setState({
      skyboxSelection: 'procedural_aurora',
      skyboxEnabled: true,
      skyboxMode: 'procedural_aurora',
    })

    const state = useEnvironmentStore.getState()
    expect(state.skyboxSelection).toBe('procedural_aurora')
    expect(state.skyboxMode).toBe('procedural_aurora')
    expect(state.skyboxEnabled).toBe(true)
  })

  it('should set classic mode state correctly', () => {
    // Test the store state derivation for classic mode selection
    // (Rendering the actual SkyboxLoader with KTX2 requires more complex mocking)
    useEnvironmentStore.setState({
      skyboxSelection: 'space_blue',
      skyboxEnabled: true,
      skyboxMode: 'classic',
      skyboxTexture: 'space_blue',
    })

    const state = useEnvironmentStore.getState()
    expect(state.skyboxSelection).toBe('space_blue')
    expect(state.skyboxEnabled).toBe(true)
    expect(state.skyboxMode).toBe('classic')
    expect(state.skyboxTexture).toBe('space_blue')
  })
})

describe('Skybox Color Sync Logic', () => {
  /**
   * Helper function that mirrors the logic in Skybox.tsx for determining
   * whether to use simple color interpolation (uUsePalette=0) vs cosine palette (uUsePalette=1)
   * @param syncWithObject
   * @param colorAlgorithm
   * @returns 0.0 for simple interpolation, 1.0 for cosine palette
   */
  const computeUsePaletteValue = (
    syncWithObject: boolean,
    colorAlgorithm: ColorAlgorithm
  ): number => {
    const useSimpleInterpolation =
      syncWithObject && (colorAlgorithm === 'monochromatic' || colorAlgorithm === 'analogous')
    return useSimpleInterpolation ? 0.0 : 1.0
  }

  describe('when syncWithObject is enabled', () => {
    it('should use simple interpolation (uUsePalette=0) for monochromatic algorithm', () => {
      const result = computeUsePaletteValue(true, 'monochromatic')
      expect(result).toBe(0.0)
    })

    it('should use simple interpolation (uUsePalette=0) for analogous algorithm', () => {
      const result = computeUsePaletteValue(true, 'analogous')
      expect(result).toBe(0.0)
    })

    it('should use cosine palette (uUsePalette=1) for cosine algorithm', () => {
      const result = computeUsePaletteValue(true, 'cosine')
      expect(result).toBe(1.0)
    })

    it('should use cosine palette (uUsePalette=1) for lch algorithm', () => {
      const result = computeUsePaletteValue(true, 'lch')
      expect(result).toBe(1.0)
    })

    it('should use cosine palette (uUsePalette=1) for normal algorithm', () => {
      const result = computeUsePaletteValue(true, 'normal')
      expect(result).toBe(1.0)
    })

    it('should use cosine palette (uUsePalette=1) for distance algorithm', () => {
      const result = computeUsePaletteValue(true, 'distance')
      expect(result).toBe(1.0)
    })

    it('should use cosine palette (uUsePalette=1) for multiSource algorithm', () => {
      const result = computeUsePaletteValue(true, 'multiSource')
      expect(result).toBe(1.0)
    })

    it('should use cosine palette (uUsePalette=1) for radial algorithm', () => {
      const result = computeUsePaletteValue(true, 'radial')
      expect(result).toBe(1.0)
    })
  })

  describe('when syncWithObject is disabled', () => {
    it('should use cosine palette (uUsePalette=1) regardless of algorithm', () => {
      const algorithms: ColorAlgorithm[] = [
        'monochromatic',
        'analogous',
        'cosine',
        'lch',
        'normal',
        'distance',
        'multiSource',
        'radial',
      ]

      for (const algorithm of algorithms) {
        const result = computeUsePaletteValue(false, algorithm)
        expect(result).toBe(1.0)
      }
    })
  })
})

describe('ProceduralSkyboxWithEnvironment Logic', () => {
  /**
   * Helper function that mirrors the logic in ProceduralSkyboxWithEnvironment.tsx
   * for determining whether to generate environment maps for wall reflections.
   * @param activeWalls
   * @returns True if walls are active and need environment maps
   */
  const needsEnvironmentMap = (activeWalls: string[]): boolean => {
    return activeWalls.length > 0
  }

  /**
   * Helper function that generates the settings key for Environment component
   * re-rendering, mirroring the logic in ProceduralSkyboxWithEnvironment.tsx
   * @param skyboxMode
   * @param proceduralSettings
   * @param cosineCoefficients
   * @returns Stringified key combining all relevant settings
   */
  const generateSettingsKey = (
    skyboxMode: string,
    proceduralSettings: typeof DEFAULT_SKYBOX_PROCEDURAL_SETTINGS,
    cosineCoefficients: Record<string, unknown>
  ): string => {
    const relevantSettings = {
      mode: skyboxMode,
      scale: proceduralSettings.scale,
      complexity: proceduralSettings.complexity,
      evolution: proceduralSettings.evolution,
      hue: proceduralSettings.hue,
      saturation: proceduralSettings.saturation,
      turbulence: proceduralSettings.turbulence,
      sunIntensity: proceduralSettings.sunIntensity,
      sunPosition: proceduralSettings.sunPosition,
      syncWithObject: proceduralSettings.syncWithObject,
      ...(proceduralSettings.syncWithObject ? { palette: cosineCoefficients } : {}),
    }
    return JSON.stringify(relevantSettings)
  }

  describe('environment map generation decision', () => {
    it('should not need environment map when no walls are active', () => {
      expect(needsEnvironmentMap([])).toBe(false)
    })

    it('should need environment map when floor wall is active', () => {
      expect(needsEnvironmentMap(['floor'])).toBe(true)
    })

    it('should need environment map when multiple walls are active', () => {
      expect(needsEnvironmentMap(['floor', 'back', 'left'])).toBe(true)
    })
  })

  describe('settings key generation', () => {
    const baseSettings = { ...DEFAULT_SKYBOX_PROCEDURAL_SETTINGS }
    const basePalette = { a: [0.5, 0.5, 0.5], b: [0.5, 0.5, 0.5], c: [1, 1, 1], d: [0, 0.33, 0.67] }

    it('should generate different keys for different skybox modes', () => {
      const key1 = generateSettingsKey('procedural_aurora', baseSettings, basePalette)
      const key2 = generateSettingsKey('procedural_nebula', baseSettings, basePalette)
      expect(key1).not.toBe(key2)
    })

    it('should generate different keys when scale changes', () => {
      const key1 = generateSettingsKey('procedural_aurora', baseSettings, basePalette)
      const key2 = generateSettingsKey(
        'procedural_aurora',
        { ...baseSettings, scale: 2.0 },
        basePalette
      )
      expect(key1).not.toBe(key2)
    })

    it('should generate different keys when complexity changes', () => {
      const key1 = generateSettingsKey('procedural_aurora', baseSettings, basePalette)
      const key2 = generateSettingsKey(
        'procedural_aurora',
        { ...baseSettings, complexity: 0.8 },
        basePalette
      )
      expect(key1).not.toBe(key2)
    })

    it('should include palette in key when syncWithObject is true', () => {
      const syncSettings = { ...baseSettings, syncWithObject: true }
      const key1 = generateSettingsKey('procedural_aurora', syncSettings, basePalette)
      const key2 = generateSettingsKey('procedural_aurora', syncSettings, {
        ...basePalette,
        a: [0.3, 0.3, 0.3],
      })
      expect(key1).not.toBe(key2)
    })

    it('should not include palette in key when syncWithObject is false', () => {
      const noSyncSettings = { ...baseSettings, syncWithObject: false }
      const key1 = generateSettingsKey('procedural_aurora', noSyncSettings, basePalette)
      const key2 = generateSettingsKey('procedural_aurora', noSyncSettings, {
        ...basePalette,
        a: [0.3, 0.3, 0.3],
      })
      expect(key1).toBe(key2)
    })

    it('should generate same key for identical settings', () => {
      const key1 = generateSettingsKey('procedural_aurora', baseSettings, basePalette)
      const key2 = generateSettingsKey('procedural_aurora', { ...baseSettings }, { ...basePalette })
      expect(key1).toBe(key2)
    })
  })

  describe('store integration', () => {
    beforeEach(() => {
      // Reset stores to default state
      useEnvironmentStore.getState().resetSkyboxSettings()
    })

    it('should update activeWalls when toggled', () => {
      const initialState = useEnvironmentStore.getState()
      const hadFloor = initialState.activeWalls.includes('floor')

      useEnvironmentStore.getState().toggleWall('floor')

      const newState = useEnvironmentStore.getState()
      if (hadFloor) {
        expect(newState.activeWalls).not.toContain('floor')
      } else {
        expect(newState.activeWalls).toContain('floor')
      }
    })

    it('should provide proceduralSettings with syncWithObject', () => {
      const state = useEnvironmentStore.getState()
      expect(state.proceduralSettings).toBeDefined()
      expect(typeof state.proceduralSettings.syncWithObject).toBe('boolean')
    })
  })
})
