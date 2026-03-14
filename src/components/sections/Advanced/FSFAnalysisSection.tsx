/**
 * FSF Analysis Content
 *
 * Content component for freeScalarField mode analysis. Displays:
 * - Energy and norm sparkline charts (ring buffer history) at the top
 * - Klein-Gordon dispersion diagram
 * - Diagnostics interval slider
 * - Live field observables (energy, norm, max phi/pi, energy drift)
 * - Field statistics (mean, variance)
 *
 * Used inside the unified AnalysisSection.
 *
 * @module components/sections/Advanced/FSFAnalysisSection
 */

import React, { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { ControlGroup } from '@/components/ui/ControlGroup'
import { Slider } from '@/components/ui/Slider'
import { Sparkline } from '@/components/ui/Sparkline'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'
import { useFsfDiagnosticsStore } from '@/stores/fsfDiagnosticsStore'

/**
 * Compact metric row for diagnostics display.
 */
const MetricRow: React.FC<{
  label: string
  value: number
  digits?: number
  unit?: string
}> = ({ label, value, digits = 4, unit = '' }) => (
  <div className="flex items-center justify-between py-0.5">
    <span className="text-[10px] text-text-tertiary">{label}</span>
    <span className="text-[10px] font-mono text-text-secondary tabular-nums">
      {isFinite(value) ? value.toFixed(digits) : 'NaN'}
      {unit && <span className="text-text-tertiary ml-0.5">{unit}</span>}
    </span>
  </div>
)

/**
 * Analysis content for freeScalarField mode.
 * Renders sparklines at the top, then dispersion diagram, controls, and metrics.
 *
 * @returns Sparklines, dispersion diagram, controls, and metrics display
 *
 * @example
 * ```tsx
 * <FSFAnalysisContent />
 * ```
 */
export const FSFAnalysisContent: React.FC = React.memo(() => {
  const { fsf, setDiagnosticsInterval } =
    useExtendedObjectStore(
      useShallow((s) => ({
        fsf: s.schroedinger.freeScalar,
        setDiagnosticsInterval: s.setFreeScalarDiagnosticsInterval,
      })),
    )

  return (
    <>
      {/* Sparkline charts at the top */}
      <SparklineCharts />

      {/* Klein-Gordon dispersion relation */}
      <KGDispersionDiagram mass={fsf.mass} />

      <Slider
        label="Diagnostics Interval (frames)"
        min={1}
        max={120}
        step={1}
        value={fsf.diagnosticsInterval}
        onChange={setDiagnosticsInterval}
        showValue
      />

      {/* Field observables table */}
      <MetricsDisplay />
    </>
  )
})

FSFAnalysisContent.displayName = 'FSFAnalysisContent'

/* ────────────────────────────────────────────────────────────── */
/*  Sparkline charts (isolated store subscription)               */
/* ────────────────────────────────────────────────────────────── */

/** Labeled sparkline row for a single metric history */
const SparklineRow: React.FC<{
  label: string
  data: Float32Array
  head: number
  count: number
  min?: number
  max?: number
}> = ({ label, data, head, count, min, max }) => (
  <div>
    <span className="text-[10px] text-text-tertiary uppercase tracking-wider">{label}</span>
    <Sparkline
      data={data}
      head={head}
      count={count}
      min={min}
      max={max}
      height={28}
      className="w-full"
    />
  </div>
)

const SparklineCharts: React.FC = React.memo(() => {
  const { hasData, historyEnergy, historyNorm, historyHead, historyCount } =
    useFsfDiagnosticsStore(
      useShallow((s) => ({
        hasData: s.hasData,
        historyEnergy: s.historyEnergy,
        historyNorm: s.historyNorm,
        historyHead: s.historyHead,
        historyCount: s.historyCount,
      })),
    )

  if (!hasData) {
    return (
      <div className="px-1 py-3 text-center">
        <p className="text-[10px] text-text-tertiary italic">
          Waiting for first readback...
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-2 px-1">
      <SparklineRow
        label="Energy"
        data={historyEnergy}
        head={historyHead}
        count={historyCount}
      />
      <SparklineRow
        label="Norm"
        data={historyNorm}
        head={historyHead}
        count={historyCount}
        min={0}
      />
    </div>
  )
})

SparklineCharts.displayName = 'SparklineCharts'

/* ────────────────────────────────────────────────────────────── */
/*  Klein-Gordon dispersion relation ω(k) = √(k² + m²)          */
/* ────────────────────────────────────────────────────────────── */

const KG_WIDTH = 260
const KG_HEIGHT = 130
const KG_PX = 32
const KG_PY = 16
const KG_PW = KG_WIDTH - 2 * KG_PX
const KG_PH = KG_HEIGHT - 2 * KG_PY

/**
 * Inline SVG showing the Klein-Gordon dispersion ω(k) = √(k² + m²).
 * Shows the mass gap at ω = m with a dashed horizontal line.
 *
 * @param mass - Klein-Gordon mass parameter m
 */
const KGDispersionDiagram: React.FC<{ mass: number }> = React.memo(({ mass }) => {
  const curvePoints = useMemo(() => {
    const nSamples = 80
    const kMax = Math.max(4 * mass, 4) // ensure visible range even at small mass
    const wMax = Math.sqrt(kMax * kMax + mass * mass) * 1.1

    const toX = (k: number) => KG_PX + ((k + kMax) / (2 * kMax)) * KG_PW
    const toY = (w: number) => KG_PY + (1 - w / wMax) * KG_PH

    const pts: string[] = []
    for (let i = 0; i < nSamples; i++) {
      const k = -kMax + (2 * kMax * i) / (nSamples - 1)
      const w = Math.sqrt(k * k + mass * mass)
      pts.push(`${toX(k).toFixed(1)},${toY(w).toFixed(1)}`)
    }
    return {
      points: pts.join(' '),
      massGapY: toY(mass),
      zeroY: toY(0),
      midX: toX(0),
    }
  }, [mass])

  return (
    <div data-testid="kg-dispersion">
      <p className="text-[10px] text-text-secondary mb-1">Klein-Gordon Dispersion ω(k) = √(k² + m²)</p>
      <div className="rounded-md overflow-hidden bg-[var(--bg-surface)]">
        <svg width="100%" viewBox={`0 0 ${KG_WIDTH} ${KG_HEIGHT}`} className="block">
          {/* Zero line */}
          <line
            x1={KG_PX} y1={curvePoints.zeroY} x2={KG_PX + KG_PW} y2={curvePoints.zeroY}
            stroke="var(--text-tertiary)" strokeWidth={0.5} strokeDasharray="2,2"
          />

          {/* Mass gap line ω = m */}
          <line
            x1={KG_PX} y1={curvePoints.massGapY} x2={KG_PX + KG_PW} y2={curvePoints.massGapY}
            stroke="var(--theme-accent)" strokeWidth={0.5} strokeDasharray="3,3" opacity={0.5}
          />
          <text
            x={KG_PX + KG_PW + 2} y={curvePoints.massGapY + 3}
            fill="var(--theme-accent)" fontSize={7} fontFamily="monospace" opacity={0.7}
          >
            m
          </text>

          {/* Dispersion curve */}
          <polyline
            points={curvePoints.points}
            fill="none" stroke="var(--theme-accent)" strokeWidth={2} strokeLinejoin="round"
          />

          {/* Vertical k-axis */}
          <line
            x1={curvePoints.midX} y1={KG_PY}
            x2={curvePoints.midX} y2={KG_PY + KG_PH}
            stroke="var(--text-secondary)" strokeWidth={0.5}
          />

          {/* Axis labels */}
          <text
            x={KG_PX + KG_PW / 2} y={KG_HEIGHT - 2}
            textAnchor="middle" fill="var(--text-tertiary)" fontSize={8} fontFamily="monospace"
          >
            k
          </text>
          <text
            x={4} y={KG_PY + KG_PH / 2}
            textAnchor="middle" fill="var(--text-tertiary)" fontSize={8} fontFamily="monospace"
            transform={`rotate(-90, 4, ${KG_PY + KG_PH / 2})`}
          >
            ω(k)
          </text>
        </svg>
      </div>
    </div>
  )
})

KGDispersionDiagram.displayName = 'KGDispersionDiagram'

/* ────────────────────────────────────────────────────────────── */
/*  Field observables table (isolated store subscription)         */
/* ────────────────────────────────────────────────────────────── */

const MetricsDisplay: React.FC = React.memo(() => {
  const {
    hasData,
    totalEnergy,
    totalNorm,
    maxPhi,
    maxPi,
    energyDrift,
    meanPhi,
    variancePhi,
  } = useFsfDiagnosticsStore(
    useShallow((s) => ({
      hasData: s.hasData,
      totalEnergy: s.totalEnergy,
      totalNorm: s.totalNorm,
      maxPhi: s.maxPhi,
      maxPi: s.maxPi,
      energyDrift: s.energyDrift,
      meanPhi: s.meanPhi,
      variancePhi: s.variancePhi,
    }))
  )

  if (!hasData) return null

  return (
    <ControlGroup title="Field Observables" collapsible defaultOpen>
      <div className="space-y-0.5 px-1">
        <MetricRow label="Total Energy" value={totalEnergy} digits={6} />
        <MetricRow label="Energy Drift" value={energyDrift * 100} digits={4} unit="%" />
        <div className="border-t border-panel-border my-1" />
        <MetricRow label="∫φ² dV (norm)" value={totalNorm} digits={4} />
        <MetricRow label="max |φ|" value={maxPhi} digits={4} />
        <MetricRow label="max |π|" value={maxPi} digits={4} />
        <div className="border-t border-panel-border my-1" />
        <MetricRow label="⟨φ⟩" value={meanPhi} digits={6} />
        <MetricRow label="Var(φ)" value={variancePhi} digits={6} />
      </div>
    </ControlGroup>
  )
})

MetricsDisplay.displayName = 'MetricsDisplay'
