/**
 * TDSE Analysis Section
 *
 * Right-editor section for tdseDynamics mode. Contains:
 * - Diagnostics enable toggle + interval slider
 * - Inline energy diagram (V(x) plot with kinetic energy level)
 * - Live R/T coefficients and norm readout
 *
 * Mirrors the Analysis section pattern used by harmonicOscillator
 * (SchroedingerCrossSectionSection).
 *
 * @module components/sections/Advanced/TDSEAnalysisSection
 */

import React, { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { Section } from '@/components/sections/Section'
import { ControlGroup } from '@/components/ui/ControlGroup'
import { Switch } from '@/components/ui/Switch'
import { Slider } from '@/components/ui/Slider'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'
import { useGeometryStore } from '@/stores/geometryStore'
import { useTdseDiagnosticsStore } from '@/stores/tdseDiagnosticsStore'
import {
  samplePotentialProfile,
  computePacketKineticEnergy,
  getPotentialPlotScale,
} from '@/lib/physics/tdse/potentialProfile'

/* ── SVG layout constants ── */
const WIDTH = 260
const HEIGHT = 130
const PADDING_X = 32
const PADDING_Y = 16
const PLOT_W = WIDTH - 2 * PADDING_X
const PLOT_H = HEIGHT - 2 * PADDING_Y

/**
 * Props for TDSEAnalysisSection.
 *
 * @param defaultOpen - Whether the section starts expanded
 */
export interface TDSEAnalysisSectionProps {
  defaultOpen?: boolean
}

/**
 * Analysis section shown in the right editor panel when quantumMode === 'tdseDynamics'.
 *
 * @param props - Component props
 * @returns The analysis section or null when not in TDSE mode
 *
 * @example
 * ```tsx
 * <TDSEAnalysisSection defaultOpen={true} />
 * ```
 */
export const TDSEAnalysisSection: React.FC<TDSEAnalysisSectionProps> = React.memo(
  ({ defaultOpen = true }) => {
    const objectType = useGeometryStore((s) => s.objectType)
    const { tdse, quantumMode, setDiagnosticsEnabled, setDiagnosticsInterval } =
      useExtendedObjectStore(
        useShallow((s) => ({
          tdse: s.schroedinger.tdse,
          quantumMode: s.schroedinger.quantumMode,
          setDiagnosticsEnabled: s.setTdseDiagnosticsEnabled,
          setDiagnosticsInterval: s.setTdseDiagnosticsInterval,
        })),
      )

    if (objectType !== 'schroedinger' || quantumMode !== 'tdseDynamics') return null

    return (
      <Section
        title="Analysis"
        defaultOpen={defaultOpen}
        data-testid="tdse-analysis-section"
      >
        {/* Diagnostics toggle + interval */}
        <ControlGroup
          title="Diagnostics"
          collapsible
          defaultOpen
          rightElement={
            <Switch
              checked={tdse.diagnosticsEnabled}
              onCheckedChange={setDiagnosticsEnabled}
              data-testid="tdse-diagnostics-enabled"
            />
          }
        >
          {tdse.diagnosticsEnabled && (
            <Slider
              label="Interval (frames)"
              min={1}
              max={60}
              step={1}
              value={tdse.diagnosticsInterval}
              onChange={setDiagnosticsInterval}
              showValue
              data-testid="tdse-diagnostics-interval"
            />
          )}
        </ControlGroup>

        {/* Inline energy diagram */}
        {tdse.diagnosticsEnabled && <EnergyDiagramInline tdse={tdse} />}
      </Section>
    )
  },
)

TDSEAnalysisSection.displayName = 'TDSEAnalysisSection'

/* ────────────────────────────────────────────────────────────── */
/*  Inline energy diagram (was EnergyDiagramHUD portal overlay)  */
/* ────────────────────────────────────────────────────────────── */

interface EnergyDiagramInlineProps {
  tdse: ReturnType<typeof useExtendedObjectStore.getState>['schroedinger']['tdse']
}

const EnergyDiagramInline: React.FC<EnergyDiagramInlineProps> = React.memo(({ tdse }) => {
  const { R, T, totalNorm, normDrift, hasData } = useTdseDiagnosticsStore(
    useShallow((s) => ({
      R: s.R,
      T: s.T,
      totalNorm: s.totalNorm,
      normDrift: s.normDrift,
      hasData: s.hasData,
    })),
  )

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
      <div className="rounded-md overflow-hidden bg-[var(--bg-surface)]">
        <svg width="100%" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="block">
          {/* Zero line */}
          <line
            x1={PADDING_X} y1={zeroY}
            x2={PADDING_X + PLOT_W} y2={zeroY}
            stroke="var(--text-tertiary)" strokeWidth={0.5} strokeDasharray="2,2"
          />

          {/* Y-axis ticks */}
          {yTicks.map((tick, i) => (
            <g key={i}>
              <line
                x1={PADDING_X - 3} y1={tick.y}
                x2={PADDING_X} y2={tick.y}
                stroke="var(--text-tertiary)" strokeWidth={0.5}
              />
              <text
                x={PADDING_X - 5} y={tick.y + 3}
                textAnchor="end" fill="var(--text-tertiary)"
                fontSize={8} fontFamily="monospace"
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
            fill="var(--theme-accent)" fillOpacity={0.15}
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
            x1={PADDING_X} y1={eLineY}
            x2={PADDING_X + PLOT_W} y2={eLineY}
            stroke="var(--color-warning)" strokeWidth={1} strokeDasharray="4,3"
          />
          <text
            x={PADDING_X + PLOT_W + 2} y={eLineY + 3}
            fill="var(--color-warning)" fontSize={8} fontFamily="monospace"
          >
            E
          </text>

          {/* Axes */}
          <line
            x1={PADDING_X} y1={PADDING_Y}
            x2={PADDING_X} y2={PADDING_Y + PLOT_H}
            stroke="var(--text-secondary)" strokeWidth={0.5}
          />
          <line
            x1={PADDING_X} y1={PADDING_Y + PLOT_H}
            x2={PADDING_X + PLOT_W} y2={PADDING_Y + PLOT_H}
            stroke="var(--text-secondary)" strokeWidth={0.5}
          />

          {/* Axis labels */}
          <text
            x={PADDING_X + PLOT_W / 2} y={HEIGHT - 2}
            textAnchor="middle" fill="var(--text-tertiary)"
            fontSize={8} fontFamily="monospace"
          >
            x
          </text>
          <text
            x={4} y={PADDING_Y + PLOT_H / 2}
            textAnchor="middle" fill="var(--text-tertiary)"
            fontSize={8} fontFamily="monospace"
            transform={`rotate(-90, 4, ${PADDING_Y + PLOT_H / 2})`}
          >
            V(x)
          </text>
        </svg>

        {/* Metrics readout */}
        <div className="px-2 pb-1.5 flex gap-3 text-[9px] font-mono leading-tight text-text-secondary">
          {hasData ? (
            <>
              <span>R={R.toFixed(3)} T={T.toFixed(3)}</span>
              <span className="text-text-tertiary">||ψ||²={totalNorm.toFixed(4)}</span>
              <span className={normDrift > 0.01 ? 'text-red-400' : 'text-text-tertiary'}>
                Δ={normDrift >= 0 ? '+' : ''}{(normDrift * 100).toFixed(2)}%
              </span>
            </>
          ) : (
            <span className="text-text-tertiary">Awaiting diagnostics...</span>
          )}
        </div>
      </div>
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
