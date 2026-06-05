/**
 * Domain Coloring Controls Component
 *
 * Controls for domain coloring visualization: modulus mapping mode
 * and contour line settings (density, width, strength).
 *
 * @module components/sections/Faces/DomainColoringControls
 */

import React, { useCallback } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { Select } from '@/components/ui/Select'
import { Slider } from '@/components/ui/Slider'
import { Switch } from '@/components/ui/Switch'
import { type AppearanceSlice, useAppearanceStore } from '@/stores/scene/appearanceStore'

const MODULUS_MODE_OPTIONS = [
  { value: 'logPsiAbsSquared', label: 'log(|psi|^2)' },
  { value: 'logPsiAbs', label: 'log(|psi|)' },
] as const

/** Controls for domain coloring visualization: modulus mapping mode and contour line settings. */
export const DomainColoringControls: React.FC = React.memo(() => {
  const selector = useShallow((state: AppearanceSlice) => ({
    domainColoring: state.domainColoring,
    setDomainColoringSettings: state.setDomainColoringSettings,
  }))
  const { domainColoring, setDomainColoringSettings } = useAppearanceStore(selector)

  const handleModeChange = useCallback(
    (value: string) => {
      setDomainColoringSettings({
        modulusMode: value === 'logPsiAbs' ? 'logPsiAbs' : 'logPsiAbsSquared',
      })
    },
    [setDomainColoringSettings]
  )

  const handleContoursEnabled = useCallback(
    (enabled: boolean) => {
      setDomainColoringSettings({ contoursEnabled: enabled })
    },
    [setDomainColoringSettings]
  )

  const handleDensityChange = useCallback(
    (value: number) => {
      setDomainColoringSettings({ contourDensity: value })
    },
    [setDomainColoringSettings]
  )

  const handleWidthChange = useCallback(
    (value: number) => {
      setDomainColoringSettings({ contourWidth: value })
    },
    [setDomainColoringSettings]
  )

  const handleStrengthChange = useCallback(
    (value: number) => {
      setDomainColoringSettings({ contourStrength: value })
    },
    [setDomainColoringSettings]
  )

  return (
    <div className="space-y-4">
      <Select
        data-testid="components-sections-faces-domain-coloring-controls-select-70-7"
        label="Modulus Mapping"
        options={MODULUS_MODE_OPTIONS.map((opt) => ({ value: opt.value, label: opt.label }))}
        value={domainColoring.modulusMode}
        onChange={handleModeChange}
        tooltip="How the wavefunction modulus maps to brightness in the complex-plane visualization"
      />

      <Switch
        data-testid="components-sections-faces-domain-coloring-controls-switch-78-7"
        label="Modulus Contours"
        checked={domainColoring.contoursEnabled}
        onCheckedChange={handleContoursEnabled}
        tooltip="Overlay equal-modulus contour lines on the domain coloring"
      />

      {domainColoring.contoursEnabled && (
        <>
          <Slider
            data-testid="components-sections-faces-domain-coloring-controls-slider-87-11"
            label="Contour Density"
            min={1}
            max={32}
            step={0.25}
            value={domainColoring.contourDensity}
            onChange={handleDensityChange}
            showValue
            tooltip="Number of contour lines per unit in the modulus scale"
          />

          <Slider
            data-testid="components-sections-faces-domain-coloring-controls-slider-98-11"
            label="Contour Width"
            min={0.005}
            max={0.25}
            step={0.005}
            value={domainColoring.contourWidth}
            onChange={handleWidthChange}
            showValue
            tooltip="Thickness of the contour lines"
          />

          <Slider
            data-testid="components-sections-faces-domain-coloring-controls-slider-109-11"
            label="Contour Strength"
            min={0}
            max={1}
            step={0.01}
            value={domainColoring.contourStrength}
            onChange={handleStrengthChange}
            showValue
            tooltip="Opacity of the contour lines (0 = invisible, 1 = fully opaque)"
          />
        </>
      )}
    </div>
  )
})

DomainColoringControls.displayName = 'DomainColoringControls'
