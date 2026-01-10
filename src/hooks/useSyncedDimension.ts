import { useLayoutEffect, useRef } from 'react';
import { useGeometryStore } from '@/stores/geometryStore';
import { useRotationStore } from '@/stores/rotationStore';
import { useTransformStore } from '@/stores/transformStore';
import { useAnimationStore } from '@/stores/animationStore';
import { useExtendedObjectStore } from '@/stores/extendedObjectStore';
import { useAppearanceStore } from '@/stores/appearanceStore';
import { usePerformanceStore } from '@/stores/performanceStore';
import { useShallow } from 'zustand/react/shallow';

/**
 * Synchronizes the dimension across all relevant stores and resets rotations
 * when dimension or object type changes.
 *
 * IMPORTANT: During scene loading (when isLoadingScene=true), rotations are NOT
 * reset because the scene loader restores them from saved state. This is
 * intentionally separate from sceneTransitioning (which is for visual progressive
 * refinement and is set during any dimension/object type change).
 */
export function useSyncedDimension() {
  // Grouped geometry store subscription
  const { dimension, objectType } = useGeometryStore(
    useShallow((state) => ({
      dimension: state.dimension,
      objectType: state.objectType,
    }))
  );

  // Grouped rotation store subscription
  const { setRotationDimension, resetAllRotations } = useRotationStore(
    useShallow((state) => ({
      setRotationDimension: state.setDimension,
      resetAllRotations: state.resetAllRotations,
    }))
  );

  const setTransformDimension = useTransformStore((state) => state.setDimension);
  const setAnimationDimension = useAnimationStore((state) => state.setDimension);

  // Extended object re-initialization
  const initializeBlackHoleForDimension = useExtendedObjectStore((state) => state.initializeBlackHoleForDimension);

  // Track previous object type to detect changes
  const prevObjectTypeRef = useRef(objectType);

  useLayoutEffect(() => {
    // Check if a scene is being loaded - skip sync during scene load
    // (the geometry store handles syncing during its setDimension call)
    if (usePerformanceStore.getState().isLoadingScene) return;

    setRotationDimension(dimension);
    setTransformDimension(dimension);
    setAnimationDimension(dimension);

    // Object-specific re-initialization for dimension changes
    // Note: Color algorithm is NOT set here - only when transitioning TO blackhole
    // (see second useLayoutEffect). This preserves the user's color algorithm choice
    // when changing dimensions on an existing black hole.
    if (objectType === 'blackhole') {
      initializeBlackHoleForDimension(dimension);
    }
  }, [dimension, objectType, setRotationDimension, setTransformDimension, setAnimationDimension, initializeBlackHoleForDimension]);

  // Reset rotations when object type changes (but not during scene loading)
  // Also set default color algorithm when transitioning TO blackhole
  useLayoutEffect(() => {
    // Check if a scene is being loaded - skip rotation reset during scene load
    // because the scene loader will restore rotations from saved state
    if (usePerformanceStore.getState().isLoadingScene) {
      prevObjectTypeRef.current = objectType;
      return;
    }

    if (prevObjectTypeRef.current !== objectType) {
      resetAllRotations();
      
      // When transitioning TO blackhole, set default color algorithm to blackbody.
      // This only runs on object type CHANGE, not on dimension changes,
      // so loaded scenes preserve their color algorithm setting.
      if (objectType === 'blackhole') {
        useAppearanceStore.getState().setColorAlgorithm('blackbody');
      }
      
      prevObjectTypeRef.current = objectType;
    }
  }, [objectType, resetAllRotations]);
}
