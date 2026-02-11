import { Select } from '@/components/ui/Select'
import { Slider } from '@/components/ui/Slider'
import { Switch } from '@/components/ui/Switch'
import { useAppearanceStore, type AppearanceSlice } from '@/stores/appearanceStore'
import React, { useCallback } from 'react'
import { useShallow } from 'zustand/react/shallow'

const MODULUS_MODE_OPTIONS = [
  { value: 'logPsiAbsSquared', label: 'log(|psi|^2)' },
  { value: 'logPsiAbs', label: 'log(|psi|)' },
] as const

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
        label="Modulus Mapping"
        options={MODULUS_MODE_OPTIONS.map((opt) => ({ value: opt.value, label: opt.label }))}
        value={domainColoring.modulusMode}
        onChange={handleModeChange}
      />

      <Switch
        label="Modulus Contours"
        checked={domainColoring.contoursEnabled}
        onCheckedChange={handleContoursEnabled}
      />

      {domainColoring.contoursEnabled && (
        <>
          <Slider
            label="Contour Density"
            min={1}
            max={32}
            step={0.25}
            value={domainColoring.contourDensity}
            onChange={handleDensityChange}
            showValue
          />

          <Slider
            label="Contour Width"
            min={0.005}
            max={0.25}
            step={0.005}
            value={domainColoring.contourWidth}
            onChange={handleWidthChange}
            showValue
          />

          <Slider
            label="Contour Strength"
            min={0}
            max={1}
            step={0.01}
            value={domainColoring.contourStrength}
            onChange={handleStrengthChange}
            showValue
          />
        </>
      )}
    </div>
  )
})

DomainColoringControls.displayName = 'DomainColoringControls'
