/**
 * TDSE Analysis Content
 *
 * Content component for tdseDynamics mode analysis. Contains:
 * - Diagnostics enable toggle + interval slider
 * - Inline energy diagram (V(x) plot with kinetic energy level)
 * - Live R/T coefficients and norm readout
 *
 * Used inside the unified AnalysisSection.
 *
 * @module components/sections/Analysis/TDSEAnalysisSection
 */

import React, { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { AndersonSweepSection } from '@/components/sections/Analysis/AndersonSweepSection'
import { TDSESpectrometerPanel } from '@/components/sections/Analysis/TDSESpectrometerPanel'
import { ControlGroup } from '@/components/ui/ControlGroup'
import { Slider } from '@/components/ui/Slider'
import { Sparkline } from '@/components/ui/Sparkline'
import { Switch } from '@/components/ui/Switch'
import { AXIS_LABELS } from '@/constants/dimension'
import {
  computePacketKineticEnergy,
  getPotentialPlotScale,
  samplePotentialProfile,
} from '@/lib/physics/tdse/potentialProfile'
import { useDiagnosticsStore } from '@/stores/diagnosticsStore'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'

/* ── SVG layout constants ── */
const WIDTH = 260
const HEIGHT = 130
const PADDING_X = 32
const PADDING_Y = 16
const PLOT_W = WIDTH - 2 * PADDING_X
const PLOT_H = HEIGHT - 2 * PADDING_Y

/**
 * Analysis content for tdseDynamics mode.
 * Renders diagnostics controls and inline energy diagram.
 *
 * @returns Diagnostics controls and energy diagram
 *
 * @example
 * ```tsx
 * <TDSEAnalysisContent />
 * ```
 */
export const TDSEAnalysisContent: React.FC = React.memo(() => {
  const { tdse, setDiagnosticsInterval, setObservablesEnabled } = useExtendedObjectStore(
    useShallow((s) => ({
      tdse: s.schroedinger.tdse,
      setDiagnosticsInterval: s.setTdseDiagnosticsInterval,
      setObservablesEnabled: s.setTdseObservablesEnabled,
    }))
  )

  return (
    <>
      <Slider
        label="Diagnostics Interval (frames)"
        tooltip="How often to compute norm, R/T coefficients, and observables. Lower values update faster but use more GPU time."
        min={1}
        max={60}
        step={1}
        value={tdse.diagnosticsInterval}
        onChange={setDiagnosticsInterval}
        showValue
        data-testid="tdse-diagnostics-interval"
      />

      {/* Inline energy diagram — hidden for Anderson disorder since the
          stochastic potential has no meaningful 1D analytical profile */}
      {tdse.potentialType !== 'andersonDisorder' && <EnergyDiagramInline tdse={tdse} />}

      {/* Observable expectation values */}
      <ObservablesDisplay
        enabled={tdse.observablesEnabled}
        onEnabledChange={setObservablesEnabled}
        hbar={tdse.hbar}
      />

      {/* Energy spectral density (when observables enabled) */}
      {tdse.observablesEnabled && <EnergySpectrumDisplay />}

      {/* Anderson disorder sweep (only for andersonDisorder potential) */}
      {tdse.potentialType === 'andersonDisorder' && <AndersonSweepSection />}

      {/* Heller wavepacket spectrometer — reads eigenvalue spectrum out of C(t) */}
      <TDSESpectrometerPanel tdse={tdse} />
    </>
  )
})

TDSEAnalysisContent.displayName = 'TDSEAnalysisContent'

/* ────────────────────────────────────────────────────────────── */
/*  Inline energy diagram (was EnergyDiagramHUD portal overlay)  */
/* ────────────────────────────────────────────────────────────── */

interface EnergyDiagramInlineProps {
  tdse: ReturnType<typeof useExtendedObjectStore.getState>['schroedinger']['tdse']
}

/** Potential types where left/right norm split is physically interpretable as R/T */
const SCATTERING_POTENTIALS = new Set(['barrier', 'step', 'driven'])

const EnergyDiagramInline: React.FC<EnergyDiagramInlineProps> = React.memo(({ tdse }) => {
  const isScattering = SCATTERING_POTENTIALS.has(tdse.potentialType)
  const isAnderson = tdse.potentialType === 'andersonDisorder'
  const { R, T, totalNorm, normDrift, ipr, hasData, historyIpr, historyCount, historyHead } =
    useDiagnosticsStore(
      useShallow((s) => ({
        R: s.tdse.R,
        T: s.tdse.T,
        totalNorm: s.tdse.totalNorm,
        normDrift: s.tdse.normDrift,
        ipr: s.tdse.ipr,
        hasData: s.tdse.hasData,
        historyIpr: s.tdse.historyIpr,
        historyCount: s.tdse.historyCount,
        historyHead: s.tdse.historyHead,
      }))
    )

  void isAnderson // used for conditional rendering below

  const profile = useMemo(() => samplePotentialProfile(tdse, 200), [tdse])
  const kineticEnergy = useMemo(() => computePacketKineticEnergy(tdse), [tdse])
  const potScale = useMemo(() => getPotentialPlotScale(tdse), [tdse])

  if (!profile) return null

  const clippedVMax = Math.min(profile.vMax, potScale * 1.5)
  const clippedVMin = Math.max(profile.vMin, -potScale * 1.5)
  const eMax = Math.max(clippedVMax, kineticEnergy, 1)
  const eMin = Math.min(clippedVMin, 0)
  const eRange = eMax - eMin || 1
  const yLow = eMin - eRange * 0.1
  const yHigh = eMax + eRange * 0.1
  const yRange = yHigh - yLow

  const xMin = profile.xs[0]!
  const xMax = profile.xs[profile.xs.length - 1]!
  const xRange = xMax - xMin || 1

  const toSvgX = (x: number) => PADDING_X + ((x - xMin) / xRange) * PLOT_W
  const toSvgY = (v: number) => PADDING_Y + (1 - (v - yLow) / yRange) * PLOT_H

  const vPolyPoints = profile.xs.map((x, i) => {
    const sx = toSvgX(x)
    const clampedV = Math.max(yLow, Math.min(yHigh, profile.vs[i]!))
    return `${sx.toFixed(1)},${toSvgY(clampedV).toFixed(1)}`
  })

  const eLineY = toSvgY(kineticEnergy)
  const zeroY = toSvgY(0)

  const yTicks: { y: number; label: string }[] = []
  const niceStep = niceNum(yRange / 4, true)
  const tickStart = Math.ceil(yLow / niceStep) * niceStep
  for (let v = tickStart; v <= yHigh; v += niceStep) {
    yTicks.push({ y: toSvgY(v), label: formatNum(v) })
  }

  return (
    <div className="mt-2" data-testid="tdse-energy-diagram-inline">
      <p className="text-xs text-text-secondary mb-1">Potential V(x) & Kinetic Energy</p>
      <div className="rounded-md overflow-hidden bg-[var(--bg-surface)]">
        <svg width="100%" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="block">
          {/* Zero line */}
          <line
            x1={PADDING_X}
            y1={zeroY}
            x2={PADDING_X + PLOT_W}
            y2={zeroY}
            stroke="var(--text-tertiary)"
            strokeWidth={0.5}
            strokeDasharray="2,2"
          />

          {/* Y-axis ticks */}
          {yTicks.map((tick, i) => (
            <g key={i}>
              <line
                x1={PADDING_X - 3}
                y1={tick.y}
                x2={PADDING_X}
                y2={tick.y}
                stroke="var(--text-tertiary)"
                strokeWidth={0.5}
              />
              <text
                x={PADDING_X - 5}
                y={tick.y + 3}
                textAnchor="end"
                fill="var(--text-tertiary)"
                fontSize={8}
                fontFamily="monospace"
              >
                {tick.label}
              </text>
            </g>
          ))}

          {/* V(x) fill */}
          <polygon
            points={[
              ...vPolyPoints,
              `${toSvgX(xMax).toFixed(1)},${zeroY.toFixed(1)}`,
              `${toSvgX(xMin).toFixed(1)},${zeroY.toFixed(1)}`,
            ].join(' ')}
            fill="var(--theme-accent)"
            fillOpacity={0.15}
            stroke="none"
          />

          {/* V(x) curve */}
          <polyline
            points={vPolyPoints.join(' ')}
            fill="none"
            stroke="var(--theme-accent)"
            strokeWidth={2}
            strokeLinejoin="round"
          />

          {/* Kinetic energy level */}
          <line
            x1={PADDING_X}
            y1={eLineY}
            x2={PADDING_X + PLOT_W}
            y2={eLineY}
            stroke="var(--color-warning)"
            strokeWidth={1}
            strokeDasharray="4,3"
          />
          <text
            x={PADDING_X + PLOT_W + 2}
            y={eLineY + 3}
            fill="var(--color-warning)"
            fontSize={8}
            fontFamily="monospace"
          >
            E
          </text>

          {/* Axes */}
          <line
            x1={PADDING_X}
            y1={PADDING_Y}
            x2={PADDING_X}
            y2={PADDING_Y + PLOT_H}
            stroke="var(--text-secondary)"
            strokeWidth={0.5}
          />
          <line
            x1={PADDING_X}
            y1={PADDING_Y + PLOT_H}
            x2={PADDING_X + PLOT_W}
            y2={PADDING_Y + PLOT_H}
            stroke="var(--text-secondary)"
            strokeWidth={0.5}
          />

          {/* Axis labels */}
          <text
            x={PADDING_X + PLOT_W / 2}
            y={HEIGHT - 2}
            textAnchor="middle"
            fill="var(--text-tertiary)"
            fontSize={8}
            fontFamily="monospace"
          >
            x
          </text>
          <text
            x={4}
            y={PADDING_Y + PLOT_H / 2}
            textAnchor="middle"
            fill="var(--text-tertiary)"
            fontSize={8}
            fontFamily="monospace"
            transform={`rotate(-90, 4, ${PADDING_Y + PLOT_H / 2})`}
          >
            V(x)
          </text>
        </svg>

        {/* Metrics readout */}
        <div className="px-2 pb-1.5 flex gap-3 text-xs font-mono leading-tight text-text-secondary">
          {hasData ? (
            <>
              {isAnderson ? (
                <span>IPR={ipr.toExponential(2)}</span>
              ) : (
                <span>
                  {isScattering
                    ? `R=${R.toFixed(3)} T=${T.toFixed(3)}`
                    : `P(L)=${R.toFixed(3)} P(R)=${T.toFixed(3)}`}
                </span>
              )}
              <span className="text-text-tertiary">||ψ||²={totalNorm.toFixed(4)}</span>
              <span className={Math.abs(normDrift) > 0.01 ? 'text-danger' : 'text-text-tertiary'}>
                Δ={normDrift >= 0 ? '+' : ''}
                {(normDrift * 100).toFixed(2)}%
              </span>
            </>
          ) : (
            <span className="text-text-tertiary">Awaiting diagnostics...</span>
          )}
        </div>
      </div>

      {/* IPR sparkline for Anderson disorder */}
      {isAnderson && historyCount > 1 && (
        <div className="mt-1.5">
          <p className="text-xs text-text-secondary mb-0.5">IPR (Inverse Participation Ratio)</p>
          <Sparkline data={historyIpr} head={historyHead} count={historyCount} height={40} />
        </div>
      )}
    </div>
  )
})

EnergyDiagramInline.displayName = 'EnergyDiagramInline'

/* ── Helpers (from EnergyDiagramHUD) ── */

function niceNum(range: number, round: boolean): number {
  const exp = Math.floor(Math.log10(Math.abs(range) || 1))
  const frac = range / Math.pow(10, exp)
  let nice: number
  if (round) {
    if (frac < 1.5) nice = 1
    else if (frac < 3) nice = 2
    else if (frac < 7) nice = 5
    else nice = 10
  } else {
    if (frac <= 1) nice = 1
    else if (frac <= 2) nice = 2
    else if (frac <= 5) nice = 5
    else nice = 10
  }
  return nice * Math.pow(10, exp)
}

function formatNum(v: number): string {
  if (Math.abs(v) < 0.001) return '0'
  if (Math.abs(v) >= 100) return v.toFixed(0)
  if (Math.abs(v) >= 1) return v.toFixed(1)
  return v.toFixed(2)
}

/* ────────────────────────────────────────────────────────────── */
/*  Observable Expectation Values Display                        */
/* ────────────────────────────────────────────────────────────── */

const DIM_LABELS = AXIS_LABELS

/** Maximum number of per-dimension uncertainty sparklines to display */
const MAX_SPARKLINE_DIMS = 3

interface ObservablesDisplayProps {
  enabled: boolean
  onEnabledChange: (enabled: boolean) => void
  /** Reduced Planck constant, used to display the ℏ/2 bound on sparklines */
  hbar: number
}

/**
 * Observable expectation values display.
 * Shows per-dimension position/momentum statistics, energy sparkline,
 * and uncertainty product sparklines with ℏ/2 reference lines.
 *
 * @param props - Component props
 * @returns Observables control group
 */
const ObservablesDisplay: React.FC<ObservablesDisplayProps> = React.memo(
  ({ enabled, onEnabledChange, hbar }) => {
    const obs = useDiagnosticsStore(
      useShallow((s) => ({
        hasData: s.observables.hasData,
        activeDims: s.observables.activeDims,
        positionMean: s.observables.positionMean,
        positionVariance: s.observables.positionVariance,
        momentumMean: s.observables.momentumMean,
        momentumVariance: s.observables.momentumVariance,
        uncertaintyProduct: s.observables.uncertaintyProduct,
        totalEnergy: s.observables.totalEnergy,
        historyEnergy: s.observables.historyEnergy,
        historyUncertainty: s.observables.historyUncertainty,
        historyHead: s.observables.historyHead,
        historyCount: s.observables.historyCount,
      }))
    )

    const minUncertainty = hbar / 2
    const sparklineDims = Math.min(obs.activeDims, MAX_SPARKLINE_DIMS)

    return (
      <ControlGroup
        title="Observables"
        collapsible
        defaultOpen={false}
        data-testid="control-group-observables"
        rightElement={
          <Switch
            checked={enabled}
            onCheckedChange={onEnabledChange}
            tooltip="Enable GPU readback of position, momentum, and energy expectation values."
            data-testid="observables-toggle"
          />
        }
      >
        {enabled && obs.hasData && (
          <div className="space-y-3" data-testid="observables-panel">
            {/* Per-dimension table */}
            <div className="text-xs font-mono space-y-0.5">
              <div className="flex gap-2 text-text-tertiary font-semibold">
                <span className="w-4">d</span>
                <span className="w-16 text-right">&lt;x&gt;</span>
                <span className="w-12 text-right">&Delta;x</span>
                <span className="w-16 text-right">&lt;p&gt;</span>
                <span className="w-12 text-right">&Delta;p</span>
                <span className="w-14 text-right">&Delta;x&Delta;p</span>
              </div>
              {Array.from({ length: obs.activeDims }, (_, d) => {
                const dx = Math.sqrt(Math.max(0, obs.positionVariance[d]!))
                const dp = Math.sqrt(Math.max(0, obs.momentumVariance[d]!))
                const product = obs.uncertaintyProduct[d]!
                const isViolation = product < minUncertainty * 0.9
                return (
                  <div key={d} className="flex gap-2 text-text-secondary">
                    <span className="w-4 text-text-tertiary">{DIM_LABELS[d]}</span>
                    <span className="w-16 text-right">{obs.positionMean[d]!.toFixed(3)}</span>
                    <span className="w-12 text-right">{dx.toFixed(3)}</span>
                    <span className="w-16 text-right">{obs.momentumMean[d]!.toFixed(3)}</span>
                    <span className="w-12 text-right">{dp.toFixed(3)}</span>
                    <span
                      className={`w-14 text-right ${isViolation ? 'text-danger' : ''}`}
                      data-testid={`uncertainty-product-${d}`}
                    >
                      {product.toFixed(4)}
                    </span>
                  </div>
                )
              })}
            </div>

            {/* Energy sparkline */}
            <div className="space-y-1">
              <div className="text-xs text-text-tertiary" data-testid="energy-readout">
                &lt;E&gt; = {obs.totalEnergy.toFixed(4)}
              </div>
              <Sparkline
                data={obs.historyEnergy}
                head={obs.historyHead}
                count={obs.historyCount}
                height={28}
                className="w-full"
              />
            </div>

            {/* Per-dimension uncertainty sparklines (up to MAX_SPARKLINE_DIMS) */}
            {Array.from({ length: sparklineDims }, (_, d) => {
              const histData = obs.historyUncertainty[d]
              if (!histData) return null
              return (
                <div key={d} className="space-y-1" data-testid={`uncertainty-sparkline-${d}`}>
                  <div className="text-xs text-text-tertiary">
                    &Delta;{DIM_LABELS[d]}&Delta;p
                    <span className="text-text-quaternary ms-1">
                      (bound: {minUncertainty.toFixed(2)})
                    </span>
                  </div>
                  <Sparkline
                    data={histData}
                    head={obs.historyHead}
                    count={obs.historyCount}
                    height={28}
                    min={0}
                    className="w-full"
                    referenceLine={minUncertainty}
                    referenceLabel={`\u210F/2`}
                  />
                </div>
              )
            })}
          </div>
        )}

        {enabled && !obs.hasData && (
          <div className="text-xs text-text-tertiary" data-testid="observables-waiting">
            Waiting for GPU readback...
          </div>
        )}
      </ControlGroup>
    )
  }
)

ObservablesDisplay.displayName = 'ObservablesDisplay'

/* ────────────────────────────────────────────────────────────── */
/*  Energy Spectral Density Display                              */
/* ────────────────────────────────────────────────────────────── */

const ES_W = 260
const ES_H = 60
const ES_PAD = { left: 4, right: 4, top: 4, bottom: 14 }
const ES_PLOT_W = ES_W - ES_PAD.left - ES_PAD.right
const ES_PLOT_H = ES_H - ES_PAD.top - ES_PAD.bottom

/**
 * Energy spectral density histogram ρ(E).
 * Shows the wavefunction's kinetic energy distribution from GPU readback.
 */
export const EnergySpectrumDisplay: React.FC = React.memo(() => {
  const spectrum = useDiagnosticsStore((s) => s.observables.energySpectrum)

  const maxVal = useMemo(() => {
    let m = 0
    for (let i = 0; i < spectrum.length; i++) {
      if (spectrum[i]! > m) m = spectrum[i]!
    }
    return m
  }, [spectrum])

  if (maxVal <= 0) return null

  const numBins = spectrum.length
  const barW = ES_PLOT_W / numBins

  return (
    <div className="mt-2" data-testid="energy-spectrum-display">
      <p className="text-xs text-text-secondary mb-0.5">Energy Spectrum ρ(E)</p>
      <div className="rounded-md overflow-hidden bg-[var(--bg-surface)]">
        <svg width="100%" viewBox={`0 0 ${ES_W} ${ES_H}`} className="block">
          {Array.from({ length: numBins }, (_, i) => {
            const h = (spectrum[i]! / maxVal) * ES_PLOT_H
            return (
              <rect
                key={i}
                x={ES_PAD.left + i * barW}
                y={ES_PAD.top + ES_PLOT_H - h}
                width={Math.max(barW - 0.5, 0.5)}
                height={h}
                fill="var(--theme-accent)"
                fillOpacity={0.7}
              />
            )
          })}
          {/* X axis */}
          <line
            x1={ES_PAD.left}
            y1={ES_PAD.top + ES_PLOT_H}
            x2={ES_PAD.left + ES_PLOT_W}
            y2={ES_PAD.top + ES_PLOT_H}
            stroke="var(--text-secondary)"
            strokeWidth={0.5}
          />
          <text
            x={ES_PAD.left + ES_PLOT_W / 2}
            y={ES_H - 2}
            textAnchor="middle"
            fill="var(--text-tertiary)"
            fontSize={7}
            fontFamily="monospace"
          >
            E (kinetic)
          </text>
        </svg>
      </div>
    </div>
  )
})

EnergySpectrumDisplay.displayName = 'EnergySpectrumDisplay'
