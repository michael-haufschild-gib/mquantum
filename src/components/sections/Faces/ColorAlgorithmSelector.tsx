/**
 * Color Algorithm Selector Component
 *
 * Dropdown for selecting the color algorithm used for face/surface coloring.
 * Object-specific algorithms are filtered based on current object type:
 * - Quantum algorithms (phase, mixed, blackbody) only shown for Schroedinger
 * - Black hole algorithms (accretionGradient, etc.) only shown for Black Hole
 */

import { Select } from '@/components/ui/Select';
import {
  COLOR_ALGORITHM_OPTIONS,
  type ColorAlgorithm,
  isColorAlgorithmAvailable,
} from '@/rendering/shaders/palette';
import { useAppearanceStore, type AppearanceSlice } from '@/stores/appearanceStore';
import { useGeometryStore } from '@/stores/geometryStore';
import React, { useMemo, useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';

export interface ColorAlgorithmSelectorProps {
  className?: string;
}

export const ColorAlgorithmSelector: React.FC<ColorAlgorithmSelectorProps> = React.memo(({
  className = '',
}) => {
  const { colorAlgorithm, setColorAlgorithm } = useAppearanceStore(
    useShallow((state: AppearanceSlice) => ({
      colorAlgorithm: state.colorAlgorithm,
      setColorAlgorithm: state.setColorAlgorithm,
    }))
  );
  const objectType = useGeometryStore((state) => state.objectType);

  // Filter algorithms based on object type
  const availableOptions = useMemo(() => {
    return COLOR_ALGORITHM_OPTIONS.filter((opt) => {
      return isColorAlgorithmAvailable(opt.value, objectType);
    });
  }, [objectType]);

  // Transform options for Select component
  const selectOptions = useMemo(() =>
    availableOptions.map((opt) => ({
      value: opt.value,
      label: opt.label,
    })),
    [availableOptions]
  );

  const handleChange = useCallback((v: string) => {
    setColorAlgorithm(v as ColorAlgorithm);
  }, [setColorAlgorithm]);

  return (
    <div className={className}>
      <Select
        options={selectOptions}
        value={colorAlgorithm}
        onChange={handleChange}
      />
    </div>
  );
});

ColorAlgorithmSelector.displayName = 'ColorAlgorithmSelector';
