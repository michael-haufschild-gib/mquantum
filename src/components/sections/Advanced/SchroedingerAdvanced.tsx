import { ColorPicker } from '@/components/ui/ColorPicker'
import { ControlGroup } from '@/components/ui/ControlGroup'
import { Select } from '@/components/ui/Select'
import { Slider } from '@/components/ui/Slider'
import { Switch } from '@/components/ui/Switch'
import { ToggleButton } from '@/components/ui/ToggleButton'
import { useAppearanceStore, type AppearanceSlice } from '@/stores/appearanceStore'
import { useExtendedObjectStore, type ExtendedObjectState } from '@/stores/extendedObjectStore'
import React from 'react'
import { useShallow } from 'zustand/react/shallow'

export const SchroedingerAdvanced: React.FC = React.memo(() => {
  const extendedObjectSelector = useShallow((state: ExtendedObjectState) => ({
    config: state.schroedinger,
    setDensityGain: state.setSchroedingerDensityGain,
    setPowderScale: state.setSchroedingerPowderScale,
    setScatteringAnisotropy: state.setSchroedingerScatteringAnisotropy,
    setDispersionEnabled: state.setSchroedingerDispersionEnabled,
    setDispersionStrength: state.setSchroedingerDispersionStrength,
    setDispersionDirection: state.setSchroedingerDispersionDirection,
    setDispersionQuality: state.setSchroedingerDispersionQuality,
    // Shadows/AO
    setShadowsEnabled: state.setSchroedingerShadowsEnabled,
    setShadowStrength: state.setSchroedingerShadowStrength,
    setAoEnabled: state.setSchroedingerAoEnabled,
    setAoStrength: state.setSchroedingerAoStrength,
    // Quantum Effects
    setNodalEnabled: state.setSchroedingerNodalEnabled,
    setNodalColor: state.setSchroedingerNodalColor,
    setNodalStrength: state.setSchroedingerNodalStrength,
    setEnergyColorEnabled: state.setSchroedingerEnergyColorEnabled,
    setShimmerEnabled: state.setSchroedingerShimmerEnabled,
    setShimmerStrength: state.setSchroedingerShimmerStrength,
    setIsoEnabled: state.setSchroedingerIsoEnabled,
    setIsoThreshold: state.setSchroedingerIsoThreshold,
    // Erosion
    setErosionStrength: state.setSchroedingerErosionStrength,
    setErosionScale: state.setSchroedingerErosionScale,
    setErosionTurbulence: state.setSchroedingerErosionTurbulence,
    setErosionNoiseType: state.setSchroedingerErosionNoiseType,
    setErosionHQ: state.setSchroedingerErosionHQ,
  }))
  const {
    config,
    setDensityGain,
    setPowderScale,
    setScatteringAnisotropy,
    setDispersionEnabled,
    setDispersionStrength,
    setDispersionDirection,
    setDispersionQuality,
    setShadowsEnabled,
    setShadowStrength,
    setAoEnabled,
    setAoStrength,
    setNodalEnabled,
    setNodalColor,
    setNodalStrength,
    setEnergyColorEnabled,
    setShimmerEnabled,
    setShimmerStrength,
    setIsoEnabled,
    setIsoThreshold,
    setErosionStrength,
    setErosionScale,
    setErosionTurbulence,
    setErosionNoiseType,
    setErosionHQ,
  } = useExtendedObjectStore(extendedObjectSelector)

  // Emission settings from appearance store
  const emissionSelector = useShallow((state: AppearanceSlice) => ({
    faceEmission: state.faceEmission,
    faceEmissionThreshold: state.faceEmissionThreshold,
    faceEmissionColorShift: state.faceEmissionColorShift,
    faceEmissionPulsing: state.faceEmissionPulsing,
    faceRimFalloff: state.faceRimFalloff,
    setFaceEmission: state.setFaceEmission,
    setFaceEmissionThreshold: state.setFaceEmissionThreshold,
    setFaceEmissionColorShift: state.setFaceEmissionColorShift,
    setFaceEmissionPulsing: state.setFaceEmissionPulsing,
    setFaceRimFalloff: state.setFaceRimFalloff,
  }))
  const {
    faceEmission,
    faceEmissionThreshold,
    faceEmissionColorShift,
    faceEmissionPulsing,
    faceRimFalloff,
    setFaceEmission,
    setFaceEmissionThreshold,
    setFaceEmissionColorShift,
    setFaceEmissionPulsing,
    setFaceRimFalloff,
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
        <div className="flex items-center justify-between py-2">
          <label className="text-xs text-text-secondary">Pulsing</label>
          <Switch
            checked={faceEmissionPulsing}
            onCheckedChange={setFaceEmissionPulsing}
            data-testid="schroedinger-emission-pulsing"
          />
        </div>
        <Slider
          label="Rim Falloff"
          min={0}
          max={10}
          step={0.5}
          value={faceRimFalloff}
          onChange={setFaceRimFalloff}
          showValue
          data-testid="schroedinger-rim-falloff"
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

        {/* Volumetric Shadows */}
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-border-subtle">
          <label className="text-xs text-text-secondary">Volumetric Shadows</label>
          <ToggleButton
            pressed={config.shadowsEnabled ?? false}
            onToggle={() => setShadowsEnabled(!(config.shadowsEnabled ?? false))}
            className="text-xs px-2 py-1 h-auto"
            ariaLabel="Toggle shadows"
          >
            {config.shadowsEnabled ? 'ON' : 'OFF'}
          </ToggleButton>
        </div>
        {config.shadowsEnabled && (
          <Slider
            label="Shadow Strength"
            min={0}
            max={2}
            step={0.1}
            value={config.shadowStrength ?? 1.0}
            onChange={setShadowStrength}
            showValue
          />
        )}

        {/* Volumetric AO */}
        <div className="flex items-center justify-between mt-2">
          <label className="text-xs text-text-secondary">Volumetric AO</label>
          <ToggleButton
            pressed={config.aoEnabled ?? false}
            onToggle={() => setAoEnabled(!(config.aoEnabled ?? false))}
            className="text-xs px-2 py-1 h-auto"
            ariaLabel="Toggle AO"
          >
            {config.aoEnabled ? 'ON' : 'OFF'}
          </ToggleButton>
        </div>
        {config.aoEnabled && (
          <Slider
            label="AO Strength"
            min={0}
            max={2}
            step={0.1}
            value={config.aoStrength ?? 1.0}
            onChange={setAoStrength}
            showValue
          />
        )}

        {/* Isosurface Mode */}
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-border-subtle">
          <label className="text-xs text-text-secondary">Isosurface Mode</label>
          <ToggleButton
            pressed={config.isoEnabled}
            onToggle={() => setIsoEnabled(!config.isoEnabled)}
            className="text-xs px-2 py-1 h-auto"
            ariaLabel="Toggle isosurface mode"
            data-testid="schroedinger-iso-toggle"
          >
            {config.isoEnabled ? 'ON' : 'OFF'}
          </ToggleButton>
        </div>
        {config.isoEnabled && (
          <Slider
            label="Iso Threshold (log)"
            min={-6}
            max={0}
            step={0.1}
            value={config.isoThreshold}
            onChange={setIsoThreshold}
            showValue
            data-testid="schroedinger-iso-threshold"
          />
        )}
        <p className="text-xs text-text-tertiary">
          {config.isoEnabled
            ? 'Sharp surface at constant probability density'
            : 'Volumetric cloud visualization'}
        </p>
      </ControlGroup>

      {/* Quantum Effects */}
      <ControlGroup title="Quantum Effects" collapsible defaultOpen>
        {/* Nodal Surfaces */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label className="text-xs text-text-secondary">Nodal Surfaces</label>
            <ToggleButton
              pressed={config.nodalEnabled ?? false}
              onToggle={() => setNodalEnabled(!(config.nodalEnabled ?? false))}
              className="text-xs px-2 py-1 h-auto"
              ariaLabel="Toggle nodal surfaces"
              data-testid="schroedinger-nodal-toggle"
            >
              {config.nodalEnabled ? 'ON' : 'OFF'}
            </ToggleButton>
          </div>
          {config.nodalEnabled && (
            <div className="ps-2 border-s border-border-default">
              <Slider
                label="Strength"
                min={0.0}
                max={2.0}
                step={0.1}
                value={config.nodalStrength ?? 1.0}
                onChange={setNodalStrength}
                showValue
                data-testid="schroedinger-nodal-strength"
              />
              <div className="flex items-center justify-between mt-1">
                <label className="text-xs text-text-secondary">Color</label>
                <ColorPicker
                  value={config.nodalColor ?? '#00ffff'}
                  onChange={(c) => setNodalColor(c)}
                  disableAlpha={true}
                  className="w-24"
                />
              </div>
            </div>
          )}
        </div>

        {/* Energy Coloring */}
        <div className="flex items-center justify-between mt-2">
          <label className="text-xs text-text-secondary">Energy Coloring</label>
          <ToggleButton
            pressed={config.energyColorEnabled ?? false}
            onToggle={() => setEnergyColorEnabled(!(config.energyColorEnabled ?? false))}
            className="text-xs px-2 py-1 h-auto"
            ariaLabel="Toggle energy coloring"
            data-testid="schroedinger-energy-toggle"
          >
            {config.energyColorEnabled ? 'ON' : 'OFF'}
          </ToggleButton>
        </div>

        {/* Uncertainty Shimmer */}
        <div className="space-y-1 mt-2">
          <div className="flex items-center justify-between">
            <label className="text-xs text-text-secondary">Uncertainty Shimmer</label>
            <ToggleButton
              pressed={config.shimmerEnabled ?? false}
              onToggle={() => setShimmerEnabled(!(config.shimmerEnabled ?? false))}
              className="text-xs px-2 py-1 h-auto"
              ariaLabel="Toggle shimmer"
              data-testid="schroedinger-shimmer-toggle"
            >
              {config.shimmerEnabled ? 'ON' : 'OFF'}
            </ToggleButton>
          </div>
          {config.shimmerEnabled && (
            <Slider
              label="Strength"
              min={0.0}
              max={1.0}
              step={0.1}
              value={config.shimmerStrength ?? 0.5}
              onChange={setShimmerStrength}
              showValue
              data-testid="schroedinger-shimmer-strength"
            />
          )}
        </div>
      </ControlGroup>

      {/* Artistic - Chromatic Dispersion & Erosion */}
      <ControlGroup title="Artistic" collapsible defaultOpen>
        {/* Chromatic Dispersion */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs text-text-secondary font-medium">Chromatic Dispersion</label>
            <ToggleButton
              pressed={config.dispersionEnabled ?? false}
              onToggle={() => setDispersionEnabled(!(config.dispersionEnabled ?? false))}
              className="text-xs px-2 py-1 h-auto"
              ariaLabel="Toggle dispersion"
              data-testid="schroedinger-dispersion-toggle"
            >
              {config.dispersionEnabled ? 'ON' : 'OFF'}
            </ToggleButton>
          </div>
          {config.dispersionEnabled && (
            <div className="ps-2 border-s border-border-default space-y-2">
              <Slider
                label="Strength"
                min={0.0}
                max={1.0}
                step={0.05}
                value={config.dispersionStrength ?? 0.2}
                onChange={setDispersionStrength}
                showValue
                data-testid="schroedinger-dispersion-strength"
              />
              <div className="flex gap-2">
                <div className="flex-1">
                  <Select
                    label="Direction"
                    options={[
                      { value: '0', label: 'Radial' },
                      { value: '1', label: 'View' },
                    ]}
                    value={String(config.dispersionDirection ?? 0)}
                    onChange={(v) => setDispersionDirection(parseInt(v))}
                    data-testid="schroedinger-dispersion-direction"
                  />
                </div>
                <div className="flex-1">
                  <Select
                    label="Quality"
                    options={[
                      { value: '0', label: 'Fast (Grad)' },
                      { value: '1', label: 'High (Sample)' },
                    ]}
                    value={String(config.dispersionQuality ?? 0)}
                    onChange={(v) => setDispersionQuality(parseInt(v))}
                    data-testid="schroedinger-dispersion-quality"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Edge Erosion */}
        <div className="space-y-2 mt-3 pt-3 border-t border-border-subtle">
          <label className="text-xs text-text-secondary font-medium">Edge Erosion</label>
          <Slider
            label="Strength"
            min={0.0}
            max={1.0}
            step={0.05}
            value={config.erosionStrength ?? 0.0}
            onChange={setErosionStrength}
            showValue
            data-testid="schroedinger-erosion-strength"
          />
          {(config.erosionStrength ?? 0) > 0 && (
            <div className="ps-2 border-s border-border-default space-y-2">
              <Slider
                label="Scale"
                min={0.25}
                max={4.0}
                step={0.25}
                value={config.erosionScale ?? 1.0}
                onChange={setErosionScale}
                showValue
                data-testid="schroedinger-erosion-scale"
              />
              <Slider
                label="Turbulence"
                min={0.0}
                max={1.0}
                step={0.1}
                value={config.erosionTurbulence ?? 0.5}
                onChange={setErosionTurbulence}
                showValue
                data-testid="schroedinger-erosion-turbulence"
              />
              <Select
                label="Noise Type"
                options={[
                  { value: '0', label: 'Worley (Cloudy)' },
                  { value: '1', label: 'Perlin (Smooth)' },
                  { value: '2', label: 'Hybrid (Billowy)' },
                ]}
                value={String(config.erosionNoiseType ?? 0)}
                onChange={(v) => setErosionNoiseType(parseInt(v))}
                data-testid="schroedinger-erosion-type"
              />
              <div className="flex items-center justify-between">
                <label className="text-xs text-text-secondary">HQ Mode</label>
                <ToggleButton
                  pressed={config.erosionHQ ?? false}
                  onToggle={() => setErosionHQ(!(config.erosionHQ ?? false))}
                  className="text-xs px-2 py-1 h-auto"
                  data-testid="schroedinger-erosion-hq"
                  ariaLabel="Toggle high quality erosion mode"
                >
                  {config.erosionHQ ? 'ON' : 'OFF'}
                </ToggleButton>
              </div>
            </div>
          )}
        </div>
      </ControlGroup>
    </div>
  )
})

SchroedingerAdvanced.displayName = 'SchroedingerAdvanced'
