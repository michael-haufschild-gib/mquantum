/**
 * Polytope Slice Store Tests
 *
 * Tests for the polytope state management in extendedObjectStore.
 *
 * @see src/stores/slices/geometry/polytopeSlice.ts
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useExtendedObjectStore } from '@/stores/extendedObjectStore';
import { DEFAULT_POLYTOPE_SCALES } from '@/lib/geometry/extended/types';

describe('polytopeSlice', () => {
  beforeEach(() => {
    // Reset store to defaults
    useExtendedObjectStore.getState().reset();
  });

  afterEach(() => {
    useExtendedObjectStore.getState().reset();
  });

  describe('Scale Actions', () => {
    it('setPolytopeScale sets scale within valid range', () => {
      const store = useExtendedObjectStore.getState();

      store.setPolytopeScale(2.5);
      expect(useExtendedObjectStore.getState().polytope.scale).toBe(2.5);
    });

    it('setPolytopeScale clamps value to [0.5, 8.0]', () => {
      const store = useExtendedObjectStore.getState();

      store.setPolytopeScale(0.3);
      expect(useExtendedObjectStore.getState().polytope.scale).toBe(0.5);

      store.setPolytopeScale(10.0);
      expect(useExtendedObjectStore.getState().polytope.scale).toBe(8.0);
    });

    it('initializePolytopeForType sets type-specific default scale', () => {
      const store = useExtendedObjectStore.getState();

      // Simplex has a larger default scale (4.0)
      store.initializePolytopeForType('simplex');
      expect(useExtendedObjectStore.getState().polytope.scale).toBe(DEFAULT_POLYTOPE_SCALES['simplex']);

      // Hypercube has standard scale (1.8)
      store.initializePolytopeForType('hypercube');
      expect(useExtendedObjectStore.getState().polytope.scale).toBe(DEFAULT_POLYTOPE_SCALES['hypercube']);
    });

    it('initializePolytopeForType uses default scale for unknown types', () => {
      const store = useExtendedObjectStore.getState();

      store.initializePolytopeForType('unknown-type');
      // Falls back to DEFAULT_POLYTOPE_CONFIG.scale (1.8)
      expect(useExtendedObjectStore.getState().polytope.scale).toBe(1.8);
    });
  });

  describe('Version tracking', () => {
    it('increments polytopeVersion on scale change', () => {
      const store = useExtendedObjectStore.getState();
      const initialVersion = useExtendedObjectStore.getState().polytopeVersion;

      store.setPolytopeScale(3.0);

      expect(useExtendedObjectStore.getState().polytopeVersion).toBe(initialVersion + 1);
    });

    it('increments polytopeVersion on initializePolytopeForType', () => {
      const store = useExtendedObjectStore.getState();
      const initialVersion = useExtendedObjectStore.getState().polytopeVersion;

      store.initializePolytopeForType('simplex');

      expect(useExtendedObjectStore.getState().polytopeVersion).toBe(initialVersion + 1);
    });
  });

  describe('Store reset', () => {
    it('resets scale to default', () => {
      const store = useExtendedObjectStore.getState();

      // Set a custom scale
      store.setPolytopeScale(5.0);
      expect(useExtendedObjectStore.getState().polytope.scale).toBe(5.0);

      // Reset
      store.reset();

      // Verify reset to default (1.8)
      expect(useExtendedObjectStore.getState().polytope.scale).toBe(1.8);
    });
  });
});

