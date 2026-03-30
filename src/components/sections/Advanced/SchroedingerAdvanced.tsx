import React from 'react'
import { useShallow } from 'zustand/react/shallow'

import { ControlGroup } from '@/components/ui/ControlGroup'
import { Slider } from '@/components/ui/Slider'
import { type AppearanceSlice, useAppearanceStore } from '@/stores/appearanceStore'
import { type ExtendedObjectState, useExtendedObjectStore } from '@/stores/extendedObjectStore'
import { useGeometryStore } from '@/stores/geometryStore'

export const SchroedingerAdvanced: React.FC = React.memo(() => {
  const { dimension, objectType } = useGeometryStore(
    useShallow((state) => ({ dimension: state.dimension, objectType: state.objectType }))
  )
  // Pauli spinor is always volumetric 3D — bypass schroedinger iso/representation checks
  const isPauli = objectType === 'pauliSpinor'
  const extendedObjectSelector = useShallow((state: ExtendedObjectState) => ({
    config: state.schroedinger,
    setPowderScale: state.setSchroedingerPowderScale,
    setScatteringAnisotropy: state.setSchroedingerScatteringAnisotropy,
  }))
  const { config, setPowderScale, setScatteringAnisotropy } =
    useExtendedObjectStore(extendedObjectSelector)

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
      <ControlGroup
        title="Emission & Rim"
        collapsible
        defaultOpen
        data-testid="control-group-emission-rim"
      >
        <Slider
          label="Emission Strength"
          tooltip="Self-illumination intensity. Makes the wavefunction glow from within, independent of lighting."
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
          tooltip="Minimum density below which emission is suppressed. Prevents dim regions from glowing."
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
          tooltip="Shifts the emission hue relative to the surface color. Negative = cooler tones, positive = warmer tones."
          min={-1}
          max={1}
          step={0.1}
          value={faceEmissionColorShift}
          onChange={setFaceEmissionColorShift}
          showValue
          data-testid="schroedinger-emission-color-shift"
        />
      </ControlGroup>

      {/* Volume Rendering — density gain/contrast moved to Exposure section */}
      {(isPauli || (!config.isoEnabled && dimension > 2 && config.representation !== 'wigner')) && (
        <ControlGroup
          title="Volume Effects"
          collapsible
          defaultOpen
          data-testid="control-group-volume-rendering"
        >
          <Slider
            label="Powder Effect"
            tooltip="Simulates light scattering in dense media. Creates a soft, diffuse appearance similar to powder or fog within the volume."
            min={0.0}
            max={2.0}
            step={0.1}
            value={config.powderScale}
            onChange={setPowderScale}
            showValue
            data-testid="schroedinger-powder-scale"
          />
          <Slider
            label="Anisotropy (Phase)"
            tooltip="Henyey-Greenstein scattering parameter. Positive = forward scattering (backlit glow), negative = backscattering (edge highlights)."
            min={-0.9}
            max={0.9}
            step={0.05}
            value={config.scatteringAnisotropy ?? 0.0}
            onChange={setScatteringAnisotropy}
            showValue
            data-testid="schroedinger-anisotropy"
          />
        </ControlGroup>
      )}
    </div>
  )
})

SchroedingerAdvanced.displayName = 'SchroedingerAdvanced'
