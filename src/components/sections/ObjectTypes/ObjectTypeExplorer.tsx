import { soundManager } from '@/lib/audio/SoundManager';
import { getAvailableTypesForDimension } from '@/lib/geometry';
import type { ObjectType } from '@/lib/geometry/types';
import { useObjectTypeInitialization } from '@/hooks/useObjectTypeInitialization';
import { useGeometryStore, type GeometrySlice } from '@/stores/geometryStore';
import { useRotationStore } from '@/stores/rotationStore';
import { m } from 'motion/react';
import React, { useCallback, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';

export const ObjectTypeExplorer: React.FC = React.memo(() => {
  // Consolidate geometry store selectors with useShallow
  const { objectType, setObjectType, dimension } = useGeometryStore(
    useShallow((state: GeometrySlice) => ({
      objectType: state.objectType,
      setObjectType: state.setObjectType,
      dimension: state.dimension,
    }))
  );
  const resetAllRotations = useRotationStore((state) => state.resetAllRotations);

  // Handle object type initialization (fractals, polytopes, raymarching visibility)
  useObjectTypeInitialization(objectType, dimension);

  // Get available types based on current dimension
  const availableTypes = useMemo(() => getAvailableTypesForDimension(dimension), [dimension]);

  const handleSelect = useCallback((value: ObjectType) => {
     soundManager.playClick();
     // Reset rotation angles to prevent accumulated rotations from previous
     // object type causing visual artifacts (e.g., spikes/distortion)
     resetAllRotations();
     setObjectType(value);
  }, [resetAllRotations, setObjectType]);

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
});

ObjectTypeExplorer.displayName = 'ObjectTypeExplorer';
