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
import { generateQuantumPreset, getNamedPreset } from '@/lib/geometry/extended/schroedinger/presets'
import type { SecondQuantizationMode } from '@/lib/geometry/extended/types'
import { computeSecondQuantMetrics, type SecondQuantParams } from '@/lib/math/secondQuantization'

import type { SecondQuantizationSectionProps } from './types'

/**
 * Display window length for the |c_n|² bar chart. Independent of the
 * underlying distribution width: we always render at most this many bars,
 * but slide the visible window to track the distribution peak so the chart
 * stays informative for large |alpha| / large r.
 */
const FOCK_DISPLAY_WINDOW = 8

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

  // Resolve the per-dimension HO frequency for the currently selected mode
  // index. The Schroedinger renderer uses these same frequencies (generated
  // from seed/preset/spread), so reading them here keeps the educational
  // metrics consistent with what is actually being rendered. Without this,
  // the "Mode index (k)" slider was decorative — the energy display stayed
  // at E = (n + 1/2)·ℏω with omega hardcoded to 1, no matter which mode the
  // user selected.
  //
  // Both the clamped `activeModeIndex` and `modeOmega` are returned from the
  // same memo so every consumer (table label, slider value, metric call)
  // reads from the *same* index. Using the raw `sqLayerSelectedModeIndex`
  // in one place and the clamped index in another meant the table would
  // briefly show "Mode k=4" while the metrics were computed from `k=2`
  // whenever dimension or preset size shrank.
  const { activeModeIndex, modeOmega } = useMemo(() => {
    if (!sqLayerEnabled) return { activeModeIndex: 0, modeOmega: 1.0 }
    const preset =
      config.presetName === 'custom'
        ? generateQuantumPreset(
            config.seed,
            dimension,
            config.termCount,
            config.maxQuantumNumber,
            config.frequencySpread
          )
        : (getNamedPreset(config.presetName, dimension) ??
          generateQuantumPreset(
            config.seed,
            dimension,
            config.termCount,
            config.maxQuantumNumber,
            config.frequencySpread
          ))
    const clampedIdx = Math.max(0, Math.min(sqLayerSelectedModeIndex, preset.omega.length - 1))
    const omega = preset.omega[clampedIdx]
    return {
      activeModeIndex: clampedIdx,
      modeOmega: Number.isFinite(omega) && omega! > 0 ? omega! : 1.0,
    }
  }, [
    sqLayerEnabled,
    sqLayerSelectedModeIndex,
    dimension,
    config.presetName,
    config.seed,
    config.termCount,
    config.maxQuantumNumber,
    config.frequencySpread,
  ])

  // Build params for the selected dimension mode
  const params: SecondQuantParams = useMemo(
    () => ({
      n: sqLayerFockQuantumNumber,
      alphaRe: sqLayerCoherentAlphaRe,
      alphaIm: sqLayerCoherentAlphaIm,
      squeezeR: sqLayerSqueezeR,
      squeezeTheta: sqLayerSqueezeTheta,
      omega: modeOmega,
    }),
    [
      sqLayerFockQuantumNumber,
      sqLayerCoherentAlphaRe,
      sqLayerCoherentAlphaIm,
      sqLayerSqueezeR,
      sqLayerSqueezeTheta,
      modeOmega,
    ]
  )

  // Compute metrics only when enabled. `computeSecondQuantMetrics` throws a
  // `RangeError` for exact Fock states past `FOCK_MAX_SAFE_LENGTH` — the UI
  // slider is clamped to `[0, 10]`, so this is only reachable via malformed
  // preset imports. Swallow *only* that specific error and render a
  // placeholder, so other bugs still surface instead of being hidden by a
  // blanket catch.
  const metrics = useMemo(() => {
    if (!sqLayerEnabled) return null
    try {
      return computeSecondQuantMetrics(sqLayerMode, params)
    } catch (error) {
      if (error instanceof RangeError) return null
      throw error
    }
  }, [sqLayerEnabled, sqLayerMode, params])

  return (
    <ControlGroup
      title="2nd Quantization"
      collapsible
      defaultOpen={false}
      data-testid="control-group-2nd-quantization"
      rightElement={
        <Switch
          checked={sqLayerEnabled}
          onCheckedChange={actions.setEnabled}
          ariaLabel="Toggle second quantization layer"
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
              tooltip="Interpretation basis: Fock (number states |n>), Coherent (classical-like |alpha>), or Squeezed (reduced uncertainty in one quadrature)."
              data-testid="sq-layer-mode-selector"
            />

            {/* Mode index selector */}
            <Slider
              label="Mode index (k)"
              tooltip="Which dimension's harmonic oscillator mode to analyze. Each dimension is an independent quantum harmonic oscillator."
              min={0}
              max={Math.max(dimension - 1, 0)}
              step={1}
              value={activeModeIndex}
              onChange={actions.setSelectedModeIndex}
              showValue
              data-testid="sq-layer-mode-index"
            />

            {/* Fock number state parameter */}
            {sqLayerMode === 'fock' && (
              <Slider
                label="Fock quantum number (n)"
                tooltip="Occupation number of the Fock state |n>. Energy is E = hbar*omega*(n + 1/2)."
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
                  tooltip="Real part of the coherent state amplitude alpha. Determines the mean position quadrature."
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
                  tooltip="Imaginary part of the coherent state amplitude alpha. Determines the mean momentum quadrature."
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
                  tooltip="Squeeze parameter. Larger r compresses one quadrature uncertainty below the vacuum level at the expense of the conjugate."
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
                  tooltip="Squeeze angle in phase space. Rotates the axis along which uncertainty is reduced."
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
                tooltip="Show the Fock-space occupation number, energy, and P(n) distribution for the selected mode."
                data-testid="sq-show-occupation"
              />
              <Switch
                checked={sqLayerShowUncertainty}
                onCheckedChange={actions.setShowUncertainty}
                label="Uncertainty"
                tooltip="Show quadrature uncertainties (delta X, delta P) and the Heisenberg product delta X * delta P."
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
                    modeIndex={activeModeIndex}
                    modeOmega={modeOmega}
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
 * Find the index of the largest entry in `distribution`. Returns 0 when all
 * entries are non-finite or non-positive — probabilities cannot be negative
 * and a sea of zeros has no meaningful peak, so defaulting the window to
 * start at n=0 is the right visual fallback.
 *
 * @internal
 */
function argmax(distribution: number[]): number {
  let bestIdx = 0
  let bestVal = 0
  for (let i = 0; i < distribution.length; i++) {
    const v = distribution[i] ?? 0
    // Require strictly positive *and* finite so an all-zero (or all-
    // negative, all-NaN) distribution keeps bestIdx === 0 rather than
    // latching onto whichever index happened to have the least-negative
    // garbage value.
    if (Number.isFinite(v) && v > bestVal) {
      bestVal = v
      bestIdx = i
    }
  }
  return bestIdx
}

/**
 * Pick a centered window of `width` indices around the distribution peak,
 * clamped so the window stays inside `[0, distribution.length)`. For
 * narrow distributions (peak near zero) this returns `[0, width)` exactly,
 * which keeps the visual stable for the small-occupation case.
 *
 * @internal
 */
function selectDisplayWindow(
  distribution: number[],
  width: number
): { start: number; end: number } {
  const len = distribution.length
  if (len <= width) return { start: 0, end: len }
  const peak = argmax(distribution)
  const half = Math.floor(width / 2)
  let start = Math.max(0, peak - half)
  let end = start + width
  if (end > len) {
    end = len
    start = end - width
  }
  return { start, end }
}

/**
 * Displays Fock-space occupation metrics for a single mode.
 */
function FockOccupationTable({
  mode,
  modeIndex,
  modeOmega,
  occupation,
  energy,
  fockDistribution,
}: {
  mode: SecondQuantizationMode
  modeIndex: number
  modeOmega: number
  occupation: number
  energy: number
  fockDistribution: number[]
}) {
  const { start, end } = selectDisplayWindow(fockDistribution, FOCK_DISPLAY_WINDOW)
  const omegaLabel = Number.isFinite(modeOmega) ? modeOmega.toFixed(3) : '—'
  return (
    <div
      className="rounded-md border border-panel-border p-2 text-xs"
      data-testid="sq-occupation-table"
    >
      <div className="font-medium text-text-primary mb-1">
        Mode k={modeIndex} — {mode}{' '}
        <span className="text-text-tertiary font-normal">(ω={omegaLabel})</span>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-text-secondary">
        <span>⟨n̂⟩ =</span>
        <span className="text-text-primary">{occupation.toFixed(3)}</span>
        <span>E =</span>
        {/* `energy` = ω·(⟨n̂⟩ + ½). Displaying it as multiples of ℏω requires
            dividing by ω so the reported coefficient matches the ℏω label. */}
        <span className="text-text-primary">
          {modeOmega > 0 ? (energy / modeOmega).toFixed(3) : '—'} ℏω
        </span>
      </div>
      {/* Fock distribution bar chart — windowed around the distribution peak
          so large alpha / r still produce a meaningful display instead of a
          column of empty bars. */}
      <div className="mt-2 space-y-0.5">
        <div className="text-text-tertiary mb-0.5">
          P(n) distribution{' '}
          {start > 0 && (
            <span className="text-text-tertiary/70">
              (n = {start}…{end - 1})
            </span>
          )}
        </div>
        {fockDistribution.slice(start, end).map((prob, offset) => {
          const n = start + offset
          const rawPercent = prob * 100
          const percent = Number.isFinite(rawPercent) ? Math.max(0, Math.min(rawPercent, 100)) : 0

          return (
            <div key={n} className="flex items-center gap-1">
              <span className="w-4 text-end text-text-tertiary">{n}</span>
              <div className="flex-1 h-2 rounded-full bg-panel-border overflow-hidden">
                <div
                  role="meter"
                  aria-valuenow={percent}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`Fock state |${n}⟩ probability`}
                  className="h-full rounded-full bg-accent"
                  style={{ width: `${percent}%` }}
                />
              </div>
              <span className="w-10 text-end text-text-tertiary">{percent.toFixed(1)}%</span>
            </div>
          )
        })}
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
        <span className={isMinimumUncertainty ? 'text-accent' : 'text-text-primary'}>
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
