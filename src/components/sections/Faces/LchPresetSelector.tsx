/**
 * LCH Preset Selector Component
 *
 * Dropdown for selecting pre-configured LCH (Lightness-Chroma-Hue) presets.
 * These presets configure the perceptually uniform color space parameters.
 */

import { Select } from '@/components/ui/Select';
import { LCH_PRESET_OPTIONS } from '@/rendering/shaders/palette';
import { useAppearanceStore, type AppearanceSlice } from '@/stores/appearanceStore';
import React, { useMemo, useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';

export interface LchPresetSelectorProps {
  className?: string;
}

export const LchPresetSelector: React.FC<LchPresetSelectorProps> = React.memo(({
  className = '',
}) => {
  const appearanceSelector = useShallow((state: AppearanceSlice) => ({
    lchLightness: state.lchLightness,
    lchChroma: state.lchChroma,
    setLchLightness: state.setLchLightness,
    setLchChroma: state.setLchChroma,
  }));
  const { lchLightness, lchChroma, setLchLightness, setLchChroma } = useAppearanceStore(appearanceSelector);

  // Find current preset by matching lightness and chroma values
  const currentPreset = useMemo(() => {
    for (const preset of LCH_PRESET_OPTIONS) {
      // Use approximate matching with small tolerance
      if (
        Math.abs(preset.lightness - lchLightness) < 0.01 &&
        Math.abs(preset.chroma - lchChroma) < 0.01
      ) {
        return preset.value;
      }
    }
    return 'custom';
  }, [lchLightness, lchChroma]);

  const options = useMemo(() => [
    ...LCH_PRESET_OPTIONS.map((opt) => ({
      value: opt.value,
      label: opt.label,
    })),
    { value: 'custom', label: 'Custom' },
  ], []);

  const handleChange = useCallback((value: string) => {
    if (value === 'custom') return;

    const preset = LCH_PRESET_OPTIONS.find((p) => p.value === value);
    if (preset) {
      setLchLightness(preset.lightness);
      setLchChroma(preset.chroma);
    }
  }, [setLchLightness, setLchChroma]);

  return (
    <div className={className}>
      <Select
        label="LCH Preset"
        options={options}
        value={currentPreset}
        onChange={handleChange}
      />
    </div>
  );
});

LchPresetSelector.displayName = 'LchPresetSelector';
