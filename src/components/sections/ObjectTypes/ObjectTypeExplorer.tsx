import { soundManager } from '@/lib/audio/SoundManager';
import { getAvailableTypesForDimension } from '@/lib/geometry';
import { getConfigStoreKey, isRaymarchingType } from '@/lib/geometry/registry';
import type { ObjectType } from '@/lib/geometry/types';
import { isPolytopeType } from '@/lib/geometry/types';
import { useAppearanceStore } from '@/stores/appearanceStore';
import { useExtendedObjectStore } from '@/stores/extendedObjectStore';
import { useGeometryStore } from '@/stores/geometryStore';
import { useRotationStore } from '@/stores/rotationStore';
import { m } from 'motion/react';
import React, { useEffect, useMemo } from 'react';

export const ObjectTypeExplorer: React.FC = () => {
  const objectType = useGeometryStore((state) => state.objectType);
  const setObjectType = useGeometryStore((state) => state.setObjectType);
  const dimension = useGeometryStore((state) => state.dimension);
  const resetAllRotations = useRotationStore((state) => state.resetAllRotations);

  const initializeMandelbulbForDimension = useExtendedObjectStore(
    (state) => state.initializeMandelbulbForDimension
  );
  const initializeSchroedingerForDimension = useExtendedObjectStore(
    (state) => state.initializeSchroedingerForDimension
  );
  const initializeQuaternionJuliaForDimension = useExtendedObjectStore(
    (state) => state.initializeQuaternionJuliaForDimension
  );
  const initializePolytopeForType = useExtendedObjectStore(
    (state) => state.initializePolytopeForType
  );

  // Map config store keys to their initializer functions (for fractal types)
  const fractalInitializers = useMemo(() => ({
    mandelbulb: initializeMandelbulbForDimension,
    schroedinger: initializeSchroedingerForDimension,
    quaternionJulia: initializeQuaternionJuliaForDimension,
  }), [initializeMandelbulbForDimension, initializeSchroedingerForDimension, initializeQuaternionJuliaForDimension]);

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

  // Get available types based on current dimension
  const availableTypes = useMemo(() => getAvailableTypesForDimension(dimension), [dimension]);

  const handleSelect = (value: ObjectType) => {
     soundManager.playClick();
     // Reset rotation angles to prevent accumulated rotations from previous
     // object type causing visual artifacts (e.g., spikes/distortion)
     resetAllRotations();
     setObjectType(value);
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.05
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, x: -10 },
    show: { opacity: 1, x: 0 }
  };

  return (
    <m.div
        className="grid grid-cols-1 gap-2"
        variants={containerVariants}
        initial="hidden"
        animate="show"
    >
      {availableTypes.map((type) => {
        const isSelected = objectType === type.type;
        const isDisabled = !type.available;

        return (
                    <m.button
                      key={type.type}
                      variants={itemVariants}
                      onClick={() => !isDisabled && handleSelect(type.type)}
                      onMouseEnter={() => !isDisabled && soundManager.playHover()}
                      disabled={isDisabled}
                      className={`
                        relative group flex flex-col p-3 rounded-lg border text-left transition-all duration-200
                        ${isSelected
                          ? 'bg-accent/10 border-accent text-accent shadow-[0_0_15px_color-mix(in_oklch,var(--color-accent)_10%,transparent)]'
                          : 'bg-[var(--bg-panel)]/30 border-panel-border hover:border-text-secondary/50 text-text-secondary hover:text-text-primary hover:bg-[var(--bg-panel)]/50'
                        }
                        ${isDisabled ? 'opacity-50 cursor-not-allowed hover:border-panel-border' : 'cursor-pointer'}
                      `}
                      whileHover={!isDisabled ? { scale: 1.01, x: 2 } : undefined}
                      whileTap={!isDisabled ? { scale: 0.98 } : undefined}
                      data-testid={`object-type-${type.type}`}
                    >
                      <div className="flex items-center justify-between w-full mb-1">
                          <span className="font-medium text-sm">{type.name}</span>
                          {isSelected && (
                              <div className="relative w-2 h-2">
                                {/* Glow layer - static blur, no animation = 0 style recalcs */}
                                <div className="absolute inset-0 rounded-full bg-accent led-glow" />
                                {/* Solid LED core */}
                                <div className="absolute inset-0 rounded-full bg-accent" />
                              </div>
                          )}
                      </div>
                      <span className="text-xs text-text-secondary/80 line-clamp-2 leading-relaxed">
                          {type.description}
                      </span>

                      {isDisabled && (
                          <div className="absolute inset-0 bg-background/50 flex items-center justify-center rounded-lg opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-[1px]">
                               <span className="text-xs font-bold bg-background px-2 py-1 rounded shadow-sm border border-panel-border">
                                  {type.disabledReason}
                               </span>
                          </div>
                      )}
                    </m.button>        );
      })}
    </m.div>
  );
};
