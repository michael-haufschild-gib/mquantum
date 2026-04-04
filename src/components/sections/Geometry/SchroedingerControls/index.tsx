/**
 * SchroedingerControls Component
 *
 * Controls for configuring n-dimensional quantum wavefunction visualization.
 * Supports multiple physics modes: harmonic oscillator, hydrogen ND,
 * free scalar field, TDSE dynamics, BEC dynamics, and Dirac equation.
 */

import React from 'react'

import { Section } from '@/components/sections/Section'
import { Slider } from '@/components/ui/Slider'
import { ToggleGroup } from '@/components/ui/ToggleGroup'
import type { SchroedingerConfig } from '@/lib/geometry/extended/types'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'
import { useGeometryStore } from '@/stores/geometryStore'

import { BECControls } from './BECControls'
import { DiracControls } from './DiracControls'
import { FreeScalarFieldControls } from './FreeScalarFieldControls'
import { HarmonicOscillatorControls } from './HarmonicOscillatorControls'
import { HydrogenNDControls } from './HydrogenNDControls'
import { HydrogenNDCoupledControls } from './HydrogenNDCoupledControls'
import { KKCompactificationSection } from './KKCompactificationSection'
import { QuantumWalkControls } from './QuantumWalkControls'
import { TDSEControls } from './TDSEControls'
import type {
  BecActions,
  DiracActions,
  FreeScalarFieldActions,
  HarmonicOscillatorActions,
  HydrogenNDActions,
  HydrogenNDCoupledActions,
  TdseActions,
} from './types'
import { useSchroedingerActions } from './useSchroedingerActions'
import { WignerControls } from './WignerControls'

/**
 * Props for the SchroedingerControls component.
 */
export interface SchroedingerControlsProps {
  /** Optional CSS class name for additional styling. */
  className?: string
}

/** Extracted to reduce main component complexity. */
function renderModeControls(p: {
  config: SchroedingerConfig
  dimension: number
  isQuantumWalk: boolean
  isDiracEquation: boolean
  isBecDynamics: boolean
  isTdseDynamics: boolean
  isFreeScalarField: boolean
  isHydrogenCoupled: boolean
  isHydrogenNDMode: boolean
  diracActions: DiracActions
  becActions: BecActions
  tdseActions: TdseActions
  freeScalarActions: FreeScalarFieldActions
  hydrogenNDCoupledActions: HydrogenNDCoupledActions
  hydrogenNDActions: HydrogenNDActions
  harmonicActions: HarmonicOscillatorActions
}): React.ReactNode {
  if (p.isQuantumWalk) return <QuantumWalkControls />
  if (p.isDiracEquation)
    return <DiracControls config={p.config} dimension={p.dimension} actions={p.diracActions} />
  if (p.isBecDynamics)
    return (
      <>
        <BECControls config={p.config} dimension={p.dimension} actions={p.becActions} />
        <KKCompactificationSection defaultOpen={false} />
      </>
    )
  if (p.isTdseDynamics)
    return (
      <>
        <TDSEControls config={p.config} dimension={p.dimension} actions={p.tdseActions} />
        <KKCompactificationSection defaultOpen={false} />
      </>
    )
  if (p.isFreeScalarField)
    return (
      <FreeScalarFieldControls
        config={p.config}
        dimension={p.dimension}
        actions={p.freeScalarActions}
      />
    )
  if (p.isHydrogenCoupled)
    return (
      <HydrogenNDCoupledControls
        config={p.config}
        dimension={p.dimension}
        actions={p.hydrogenNDCoupledActions}
      />
    )
  if (p.isHydrogenNDMode)
    return (
      <HydrogenNDControls config={p.config} dimension={p.dimension} actions={p.hydrogenNDActions} />
    )
  return (
    <HarmonicOscillatorControls
      config={p.config}
      dimension={p.dimension}
      actions={p.harmonicActions}
    />
  )
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
      hydrogenNDCoupledActions,
      wignerActions,
      freeScalarActions,
      tdseActions,
      becActions,
      diracActions,
    } = useSchroedingerActions()

    const dimension = useGeometryStore((state) => state.dimension)
    const isoEnabled = useExtendedObjectStore((state) => state.schroedinger?.isoEnabled ?? false)

    const isHydrogenNDMode =
      config.quantumMode === 'hydrogenND' || config.quantumMode === 'hydrogenNDCoupled'
    const isHydrogenCoupled = config.quantumMode === 'hydrogenNDCoupled'
    const isFreeScalarField = config.quantumMode === 'freeScalarField'
    const isTdseDynamics = config.quantumMode === 'tdseDynamics'
    const isBecDynamics = config.quantumMode === 'becDynamics'
    const isDiracEquation = config.quantumMode === 'diracEquation'
    const isQuantumWalk = config.quantumMode === 'quantumWalk'

    return (
      <div className={className} data-testid="schroedinger-controls">
        {/* Representation Selection — hidden for compute modes */}
        {!isFreeScalarField &&
          !isTdseDynamics &&
          !isBecDynamics &&
          !isDiracEquation &&
          !isQuantumWalk && (
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
                  tooltip="Choose the space in which the wavefunction is displayed: position-space, momentum-space (Fourier transform), or Wigner phase-space."
                  fullWidth
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
                      tooltip="Display units: k-space (wavenumber) or p-space (momentum p = hbar * k)."
                      fullWidth
                      data-testid="momentum-units-selector"
                    />
                    <Slider
                      label="Momentum Scale"
                      tooltip="Spatial extent of the momentum-space visualization. Increase to see higher-momentum components."
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
                        tooltip="ħ used to convert between k-space (k) and momentum-space (p = ħk). Only affects display units, not the physics."
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
                    Internal momentum rendering uses k-space; display units affect interpretation
                    only.
                  </p>
                )}
              </div>
            </Section>
          )}

        {/* Quantum State / Field Config Section */}
        <Section
          title={
            isFreeScalarField || isTdseDynamics || isBecDynamics || isDiracEquation
              ? 'Field Configuration'
              : isQuantumWalk
                ? 'Walk Configuration'
                : 'Quantum State'
          }
          defaultOpen={true}
        >
          {renderModeControls({
            config,
            dimension,
            isQuantumWalk,
            isDiracEquation,
            isBecDynamics,
            isTdseDynamics,
            isFreeScalarField,
            isHydrogenCoupled,
            isHydrogenNDMode,
            diracActions,
            becActions,
            tdseActions,
            freeScalarActions,
            hydrogenNDCoupledActions,
            hydrogenNDActions,
            harmonicActions,
          })}
        </Section>

        {/* Render Mode Info */}
        <div className="px-4 py-2 text-xs text-text-secondary border-t border-border-subtle">
          <p>
            Rendering: {isoEnabled ? 'Isosurface (Marching Cubes)' : 'Volumetric (Beer-Lambert)'}
          </p>
          {isHydrogenNDMode && (
            <p className="text-text-tertiary mt-1">{dimension}D hydrogen atom viewed in 3D space</p>
          )}
          {isFreeScalarField && (
            <p className="text-text-tertiary mt-1">
              {config.freeScalar.latticeDim}D lattice,{' '}
              {config.freeScalar.gridSize.slice(0, config.freeScalar.latticeDim).join('\u00D7')}{' '}
              sites
            </p>
          )}
          {isTdseDynamics && (
            <p className="text-text-tertiary mt-1">
              {config.tdse.latticeDim}D TDSE,{' '}
              {config.tdse.gridSize.slice(0, config.tdse.latticeDim).join('\u00D7')} sites
            </p>
          )}
          {isBecDynamics && (
            <p className="text-text-tertiary mt-1">
              {config.bec.latticeDim}D BEC (GPE),{' '}
              {config.bec.gridSize.slice(0, config.bec.latticeDim).join('\u00D7')} sites
            </p>
          )}
          {isDiracEquation && (
            <p className="text-text-tertiary mt-1">
              {config.dirac.latticeDim}D Dirac,{' '}
              {config.dirac.gridSize.slice(0, config.dirac.latticeDim).join('\u00D7')} sites, S=
              {Math.pow(2, Math.floor((config.dirac.latticeDim + 1) / 2))} spinor
            </p>
          )}
          {isQuantumWalk && (
            <p className="text-text-tertiary mt-1">
              {dimension}D quantum walk, {config.quantumWalk.coinType} coin,{' '}
              {config.quantumWalk.gridSize.slice(0, dimension).join('\u00D7')} lattice
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
export type * from './types'
export { WignerControls } from './WignerControls'
