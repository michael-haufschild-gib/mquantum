import React from 'react'
import { useShallow } from 'zustand/react/shallow'

import { Section } from '@/components/sections/Section'
import { UnavailableSection } from '@/components/sections/UnavailableSection'
import { ColorPicker } from '@/components/ui/ColorPicker'
import { Select } from '@/components/ui/Select'
import { Slider } from '@/components/ui/Slider'
import { Switch } from '@/components/ui/Switch'
import type {
  SchroedingerNodalDefinition,
  SchroedingerNodalFamilyFilter,
  SchroedingerNodalRenderMode,
} from '@/lib/geometry/extended/types'
import { DEFAULT_SCHROEDINGER_CONFIG } from '@/lib/geometry/extended/types'
import { type ExtendedObjectState, useExtendedObjectStore } from '@/stores/extendedObjectStore'
import { useGeometryStore } from '@/stores/geometryStore'

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

/** Props for the quantum effects analysis section (uncertainty, nodal surfaces). */
export interface SchroedingerQuantumEffectsSectionProps {
  defaultOpen?: boolean
}

export const SchroedingerQuantumEffectsSection: React.FC<SchroedingerQuantumEffectsSectionProps> =
  React.memo(({ defaultOpen = true }) => {
    const objectType = useGeometryStore((state) => state.objectType)
    const dimension = useGeometryStore((state) => state.dimension)

    const extendedObjectSelector = useShallow((state: ExtendedObjectState) => ({
      config: state.schroedinger,
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

      setUncertaintyBoundaryEnabled: state.setSchroedingerUncertaintyBoundaryEnabled,
      setUncertaintyBoundaryStrength: state.setSchroedingerUncertaintyBoundaryStrength,
      setUncertaintyConfidenceMass: state.setSchroedingerUncertaintyConfidenceMass,
      setUncertaintyBoundaryWidth: state.setSchroedingerUncertaintyBoundaryWidth,
      setPhaseMaterialityEnabled: state.setSchroedingerPhaseMaterialityEnabled,
      setPhaseMaterialityStrength: state.setSchroedingerPhaseMaterialityStrength,
    }))
    const {
      config,
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

      setUncertaintyBoundaryEnabled,
      setUncertaintyBoundaryStrength,
      setUncertaintyConfidenceMass,
      setUncertaintyBoundaryWidth,
      setPhaseMaterialityEnabled,
      setPhaseMaterialityStrength,
    } = useExtendedObjectStore(extendedObjectSelector)

    if (objectType !== 'schroedinger') {
      return null
    }
    const isHydrogenMode =
      config.quantumMode === 'hydrogenND' || config.quantumMode === 'hydrogenNDCoupled'
    // Quantum effects are 3D volumetric shader features — hide for 2D, Wigner, and freeScalar modes.
    // Free scalar field uses density-grid raymarching; these shader features are disabled in
    // extractSchrodingerConfig and would have no visual effect.
    if (
      dimension <= 2 ||
      config.representation === 'wigner' ||
      config.quantumMode === 'freeScalarField' ||
      config.quantumMode === 'tdseDynamics' ||
      config.quantumMode === 'becDynamics' ||
      config.quantumMode === 'diracEquation'
    ) {
      const reason =
        dimension <= 2
          ? 'Requires 3D or higher'
          : config.representation === 'wigner'
            ? 'Not available in Wigner representation'
            : 'Available in Harmonic Oscillator and Hydrogen modes'
      return <UnavailableSection title="Quantum Effects" reason={reason} />
    }

    return (
      <Section
        title="Quantum Effects"
        defaultOpen={defaultOpen}
        data-testid="quantum-effects-section"
      >
        <div className="space-y-2">
          <div className="space-y-1">
            <Switch
              label="Nodal Surfaces"
              tooltip="Highlight regions where the wavefunction passes through zero. These surfaces separate positive and negative lobes."
              checked={config.nodalEnabled ?? false}
              onCheckedChange={(checked) => setNodalEnabled(checked)}
              data-testid="schroedinger-nodal-toggle"
            />
            {config.nodalEnabled && (
              <div className="ps-2 border-s border-border-default space-y-2">
                <Slider
                  label="Strength"
                  tooltip="Visual intensity of the nodal surface highlight. Higher values make the zero-crossing surfaces more prominent."
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
                  tooltip="Volumetric Band renders a soft glowing region around the node. Ray-Hit Surface renders a sharp isosurface."
                  options={NODAL_RENDER_MODE_OPTIONS}
                  value={config.nodalRenderMode ?? 'band'}
                  onChange={setNodalRenderMode}
                  data-testid="schroedinger-nodal-render-mode"
                />

                <Select
                  label="Definition"
                  tooltip="Which zero-crossing to detect: |psi| envelope nodes, Re(psi)=0, Im(psi)=0, or the intersection of Re and Im zeros."
                  options={NODAL_DEFINITION_OPTIONS}
                  value={config.nodalDefinition ?? 'psiAbs'}
                  onChange={setNodalDefinition}
                  data-testid="schroedinger-nodal-definition"
                />

                <Slider
                  label="Zero Tolerance ε"
                  tooltip="Width of the zero-crossing detection band. Smaller values produce thinner, more precise nodal surfaces."
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
                  tooltip="Filter nodal surfaces by origin: radial nodes (from the Laguerre polynomial), angular nodes (from spherical harmonics), or both."
                  options={NODAL_FAMILY_OPTIONS}
                  value={config.nodalFamilyFilter ?? 'all'}
                  onChange={setNodalFamilyFilter}
                  disabled={!isHydrogenMode}
                  data-testid="schroedinger-nodal-family-filter"
                />
                {!isHydrogenMode && (
                  <p className="text-xs text-text-tertiary">
                    Family filtering is available in Hydrogen ND mode.
                  </p>
                )}

                <Switch
                  label="Lobe Sign Colors"
                  tooltip="Color positive and negative wavefunction lobes differently, making the sign structure visible across nodal boundaries."
                  checked={config.nodalLobeColoringEnabled ?? false}
                  onCheckedChange={(checked) => setNodalLobeColoringEnabled(checked)}
                  data-testid="schroedinger-nodal-lobe-toggle"
                />

                {config.nodalLobeColoringEnabled ? (
                  <>
                    <div
                      className="flex items-center justify-between"
                      data-testid="schroedinger-nodal-color-positive"
                    >
                      <label className="text-xs text-text-secondary">Positive Lobe</label>
                      <ColorPicker
                        value={
                          config.nodalColorPositive ??
                          DEFAULT_SCHROEDINGER_CONFIG.nodalColorPositive
                        }
                        onChange={setNodalColorPositive}
                        tooltip="Color for regions where the wavefunction is positive."
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
                        value={
                          config.nodalColorNegative ??
                          DEFAULT_SCHROEDINGER_CONFIG.nodalColorNegative
                        }
                        onChange={setNodalColorNegative}
                        tooltip="Color for regions where the wavefunction is negative."
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
                        value={config.nodalColor ?? DEFAULT_SCHROEDINGER_CONFIG.nodalColor}
                        onChange={setNodalColor}
                        tooltip="Color of the nodal surface where |psi| passes through zero."
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
                        value={config.nodalColorReal ?? DEFAULT_SCHROEDINGER_CONFIG.nodalColorReal}
                        onChange={setNodalColorReal}
                        tooltip="Color of the nodal surface where Re(psi) = 0."
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
                        value={config.nodalColorImag ?? DEFAULT_SCHROEDINGER_CONFIG.nodalColorImag}
                        onChange={setNodalColorImag}
                        tooltip="Color of the nodal surface where Im(psi) = 0."
                        disableAlpha={true}
                        className="w-24"
                      />
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="space-y-1 mt-2">
            <Switch
              label="Uncertainty Boundary"
              tooltip="Render a shell at the boundary enclosing a given fraction of the probability density, visualizing the spatial extent of quantum uncertainty."
              checked={config.uncertaintyBoundaryEnabled ?? false}
              onCheckedChange={(checked) => setUncertaintyBoundaryEnabled(checked)}
              data-testid="schroedinger-uncertainty-boundary-toggle"
            />
            {config.uncertaintyBoundaryEnabled && (
              <div className="ps-2 border-s border-border-default space-y-2">
                <Slider
                  label="Strength"
                  tooltip="Visual intensity of the uncertainty boundary shell."
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
                  tooltip="Fraction of the total probability enclosed by the boundary. 0.68 corresponds to one standard deviation for a Gaussian."
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
                  tooltip="Spatial thickness of the boundary shell transition. Larger values produce a softer, more diffuse boundary."
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

          <div className="space-y-1 mt-2">
            <Switch
              label="Phase Materiality"
              tooltip="Modulate material properties (roughness, metalness) based on the complex phase of the wavefunction, making phase visible through surface appearance."
              checked={config.phaseMaterialityEnabled ?? false}
              onCheckedChange={(checked) => setPhaseMaterialityEnabled(checked)}
              data-testid="schroedinger-phase-materiality-toggle"
            />
            {config.phaseMaterialityEnabled && (
              <Slider
                label="Strength"
                tooltip="How strongly the wavefunction phase modulates the surface material properties."
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
        </div>
      </Section>
    )
  })

SchroedingerQuantumEffectsSection.displayName = 'SchroedingerQuantumEffectsSection'
