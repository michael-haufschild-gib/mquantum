/**
 * SchroedingerControls Component
 *
 * Controls for configuring n-dimensional quantum wavefunction visualization.
 * Supports multiple physics modes: harmonic oscillator, hydrogen ND,
 * free scalar field, TDSE dynamics, BEC dynamics, and Dirac equation.
 */

import { Slider } from '@/components/ui/Slider'
import { ToggleGroup } from '@/components/ui/ToggleGroup'
import { Section } from '@/components/sections/Section'
import { useGeometryStore } from '@/stores/geometryStore'
import React from 'react'
import { FreeScalarFieldControls } from './FreeScalarFieldControls'
import { HarmonicOscillatorControls } from './HarmonicOscillatorControls'
import { HydrogenNDControls } from './HydrogenNDControls'
import { TDSEControls } from './TDSEControls'
import { BECControls } from './BECControls'
import { DiracControls } from './DiracControls'
import { WignerControls } from './WignerControls'
import { useSchroedingerActions } from './useSchroedingerActions'

/**
 * Props for the SchroedingerControls component.
 */
export interface SchroedingerControlsProps {
  /** Optional CSS class name for additional styling. */
  className?: string
}

/**
 * SchroedingerControls component — top-level quantum mode controls panel.
 *
 * @param props - Component props
 * @param props.className - Optional CSS class name
 * @returns React component
 */
export const SchroedingerControls: React.FC<SchroedingerControlsProps> = React.memo(
  ({ className = '' }) => {
    const {
      config,
      setRepresentation,
      setMomentumDisplayUnits,
      setMomentumScale,
      setMomentumHbar,
      harmonicActions,
      hydrogenNDActions,
      wignerActions,
      freeScalarActions,
      tdseActions,
      becActions,
      diracActions,
    } = useSchroedingerActions()

    const dimension = useGeometryStore((state) => state.dimension)

    const isHydrogenNDMode = config.quantumMode === 'hydrogenND'
    const isFreeScalarField = config.quantumMode === 'freeScalarField'
    const isTdseDynamics = config.quantumMode === 'tdseDynamics'
    const isBecDynamics = config.quantumMode === 'becDynamics'
    const isDiracEquation = config.quantumMode === 'diracEquation'

    return (
      <div className={className} data-testid="schroedinger-controls">
        {/* Representation Selection — hidden for compute modes */}
        {!isFreeScalarField && !isTdseDynamics && !isBecDynamics && !isDiracEquation && (
          <Section title="Representation" defaultOpen={true}>
            <div className="space-y-3">
              <ToggleGroup
                options={[
                  { value: 'position', label: 'Position' },
                  { value: 'momentum', label: 'Momentum' },
                  { value: 'wigner', label: 'Wigner' },
                ]}
                value={config.representation}
                onChange={(v) => setRepresentation(v as 'position' | 'momentum' | 'wigner')}
                ariaLabel="Select representation space"
                data-testid="representation-selector"
              />

              {config.representation === 'momentum' && (
                <div className="space-y-3">
                  <ToggleGroup
                    options={[
                      { value: 'k', label: 'k-Space' },
                      { value: 'p', label: 'p-Space' },
                    ]}
                    value={config.momentumDisplayUnits}
                    onChange={(v) => setMomentumDisplayUnits(v as 'k' | 'p')}
                    ariaLabel="Select momentum display units"
                    data-testid="momentum-units-selector"
                  />
                  <Slider
                    label="Momentum Scale"
                    min={0.1}
                    max={4.0}
                    step={0.05}
                    value={config.momentumScale}
                    onChange={setMomentumScale}
                    showValue
                    data-testid="momentum-scale-slider"
                  />
                  {config.momentumDisplayUnits === 'p' && (
                    <Slider
                      label="Reduced Planck Constant (ħ)"
                      min={0.01}
                      max={10.0}
                      step={0.01}
                      value={config.momentumHbar}
                      onChange={setMomentumHbar}
                      showValue
                      data-testid="momentum-hbar-slider"
                    />
                  )}
                </div>
              )}

              {config.representation === 'wigner' && (
                <WignerControls config={config} dimension={dimension} actions={wignerActions} />
              )}

              {config.representation === 'momentum' && (
                <p className="text-xs text-text-tertiary">
                  Internal momentum rendering uses k-space; display units affect interpretation only.
                </p>
              )}
            </div>
          </Section>
        )}

        {/* Quantum State / Field Config Section */}
        <Section title={isFreeScalarField || isTdseDynamics || isBecDynamics || isDiracEquation ? 'Field Configuration' : 'Quantum State'} defaultOpen={true}>
          {isDiracEquation ? (
            <DiracControls config={config} dimension={dimension} actions={diracActions} />
          ) : isBecDynamics ? (
            <BECControls config={config} dimension={dimension} actions={becActions} />
          ) : isTdseDynamics ? (
            <TDSEControls config={config} dimension={dimension} actions={tdseActions} />
          ) : isFreeScalarField ? (
            <FreeScalarFieldControls config={config} dimension={dimension} actions={freeScalarActions} />
          ) : isHydrogenNDMode ? (
            <HydrogenNDControls config={config} dimension={dimension} actions={hydrogenNDActions} />
          ) : (
            <HarmonicOscillatorControls
              config={config}
              dimension={dimension}
              actions={harmonicActions}
            />
          )}
        </Section>

        {/* Render Mode Info */}
        <div className="px-4 py-2 text-xs text-text-secondary border-t border-border-subtle">
          <p>Rendering: Volumetric (Beer-Lambert)</p>
          {isHydrogenNDMode && (
            <p className="text-text-tertiary mt-1">{dimension}D hydrogen atom viewed in 3D space</p>
          )}
          {isFreeScalarField && (
            <p className="text-text-tertiary mt-1">
              {config.freeScalar.latticeDim}D lattice, {config.freeScalar.gridSize.slice(0, config.freeScalar.latticeDim).join('\u00D7')} sites
            </p>
          )}
          {isTdseDynamics && (
            <p className="text-text-tertiary mt-1">
              {config.tdse.latticeDim}D TDSE, {config.tdse.gridSize.slice(0, config.tdse.latticeDim).join('\u00D7')} sites
            </p>
          )}
          {isBecDynamics && (
            <p className="text-text-tertiary mt-1">
              {config.bec.latticeDim}D BEC (GPE), {config.bec.gridSize.slice(0, config.bec.latticeDim).join('\u00D7')} sites
            </p>
          )}
          {isDiracEquation && (
            <p className="text-text-tertiary mt-1">
              {config.dirac.latticeDim}D Dirac, {config.dirac.gridSize.slice(0, config.dirac.latticeDim).join('\u00D7')} sites, S={Math.pow(2, Math.floor((config.dirac.latticeDim + 1) / 2))} spinor
            </p>
          )}
        </div>
      </div>
    )
  }
)

SchroedingerControls.displayName = 'SchroedingerControls'

// Re-export sub-components for direct imports if needed
export { BECControls } from './BECControls'
export { FreeScalarFieldControls } from './FreeScalarFieldControls'
export { HarmonicOscillatorControls } from './HarmonicOscillatorControls'
export { HydrogenNDControls } from './HydrogenNDControls'
export { TDSEControls } from './TDSEControls'
export { WignerControls } from './WignerControls'
export type * from './types'
