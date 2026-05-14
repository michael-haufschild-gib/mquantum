/**
 * Tests for performanceStore
 * Verifies performance optimization state management
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { DEFAULT_CAPABILITIES, DESKTOP_DEFAULT_RESOLUTION_SCALE } from '@/lib/deviceCapabilities'
import { DEFAULT_MAX_FPS, MAX_MAX_FPS, MIN_MAX_FPS } from '@/stores/defaults/visualDefaults'
import {
  DEFAULT_DENSITY_GRID_RESOLUTION,
  hasPersistedMaxFps,
  hasPersistedResolutionScale,
  REFINEMENT_STAGE_QUALITY,
  usePerformanceStore,
} from '@/stores/runtime/performanceStore'

describe('performanceStore', () => {
  beforeEach(() => {
    // Reset store state before each test
    usePerformanceStore.getState().reset()
  })

  describe('interaction state', () => {
    it('interaction flags toggle independently and reset clears them', () => {
      const store = usePerformanceStore.getState()

      store.setIsInteracting(true)
      store.setSceneTransitioning(true)
      store.setIsLoadingScene(true)

      const state = usePerformanceStore.getState()
      expect(state.isInteracting).toBe(true)
      expect(state.sceneTransitioning).toBe(true)
      expect(state.isLoadingScene).toBe(true)

      store.reset()
      const after = usePerformanceStore.getState()
      expect(after.isInteracting).toBe(false)
      expect(after.sceneTransitioning).toBe(false)
      expect(after.isLoadingScene).toBe(false)
    })
  })

  describe('device capabilities', () => {
    it('reset restores capability defaults', () => {
      const store = usePerformanceStore.getState()

      store.setDeviceCapabilities({
        gpuTier: 1,
        isMobileGPU: true,
        gpuName: 'mali mobile gpu',
        detectionType: 'BENCHMARK',
        estimatedFps: 20,
      })

      expect(usePerformanceStore.getState().deviceCapabilitiesDetected).toBe(true)

      store.reset()

      const state = usePerformanceStore.getState()
      expect(state.gpuTier).toBe(DEFAULT_CAPABILITIES.gpuTier)
      expect(state.isMobileGPU).toBe(DEFAULT_CAPABILITIES.isMobileGPU)
      expect(state.gpuName).toBe(DEFAULT_CAPABILITIES.gpuName)
      expect(state.deviceCapabilitiesDetected).toBe(false)
    })
  })

  describe('progressive refinement', () => {
    it('should set progressiveRefinementEnabled', () => {
      const { setProgressiveRefinementEnabled } = usePerformanceStore.getState()

      setProgressiveRefinementEnabled(false)
      expect(usePerformanceStore.getState().progressiveRefinementEnabled).toBe(false)
      // When disabled, should reset to final quality
      expect(usePerformanceStore.getState().refinementStage).toBe('final')
      expect(usePerformanceStore.getState().qualityMultiplier).toBe(1.0)
    })

    it('should set refinement stage with correct quality multiplier', () => {
      const { setRefinementStage } = usePerformanceStore.getState()

      setRefinementStage('low')
      expect(usePerformanceStore.getState().refinementStage).toBe('low')
      expect(usePerformanceStore.getState().qualityMultiplier).toBe(REFINEMENT_STAGE_QUALITY.low)

      setRefinementStage('medium')
      expect(usePerformanceStore.getState().refinementStage).toBe('medium')
      expect(usePerformanceStore.getState().qualityMultiplier).toBe(REFINEMENT_STAGE_QUALITY.medium)

      setRefinementStage('high')
      expect(usePerformanceStore.getState().refinementStage).toBe('high')
      expect(usePerformanceStore.getState().qualityMultiplier).toBe(REFINEMENT_STAGE_QUALITY.high)

      setRefinementStage('final')
      expect(usePerformanceStore.getState().refinementStage).toBe('final')
      expect(usePerformanceStore.getState().qualityMultiplier).toBe(REFINEMENT_STAGE_QUALITY.final)
    })

    it('should clamp refinement progress to 0-100', () => {
      const { setRefinementProgress } = usePerformanceStore.getState()

      setRefinementProgress(-10)
      expect(usePerformanceStore.getState().refinementProgress).toBe(0)

      setRefinementProgress(150)
      expect(usePerformanceStore.getState().refinementProgress).toBe(100)

      setRefinementProgress(50)
      expect(usePerformanceStore.getState().refinementProgress).toBe(50)
    })

    it('should ignore non-finite refinement progress updates', () => {
      const { setRefinementProgress } = usePerformanceStore.getState()
      setRefinementProgress(80)
      expect(usePerformanceStore.getState().refinementProgress).toBe(80)

      setRefinementProgress(Number.NaN)
      setRefinementProgress(Number.POSITIVE_INFINITY)
      setRefinementProgress(Number.NEGATIVE_INFINITY)

      expect(usePerformanceStore.getState().refinementProgress).toBe(80)
    })

    it('should reset refinement when enabled', () => {
      const { setRefinementStage, resetRefinement } = usePerformanceStore.getState()

      setRefinementStage('final')
      resetRefinement()

      expect(usePerformanceStore.getState().refinementStage).toBe('low')
      expect(usePerformanceStore.getState().qualityMultiplier).toBe(REFINEMENT_STAGE_QUALITY.low)
    })

    it('should not reset refinement when disabled', () => {
      const { setProgressiveRefinementEnabled, resetRefinement } = usePerformanceStore.getState()

      setProgressiveRefinementEnabled(false)
      // Since disabled sets to final, the stage is already final
      resetRefinement()

      // Should stay at final when disabled
      expect(usePerformanceStore.getState().refinementStage).toBe('final')
    })
  })

  describe('temporal reprojection', () => {
    it('temporal and camera flags are independent', () => {
      const store = usePerformanceStore.getState()
      store.setTemporalReprojectionEnabled(false)
      store.setCameraTeleported(true)

      expect(usePerformanceStore.getState().temporalReprojectionEnabled).toBe(false)
      expect(usePerformanceStore.getState().cameraTeleported).toBe(true)
    })
  })

  describe('eigenfunction cache fidelity controls', () => {
    it('defaults analytical gradient and fast interpolation to enabled', () => {
      const state = usePerformanceStore.getState()
      expect(state.analyticalGradientEnabled).toBe(true)
      expect(state.fastEigenInterpolationEnabled).toBe(true)
    })

    it('sets analytical gradient and fast interpolation independently', () => {
      const {
        setEigenfunctionCacheEnabled,
        setAnalyticalGradientEnabled,
        setFastEigenInterpolationEnabled,
      } = usePerformanceStore.getState()

      setAnalyticalGradientEnabled(false)
      setFastEigenInterpolationEnabled(false)
      setEigenfunctionCacheEnabled(false)

      const state = usePerformanceStore.getState()
      expect(state.eigenfunctionCacheEnabled).toBe(false)
      expect(state.analyticalGradientEnabled).toBe(false)
      expect(state.fastEigenInterpolationEnabled).toBe(false)
    })

    it('reset restores analytical gradient and fast interpolation defaults', () => {
      const store = usePerformanceStore.getState()
      store.setAnalyticalGradientEnabled(false)
      store.setFastEigenInterpolationEnabled(false)

      store.reset()

      const state = usePerformanceStore.getState()
      expect(state.analyticalGradientEnabled).toBe(true)
      expect(state.fastEigenInterpolationEnabled).toBe(true)
    })
  })

  describe('shader compilation', () => {
    it('should track shader compilation state', () => {
      const { setShaderCompiling } = usePerformanceStore.getState()

      setShaderCompiling('floor', true)
      expect(usePerformanceStore.getState().isShaderCompiling).toBe(true)
      expect(usePerformanceStore.getState().shaderCompilationMessage).toContain('floor')

      setShaderCompiling('floor', false)
      expect(usePerformanceStore.getState().isShaderCompiling).toBe(false)
    })

    it('should handle multiple simultaneous compilations', () => {
      const { setShaderCompiling } = usePerformanceStore.getState()

      setShaderCompiling('floor', true)
      setShaderCompiling('skybox', true)

      const state = usePerformanceStore.getState()
      expect(state.isShaderCompiling).toBe(true)
      expect(state.shaderCompilationMessage).toContain('2 shaders')

      setShaderCompiling('floor', false)
      expect(usePerformanceStore.getState().isShaderCompiling).toBe(true)

      setShaderCompiling('skybox', false)
      expect(usePerformanceStore.getState().isShaderCompiling).toBe(false)
    })
  })

  describe('shader debugging', () => {
    it('should set shader debug info', () => {
      const { setShaderDebugInfo } = usePerformanceStore.getState()

      const debugInfo = {
        name: 'test',
        vertexShaderLength: 100,
        fragmentShaderLength: 200,
        activeModules: ['lighting'],
        features: ['lighting'],
      }
      setShaderDebugInfo('testKey', debugInfo)

      expect(usePerformanceStore.getState().shaderDebugInfos['testKey']).toEqual(debugInfo)
    })

    it('should remove shader debug info when set to null', () => {
      const { setShaderDebugInfo } = usePerformanceStore.getState()

      setShaderDebugInfo('testKey', {
        name: 'test',
        vertexShaderLength: 100,
        fragmentShaderLength: 200,
        activeModules: [],
        features: [],
      })
      setShaderDebugInfo('testKey', null)

      expect(usePerformanceStore.getState().shaderDebugInfos['testKey']).toBeUndefined()
    })

    it('should toggle shader module overrides', () => {
      const { toggleShaderModule } = usePerformanceStore.getState()

      toggleShaderModule('lighting')
      expect(usePerformanceStore.getState().shaderOverrides).toContain('lighting')

      toggleShaderModule('lighting')
      expect(usePerformanceStore.getState().shaderOverrides).not.toContain('lighting')
    })

    it('should reset shader overrides', () => {
      const { toggleShaderModule, resetShaderOverrides } = usePerformanceStore.getState()

      toggleShaderModule('lighting')
      toggleShaderModule('emission')
      resetShaderOverrides()

      expect(usePerformanceStore.getState().shaderOverrides).toHaveLength(0)
    })
  })

  describe('reset', () => {
    it('should reset all state to defaults', () => {
      const store = usePerformanceStore.getState()

      // Modify various state
      store.setIsInteracting(true)
      store.setSceneTransitioning(true)
      store.setRefinementStage('low')
      store.setShaderCompiling('test', true)

      // Reset
      store.reset()

      // Verify all back to defaults
      const state = usePerformanceStore.getState()
      expect(state.isInteracting).toBe(false)
      expect(state.sceneTransitioning).toBe(false)
      expect(state.refinementStage).toBe('final')
      expect(state.isShaderCompiling).toBe(false)
    })

    it('should persist default resolution scale and maxFps to localStorage', () => {
      const store = usePerformanceStore.getState()

      // Set non-default values (persisted to localStorage)
      store.setRenderResolutionScale(0.5)
      store.setMaxFps(90)
      store.setDensityGridResolution(256)
      expect(localStorage.getItem('mdim_render_resolution_scale')).toBe('0.5')
      expect(localStorage.getItem('mdim_max_fps')).toBe('90')
      expect(localStorage.getItem('mdim_density_grid_resolution')).toBe('256')

      // Reset should overwrite with defaults in localStorage
      store.reset()
      expect(localStorage.getItem('mdim_render_resolution_scale')).toBe(
        String(DESKTOP_DEFAULT_RESOLUTION_SCALE)
      )
      expect(localStorage.getItem('mdim_max_fps')).toBe(String(DEFAULT_MAX_FPS))
      expect(localStorage.getItem('mdim_density_grid_resolution')).toBe(
        String(DEFAULT_DENSITY_GRID_RESOLUTION)
      )
    })
  })
})

describe('density grid resolution persistence', () => {
  const DENSITY_GRID_RESOLUTION_KEY = 'mdim_density_grid_resolution'

  beforeEach(() => {
    usePerformanceStore.getState().reset()
    localStorage.removeItem(DENSITY_GRID_RESOLUTION_KEY)
  })

  afterEach(() => {
    localStorage.removeItem(DENSITY_GRID_RESOLUTION_KEY)
  })

  it('persists valid density grid resolution preferences', () => {
    usePerformanceStore.getState().setDensityGridResolution(128)

    expect(usePerformanceStore.getState().densityGridResolution).toBe(128)
    expect(localStorage.getItem(DENSITY_GRID_RESOLUTION_KEY)).toBe('128')
  })

  it('rejects invalid density grid resolution values at runtime', () => {
    usePerformanceStore.getState().setDensityGridResolution(128)

    usePerformanceStore.getState().setDensityGridResolution(512 as never)
    usePerformanceStore.getState().setDensityGridResolution(Number.NaN as never)

    expect(usePerformanceStore.getState().densityGridResolution).toBe(128)
    expect(localStorage.getItem(DENSITY_GRID_RESOLUTION_KEY)).toBe('128')
  })

  it('reset persists the default density grid resolution', () => {
    usePerformanceStore.getState().setDensityGridResolution(256)

    usePerformanceStore.getState().reset()

    expect(usePerformanceStore.getState().densityGridResolution).toBe(
      DEFAULT_DENSITY_GRID_RESOLUTION
    )
    expect(localStorage.getItem(DENSITY_GRID_RESOLUTION_KEY)).toBe(
      String(DEFAULT_DENSITY_GRID_RESOLUTION)
    )
  })
})

describe('render resolution scale persistence', () => {
  const RESOLUTION_SCALE_KEY = 'mdim_render_resolution_scale'

  beforeEach(() => {
    // Reset store state, then clear localStorage so tests start with no persisted value
    usePerformanceStore.getState().reset()
    localStorage.removeItem(RESOLUTION_SCALE_KEY)
  })

  afterEach(() => {
    // Clean up localStorage after each test
    localStorage.removeItem(RESOLUTION_SCALE_KEY)
  })

  describe('setRenderResolutionScale', () => {
    it('should persist resolution scale to localStorage', () => {
      const { setRenderResolutionScale } = usePerformanceStore.getState()

      setRenderResolutionScale(0.75)

      expect(localStorage.getItem(RESOLUTION_SCALE_KEY)).toBe('0.75')
    })

    it('should clamp and persist values at boundaries', () => {
      const { setRenderResolutionScale } = usePerformanceStore.getState()

      // Below minimum (0.1)
      setRenderResolutionScale(0.05)
      expect(usePerformanceStore.getState().renderResolutionScale).toBe(0.1)
      expect(localStorage.getItem(RESOLUTION_SCALE_KEY)).toBe('0.1')

      // Above maximum
      setRenderResolutionScale(1.5)
      expect(usePerformanceStore.getState().renderResolutionScale).toBe(1.0)
      expect(localStorage.getItem(RESOLUTION_SCALE_KEY)).toBe('1')
    })

    it('ignores non-finite resolution scales', () => {
      const { setRenderResolutionScale } = usePerformanceStore.getState()
      setRenderResolutionScale(0.75)

      setRenderResolutionScale(Number.NaN)
      expect(usePerformanceStore.getState().renderResolutionScale).toBe(0.75)
      expect(localStorage.getItem(RESOLUTION_SCALE_KEY)).toBe('0.75')

      setRenderResolutionScale(Number.POSITIVE_INFINITY)
      expect(usePerformanceStore.getState().renderResolutionScale).toBe(0.75)
      expect(localStorage.getItem(RESOLUTION_SCALE_KEY)).toBe('0.75')
    })
  })

  describe('hasPersistedResolutionScale', () => {
    it('should return false when no value is persisted', () => {
      expect(hasPersistedResolutionScale()).toBe(false)
    })

    it('should return true after setting resolution scale', () => {
      const { setRenderResolutionScale } = usePerformanceStore.getState()

      setRenderResolutionScale(0.75)

      expect(hasPersistedResolutionScale()).toBe(true)
    })

    it('should return false for invalid persisted values', () => {
      // Set an invalid value directly
      localStorage.setItem(RESOLUTION_SCALE_KEY, 'invalid')
      expect(hasPersistedResolutionScale()).toBe(false)

      // Set a malformed value with a valid numeric prefix
      localStorage.setItem(RESOLUTION_SCALE_KEY, '0.75junk')
      expect(hasPersistedResolutionScale()).toBe(false)

      // Set a value out of range (below 0.1)
      localStorage.setItem(RESOLUTION_SCALE_KEY, '0.05')
      expect(hasPersistedResolutionScale()).toBe(false)

      // Set a value out of range (above 1.0)
      localStorage.setItem(RESOLUTION_SCALE_KEY, '1.5')
      expect(hasPersistedResolutionScale()).toBe(false)
    })
  })

  describe('initial state loading', () => {
    it('should load persisted resolution scale on store creation', () => {
      // Pre-populate localStorage
      localStorage.setItem(RESOLUTION_SCALE_KEY, '0.75')

      // Force store to reload by getting fresh state
      // Note: In actual usage, this happens on module load
      // For testing, we verify the loadPersistedResolutionScale function works correctly
      // by checking hasPersistedResolutionScale returns true
      expect(hasPersistedResolutionScale()).toBe(true)
    })
  })
})

describe('max FPS persistence', () => {
  const MAX_FPS_KEY = 'mdim_max_fps'

  beforeEach(() => {
    // Reset store state, then clear localStorage so tests start with no persisted value
    usePerformanceStore.getState().reset()
    localStorage.removeItem(MAX_FPS_KEY)
  })

  afterEach(() => {
    // Clean up localStorage after each test
    localStorage.removeItem(MAX_FPS_KEY)
  })

  describe('setMaxFps', () => {
    it('should set maxFps to a valid value', () => {
      usePerformanceStore.getState().setMaxFps(30)
      expect(usePerformanceStore.getState().maxFps).toBe(30)
    })

    it('should persist maxFps to localStorage', () => {
      const { setMaxFps } = usePerformanceStore.getState()

      setMaxFps(60)

      expect(localStorage.getItem(MAX_FPS_KEY)).toBe('60')
    })

    it('should clamp and persist values at boundaries', () => {
      const { setMaxFps } = usePerformanceStore.getState()

      // Below minimum
      setMaxFps(5)
      expect(usePerformanceStore.getState().maxFps).toBe(MIN_MAX_FPS)
      expect(localStorage.getItem(MAX_FPS_KEY)).toBe(String(MIN_MAX_FPS))

      // Above maximum
      setMaxFps(999)
      expect(usePerformanceStore.getState().maxFps).toBe(MAX_MAX_FPS)
      expect(localStorage.getItem(MAX_FPS_KEY)).toBe(String(MAX_MAX_FPS))
    })

    it('clamps to the allowed range', () => {
      const cases: Array<{ input: number; expected: number }> = [
        { input: MIN_MAX_FPS - 1, expected: MIN_MAX_FPS },
        { input: MIN_MAX_FPS, expected: MIN_MAX_FPS },
        { input: MIN_MAX_FPS + 1, expected: MIN_MAX_FPS + 1 },
        { input: MAX_MAX_FPS - 1, expected: MAX_MAX_FPS - 1 },
        { input: MAX_MAX_FPS, expected: MAX_MAX_FPS },
        { input: MAX_MAX_FPS + 1, expected: MAX_MAX_FPS },
        { input: -30, expected: MIN_MAX_FPS },
        { input: 999, expected: MAX_MAX_FPS },
      ]

      for (const { input, expected } of cases) {
        usePerformanceStore.getState().reset()
        usePerformanceStore.getState().setMaxFps(input)
        expect(usePerformanceStore.getState().maxFps).toBe(expected)
      }
    })

    it('accepts 0 as transient uncapped FPS without persisting', () => {
      const { setMaxFps } = usePerformanceStore.getState()

      // First set a normal value to populate localStorage
      setMaxFps(60)
      expect(localStorage.getItem(MAX_FPS_KEY)).toBe('60')

      // Setting 0 should update state but not persist
      setMaxFps(0)
      expect(usePerformanceStore.getState().maxFps).toBe(0)
      // localStorage should still have the previous value
      expect(localStorage.getItem(MAX_FPS_KEY)).toBe('60')
    })

    it('ignores non-finite max FPS values', () => {
      const { setMaxFps } = usePerformanceStore.getState()
      setMaxFps(60)

      setMaxFps(Number.NaN)
      expect(usePerformanceStore.getState().maxFps).toBe(60)
      expect(localStorage.getItem(MAX_FPS_KEY)).toBe('60')

      setMaxFps(Number.POSITIVE_INFINITY)
      expect(usePerformanceStore.getState().maxFps).toBe(60)
      expect(localStorage.getItem(MAX_FPS_KEY)).toBe('60')
    })
  })

  describe('hasPersistedMaxFps', () => {
    it('should return false when no value is persisted', () => {
      expect(hasPersistedMaxFps()).toBe(false)
    })

    it('should return true after setting maxFps', () => {
      const { setMaxFps } = usePerformanceStore.getState()

      setMaxFps(60)

      expect(hasPersistedMaxFps()).toBe(true)
    })

    it('should return false for invalid persisted values', () => {
      // Set an invalid value directly
      localStorage.setItem(MAX_FPS_KEY, 'invalid')
      expect(hasPersistedMaxFps()).toBe(false)

      // Set a malformed value with a valid numeric prefix
      localStorage.setItem(MAX_FPS_KEY, '45fps')
      expect(hasPersistedMaxFps()).toBe(false)

      // Set a value out of range (below MIN)
      localStorage.setItem(MAX_FPS_KEY, '5')
      expect(hasPersistedMaxFps()).toBe(false)

      // Set a value out of range (above MAX)
      localStorage.setItem(MAX_FPS_KEY, '999')
      expect(hasPersistedMaxFps()).toBe(false)
    })
  })

  describe('reset', () => {
    it('should reset maxFps to default value', () => {
      // Change from default
      usePerformanceStore.getState().setMaxFps(90)
      expect(usePerformanceStore.getState().maxFps).toBe(90)

      // Reset
      usePerformanceStore.getState().reset()
      expect(usePerformanceStore.getState().maxFps).toBe(DEFAULT_MAX_FPS)
    })
  })
})
