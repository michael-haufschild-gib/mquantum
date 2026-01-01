/**
 * Object Type Selector Component
 * Allows users to select the type of n-dimensional object
 *
 * Supports both traditional polytopes and extended objects:
 * - Polytopes: Hypercube, Simplex, Cross-Polytope
 * - Extended: Root System, Clifford Torus, Mandelbulb, Quaternion Julia
 */

import React, { useMemo, useCallback } from 'react';
import { Select } from '@/components/ui/Select';
import { Tooltip } from '@/components/ui/Tooltip';
import { useGeometryStore, type GeometrySlice } from '@/stores/geometryStore';
import { useRotationStore } from '@/stores/rotationStore';
import { getAvailableTypesForDimension } from '@/lib/geometry';
import type { ObjectType } from '@/lib/geometry/types';
import { useObjectTypeInitialization } from '@/hooks/useObjectTypeInitialization';
import { useShallow } from 'zustand/react/shallow';

export interface ObjectTypeSelectorProps {
  className?: string;
  disabled?: boolean;
}

export const ObjectTypeSelector: React.FC<ObjectTypeSelectorProps> = React.memo(({
  className = '',
  disabled = false,
}) => {
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

  // Build options with disabled state for dimension-constrained types
  const options = useMemo(() => {
    return availableTypes.map((t) => ({
      value: t.type,
      label: t.available ? t.name : `${t.name} (${t.disabledReason})`,
      disabled: !t.available,
    }));
  }, [availableTypes]);

  // Get description for current type
  const description = useMemo(() => {
    const found = availableTypes.find((t) => t.type === objectType);
    return found?.description ?? '';
  }, [availableTypes, objectType]);

  const handleChange = useCallback((value: string) => {
    // Only set if the type is available for current dimension
    const typeInfo = availableTypes.find((t) => t.type === value);
    if (typeInfo?.available) {
      // Reset rotation angles to prevent accumulated rotations from previous
      // object type causing visual artifacts (e.g., spikes/distortion)
      resetAllRotations();
      setObjectType(value as ObjectType);
    }
  }, [availableTypes, resetAllRotations, setObjectType]);

  return (
    <div className={`space-y-2 ${className}`}>
      <Tooltip
        content="Select the type of geometric object to visualize"
        position="top"
        className="w-full"
      >
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-text-secondary">
            Type
          </label>
          <Select
            options={options}
            value={objectType}
            onChange={handleChange}
            disabled={disabled}
            data-testid="object-type-selector"
            className="flex-1"
          />
        </div>
      </Tooltip>
      <p className="text-xs text-text-secondary">
        {description}
      </p>
    </div>
  );
});

ObjectTypeSelector.displayName = 'ObjectTypeSelector';
