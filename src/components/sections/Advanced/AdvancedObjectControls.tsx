import React from 'react'
import { useShallow } from 'zustand/react/shallow'

import { Section } from '@/components/sections/Section'
import { ColorPicker } from '@/components/ui/ColorPicker'
import { ControlGroup } from '@/components/ui/ControlGroup'
import { Slider } from '@/components/ui/Slider'
import { Switch } from '@/components/ui/Switch'
import { supportsSchroedingerSurfaceMode } from '@/lib/geometry/registry'
import { type AppearanceSlice, useAppearanceStore } from '@/stores/scene/appearanceStore'
import {
  type ExtendedObjectState,
  useExtendedObjectStore,
} from '@/stores/scene/extendedObjectStore'
import { useGeometryStore } from '@/stores/scene/geometryStore'

/** Advanced rendering controls: SSS, emission & rim, and volume effects. */
export const AdvancedObjectControls: React.FC = React.memo(() => {
  const { dimension, objectType } = useGeometryStore(
    useShallow((state) => ({ dimension: state.dimension, objectType: state.objectType }))
  )

  const { isoEnabled, quantumMode, representation } = useExtendedObjectStore(
    useShallow((state: ExtendedObjectState) => ({
      isoEnabled: state.schroedinger?.isoEnabled ?? false,
      quantumMode: state.schroedinger?.quantumMode ?? 'harmonicOscillator',
      representation: state.schroedinger?.representation ?? 'position',
    }))
  )

  const { powderScale, scatteringAnisotropy, setPowderScale, setScatteringAnisotropy } =
    useExtendedObjectStore(
      useShallow((state: ExtendedObjectState) => ({
        powderScale: state.schroedinger?.powderScale ?? 1.0,
        scatteringAnisotropy: state.schroedinger?.scatteringAnisotropy ?? 0,
        setPowderScale: state.setSchroedingerPowderScale,
        setScatteringAnisotropy: state.setSchroedingerScatteringAnisotropy,
      }))
    )

  const {
    sssEnabled,
    setSssEnabled,
    sssIntensity,
    setSssIntensity,
    sssColor,
    setSssColor,
    sssThickness,
    setSssThickness,
    sssJitter,
    setSssJitter,
  } = useAppearanceStore(
    useShallow((state: AppearanceSlice) => ({
      sssEnabled: state.sssEnabled,
      setSssEnabled: state.setSssEnabled,
      sssIntensity: state.sssIntensity,
      setSssIntensity: state.setSssIntensity,
      sssColor: state.sssColor,
      setSssColor: state.setSssColor,
      sssThickness: state.sssThickness,
      setSssThickness: state.setSssThickness,
      sssJitter: state.sssJitter,
      setSssJitter: state.setSssJitter,
    }))
  )

  const {
    faceEmission,
    faceEmissionThreshold,
    faceEmissionColorShift,
    setFaceEmission,
    setFaceEmissionThreshold,
    setFaceEmissionColorShift,
  } = useAppearanceStore(
    useShallow((state: AppearanceSlice) => ({
      faceEmission: state.faceEmission,
      faceEmissionThreshold: state.faceEmissionThreshold,
      faceEmissionColorShift: state.faceEmissionColorShift,
      setFaceEmission: state.setFaceEmission,
      setFaceEmissionThreshold: state.setFaceEmissionThreshold,
      setFaceEmissionColorShift: state.setFaceEmissionColorShift,
    }))
  )

  if (objectType !== 'schroedinger' && objectType !== 'pauliSpinor') {
    return null
  }

  const isPauli = objectType === 'pauliSpinor'
  const effectiveIsoEnabled =
    isoEnabled &&
    supportsSchroedingerSurfaceMode({
      objectType,
      quantumMode,
      dimension,
      representation,
    })
  const showVolumetric =
    isPauli || (!effectiveIsoEnabled && dimension > 2 && representation !== 'wigner')

  return (
    <Section title="Advanced Rendering" defaultOpen={true} data-testid="advanced-object-controls">
      <div className="space-y-4">
        {/* Subsurface Scattering (volumetric only, 3D+) */}
        {showVolumetric && (
          <ControlGroup
            title="Subsurface Scattering"
            collapsible
            defaultOpen={false}
            data-testid="control-group-subsurface-scattering"
            rightElement={
              <Switch
                checked={sssEnabled}
                onCheckedChange={setSssEnabled}
                tooltip="Simulate translucent subsurface light scattering within the volume."
                data-testid="global-sss-toggle"
              />
            }
          >
            <Slider
              label="Intensity"
              tooltip="Strength of the subsurface scattering effect. Higher values simulate more translucent materials where light penetrates and scatters inside."
              min={0.0}
              max={2.0}
              step={0.1}
              value={sssIntensity}
              onChange={setSssIntensity}
              showValue
              data-testid="global-sss-intensity"
            />
            <div className="flex items-center justify-between">
              <label className="text-xs text-[var(--text-secondary)]">SSS Tint</label>
              <ColorPicker
                value={sssColor}
                onChange={setSssColor}
                tooltip="Tint color for subsurface scattered light. Warm tones simulate organic materials; cool tones simulate crystalline media."
                disableAlpha={true}
                className="w-24"
              />
            </div>
            <Slider
              label="Thickness"
              tooltip="Penetration depth of the subsurface scatter. Larger values let light travel further into the volume before scattering back."
              min={0.1}
              max={5.0}
              step={0.1}
              value={sssThickness}
              onChange={setSssThickness}
              showValue
              data-testid="global-sss-thickness"
            />
            <Slider
              label="Sample Jitter"
              tooltip="Random offset applied to scatter sample positions. Reduces visible banding artifacts at the cost of slight noise."
              min={0.0}
              max={1.0}
              step={0.05}
              value={sssJitter}
              onChange={setSssJitter}
              showValue
              data-testid="global-sss-jitter"
            />
          </ControlGroup>
        )}

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
            tooltip={
              representation === 'wigner'
                ? 'Color shift is not available in Wigner phase-space mode.'
                : 'Shifts the emission hue relative to the surface color. Negative = cooler tones, positive = warmer tones.'
            }
            min={-1}
            max={1}
            step={0.1}
            value={faceEmissionColorShift}
            onChange={setFaceEmissionColorShift}
            showValue
            disabled={representation === 'wigner'}
            data-testid="schroedinger-emission-color-shift"
          />
        </ControlGroup>

        {/* Volume Effects (Schrödinger volumetric only — Pauli has no powderScale/scatteringAnisotropy) */}
        {showVolumetric && !isPauli && (
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
              value={powderScale}
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
              value={scatteringAnisotropy}
              onChange={setScatteringAnisotropy}
              showValue
              data-testid="schroedinger-anisotropy"
            />
          </ControlGroup>
        )}
      </div>
    </Section>
  )
})

AdvancedObjectControls.displayName = 'AdvancedObjectControls'
