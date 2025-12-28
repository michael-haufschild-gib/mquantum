/**
 * Environment Controls Component
 * Controls for scene environment settings (background, ground plane, grid, axis helper)
 * Organized into tabs: Walls (surface/grid) and Misc (helpers)
 */

import { Button } from '@/components/ui/Button';
import { ColorPicker } from '@/components/ui/ColorPicker';
import { MultiToggleGroup } from '@/components/ui/MultiToggleGroup';
import { Select } from '@/components/ui/Select';
import { Slider } from '@/components/ui/Slider';
import { Switch } from '@/components/ui/Switch';
import { Tabs } from '@/components/ui/Tabs';
import { DEFAULT_GROUND_PBR, type GroundPlaneType, type WallPosition } from '@/stores/defaults/visualDefaults';
import { useEnvironmentStore, type EnvironmentStore } from '@/stores/environmentStore';
import { usePBRStore, type PBRSlice } from '@/stores/pbrStore';
import React, { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { SkyboxControls } from './SkyboxControls';

/** Options for wall position toggle group */
const WALL_OPTIONS: { value: WallPosition; label: string }[] = [
  { value: 'floor', label: 'Floor' },
  { value: 'back', label: 'Back' },
  { value: 'left', label: 'Left' },
  { value: 'right', label: 'Right' },
  { value: 'top', label: 'Top' },
];

/** Options for surface type select */
const SURFACE_TYPE_OPTIONS: { value: GroundPlaneType; label: string }[] = [
  { value: 'two-sided', label: 'Two-Sided' },
  { value: 'plane', label: 'Plane' },
];

export interface EnvironmentControlsProps {
  className?: string;
}

export const EnvironmentControls: React.FC<EnvironmentControlsProps> = React.memo(({
  className = '',
}) => {
  const [activeTab, setActiveTab] = useState('walls');

  const environmentSelector = useShallow((state: EnvironmentStore) => ({
    activeWalls: state.activeWalls,
    groundPlaneOffset: state.groundPlaneOffset,
    groundPlaneColor: state.groundPlaneColor,
    groundPlaneType: state.groundPlaneType,
    groundPlaneSizeScale: state.groundPlaneSizeScale,
    showGroundGrid: state.showGroundGrid,
    groundGridColor: state.groundGridColor,
    groundGridSpacing: state.groundGridSpacing,
    setActiveWalls: state.setActiveWalls,
    setGroundPlaneOffset: state.setGroundPlaneOffset,
    setGroundPlaneColor: state.setGroundPlaneColor,
    setGroundPlaneType: state.setGroundPlaneType,
    setGroundPlaneSizeScale: state.setGroundPlaneSizeScale,
    setShowGroundGrid: state.setShowGroundGrid,
    setGroundGridColor: state.setGroundGridColor,
    setGroundGridSpacing: state.setGroundGridSpacing,
  }));
  const {
    activeWalls,
    groundPlaneOffset,
    groundPlaneColor,
    groundPlaneType,
    groundPlaneSizeScale,
    showGroundGrid,
    groundGridColor,
    groundGridSpacing,
    setActiveWalls,
    setGroundPlaneOffset,
    setGroundPlaneColor,
    setGroundPlaneType,
    setGroundPlaneSizeScale,
    setShowGroundGrid,
    setGroundGridColor,
    setGroundGridSpacing,
  } = useEnvironmentStore(environmentSelector);

  // PBR settings for ground/walls (from dedicated PBR store)
  const pbrSelector = useShallow((state: PBRSlice) => ({
    roughness: state.ground.roughness,
    metallic: state.ground.metallic,
    specularIntensity: state.ground.specularIntensity,
    specularColor: state.ground.specularColor,
    setRoughness: state.setGroundRoughness,
    setMetallic: state.setGroundMetallic,
    setSpecularIntensity: state.setGroundSpecularIntensity,
    setSpecularColor: state.setGroundSpecularColor,
  }));
  const {
    roughness,
    metallic,
    specularIntensity,
    specularColor,
    setRoughness,
    setMetallic,
    setSpecularIntensity,
    setSpecularColor,
  } = usePBRStore(pbrSelector);

  /**
   * Walls tab content - ground plane and grid settings
   * @returns JSX element for walls tab
   */
  const wallsContent = (
    <div className="space-y-4">
      {/* Wall Selection Toggle Group */}
      <MultiToggleGroup
        options={WALL_OPTIONS}
        value={activeWalls}
        onChange={setActiveWalls}
        label=""
        ariaLabel="Select which walls to display"
      />

      {/* Distance Offset */}
      <Slider
        label="Distance Offset"
        value={groundPlaneOffset}
        min={0}
        max={10}
        step={0.5}
        onChange={setGroundPlaneOffset}
        tooltip="Additional distance offset for walls from center"
      />

      {/* Surface Color */}
      <ColorPicker
        label="Surface Color"
        value={groundPlaneColor}
        onChange={setGroundPlaneColor}
        disableAlpha={true}
      />


      {/* Surface Type */}
      <Select
        label="Surface Type"
        options={SURFACE_TYPE_OPTIONS}
        value={groundPlaneType}
        onChange={setGroundPlaneType}
      />

      {/* Surface Size */}
      <Slider
        label="Surface Size"
        value={groundPlaneSizeScale}
        min={1}
        max={10}
        step={0.5}
        onChange={setGroundPlaneSizeScale}
        tooltip="Scale multiplier for ground surface size"
      />

      {/* Grid Toggle */}
      <Switch
        checked={showGroundGrid}
        onCheckedChange={setShowGroundGrid}
        label="Show Grid"
      />

      {/* Grid Color */}
      <ColorPicker
        label="Grid Color"
        value={groundGridColor}
        onChange={setGroundGridColor}
        disableAlpha={true}
      />


      {/* Grid Spacing */}
      <Slider
        label="Grid Spacing"
        value={groundGridSpacing}
        min={0.5}
        max={5}
        step={0.5}
        onChange={setGroundGridSpacing}
        tooltip="Distance between grid lines"
      />

      {/* --- Material Subsection --- */}
      <div className="flex items-center justify-between border-b border-panel-border pb-2 mt-4">
        <span className="text-xs font-bold text-text-secondary uppercase tracking-wider">Wall Material</span>
      </div>

      {/* Roughness */}
      <Slider
        label="Roughness"
        value={roughness}
        min={0.04}
        max={1}
        step={0.01}
        onChange={setRoughness}
        showValue
      />

      {/* Metallic */}
      <Slider
        label="Metallic"
        value={metallic}
        min={0}
        max={1}
        step={0.01}
        onChange={setMetallic}
        showValue
      />

      {/* Specular Color */}
      <div className="flex items-center justify-between">
        <ColorPicker
          label="Specular Color"
          value={specularColor}
          onChange={setSpecularColor}
          disableAlpha={true}
        />
        {specularColor !== DEFAULT_GROUND_PBR.specularColor && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSpecularColor(DEFAULT_GROUND_PBR.specularColor)}
            className="h-6 px-2 text-xs text-accent hover:text-accent/80"
            title="Reset to default"
          >
            Reset
          </Button>
        )}
      </div>

      {/* Specular Intensity */}
      <Slider
        label="Specular Intensity"
        value={specularIntensity}
        min={0}
        max={2}
        step={0.1}
        onChange={setSpecularIntensity}
        showValue
      />
    </div>
  );

  return (
    <div className={className}>
      <Tabs
        value={activeTab}
        onChange={setActiveTab}
        data-testid="env-controls"
        tabListClassName="mb-4"
        tabs={[
          { id: 'walls', label: 'Walls', content: wallsContent },
          { id: 'skybox', label: 'Skybox', content: <SkyboxControls /> },
        ]}
      />
    </div>
  );
});
