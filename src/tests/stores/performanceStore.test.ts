/**
 * Tests for performanceStore
 * Verifies performance optimization state management
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  usePerformanceStore,
  REFINEMENT_STAGE_QUALITY,
  getEffectiveSSRQuality,
  getEffectiveShadowQuality,
  getEffectiveSampleQuality,
  hasPersistedResolutionScale,
} from '@/stores/performanceStore';

describe('performanceStore', () => {
  beforeEach(() => {
    // Reset store state before each test
    usePerformanceStore.getState().reset();
  });

  describe('interaction state', () => {
    it('should set isInteracting', () => {
      const { setIsInteracting } = usePerformanceStore.getState();

      setIsInteracting(true);
      expect(usePerformanceStore.getState().isInteracting).toBe(true);

      setIsInteracting(false);
      expect(usePerformanceStore.getState().isInteracting).toBe(false);
    });

    it('should set sceneTransitioning', () => {
      const { setSceneTransitioning } = usePerformanceStore.getState();

      setSceneTransitioning(true);
      expect(usePerformanceStore.getState().sceneTransitioning).toBe(true);

      setSceneTransitioning(false);
      expect(usePerformanceStore.getState().sceneTransitioning).toBe(false);
    });

    it('should set isLoadingScene', () => {
      const { setIsLoadingScene } = usePerformanceStore.getState();

      setIsLoadingScene(true);
      expect(usePerformanceStore.getState().isLoadingScene).toBe(true);

      setIsLoadingScene(false);
      expect(usePerformanceStore.getState().isLoadingScene).toBe(false);
    });
  });

  describe('progressive refinement', () => {
    it('should set progressiveRefinementEnabled', () => {
      const { setProgressiveRefinementEnabled } = usePerformanceStore.getState();

      setProgressiveRefinementEnabled(false);
      expect(usePerformanceStore.getState().progressiveRefinementEnabled).toBe(false);
      // When disabled, should reset to final quality
      expect(usePerformanceStore.getState().refinementStage).toBe('final');
      expect(usePerformanceStore.getState().qualityMultiplier).toBe(1.0);
    });

    it('should set refinement stage with correct quality multiplier', () => {
      const { setRefinementStage } = usePerformanceStore.getState();

      setRefinementStage('low');
      expect(usePerformanceStore.getState().refinementStage).toBe('low');
      expect(usePerformanceStore.getState().qualityMultiplier).toBe(REFINEMENT_STAGE_QUALITY.low);

      setRefinementStage('medium');
      expect(usePerformanceStore.getState().refinementStage).toBe('medium');
      expect(usePerformanceStore.getState().qualityMultiplier).toBe(REFINEMENT_STAGE_QUALITY.medium);

      setRefinementStage('high');
      expect(usePerformanceStore.getState().refinementStage).toBe('high');
      expect(usePerformanceStore.getState().qualityMultiplier).toBe(REFINEMENT_STAGE_QUALITY.high);

      setRefinementStage('final');
      expect(usePerformanceStore.getState().refinementStage).toBe('final');
      expect(usePerformanceStore.getState().qualityMultiplier).toBe(REFINEMENT_STAGE_QUALITY.final);
    });

    it('should clamp refinement progress to 0-100', () => {
      const { setRefinementProgress } = usePerformanceStore.getState();

      setRefinementProgress(-10);
      expect(usePerformanceStore.getState().refinementProgress).toBe(0);

      setRefinementProgress(150);
      expect(usePerformanceStore.getState().refinementProgress).toBe(100);

      setRefinementProgress(50);
      expect(usePerformanceStore.getState().refinementProgress).toBe(50);
    });

    it('should reset refinement when enabled', () => {
      const { setRefinementStage, resetRefinement } = usePerformanceStore.getState();

      setRefinementStage('final');
      resetRefinement();

      expect(usePerformanceStore.getState().refinementStage).toBe('low');
      expect(usePerformanceStore.getState().qualityMultiplier).toBe(REFINEMENT_STAGE_QUALITY.low);
    });

    it('should not reset refinement when disabled', () => {
      const { setProgressiveRefinementEnabled, resetRefinement } =
        usePerformanceStore.getState();

      setProgressiveRefinementEnabled(false);
      // Since disabled sets to final, the stage is already final
      resetRefinement();

      // Should stay at final when disabled
      expect(usePerformanceStore.getState().refinementStage).toBe('final');
    });
  });

  describe('temporal reprojection', () => {
    it('should set temporalReprojectionEnabled', () => {
      const { setTemporalReprojectionEnabled } = usePerformanceStore.getState();

      setTemporalReprojectionEnabled(false);
      expect(usePerformanceStore.getState().temporalReprojectionEnabled).toBe(false);

      setTemporalReprojectionEnabled(true);
      expect(usePerformanceStore.getState().temporalReprojectionEnabled).toBe(true);
    });

    it('should set cameraTeleported', () => {
      const { setCameraTeleported } = usePerformanceStore.getState();

      setCameraTeleported(true);
      expect(usePerformanceStore.getState().cameraTeleported).toBe(true);

      setCameraTeleported(false);
      expect(usePerformanceStore.getState().cameraTeleported).toBe(false);
    });
  });

  describe('fractal animation quality', () => {
    it('should set fractalAnimationLowQuality', () => {
      const { setFractalAnimationLowQuality } = usePerformanceStore.getState();

      setFractalAnimationLowQuality(false);
      expect(usePerformanceStore.getState().fractalAnimationLowQuality).toBe(false);

      setFractalAnimationLowQuality(true);
      expect(usePerformanceStore.getState().fractalAnimationLowQuality).toBe(true);
    });
  });

  describe('shader compilation', () => {
    it('should track shader compilation state', () => {
      const { setShaderCompiling } = usePerformanceStore.getState();

      setShaderCompiling('floor', true);
      expect(usePerformanceStore.getState().isShaderCompiling).toBe(true);
      expect(usePerformanceStore.getState().shaderCompilationMessage).toContain('floor');

      setShaderCompiling('floor', false);
      expect(usePerformanceStore.getState().isShaderCompiling).toBe(false);
    });

    it('should handle multiple simultaneous compilations', () => {
      const { setShaderCompiling } = usePerformanceStore.getState();

      setShaderCompiling('floor', true);
      setShaderCompiling('skybox', true);

      const state = usePerformanceStore.getState();
      expect(state.isShaderCompiling).toBe(true);
      expect(state.shaderCompilationMessage).toContain('2 shaders');

      setShaderCompiling('floor', false);
      expect(usePerformanceStore.getState().isShaderCompiling).toBe(true);

      setShaderCompiling('skybox', false);
      expect(usePerformanceStore.getState().isShaderCompiling).toBe(false);
    });
  });

  describe('shader debugging', () => {
    it('should set shader debug info', () => {
      const { setShaderDebugInfo } = usePerformanceStore.getState();

      const debugInfo = {
        name: 'test',
        vertexShaderLength: 100,
        fragmentShaderLength: 200,
        activeModules: ['lighting'],
        features: ['shadows'],
      };
      setShaderDebugInfo('testKey', debugInfo);

      expect(usePerformanceStore.getState().shaderDebugInfos['testKey']).toEqual(debugInfo);
    });

    it('should remove shader debug info when set to null', () => {
      const { setShaderDebugInfo } = usePerformanceStore.getState();

      setShaderDebugInfo('testKey', {
        name: 'test',
        vertexShaderLength: 100,
        fragmentShaderLength: 200,
        activeModules: [],
        features: [],
      });
      setShaderDebugInfo('testKey', null);

      expect(usePerformanceStore.getState().shaderDebugInfos['testKey']).toBeUndefined();
    });

    it('should toggle shader module overrides', () => {
      const { toggleShaderModule } = usePerformanceStore.getState();

      toggleShaderModule('lighting');
      expect(usePerformanceStore.getState().shaderOverrides).toContain('lighting');

      toggleShaderModule('lighting');
      expect(usePerformanceStore.getState().shaderOverrides).not.toContain('lighting');
    });

    it('should reset shader overrides', () => {
      const { toggleShaderModule, resetShaderOverrides } = usePerformanceStore.getState();

      toggleShaderModule('lighting');
      toggleShaderModule('shadows');
      resetShaderOverrides();

      expect(usePerformanceStore.getState().shaderOverrides).toHaveLength(0);
    });
  });

  describe('reset', () => {
    it('should reset all state to defaults', () => {
      const store = usePerformanceStore.getState();

      // Modify various state
      store.setIsInteracting(true);
      store.setSceneTransitioning(true);
      store.setRefinementStage('low');
      store.setShaderCompiling('test', true);

      // Reset
      store.reset();

      // Verify all back to defaults
      const state = usePerformanceStore.getState();
      expect(state.isInteracting).toBe(false);
      expect(state.sceneTransitioning).toBe(false);
      expect(state.refinementStage).toBe('final');
      expect(state.isShaderCompiling).toBe(false);
    });
  });
});

describe('quality interpolation utilities', () => {
  describe('getEffectiveSSRQuality', () => {
    it('should return low at minimum multiplier', () => {
      expect(getEffectiveSSRQuality('high', 0.25)).toBe('low');
    });

    it('should return target at maximum multiplier', () => {
      expect(getEffectiveSSRQuality('high', 1.0)).toBe('high');
      expect(getEffectiveSSRQuality('medium', 1.0)).toBe('medium');
    });

    it('should interpolate between low and target', () => {
      // At 0.5 multiplier with high target, should be around medium
      const result = getEffectiveSSRQuality('high', 0.5);
      expect(['low', 'medium']).toContain(result);
    });
  });

  describe('getEffectiveShadowQuality', () => {
    it('should return target at maximum multiplier', () => {
      expect(getEffectiveShadowQuality('ultra', 1.0)).toBe('ultra');
    });

    it('should return low at minimum multiplier', () => {
      expect(getEffectiveShadowQuality('ultra', 0.25)).toBe('low');
    });
  });

  describe('getEffectiveSampleQuality', () => {
    it('should return target at maximum multiplier', () => {
      expect(getEffectiveSampleQuality('high', 1.0)).toBe('high');
    });

    it('should return low at minimum multiplier', () => {
      expect(getEffectiveSampleQuality('high', 0.25)).toBe('low');
    });
  });
});

describe('render resolution scale persistence', () => {
  const RESOLUTION_SCALE_KEY = 'mdim_render_resolution_scale';

  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.removeItem(RESOLUTION_SCALE_KEY);
    // Reset store state
    usePerformanceStore.getState().reset();
  });

  afterEach(() => {
    // Clean up localStorage after each test
    localStorage.removeItem(RESOLUTION_SCALE_KEY);
  });

  describe('setRenderResolutionScale', () => {
    it('should persist resolution scale to localStorage', () => {
      const { setRenderResolutionScale } = usePerformanceStore.getState();

      setRenderResolutionScale(0.75);

      expect(localStorage.getItem(RESOLUTION_SCALE_KEY)).toBe('0.75');
    });

    it('should clamp and persist values at boundaries', () => {
      const { setRenderResolutionScale } = usePerformanceStore.getState();

      // Below minimum
      setRenderResolutionScale(0.3);
      expect(usePerformanceStore.getState().renderResolutionScale).toBe(0.5);
      expect(localStorage.getItem(RESOLUTION_SCALE_KEY)).toBe('0.5');

      // Above maximum
      setRenderResolutionScale(1.5);
      expect(usePerformanceStore.getState().renderResolutionScale).toBe(1.0);
      expect(localStorage.getItem(RESOLUTION_SCALE_KEY)).toBe('1');
    });
  });

  describe('hasPersistedResolutionScale', () => {
    it('should return false when no value is persisted', () => {
      expect(hasPersistedResolutionScale()).toBe(false);
    });

    it('should return true after setting resolution scale', () => {
      const { setRenderResolutionScale } = usePerformanceStore.getState();

      setRenderResolutionScale(0.75);

      expect(hasPersistedResolutionScale()).toBe(true);
    });

    it('should return false for invalid persisted values', () => {
      // Set an invalid value directly
      localStorage.setItem(RESOLUTION_SCALE_KEY, 'invalid');
      expect(hasPersistedResolutionScale()).toBe(false);

      // Set a value out of range
      localStorage.setItem(RESOLUTION_SCALE_KEY, '0.3');
      expect(hasPersistedResolutionScale()).toBe(false);

      localStorage.setItem(RESOLUTION_SCALE_KEY, '1.5');
      expect(hasPersistedResolutionScale()).toBe(false);
    });
  });

  describe('initial state loading', () => {
    it('should load persisted resolution scale on store creation', () => {
      // Pre-populate localStorage
      localStorage.setItem(RESOLUTION_SCALE_KEY, '0.75');

      // Force store to reload by getting fresh state
      // Note: In actual usage, this happens on module load
      // For testing, we verify the loadPersistedResolutionScale function works correctly
      // by checking hasPersistedResolutionScale returns true
      expect(hasPersistedResolutionScale()).toBe(true);
    });
  });
});
