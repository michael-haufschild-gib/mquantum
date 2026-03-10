import { Section } from '@/components/sections/Section'
import { ColorPicker } from '@/components/ui/ColorPicker'
import { Select } from '@/components/ui/Select'
import { Slider } from '@/components/ui/Slider'
import { ToggleButton } from '@/components/ui/ToggleButton'
import type {
  SchroedingerNodalDefinition,
  SchroedingerNodalFamilyFilter,
  SchroedingerNodalRenderMode,
} from '@/lib/geometry/extended/types'
import { DEFAULT_SCHROEDINGER_CONFIG } from '@/lib/geometry/extended/types'
import { useExtendedObjectStore, type ExtendedObjectState } from '@/stores/extendedObjectStore'
import { useGeometryStore } from '@/stores/geometryStore'
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

/**
 *
 */
export interface SchroedingerQuantumEffectsSectionProps {
  defaultOpen?: boolean
}

export const SchroedingerQuantumEffectsSection: React.FC<
  SchroedingerQuantumEffectsSectionProps
> = React.memo(({ defaultOpen = true }) => {
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
  // Quantum effects are 3D volumetric shader features — hide for 2D, Wigner, and freeScalar modes.
  // Free scalar field uses density-grid raymarching; these shader features are disabled in
  // extractSchrodingerConfig and would have no visual effect.
  if (dimension <= 2 || config.representation === 'wigner' || config.quantumMode === 'freeScalarField' || config.quantumMode === 'tdseDynamics' || config.quantumMode === 'becDynamics') return null

  return (
    <Section title="Quantum Effects" defaultOpen={defaultOpen} data-testid="quantum-effects-section">
      <div className="space-y-2">
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
                  onToggle={() => setNodalLobeColoringEnabled(!(config.nodalLobeColoringEnabled ?? false))}
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
                      value={
                        config.nodalColorPositive ??
                        DEFAULT_SCHROEDINGER_CONFIG.nodalColorPositive
                      }
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
                      value={
                        config.nodalColorNegative ??
                        DEFAULT_SCHROEDINGER_CONFIG.nodalColorNegative
                      }
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
                      value={config.nodalColor ?? DEFAULT_SCHROEDINGER_CONFIG.nodalColor}
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
                      value={config.nodalColorReal ?? DEFAULT_SCHROEDINGER_CONFIG.nodalColorReal}
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
                      value={config.nodalColorImag ?? DEFAULT_SCHROEDINGER_CONFIG.nodalColorImag}
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

        <div className="space-y-1 mt-2">
          <div className="flex items-center justify-between">
            <label className="text-xs text-text-secondary">Phase Materiality</label>
            <ToggleButton
              pressed={config.phaseMaterialityEnabled ?? false}
              onToggle={() => setPhaseMaterialityEnabled(!(config.phaseMaterialityEnabled ?? false))}
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

      </div>
    </Section>
  )
})

SchroedingerQuantumEffectsSection.displayName = 'SchroedingerQuantumEffectsSection'
