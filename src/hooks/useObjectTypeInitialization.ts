/**
 * useObjectTypeInitialization Hook
 *
 * Handles initialization of object type-specific settings when the object type
 * or dimension changes. Extracted from ObjectTypeExplorer and ObjectTypeSelector
 * to eliminate duplicate code.
 *
 * Responsibilities:
 * - Initialize fractal settings (mandelbulb, schroedinger, quaternion julia)
 * - Initialize polytope scale for polytope types
 * - Ensure raymarching types have faces visible
 */

import { useEffect, useMemo } from 'react';
import { getConfigStoreKey, isRaymarchingType } from '@/lib/geometry/registry';
import type { ObjectType } from '@/lib/geometry/types';
import { isPolytopeType } from '@/lib/geometry/types';
import { useAppearanceStore } from '@/stores/appearanceStore';
import { useExtendedObjectStore, type ExtendedObjectState } from '@/stores/extendedObjectStore';
import { useShallow } from 'zustand/react/shallow';

/**
 * Hook to initialize object type-specific settings.
 *
 * @param objectType - Current object type
 * @param dimension - Current dimension
 */
export function useObjectTypeInitialization(objectType: ObjectType, dimension: number): void {
  // Consolidate extended object store selectors with useShallow
  const {
    initializeMandelbulbForDimension,
    initializeSchroedingerForDimension,
    initializeQuaternionJuliaForDimension,
    initializePolytopeForType,
  } = useExtendedObjectStore(
    useShallow((state: ExtendedObjectState) => ({
      initializeMandelbulbForDimension: state.initializeMandelbulbForDimension,
      initializeSchroedingerForDimension: state.initializeSchroedingerForDimension,
      initializeQuaternionJuliaForDimension: state.initializeQuaternionJuliaForDimension,
      initializePolytopeForType: state.initializePolytopeForType,
    }))
  );

  // Map config store keys to their initializer functions (for fractal types)
  const fractalInitializers = useMemo(
    () => ({
      mandelbulb: initializeMandelbulbForDimension,
      schroedinger: initializeSchroedingerForDimension,
      quaternionJulia: initializeQuaternionJuliaForDimension,
    }),
    [initializeMandelbulbForDimension, initializeSchroedingerForDimension, initializeQuaternionJuliaForDimension]
  );

  // Ensure faces are visible for raymarched fractals so render mode isn't 'none'
  useEffect(() => {
    if (isRaymarchingType(objectType)) {
      const store = useAppearanceStore.getState();
      if (!store.facesVisible) {
        store.setFacesVisible(true);
      }
    }
  }, [objectType]);

  // Initialize fractal settings when objectType changes (data-driven via registry)
  useEffect(() => {
    const configKey = getConfigStoreKey(objectType);
    if (configKey && configKey in fractalInitializers) {
      const initializer = fractalInitializers[configKey as keyof typeof fractalInitializers];
      initializer(dimension);
    }
  }, [objectType, dimension, fractalInitializers]);

  // Initialize polytope scale when switching to a polytope type
  useEffect(() => {
    if (isPolytopeType(objectType)) {
      initializePolytopeForType(objectType);
    }
  }, [objectType, initializePolytopeForType]);
}
