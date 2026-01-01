/**
 * Tests for useAnimationLoop hook
 *
 * Note: This hook uses requestAnimationFrame for animation. Testing the full
 * animation loop behavior is complex due to timing dependencies. These tests
 * verify the module structure and basic store interactions.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useAnimationStore } from '@/stores/animationStore';
import { useRotationStore } from '@/stores/rotationStore';
import { usePerformanceStore } from '@/stores/performanceStore';
import { useUIStore } from '@/stores/uiStore';
import { DEFAULT_MAX_FPS } from '@/stores/defaults/visualDefaults';

describe('useAnimationLoop', () => {
  beforeEach(() => {
    // Reset all stores
    useAnimationStore.getState().reset();
    useRotationStore.getState().resetAllRotations();
    useRotationStore.getState().setDimension(4);
    usePerformanceStore.getState().setMaxFps(60);
    useUIStore.getState().setAnimationBias(0);
  });

  describe('module structure', () => {
    it('should export useAnimationLoop function', async () => {
      const module = await import('@/hooks/useAnimationLoop');
      expect(module.useAnimationLoop).toBeDefined();
      expect(typeof module.useAnimationLoop).toBe('function');
    });
  });

  describe('store interactions', () => {
    it('should read from animation store', () => {
      const store = useAnimationStore.getState();
      // After reset, isPlaying defaults to true
      expect(store.isPlaying).toBe(true);
      expect(store.animatingPlanes).toBeInstanceOf(Set);
      expect(typeof store.getRotationDelta).toBe('function');
    });

    it('should read from rotation store', () => {
      const store = useRotationStore.getState();
      expect(store.rotations).toBeInstanceOf(Map);
      expect(typeof store.updateRotations).toBe('function');
    });

    it('should read from visual store for animation bias', () => {
      const bias = useUIStore.getState().animationBias;
      expect(typeof bias).toBe('number');
      expect(bias).toBeGreaterThanOrEqual(0);
      expect(bias).toBeLessThanOrEqual(1);
    });
  });

  describe('animation speed', () => {
    it('should compute rotation delta based on speed and time', () => {
      const deltaTime = 16.67; // ~60fps
      const rotationDelta = useAnimationStore.getState().getRotationDelta(deltaTime);

      expect(typeof rotationDelta).toBe('number');
      expect(rotationDelta).toBeGreaterThanOrEqual(0);
    });

    it('should scale rotation delta with animation speed', () => {
      // Default speed
      useAnimationStore.getState().setSpeed(1.0);
      const delta1 = useAnimationStore.getState().getRotationDelta(16.67);

      // Half speed
      useAnimationStore.getState().setSpeed(0.5);
      const delta2 = useAnimationStore.getState().getRotationDelta(16.67);

      // Half speed should produce roughly half the delta
      expect(delta2).toBeLessThan(delta1);
      expect(delta2).toBeCloseTo(delta1 * 0.5, 1);
    });
  });

  describe('animating planes management', () => {
    it('should have default animating planes after reset', () => {
      // After reset, animation store has default planes: XY, YZ, ZW
      expect(useAnimationStore.getState().animatingPlanes.size).toBe(3);
      expect(useAnimationStore.getState().animatingPlanes.has('XY')).toBe(true);
    });

    it('should allow adding and removing individual planes', () => {
      // Start from reset state with default planes
      useAnimationStore.getState().stopAll(); // Clear all planes
      useAnimationStore.getState().setPlaneAnimating('XY', true);
      useAnimationStore.getState().setPlaneAnimating('XZ', true);

      expect(useAnimationStore.getState().animatingPlanes.size).toBe(2);
      expect(useAnimationStore.getState().animatingPlanes.has('XY')).toBe(true);
      expect(useAnimationStore.getState().animatingPlanes.has('XZ')).toBe(true);
    });

    it('should reset animating planes to defaults on reset', () => {
      useAnimationStore.getState().stopAll();
      expect(useAnimationStore.getState().animatingPlanes.size).toBe(0);

      useAnimationStore.getState().reset();
      // Reset restores default planes: XY, YZ, ZW
      expect(useAnimationStore.getState().animatingPlanes.size).toBe(3);
    });
  });

  describe('play/pause state', () => {
    it('should start playing by default (after reset)', () => {
      // Default state after reset is playing=true
      expect(useAnimationStore.getState().isPlaying).toBe(true);
    });

    it('should toggle play state', () => {
      useAnimationStore.getState().pause();
      expect(useAnimationStore.getState().isPlaying).toBe(false);

      useAnimationStore.getState().play();
      expect(useAnimationStore.getState().isPlaying).toBe(true);
    });
  });

  describe('rotation updates', () => {
    it('should update multiple rotations at once', () => {
      const updates = new Map<string, number>([
        ['XY', Math.PI / 4],
        ['XZ', Math.PI / 2],
      ]);

      useRotationStore.getState().updateRotations(updates);

      expect(useRotationStore.getState().rotations.get('XY')).toBeCloseTo(Math.PI / 4);
      expect(useRotationStore.getState().rotations.get('XZ')).toBeCloseTo(Math.PI / 2);
    });

    it('should normalize angles to [0, 2π)', () => {
      // Set angle greater than 2π
      useRotationStore.getState().setRotation('XY', 3 * Math.PI);

      const angle = useRotationStore.getState().rotations.get('XY') ?? 0;
      expect(angle).toBeGreaterThanOrEqual(0);
      expect(angle).toBeLessThan(2 * Math.PI);
    });
  });

  describe('animation bias', () => {
    it('should default to 0 (uniform animation)', () => {
      expect(useUIStore.getState().animationBias).toBe(0);
    });

    it('should allow setting animation bias', () => {
      useUIStore.getState().setAnimationBias(0.5);
      expect(useUIStore.getState().animationBias).toBe(0.5);
    });

    it('should clamp bias to valid range', () => {
      useUIStore.getState().setAnimationBias(1.5);
      expect(useUIStore.getState().animationBias).toBeLessThanOrEqual(1);

      useUIStore.getState().setAnimationBias(-0.5);
      expect(useUIStore.getState().animationBias).toBeGreaterThanOrEqual(0);
    });
  });

  describe('FPS limiting', () => {
    it('should read maxFps from performance store', () => {
      const maxFps = usePerformanceStore.getState().maxFps;
      expect(typeof maxFps).toBe('number');
      expect(maxFps).toBeGreaterThanOrEqual(15);
      expect(maxFps).toBeLessThanOrEqual(120);
    });

    it('should default to 120 FPS', () => {
      usePerformanceStore.getState().reset();
      expect(usePerformanceStore.getState().maxFps).toBe(DEFAULT_MAX_FPS);
    });

    it('should allow changing maxFps', () => {
      usePerformanceStore.getState().setMaxFps(30);
      expect(usePerformanceStore.getState().maxFps).toBe(30);

      usePerformanceStore.getState().setMaxFps(90);
      expect(usePerformanceStore.getState().maxFps).toBe(90);
    });

    it('should calculate frame interval from maxFps', () => {
      // Reset to ensure default of 120 FPS
      usePerformanceStore.getState().reset();
      const maxFps = usePerformanceStore.getState().maxFps;
      const frameInterval = 1000 / maxFps;

      // At 120 FPS, frame interval should be ~8.33ms
      expect(frameInterval).toBeCloseTo(8.33, 1);
    });

    it('should have correct frame interval at different FPS values', () => {
      // 30 FPS = 33.33ms per frame
      usePerformanceStore.getState().setMaxFps(30);
      expect(1000 / usePerformanceStore.getState().maxFps).toBeCloseTo(33.33, 1);

      // 120 FPS = 8.33ms per frame
      usePerformanceStore.getState().setMaxFps(120);
      expect(1000 / usePerformanceStore.getState().maxFps).toBeCloseTo(8.33, 1);

      // 15 FPS = 66.67ms per frame
      usePerformanceStore.getState().setMaxFps(15);
      expect(1000 / usePerformanceStore.getState().maxFps).toBeCloseTo(66.67, 1);
    });
  });
});
