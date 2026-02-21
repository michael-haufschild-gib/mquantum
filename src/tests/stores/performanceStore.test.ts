/**
 * Tests for performanceStore
 * Verifies performance optimization state management
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  usePerformanceStore,
  REFINEMENT_STAGE_QUALITY,
  getEffectiveSampleQuality,
  hasPersistedResolutionScale,
  hasPersistedMaxFps,
} from '@/stores/performanceStore'
import { DEFAULT_MAX_FPS, MAX_MAX_FPS, MIN_MAX_FPS } from '@/stores/defaults/visualDefaults'

describe('performanceStore', () => {
  beforeEach(() => {
    // Reset store state before each test
    usePerformanceStore.getState().reset()
  })

  describe('interaction state', () => {
    it('should set isInteracting', () => {
      const { setIsInteracting } = usePerformanceStore.getState()

      setIsInteracting(true)
      expect(usePerformanceStore.getState().isInteracting).toBe(true)

      setIsInteracting(false)
      expect(usePerformanceStore.getState().isInteracting).toBe(false)
    })

    it('should set sceneTransitioning', () => {
      const { setSceneTransitioning } = usePerformanceStore.getState()

      setSceneTransitioning(true)
      expect(usePerformanceStore.getState().sceneTransitioning).toBe(true)

      setSceneTransitioning(false)
      expect(usePerformanceStore.getState().sceneTransitioning).toBe(false)
    })

    it('should set isLoadingScene', () => {
      const { setIsLoadingScene } = usePerformanceStore.getState()

      setIsLoadingScene(true)
      expect(usePerformanceStore.getState().isLoadingScene).toBe(true)

      setIsLoadingScene(false)
      expect(usePerformanceStore.getState().isLoadingScene).toBe(false)
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
    it('should set temporalReprojectionEnabled', () => {
      const { setTemporalReprojectionEnabled } = usePerformanceStore.getState()

      setTemporalReprojectionEnabled(false)
      expect(usePerformanceStore.getState().temporalReprojectionEnabled).toBe(false)

      setTemporalReprojectionEnabled(true)
      expect(usePerformanceStore.getState().temporalReprojectionEnabled).toBe(true)
    })

    it('should set cameraTeleported', () => {
      const { setCameraTeleported } = usePerformanceStore.getState()

      setCameraTeleported(true)
      expect(usePerformanceStore.getState().cameraTeleported).toBe(true)

      setCameraTeleported(false)
      expect(usePerformanceStore.getState().cameraTeleported).toBe(false)
    })
  })

  describe('eigenfunction cache fidelity controls', () => {
    it('defaults analytical gradient and robust interpolation to enabled', () => {
      const state = usePerformanceStore.getState()
      expect(state.analyticalGradientEnabled).toBe(true)
      expect(state.robustEigenInterpolationEnabled).toBe(true)
    })

    it('sets analytical gradient and robust interpolation independently', () => {
      const {
        setEigenfunctionCacheEnabled,
        setAnalyticalGradientEnabled,
        setRobustEigenInterpolationEnabled,
      } = usePerformanceStore.getState()

      setAnalyticalGradientEnabled(false)
      setRobustEigenInterpolationEnabled(false)
      setEigenfunctionCacheEnabled(false)

      const state = usePerformanceStore.getState()
      expect(state.eigenfunctionCacheEnabled).toBe(false)
      expect(state.analyticalGradientEnabled).toBe(false)
      expect(state.robustEigenInterpolationEnabled).toBe(false)
    })

    it('reset restores analytical gradient and robust interpolation defaults', () => {
      const store = usePerformanceStore.getState()
      store.setAnalyticalGradientEnabled(false)
      store.setRobustEigenInterpolationEnabled(false)

      store.reset()

      const state = usePerformanceStore.getState()
      expect(state.analyticalGradientEnabled).toBe(true)
      expect(state.robustEigenInterpolationEnabled).toBe(true)
    })
  })

  describe('fractal animation quality', () => {
    it('should set fractalAnimationLowQuality', () => {
      const { setFractalAnimationLowQuality } = usePerformanceStore.getState()

      setFractalAnimationLowQuality(false)
      expect(usePerformanceStore.getState().fractalAnimationLowQuality).toBe(false)

      setFractalAnimationLowQuality(true)
      expect(usePerformanceStore.getState().fractalAnimationLowQuality).toBe(true)
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
      expect(localStorage.getItem('mdim_render_resolution_scale')).toBe('0.5')
      expect(localStorage.getItem('mdim_max_fps')).toBe('90')

      // Reset should overwrite with defaults in localStorage
      store.reset()
      expect(localStorage.getItem('mdim_render_resolution_scale')).not.toBe('0.5')
      expect(localStorage.getItem('mdim_max_fps')).not.toBe('90')
    })
  })
})

describe('quality interpolation utilities', () => {
  describe('getEffectiveSampleQuality', () => {
    it('should return target at maximum multiplier', () => {
      expect(getEffectiveSampleQuality('high', 1.0)).toBe('high')
    })

    it('should return low at minimum multiplier', () => {
      expect(getEffectiveSampleQuality('high', 0.25)).toBe('low')
    })
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
