import { ColorPicker } from '@/components/ui/ColorPicker'
import { ControlGroup } from '@/components/ui/ControlGroup'
import { Select } from '@/components/ui/Select'
import { Slider } from '@/components/ui/Slider'
import { ToggleButton } from '@/components/ui/ToggleButton'
import { useAppearanceStore, type AppearanceSlice } from '@/stores/appearanceStore'
import { useExtendedObjectStore, type ExtendedObjectState } from '@/stores/extendedObjectStore'
import React from 'react'
import { useShallow } from 'zustand/react/shallow'

export const SchroedingerAdvanced: React.FC = React.memo(() => {
  const extendedObjectSelector = useShallow((state: ExtendedObjectState) => ({
    config: state.schroedinger,
    setDensityGain: state.setSchroedingerDensityGain,
    setDensityContrast: state.setSchroedingerDensityContrast,
    setPowderScale: state.setSchroedingerPowderScale,
    setScatteringAnisotropy: state.setSchroedingerScatteringAnisotropy,
    setDispersionEnabled: state.setSchroedingerDispersionEnabled,
    setDispersionStrength: state.setSchroedingerDispersionStrength,
    setDispersionDirection: state.setSchroedingerDispersionDirection,
    setDispersionQuality: state.setSchroedingerDispersionQuality,
    // Erosion
    setErosionStrength: state.setSchroedingerErosionStrength,
    setErosionScale: state.setSchroedingerErosionScale,
    setErosionTurbulence: state.setSchroedingerErosionTurbulence,
    setErosionNoiseType: state.setSchroedingerErosionNoiseType,
    setErosionHQ: state.setSchroedingerErosionHQ,
    // Electric Arcs
    setArcEnabled: state.setSchroedingerArcEnabled,
    setArcIntensity: state.setSchroedingerArcIntensity,
    setArcScale: state.setSchroedingerArcScale,
    setArcSharpness: state.setSchroedingerArcSharpness,
    setArcSparsity: state.setSchroedingerArcSparsity,
    setArcSpeed: state.setSchroedingerArcSpeed,
    setArcThickness: state.setSchroedingerArcThickness,
    setArcColor: state.setSchroedingerArcColor,
    setArcColorMix: state.setSchroedingerArcColorMix,
    setArcDensityGate: state.setSchroedingerArcDensityGate,
  }))
  const {
    config,
    setDensityGain,
    setDensityContrast,
    setPowderScale,
    setScatteringAnisotropy,
    setDispersionEnabled,
    setDispersionStrength,
    setDispersionDirection,
    setDispersionQuality,
    setErosionStrength,
    setErosionScale,
    setErosionTurbulence,
    setErosionNoiseType,
    setErosionHQ,
    setArcEnabled,
    setArcIntensity,
    setArcScale,
    setArcSharpness,
    setArcSparsity,
    setArcSpeed,
    setArcThickness,
    setArcColor,
    setArcColorMix,
    setArcDensityGate,
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
        {!config.isoEnabled && (
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
        {!config.isoEnabled && (
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

        {/* Density Contrast */}
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

        {/* Electric Arcs */}
        <div className="space-y-2 mt-3 pt-3 border-t border-border-subtle">
          <div className="flex items-center justify-between">
            <label className="text-xs text-text-secondary font-medium">Electric Arcs</label>
            <ToggleButton
              pressed={config.arcEnabled ?? false}
              onToggle={() => setArcEnabled(!(config.arcEnabled ?? false))}
              className="text-xs px-2 py-1 h-auto"
              ariaLabel="Toggle electric arcs"
              data-testid="schroedinger-arc-toggle"
            >
              {config.arcEnabled ? 'ON' : 'OFF'}
            </ToggleButton>
          </div>
          {config.arcEnabled && (
            <div className="ps-2 border-s border-border-default space-y-2">
              <Slider
                label="Intensity"
                min={0}
                max={2}
                step={0.05}
                value={config.arcIntensity ?? 0.8}
                onChange={setArcIntensity}
                showValue
                data-testid="schroedinger-arc-intensity"
              />
              <Slider
                label="Scale"
                min={0.5}
                max={8}
                step={0.1}
                value={config.arcScale ?? 3.0}
                onChange={setArcScale}
                showValue
                data-testid="schroedinger-arc-scale"
              />
              <Slider
                label="Sharpness"
                min={1}
                max={12}
                step={0.1}
                value={config.arcSharpness ?? 5.0}
                onChange={setArcSharpness}
                showValue
                data-testid="schroedinger-arc-sharpness"
              />
              <Slider
                label="Sparsity"
                min={0}
                max={1}
                step={0.01}
                value={config.arcSparsity ?? 0.4}
                onChange={setArcSparsity}
                showValue
                data-testid="schroedinger-arc-sparsity"
              />
              <Slider
                label="Speed"
                min={0}
                max={3}
                step={0.05}
                value={config.arcSpeed ?? 0.5}
                onChange={setArcSpeed}
                showValue
                data-testid="schroedinger-arc-speed"
              />
              <Slider
                label="Thickness"
                min={1}
                max={8}
                step={0.1}
                value={config.arcThickness ?? 4.0}
                onChange={setArcThickness}
                showValue
                data-testid="schroedinger-arc-thickness"
              />
              <Slider
                label="Color Mix"
                min={0}
                max={1}
                step={0.01}
                value={config.arcColorMix ?? 0.5}
                onChange={setArcColorMix}
                showValue
                data-testid="schroedinger-arc-color-mix"
              />
              <Slider
                label="Density Gate"
                min={0}
                max={1}
                step={0.01}
                value={config.arcDensityGate ?? 0.05}
                onChange={setArcDensityGate}
                showValue
                data-testid="schroedinger-arc-density-gate"
              />
              <ColorPicker
                label="Arc Color"
                value={config.arcColor ?? '#88ccff'}
                onChange={setArcColor}
                disableAlpha
              />
            </div>
          )}
        </div>
      </ControlGroup>
    </div>
  )
})

SchroedingerAdvanced.displayName = 'SchroedingerAdvanced'
