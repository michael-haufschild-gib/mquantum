/**
 * Light List Component
 *
 * Displays list of all lights with:
 * - Ambient light entry at top (non-deletable)
 * - Light items showing name, type, enable state
 * - Add new light select (Point, Directional, Spot)
 * - Maximum 4 lights enforced
 */

import { Select, type SelectOption } from '@/components/ui/Select'
import type { LightSource, LightType } from '@/rendering/lights/types'
import { MAX_LIGHTS } from '@/rendering/lights/types'
import { useLightingStore, type LightingSlice } from '@/stores/lightingStore'
import React, { memo, useMemo, useCallback } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { AMBIENT_LIGHT_ID, LightListItem } from './LightListItem'

/**
 *
 */
export interface LightListProps {
  className?: string
}

/** Light type options for the select */
const LIGHT_TYPE_OPTIONS: SelectOption<LightType | ''>[] = [
  { value: '', label: 'Add Light...' },
  { value: 'point', label: 'Point Light' },
  { value: 'directional', label: 'Directional Light' },
  { value: 'spot', label: 'Spot Light' },
]

export const LightList: React.FC<LightListProps> = memo(function LightList({ className = '' }) {
  const lightingSelector = useShallow((state: LightingSlice) => ({
    lights: state.lights,
    selectedLightId: state.selectedLightId,
    addLight: state.addLight,
    removeLight: state.removeLight,
    updateLight: state.updateLight,
    selectLight: state.selectLight,
    ambientEnabled: state.ambientEnabled,
    ambientIntensity: state.ambientIntensity,
    ambientColor: state.ambientColor,
    setAmbientEnabled: state.setAmbientEnabled,
  }))
  const {
    lights,
    selectedLightId,
    addLight,
    removeLight,
    updateLight,
    selectLight,
    ambientEnabled,
    ambientIntensity,
    ambientColor,
    setAmbientEnabled,
  } = useLightingStore(lightingSelector)

  // Create a virtual ambient light entry for display in the list
  const ambientLightEntry: LightSource = useMemo(
    () => ({
      id: AMBIENT_LIGHT_ID,
      type: 'point', // Type doesn't matter for ambient, just needed for interface
      name: 'Ambient Light',
      color: ambientColor,
      intensity: ambientIntensity,
      enabled: ambientEnabled,
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      coneAngle: 45,
      penumbra: 0.5,
      range: 10,
      decay: 2,
    }),
    [ambientColor, ambientIntensity, ambientEnabled]
  )

  // Toggle ambient light using the enabled boolean (consistent with other lights)
  const handleAmbientToggle = useCallback(() => {
    setAmbientEnabled(!ambientEnabled)
  }, [ambientEnabled, setAmbientEnabled])

  const handleAmbientSelect = useCallback(() => {
    selectLight(AMBIENT_LIGHT_ID)
  }, [selectLight])

  const handleAmbientRemove = useCallback(() => {
    // No-op, ambient can't be removed
  }, [])

  const canAddLight = lights.length < MAX_LIGHTS

  const handleAddLight = useCallback(
    (type: LightType | '') => {
      if (!type) return // Ignore placeholder selection
      const newId = addLight(type as LightType)
      if (newId) {
        selectLight(newId)
      }
    },
    [addLight, selectLight]
  )

  // Check if ambient light is selected
  const isAmbientSelected = selectedLightId === AMBIENT_LIGHT_ID

  return (
    <div className={`space-y-2 ${className}`}>
      {/* Light list - ambient light always first */}
      <div className="space-y-1">
        {/* Ambient light entry (always present, non-deletable) */}
        <LightListItem
          key={AMBIENT_LIGHT_ID}
          light={ambientLightEntry}
          isSelected={isAmbientSelected}
          onSelect={handleAmbientSelect}
          onToggle={handleAmbientToggle}
          onRemove={handleAmbientRemove}
          isDeleteDisabled={true}
        />

        {/* Other lights */}
        {lights.map((light: LightSource) => (
          <LightListItem
            key={light.id}
            light={light}
            isSelected={light.id === selectedLightId}
            onSelect={() => selectLight(light.id)}
            onToggle={() => updateLight(light.id, { enabled: !light.enabled })}
            onRemove={() => removeLight(light.id)}
          />
        ))}
      </div>

      {/* Add light select - native select has no z-index issues */}
      <Select<LightType | ''>
        options={LIGHT_TYPE_OPTIONS}
        value=""
        onChange={handleAddLight}
        disabled={!canAddLight}
      />
    </div>
  )
})
