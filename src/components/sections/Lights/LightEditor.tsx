/**
 * Light Editor Component
 *
 * Displays and edits properties of the currently selected light:
 * - Name input (not for ambient)
 * - Type selector (Point, Directional, Spot) (not for ambient)
 * - Enable toggle (not for ambient)
 * - Color picker
 * - Intensity slider
 * - Position X/Y/Z inputs (not for ambient)
 * - Rotation X/Y/Z inputs (for directional/spot, not for ambient)
 * - Cone Angle slider (spot only)
 * - Penumbra slider (spot only)
 * - Range/Decay sliders (point/spot only)
 */

import { Button } from '@/components/ui/Button';
import { ColorPicker } from '@/components/ui/ColorPicker';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Slider } from '@/components/ui/Slider';
import type { LightSource, LightType } from '@/rendering/lights/types';
import { useLightingStore, type LightingSlice } from '@/stores/lightingStore';
import React, { memo, useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { AMBIENT_LIGHT_ID } from './LightListItem';
import { Vector3Input } from './Vector3Input';

export interface LightEditorProps {
  className?: string;
}

/** Light type options for selector */
const LIGHT_TYPE_OPTIONS: { value: LightType; label: string }[] = [
  { value: 'point', label: 'Point' },
  { value: 'directional', label: 'Directional' },
  { value: 'spot', label: 'Spot' },
];

/** Radians to degrees conversion */
const RAD_TO_DEG = 180 / Math.PI;

export const LightEditor: React.FC<LightEditorProps> = memo(function LightEditor({
  className = '',
}) {
  const lightingSelector = useShallow((state: LightingSlice) => ({
    lights: state.lights,
    selectedLightId: state.selectedLightId,
    updateLight: state.updateLight,
    duplicateLight: state.duplicateLight,
    selectLight: state.selectLight,
    // Ambient light state
    ambientIntensity: state.ambientIntensity,
    ambientColor: state.ambientColor,
    setAmbientIntensity: state.setAmbientIntensity,
    setAmbientColor: state.setAmbientColor,
  }));
  const {
    lights,
    selectedLightId,
    updateLight,
    duplicateLight,
    selectLight,
    ambientIntensity,
    ambientColor,
    setAmbientIntensity,
    setAmbientColor,
  } = useLightingStore(lightingSelector);

  // Check if ambient light is selected
  const isAmbientLightSelected = selectedLightId === AMBIENT_LIGHT_ID;

  // Find selected light (only for non-ambient)
  const selectedLight = isAmbientLightSelected
    ? null
    : lights.find((l: LightSource) => l.id === selectedLightId);

  // Update handlers
  const handleNameChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (selectedLightId) {
        updateLight(selectedLightId, { name: e.target.value });
      }
    },
    [selectedLightId, updateLight]
  );

  const handleTypeChange = useCallback(
    (type: LightType) => {
      if (selectedLightId) {
        updateLight(selectedLightId, { type });
      }
    },
    [selectedLightId, updateLight]
  );

  const handleIntensityChange = useCallback(
    (intensity: number) => {
      if (selectedLightId) {
        updateLight(selectedLightId, { intensity });
      }
    },
    [selectedLightId, updateLight]
  );

  const handlePositionChange = useCallback(
    (position: [number, number, number]) => {
      if (selectedLightId) {
        updateLight(selectedLightId, { position });
      }
    },
    [selectedLightId, updateLight]
  );

  const handleRotationChange = useCallback(
    (rotation: [number, number, number]) => {
      if (selectedLightId) {
        updateLight(selectedLightId, { rotation });
      }
    },
    [selectedLightId, updateLight]
  );

  const handleConeAngleChange = useCallback(
    (coneAngle: number) => {
      if (selectedLightId) {
        updateLight(selectedLightId, { coneAngle });
      }
    },
    [selectedLightId, updateLight]
  );

  const handlePenumbraChange = useCallback(
    (penumbra: number) => {
      if (selectedLightId) {
        updateLight(selectedLightId, { penumbra });
      }
    },
    [selectedLightId, updateLight]
  );

  const handleRangeChange = useCallback(
    (range: number) => {
      if (selectedLightId) {
        updateLight(selectedLightId, { range });
      }
    },
    [selectedLightId, updateLight]
  );

  const handleDecayChange = useCallback(
    (decay: number) => {
      if (selectedLightId) {
        updateLight(selectedLightId, { decay });
      }
    },
    [selectedLightId, updateLight]
  );

  const handleDuplicate = useCallback(() => {
    if (selectedLightId) {
      const newId = duplicateLight(selectedLightId);
      if (newId) {
        selectLight(newId);
      }
    }
  }, [selectedLightId, duplicateLight, selectLight]);

  const handleColorChange = useCallback((val: string) => {
    if (selectedLightId) {
      updateLight(selectedLightId, { color: val });
    }
  }, [selectedLightId, updateLight]);

  // Show ambient light editor if ambient is selected
  if (isAmbientLightSelected) {
    return (
      <div className={`space-y-4 ${className}`}>


        {/* Color picker */}
        <div className="flex items-center justify-between">
          <ColorPicker
            label="Color"
            value={ambientColor}
            onChange={setAmbientColor}
            disableAlpha={true}
          />

        </div>

        {/* Intensity slider */}
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <Slider
              label="Intensity"
              min={0}
              max={1}
              step={0.05}
              value={ambientIntensity}
              onChange={setAmbientIntensity}
              showValue
              tooltip="Global ambient lighting level"
            />
          </div>

        </div>
      </div>
    );
  }

  // Show placeholder if no light selected
  if (!selectedLight) {
    return (
      <div className={`text-center text-sm text-text-tertiary py-4 ${className}`}>
        Select a light to edit
      </div>
    );
  }

  const showRotation = selectedLight.type === 'directional' || selectedLight.type === 'spot';
  const showSpotSettings = selectedLight.type === 'spot';

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Header with name and duplicate */}
      <div className="flex items-center gap-2">
        <Input
          value={selectedLight.name}
          onChange={handleNameChange}
          aria-label="Light name"
          containerClassName="flex-1"
        />
        <Button
          variant="ghost"
          size="icon"
          onClick={handleDuplicate}
          ariaLabel="Duplicate light"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="9" y="9" width="13" height="13" rx="2" />
            <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
          </svg>
        </Button>
      </div>

      {/* Type and Enable row */}
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <Select
            label="Type"
            options={LIGHT_TYPE_OPTIONS}
            value={selectedLight.type}
            onChange={handleTypeChange}
          />
        </div>

      </div>

      {/* Color picker */}
      <ColorPicker
        label="Color"
        value={selectedLight.color}
        onChange={handleColorChange}
        disableAlpha={true}
      />


      {/* Intensity slider */}
      <Slider
        label="Intensity"
        min={0.1}
        max={3}
        step={0.1}
        value={selectedLight.intensity}
        onChange={handleIntensityChange}
        showValue
      />

      {/* Range and Decay sliders (point and spot lights only) */}
      {(selectedLight.type === 'point' || selectedLight.type === 'spot') && (
        <>
          <Slider
            label="Range"
            min={1}
            max={100}
            step={1}
            value={selectedLight.range}
            onChange={handleRangeChange}
            showValue
          />

          <Slider
            label="Decay"
            min={0.1}
            max={3}
            step={0.1}
            value={selectedLight.decay}
            onChange={handleDecayChange}
            showValue
          />
        </>
      )}

      {/* Position input */}
      <Vector3Input
        label="Position"
        value={selectedLight.position}
        onChange={handlePositionChange}
        step={0.5}
      />

      {/* Rotation input (directional/spot only) */}
      {showRotation && (
        <Vector3Input
          label="Rotation"
          value={selectedLight.rotation}
          onChange={handleRotationChange}
          step={5}
          displayMultiplier={RAD_TO_DEG}
          unit="deg"
        />
      )}

      {/* Spot light settings */}
      {showSpotSettings && (
        <>
          <Slider
            label="Cone Angle"
            min={1}
            max={120}
            step={1}
            value={selectedLight.coneAngle}
            onChange={handleConeAngleChange}
            unit="deg"
            showValue
          />

          <Slider
            label="Penumbra"
            min={0}
            max={1}
            step={0.05}
            value={selectedLight.penumbra}
            onChange={handlePenumbraChange}
            showValue
          />
        </>
      )}

    </div>
  );
});
