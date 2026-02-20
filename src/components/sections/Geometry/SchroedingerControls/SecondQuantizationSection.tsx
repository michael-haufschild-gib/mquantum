/**
 * SecondQuantizationSection Component
 *
 * Educational overlay for interpreting harmonic oscillator states through
 * operator-level language: Fock, coherent, and squeezed states.
 * Displays occupation numbers, energies, and quadrature uncertainties.
 *
 * @example
 * ```tsx
 * <SecondQuantizationSection config={config} dimension={3} actions={sqActions} />
 * ```
 */

import { useMemo } from 'react'
import { Button } from '@/components/ui/Button'
import { ControlGroup } from '@/components/ui/ControlGroup'
import { Slider } from '@/components/ui/Slider'
import { Switch } from '@/components/ui/Switch'
import { ToggleGroup } from '@/components/ui/ToggleGroup'
import type { SecondQuantizationMode } from '@/lib/geometry/extended/types'
import {
  computeSecondQuantMetrics,
  type SecondQuantParams,
} from '@/lib/math/secondQuantization'
import type { SecondQuantizationSectionProps } from './types'

/**
 * SecondQuantizationSection — Educational layer for HO second-quantization interpretation.
 *
 * Shows occupation numbers, energy, and uncertainty metrics for the selected mode
 * under Fock, coherent, or squeezed state interpretation.
 *
 * @param props - Component props
 * @param props.config - Current Schroedinger configuration
 * @param props.dimension - Current simulation dimension
 * @param props.actions - Store setter actions for sqLayer fields
 * @returns React component
 */
export function SecondQuantizationSection({
  config,
  dimension,
  actions,
}: SecondQuantizationSectionProps) {
  const {
    sqLayerEnabled,
    sqLayerMode,
    sqLayerSelectedModeIndex,
    sqLayerFockQuantumNumber,
    sqLayerShowOccupation,
    sqLayerShowUncertainty,
    sqLayerCoherentAlphaRe,
    sqLayerCoherentAlphaIm,
    sqLayerSqueezeR,
    sqLayerSqueezeTheta,
  } = config

  // Build params for the selected dimension mode
  const params: SecondQuantParams = useMemo(
    () => ({
      n: sqLayerFockQuantumNumber,
      alphaRe: sqLayerCoherentAlphaRe,
      alphaIm: sqLayerCoherentAlphaIm,
      squeezeR: sqLayerSqueezeR,
      squeezeTheta: sqLayerSqueezeTheta,
      omega: 1.0,
    }),
    [
      sqLayerFockQuantumNumber,
      sqLayerCoherentAlphaRe,
      sqLayerCoherentAlphaIm,
      sqLayerSqueezeR,
      sqLayerSqueezeTheta,
    ]
  )

  // Compute metrics only when enabled
  const metrics = useMemo(() => {
    if (!sqLayerEnabled) return null
    return computeSecondQuantMetrics(sqLayerMode, params)
  }, [sqLayerEnabled, sqLayerMode, params])

  return (
    <ControlGroup
      title="2nd Quantization"
      collapsible
      defaultOpen={false}
      rightElement={
        <Switch
          checked={sqLayerEnabled}
          onCheckedChange={actions.setEnabled}
          data-testid="sq-layer-toggle"
        />
      }
    >
      <div className="space-y-3" data-testid="sq-layer-section">
        {sqLayerEnabled && (
          <>
            {/* Mode selector */}
            <ToggleGroup
              options={[
                { value: 'fock', label: 'Fock' },
                { value: 'coherent', label: 'Coherent' },
                { value: 'squeezed', label: 'Squeezed' },
              ]}
              value={sqLayerMode}
              onChange={(v) => actions.setMode(v as SecondQuantizationMode)}
              ariaLabel="Second quantization interpretation mode"
              data-testid="sq-layer-mode-selector"
            />

            {/* Mode index selector */}
            <Slider
              label="Mode index (k)"
              min={0}
              max={Math.max(dimension - 1, 0)}
              step={1}
              value={sqLayerSelectedModeIndex}
              onChange={actions.setSelectedModeIndex}
              showValue
              data-testid="sq-layer-mode-index"
            />

            {/* Fock number state parameter */}
            {sqLayerMode === 'fock' && (
              <Slider
                label="Fock quantum number (n)"
                min={0}
                max={10}
                step={1}
                value={sqLayerFockQuantumNumber}
                onChange={actions.setFockQuantumNumber}
                showValue
                data-testid="sq-layer-fock-n"
              />
            )}

            {/* Coherent state parameters */}
            {sqLayerMode === 'coherent' && (
              <div className="space-y-2">
                <Slider
                  label="Re(α)"
                  min={-5}
                  max={5}
                  step={0.1}
                  value={sqLayerCoherentAlphaRe}
                  onChange={actions.setCoherentAlphaRe}
                  showValue
                  data-testid="sq-layer-alpha-re"
                />
                <Slider
                  label="Im(α)"
                  min={-5}
                  max={5}
                  step={0.1}
                  value={sqLayerCoherentAlphaIm}
                  onChange={actions.setCoherentAlphaIm}
                  showValue
                  data-testid="sq-layer-alpha-im"
                />
              </div>
            )}

            {/* Squeezed state parameters */}
            {sqLayerMode === 'squeezed' && (
              <div className="space-y-2">
                <Slider
                  label="Squeeze r"
                  min={0}
                  max={3}
                  step={0.05}
                  value={sqLayerSqueezeR}
                  onChange={actions.setSqueezeR}
                  showValue
                  data-testid="sq-layer-squeeze-r"
                />
                <Slider
                  label="Squeeze θ"
                  min={0}
                  max={6.28}
                  step={0.05}
                  value={sqLayerSqueezeTheta}
                  onChange={actions.setSqueezeTheta}
                  showValue
                  data-testid="sq-layer-squeeze-theta"
                />
              </div>
            )}

            {/* Preset buttons */}
            <div className="flex gap-2 flex-wrap">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  actions.setMode('fock')
                  actions.setSelectedModeIndex(0)
                  actions.setFockQuantumNumber(0)
                }}
                data-testid="sq-preset-vacuum"
              >
                Vacuum |0⟩
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  actions.setMode('coherent')
                  actions.setCoherentAlphaRe(1.0)
                  actions.setCoherentAlphaIm(0.0)
                }}
                data-testid="sq-preset-coherent"
              >
                Coherent |α=1⟩
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  actions.setMode('squeezed')
                  actions.setSqueezeR(1.5)
                  actions.setSqueezeTheta(0)
                }}
                data-testid="sq-preset-squeezed"
              >
                Squeezed (r=1.5)
              </Button>
            </div>

            {/* Display toggles */}
            <div className="flex gap-4">
              <Switch
                checked={sqLayerShowOccupation}
                onCheckedChange={actions.setShowOccupation}
                label="Occupation"
                data-testid="sq-show-occupation"
              />
              <Switch
                checked={sqLayerShowUncertainty}
                onCheckedChange={actions.setShowUncertainty}
                label="Uncertainty"
                data-testid="sq-show-uncertainty"
              />
            </div>

            {/* Metrics display */}
            {metrics && (
              <div className="space-y-3">
                {/* Occupation / Energy table */}
                {sqLayerShowOccupation && (
                  <FockOccupationTable
                    mode={sqLayerMode}
                    modeIndex={sqLayerSelectedModeIndex}
                    occupation={metrics.occupation}
                    energy={metrics.energy}
                    fockDistribution={metrics.fockDistribution}
                  />
                )}

                {/* Uncertainty card */}
                {sqLayerShowUncertainty && (
                  <UncertaintyMetricsCard
                    mode={sqLayerMode}
                    deltaX={metrics.uncertainty.deltaX}
                    deltaP={metrics.uncertainty.deltaP}
                    product={metrics.uncertainty.product}
                    covariance={metrics.uncertainty.covariance}
                    isMinimumUncertainty={metrics.uncertainty.isMinimumUncertainty}
                    meanX={metrics.uncertainty.means.x}
                    meanP={metrics.uncertainty.means.p}
                  />
                )}
              </div>
            )}
          </>
        )}
      </div>
    </ControlGroup>
  )
}

// ============================================================================
// Sub-components (inline, not exported)
// ============================================================================

/**
 * Displays Fock-space occupation metrics for a single mode.
 */
function FockOccupationTable({
  mode,
  modeIndex,
  occupation,
  energy,
  fockDistribution,
}: {
  mode: SecondQuantizationMode
  modeIndex: number
  occupation: number
  energy: number
  fockDistribution: number[]
}) {
  return (
    <div
      className="rounded-md border border-panel-border p-2 text-xs"
      data-testid="sq-occupation-table"
    >
      <div className="font-medium text-text-primary mb-1">
        Mode k={modeIndex} — {mode}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-text-secondary">
        <span>⟨n̂⟩ =</span>
        <span className="text-text-primary">{occupation.toFixed(3)}</span>
        <span>E =</span>
        <span className="text-text-primary">{energy.toFixed(3)} ℏω</span>
      </div>
      {/* Fock distribution bar chart */}
      <div className="mt-2 space-y-0.5">
        <div className="text-text-tertiary mb-0.5">P(n) distribution:</div>
        {fockDistribution.slice(0, 8).map((prob, n) => (
          <div key={n} className="flex items-center gap-1">
            <span className="w-4 text-end text-text-tertiary">{n}</span>
            <div className="flex-1 h-2 rounded-full bg-panel-border overflow-hidden">
              <div
                className="h-full rounded-full bg-accent-cyan"
                style={{ width: `${Math.min(prob * 100, 100)}%` }}
              />
            </div>
            <span className="w-10 text-end text-text-tertiary">{(prob * 100).toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Displays quadrature uncertainty metrics.
 */
function UncertaintyMetricsCard({
  mode,
  deltaX,
  deltaP,
  product,
  covariance,
  isMinimumUncertainty,
  meanX,
  meanP,
}: {
  mode: SecondQuantizationMode
  deltaX: number
  deltaP: number
  product: number
  covariance: number
  isMinimumUncertainty: boolean
  meanX: number
  meanP: number
}) {
  return (
    <div
      className="rounded-md border border-panel-border p-2 text-xs"
      data-testid="sq-uncertainty-card"
    >
      <div className="font-medium text-text-primary mb-1">Quadrature Uncertainties</div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-text-secondary">
        <span>ΔX =</span>
        <span className="text-text-primary">{deltaX.toFixed(4)}</span>
        <span>ΔP =</span>
        <span className="text-text-primary">{deltaP.toFixed(4)}</span>
        <span>ΔX·ΔP =</span>
        <span className={isMinimumUncertainty ? 'text-accent-cyan' : 'text-text-primary'}>
          {product.toFixed(4)}
          {isMinimumUncertainty && ' (min)'}
        </span>
        {Math.abs(covariance) > 1e-6 && (
          <>
            <span>Cov(X,P) =</span>
            <span className="text-text-primary">{covariance.toFixed(4)}</span>
          </>
        )}
      </div>
      {(mode === 'coherent' || meanX !== 0 || meanP !== 0) && (
        <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5 text-text-secondary">
          <span>⟨X⟩ =</span>
          <span className="text-text-primary">{meanX.toFixed(4)}</span>
          <span>⟨P⟩ =</span>
          <span className="text-text-primary">{meanP.toFixed(4)}</span>
        </div>
      )}
    </div>
  )
}
