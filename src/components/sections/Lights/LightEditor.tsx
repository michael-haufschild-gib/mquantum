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

import React, { memo, useCallback } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { Button } from '@/components/ui/Button'
import { ColorPicker } from '@/components/ui/ColorPicker'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Slider } from '@/components/ui/Slider'
import type { LightSource, LightType } from '@/rendering/lights/types'
import { type LightingSlice, useLightingStore } from '@/stores/lightingStore'

import { AMBIENT_LIGHT_ID } from './LightListItem'
import { Vector3Input } from './Vector3Input'

/**
 * Props for LightEditor.
 */
export interface LightEditorProps {
  /** Optional container class name. */
  className?: string
}

/** Light type options for selector */
const LIGHT_TYPE_OPTIONS: { value: LightType; label: string }[] = [
  { value: 'point', label: 'Point' },
  { value: 'directional', label: 'Directional' },
  { value: 'spot', label: 'Spot' },
]

/** Radians to degrees conversion */
const RAD_TO_DEG = 180 / Math.PI

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
  }))
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
  } = useLightingStore(lightingSelector)

  // Check if ambient light is selected
  const isAmbientLightSelected = selectedLightId === AMBIENT_LIGHT_ID

  // Find selected light (only for non-ambient)
  const selectedLight = isAmbientLightSelected
    ? null
    : lights.find((l: LightSource) => l.id === selectedLightId)

  // Update handlers
  const handleNameChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (selectedLightId) {
        updateLight(selectedLightId, { name: e.target.value })
      }
    },
    [selectedLightId, updateLight]
  )

  const handleTypeChange = useCallback(
    (type: LightType) => {
      if (selectedLightId) {
        updateLight(selectedLightId, { type })
      }
    },
    [selectedLightId, updateLight]
  )

  /** Create a handler that updates a single light property. */
  const lightPropHandler = useCallback(
    <K extends keyof LightSource>(key: K) =>
      (value: LightSource[K]) => {
        if (selectedLightId) updateLight(selectedLightId, { [key]: value } as Partial<LightSource>)
      },
    [selectedLightId, updateLight]
  )

  const handleIntensityChange = lightPropHandler('intensity')
  const handlePositionChange = lightPropHandler('position')
  const handleRotationChange = lightPropHandler('rotation')
  const handleConeAngleChange = lightPropHandler('coneAngle')
  const handlePenumbraChange = lightPropHandler('penumbra')
  const handleRangeChange = lightPropHandler('range')
  const handleDecayChange = lightPropHandler('decay')

  const handleDuplicate = useCallback(() => {
    if (selectedLightId) {
      const newId = duplicateLight(selectedLightId)
      if (newId) {
        selectLight(newId)
      }
    }
  }, [selectedLightId, duplicateLight, selectLight])

  const handleColorChange = lightPropHandler('color')

  // Show ambient light editor if ambient is selected
  if (isAmbientLightSelected) {
    return (
      <div className={`space-y-4 ${className}`}>
        {/* Color picker */}
        <div className="flex items-center justify-between">
          <ColorPicker
            label="Color"
            tooltip="Tint of the ambient light that illuminates all surfaces equally."
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
    )
  }

  // Show placeholder if no light selected
  if (!selectedLight) {
    return (
      <div className={`text-center text-sm text-text-tertiary py-4 ${className}`}>
        Select a light to edit
      </div>
    )
  }

  const showRotation = selectedLight.type === 'directional' || selectedLight.type === 'spot'
  const showSpotSettings = selectedLight.type === 'spot'

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
        <Button variant="ghost" size="icon" onClick={handleDuplicate} ariaLabel="Duplicate light">
          <svg
            className="w-4 h-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
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
            tooltip="Point emits in all directions, Directional is parallel (like sunlight), Spot emits in a cone."
            options={LIGHT_TYPE_OPTIONS}
            value={selectedLight.type}
            onChange={handleTypeChange}
          />
        </div>
      </div>

      {/* Color picker */}
      <ColorPicker
        label="Color"
        tooltip="Light emission color. Colored lights tint surfaces they illuminate."
        value={selectedLight.color}
        onChange={handleColorChange}
        disableAlpha={true}
      />

      {/* Intensity slider */}
      <Slider
        label="Intensity"
        tooltip="Brightness multiplier for the light source. Values above 1 create brighter-than-default illumination."
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
            tooltip="Maximum distance the light reaches. Beyond this range, the light has no effect on surfaces."
            min={0}
            max={100}
            step={1}
            value={selectedLight.range}
            onChange={handleRangeChange}
            showValue
          />

          <Slider
            label="Decay"
            tooltip="Rate of intensity falloff with distance. 0 = no falloff, 1 = linear, 2 = physically accurate inverse-square."
            min={0}
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
            tooltip="Half-angle of the spotlight cone in degrees. Wider angles illuminate a larger area."
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
            tooltip="Softness of the spotlight edge. 0 = hard edge, 1 = fully soft falloff from center to cone boundary."
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
  )
})
