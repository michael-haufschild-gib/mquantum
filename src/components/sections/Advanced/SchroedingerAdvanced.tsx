import { ControlGroup } from '@/components/ui/ControlGroup'
import { Slider } from '@/components/ui/Slider'
import { useAppearanceStore, type AppearanceSlice } from '@/stores/appearanceStore'
import { useExtendedObjectStore, type ExtendedObjectState } from '@/stores/extendedObjectStore'
import { useGeometryStore } from '@/stores/geometryStore'
import React from 'react'
import { useShallow } from 'zustand/react/shallow'

export const SchroedingerAdvanced: React.FC = React.memo(() => {
  const dimension = useGeometryStore((state) => state.dimension)
  const extendedObjectSelector = useShallow((state: ExtendedObjectState) => ({
    config: state.schroedinger,
    setDensityGain: state.setSchroedingerDensityGain,
    setDensityContrast: state.setSchroedingerDensityContrast,
    setPowderScale: state.setSchroedingerPowderScale,
    setScatteringAnisotropy: state.setSchroedingerScatteringAnisotropy,
  }))
  const {
    config,
    setDensityGain,
    setDensityContrast,
    setPowderScale,
    setScatteringAnisotropy,
  } = useExtendedObjectStore(extendedObjectSelector)

  // Emission settings from appearance store
  const emissionSelector = useShallow((state: AppearanceSlice) => ({
    faceEmission: state.faceEmission,
    faceEmissionThreshold: state.faceEmissionThreshold,
    faceEmissionColorShift: state.faceEmissionColorShift,
    setFaceEmission: state.setFaceEmission,
    setFaceEmissionThreshold: state.setFaceEmissionThreshold,
    setFaceEmissionColorShift: state.setFaceEmissionColorShift,
  }))
  const {
    faceEmission,
    faceEmissionThreshold,
    faceEmissionColorShift,
    setFaceEmission,
    setFaceEmissionThreshold,
    setFaceEmissionColorShift,
  } = useAppearanceStore(emissionSelector)

  return (
    <div className="space-y-4">
      {/* Emission & Rim */}
      <ControlGroup title="Emission & Rim" collapsible defaultOpen>
        <Slider
          label="Emission Strength"
          min={0}
          max={5}
          step={0.1}
          value={faceEmission}
          onChange={setFaceEmission}
          showValue
          data-testid="schroedinger-emission-strength"
        />
        <Slider
          label="Emission Threshold"
          min={0}
          max={1}
          step={0.05}
          value={faceEmissionThreshold}
          onChange={setFaceEmissionThreshold}
          showValue
          data-testid="schroedinger-emission-threshold"
        />
        <Slider
          label="Color Shift"
          min={-1}
          max={1}
          step={0.1}
          value={faceEmissionColorShift}
          onChange={setFaceEmissionColorShift}
          showValue
          data-testid="schroedinger-emission-color-shift"
        />
      </ControlGroup>

      {/* Volume Rendering (includes Volume Effects) */}
      <ControlGroup title="Volume Rendering" collapsible defaultOpen>
        <Slider
          label="Density Gain"
          min={0.1}
          max={5.0}
          step={0.1}
          value={config.densityGain}
          onChange={setDensityGain}
          showValue
          data-testid="schroedinger-density-gain"
        />
        {!config.isoEnabled && dimension > 2 && (
          <Slider
            label="Powder Effect"
            min={0.0}
            max={2.0}
            step={0.1}
            value={config.powderScale}
            onChange={setPowderScale}
            showValue
            data-testid="schroedinger-powder-scale"
          />
        )}
        {!config.isoEnabled && dimension > 2 && (
          <Slider
            label="Anisotropy (Phase)"
            min={-0.9}
            max={0.9}
            step={0.05}
            value={config.scatteringAnisotropy ?? 0.0}
            onChange={setScatteringAnisotropy}
            showValue
            data-testid="schroedinger-anisotropy"
          />
        )}
        <Slider
          label="Density Contrast"
          min={1.0}
          max={4.0}
          step={0.1}
          value={config.densityContrast ?? 1.8}
          onChange={setDensityContrast}
          showValue
          data-testid="schroedinger-density-contrast"
        />
      </ControlGroup>
    </div>
  )
})

SchroedingerAdvanced.displayName = 'SchroedingerAdvanced'
