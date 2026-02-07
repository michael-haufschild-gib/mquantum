import { ColorPicker } from '@/components/ui/ColorPicker'
import { ControlGroup } from '@/components/ui/ControlGroup'
import { Select } from '@/components/ui/Select'
import { Slider } from '@/components/ui/Slider'
import { ToggleButton } from '@/components/ui/ToggleButton'
import type {
  SchroedingerNodalDefinition,
  SchroedingerNodalFamilyFilter,
  SchroedingerNodalRenderMode,
} from '@/lib/geometry/extended/types'
import { useAppearanceStore, type AppearanceSlice } from '@/stores/appearanceStore'
import { useExtendedObjectStore, type ExtendedObjectState } from '@/stores/extendedObjectStore'
import React from 'react'
import { useShallow } from 'zustand/react/shallow'

const NODAL_DEFINITION_OPTIONS: { value: SchroedingerNodalDefinition; label: string }[] = [
  { value: 'psiAbs', label: '|ψ| (Nodal Envelope)' },
  { value: 'realPart', label: 'Re(ψ) = 0' },
  { value: 'imagPart', label: 'Im(ψ) = 0' },
  { value: 'complexIntersection', label: 'Re(ψ) ∩ Im(ψ)' },
]

const NODAL_FAMILY_OPTIONS: { value: SchroedingerNodalFamilyFilter; label: string }[] = [
  { value: 'all', label: 'All Nodes' },
  { value: 'radial', label: 'Radial Only' },
  { value: 'angular', label: 'Angular Only' },
]

const NODAL_RENDER_MODE_OPTIONS: { value: SchroedingerNodalRenderMode; label: string }[] = [
  { value: 'band', label: 'Volumetric Band' },
  { value: 'surface', label: 'Ray-Hit Surface' },
]

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
    // Quantum Effects
    setNodalEnabled: state.setSchroedingerNodalEnabled,
    setNodalColor: state.setSchroedingerNodalColor,
    setNodalStrength: state.setSchroedingerNodalStrength,
    setNodalDefinition: state.setSchroedingerNodalDefinition,
    setNodalTolerance: state.setSchroedingerNodalTolerance,
    setNodalFamilyFilter: state.setSchroedingerNodalFamilyFilter,
    setNodalRenderMode: state.setSchroedingerNodalRenderMode,
    setNodalLobeColoringEnabled: state.setSchroedingerNodalLobeColoringEnabled,
    setNodalColorReal: state.setSchroedingerNodalColorReal,
    setNodalColorImag: state.setSchroedingerNodalColorImag,
    setNodalColorPositive: state.setSchroedingerNodalColorPositive,
    setNodalColorNegative: state.setSchroedingerNodalColorNegative,
    setEnergyColorEnabled: state.setSchroedingerEnergyColorEnabled,
    setUncertaintyBoundaryEnabled: state.setSchroedingerUncertaintyBoundaryEnabled,
    setUncertaintyBoundaryStrength: state.setSchroedingerUncertaintyBoundaryStrength,
    setUncertaintyConfidenceMass: state.setSchroedingerUncertaintyConfidenceMass,
    setUncertaintyBoundaryWidth: state.setSchroedingerUncertaintyBoundaryWidth,
    setPhaseMaterialityEnabled: state.setSchroedingerPhaseMaterialityEnabled,
    setPhaseMaterialityStrength: state.setSchroedingerPhaseMaterialityStrength,
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
    setDensityContrast,
    setPowderScale,
    setScatteringAnisotropy,
    setDispersionEnabled,
    setDispersionStrength,
    setDispersionDirection,
    setDispersionQuality,
    setNodalEnabled,
    setNodalColor,
    setNodalStrength,
    setNodalDefinition,
    setNodalTolerance,
    setNodalFamilyFilter,
    setNodalRenderMode,
    setNodalLobeColoringEnabled,
    setNodalColorReal,
    setNodalColorImag,
    setNodalColorPositive,
    setNodalColorNegative,
    setEnergyColorEnabled,
    setUncertaintyBoundaryEnabled,
    setUncertaintyBoundaryStrength,
    setUncertaintyConfidenceMass,
    setUncertaintyBoundaryWidth,
    setPhaseMaterialityEnabled,
    setPhaseMaterialityStrength,
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
            <div className="ps-2 border-s border-border-default space-y-2">
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

              <Select
                label="Rendering Mode"
                options={NODAL_RENDER_MODE_OPTIONS}
                value={config.nodalRenderMode ?? 'band'}
                onChange={setNodalRenderMode}
                data-testid="schroedinger-nodal-render-mode"
              />

              <Select
                label="Definition"
                options={NODAL_DEFINITION_OPTIONS}
                value={config.nodalDefinition ?? 'psiAbs'}
                onChange={setNodalDefinition}
                data-testid="schroedinger-nodal-definition"
              />

              <Slider
                label="Zero Tolerance ε"
                min={0.00001}
                max={0.5}
                step={0.001}
                value={config.nodalTolerance ?? 0.02}
                onChange={setNodalTolerance}
                showValue
                formatValue={(value) => value.toFixed(4)}
                data-testid="schroedinger-nodal-tolerance"
              />

              <Select
                label="Hydrogen Node Family"
                options={NODAL_FAMILY_OPTIONS}
                value={config.nodalFamilyFilter ?? 'all'}
                onChange={setNodalFamilyFilter}
                disabled={config.quantumMode !== 'hydrogenND'}
                data-testid="schroedinger-nodal-family-filter"
              />
              {config.quantumMode !== 'hydrogenND' && (
                <p className="text-xs text-text-tertiary">
                  Family filtering is available in Hydrogen ND mode.
                </p>
              )}

              <div className="flex items-center justify-between">
                <label className="text-xs text-text-secondary">Lobe Sign Colors</label>
                <ToggleButton
                  pressed={config.nodalLobeColoringEnabled ?? false}
                  onToggle={() =>
                    setNodalLobeColoringEnabled(!(config.nodalLobeColoringEnabled ?? false))
                  }
                  className="text-xs px-2 py-1 h-auto"
                  ariaLabel="Toggle lobe sign coloring"
                  data-testid="schroedinger-nodal-lobe-toggle"
                >
                  {config.nodalLobeColoringEnabled ? 'ON' : 'OFF'}
                </ToggleButton>
              </div>

              {config.nodalLobeColoringEnabled ? (
                <>
                  <div
                    className="flex items-center justify-between"
                    data-testid="schroedinger-nodal-color-positive"
                  >
                    <label className="text-xs text-text-secondary">Positive Lobe</label>
                    <ColorPicker
                      value={config.nodalColorPositive ?? '#22c55e'}
                      onChange={setNodalColorPositive}
                      disableAlpha={true}
                      className="w-24"
                    />
                  </div>
                  <div
                    className="flex items-center justify-between"
                    data-testid="schroedinger-nodal-color-negative"
                  >
                    <label className="text-xs text-text-secondary">Negative Lobe</label>
                    <ColorPicker
                      value={config.nodalColorNegative ?? '#ef4444'}
                      onChange={setNodalColorNegative}
                      disableAlpha={true}
                      className="w-24"
                    />
                  </div>
                </>
              ) : (
                <>
                  <div
                    className="flex items-center justify-between"
                    data-testid="schroedinger-nodal-color-abs"
                  >
                    <label className="text-xs text-text-secondary">|ψ| Color</label>
                    <ColorPicker
                      value={config.nodalColor ?? '#00ffff'}
                      onChange={setNodalColor}
                      disableAlpha={true}
                      className="w-24"
                    />
                  </div>
                  <div
                    className="flex items-center justify-between"
                    data-testid="schroedinger-nodal-color-real"
                  >
                    <label className="text-xs text-text-secondary">Re(ψ) Color</label>
                    <ColorPicker
                      value={config.nodalColorReal ?? '#00ffff'}
                      onChange={setNodalColorReal}
                      disableAlpha={true}
                      className="w-24"
                    />
                  </div>
                  <div
                    className="flex items-center justify-between"
                    data-testid="schroedinger-nodal-color-imag"
                  >
                    <label className="text-xs text-text-secondary">Im(ψ) Color</label>
                    <ColorPicker
                      value={config.nodalColorImag ?? '#ff66ff'}
                      onChange={setNodalColorImag}
                      disableAlpha={true}
                      className="w-24"
                    />
                  </div>
                </>
              )}
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

        {/* Uncertainty Boundary */}
        <div className="space-y-1 mt-2">
          <div className="flex items-center justify-between">
            <label className="text-xs text-text-secondary">Uncertainty Boundary</label>
            <ToggleButton
              pressed={config.uncertaintyBoundaryEnabled ?? false}
              onToggle={() => {
                setUncertaintyBoundaryEnabled(!(config.uncertaintyBoundaryEnabled ?? false))
              }}
              className="text-xs px-2 py-1 h-auto"
              ariaLabel="Toggle uncertainty boundary"
              data-testid="schroedinger-uncertainty-boundary-toggle"
            >
              {config.uncertaintyBoundaryEnabled ? 'ON' : 'OFF'}
            </ToggleButton>
          </div>
          {config.uncertaintyBoundaryEnabled && (
            <div className="ps-2 border-s border-border-default space-y-2">
              <Slider
                label="Strength"
                min={0.0}
                max={1.0}
                step={0.05}
                value={config.uncertaintyBoundaryStrength ?? 0.5}
                onChange={setUncertaintyBoundaryStrength}
                showValue
                data-testid="schroedinger-uncertainty-boundary-strength"
              />
              <Slider
                label="Confidence Mass"
                min={0.5}
                max={0.99}
                step={0.01}
                value={config.uncertaintyConfidenceMass ?? 0.68}
                onChange={setUncertaintyConfidenceMass}
                showValue
                data-testid="schroedinger-uncertainty-confidence"
              />
              <Slider
                label="Boundary Width"
                min={0.05}
                max={1.0}
                step={0.05}
                value={config.uncertaintyBoundaryWidth ?? 0.3}
                onChange={setUncertaintyBoundaryWidth}
                showValue
                data-testid="schroedinger-uncertainty-boundary-width"
              />
            </div>
          )}
        </div>

        {/* Phase Materiality */}
        <div className="space-y-1 mt-2">
          <div className="flex items-center justify-between">
            <label className="text-xs text-text-secondary">Phase Materiality</label>
            <ToggleButton
              pressed={config.phaseMaterialityEnabled ?? false}
              onToggle={() =>
                setPhaseMaterialityEnabled(!(config.phaseMaterialityEnabled ?? false))
              }
              className="text-xs px-2 py-1 h-auto"
              ariaLabel="Toggle phase materiality"
              data-testid="schroedinger-phase-materiality-toggle"
            >
              {config.phaseMaterialityEnabled ? 'ON' : 'OFF'}
            </ToggleButton>
          </div>
          {config.phaseMaterialityEnabled && (
            <Slider
              label="Strength"
              min={0}
              max={1}
              step={0.05}
              value={config.phaseMaterialityStrength ?? 1.0}
              onChange={setPhaseMaterialityStrength}
              showValue
              data-testid="schroedinger-phase-materiality-strength"
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
      </ControlGroup>
    </div>
  )
})

SchroedingerAdvanced.displayName = 'SchroedingerAdvanced'
