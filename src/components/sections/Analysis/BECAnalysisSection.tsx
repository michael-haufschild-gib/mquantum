/**
 * BEC Analysis Content
 *
 * Content component for becDynamics mode analysis. Displays:
 * - Diagnostics toggle + interval
 * - Live BEC observables (μ, ξ, c_s, R_TF, norm drift)
 * - Inline energy diagram (harmonic trap V(x) with chemical potential level)
 *
 * Used inside the unified AnalysisSection.
 *
 * @module components/sections/Analysis/BECAnalysisSection
 */

import React, { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { Slider } from '@/components/ui/Slider'
import { asymptoticSoundSpeed, hasHorizon, hawkingReadout } from '@/lib/physics/bec/sonicHorizon'
import {
  computeWaterfallBackgroundDensity,
  resolveBecMass,
} from '@/lib/physics/bec/waterfallParams'
import { useDiagnosticsStore } from '@/stores/diagnosticsStore'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'

import { NormDriftRow } from './AnalysisPrimitives'

/* ── SVG layout constants ── */
const WIDTH = 260
const HEIGHT = 130
const PADDING_X = 32
const PADDING_Y = 16
const PLOT_W = WIDTH - 2 * PADDING_X
const PLOT_H = HEIGHT - 2 * PADDING_Y

/**
 * Analysis content for becDynamics mode.
 * Renders diagnostics controls and inline trap diagram.
 *
 * @returns Diagnostics controls and BEC observables display
 *
 * @example
 * ```tsx
 * <BECAnalysisContent />
 * ```
 */
export const BECAnalysisContent: React.FC = React.memo(() => {
  const { bec, setDiagnosticsInterval } = useExtendedObjectStore(
    useShallow((s) => ({
      bec: s.schroedinger.bec,
      setDiagnosticsInterval: s.setBecDiagnosticsInterval,
    }))
  )

  return (
    <>
      <Slider
        label="Diagnostics Interval (frames)"
        tooltip="How often to compute BEC observables (chemical potential, healing length, etc.). Lower values update faster but use more GPU time."
        min={1}
        max={60}
        step={1}
        value={bec.diagnosticsInterval}
        onChange={setDiagnosticsInterval}
        showValue
        data-testid="bec-diagnostics-interval"
      />

      {/* Inline trap diagram + diagnostics readout */}
      <BECDiagnosticsInline bec={bec} />
    </>
  )
})

BECAnalysisContent.displayName = 'BECAnalysisContent'

/* ────────────────────────────────────────────────────────────── */
/*  Inline BEC diagnostics display                                */
/* ────────────────────────────────────────────────────────────── */

interface BECDiagnosticsInlineProps {
  bec: ReturnType<typeof useExtendedObjectStore.getState>['schroedinger']['bec']
}

const BECDiagnosticsInline: React.FC<BECDiagnosticsInlineProps> = React.memo(({ bec }) => {
  const {
    hasData,
    totalNorm,
    maxDensity,
    normDrift,
    chemicalPotential,
    healingLength,
    soundSpeed,
    thomasFermiRadius,
  } = useDiagnosticsStore(
    useShallow((s) => ({
      hasData: s.bec.hasData,
      totalNorm: s.bec.totalNorm,
      maxDensity: s.bec.maxDensity,
      normDrift: s.bec.normDrift,
      chemicalPotential: s.bec.chemicalPotential,
      healingLength: s.bec.healingLength,
      soundSpeed: s.bec.soundSpeed,
      thomasFermiRadius: s.bec.thomasFermiRadius,
    }))
  )

  // Compute trap potential profile for SVG (x-axis cross-section with anisotropy)
  const profile = useMemo(() => {
    const omegaX = bec.trapOmega * (bec.trapAnisotropy[0] ?? 1.0)
    // resolveBecMass reads only `bec.mass` — pin that in the dep array below.
    const mass = resolveBecMass({ mass: bec.mass })
    const spacing = bec.spacing[0] ?? 0.15
    const gridN = bec.gridSize[0] ?? 64
    const L = gridN * spacing * 0.5
    const nSamples = 100
    const xs: number[] = []
    const vs: number[] = []
    for (let i = 0; i < nSamples; i++) {
      const x = -L + (2 * L * i) / (nSamples - 1)
      xs.push(x)
      vs.push(0.5 * mass * omegaX * omegaX * x * x)
    }
    return { xs, vs, vMax: vs[0]!, vMin: 0 }
  }, [bec.trapOmega, bec.trapAnisotropy, bec.mass, bec.spacing, bec.gridSize])

  const muLevel = hasData ? chemicalPotential : 0
  const vMax = Math.max(profile.vMax, muLevel * 1.3, 1)
  const yRange = vMax * 1.1
  const xMin = profile.xs[0]!
  const xMax = profile.xs[profile.xs.length - 1]!
  const xRange = xMax - xMin || 1

  const toSvgX = (x: number) => PADDING_X + ((x - xMin) / xRange) * PLOT_W
  const toSvgY = (v: number) => PADDING_Y + (1 - v / yRange) * PLOT_H

  const vPolyPoints = profile.xs.map((x, i) => {
    const sx = toSvgX(x)
    const clampedV = Math.min(yRange, profile.vs[i]!)
    return `${sx.toFixed(1)},${toSvgY(clampedV).toFixed(1)}`
  })

  const muLineY = toSvgY(muLevel)
  const zeroY = toSvgY(0)

  return (
    <div className="mt-2" data-testid="bec-analysis-inline">
      <p className="text-xs text-text-secondary mb-1">Harmonic Trap V(x) & Chemical Potential</p>
      <div className="rounded-md overflow-hidden bg-[var(--bg-surface)]">
        <svg
          width="100%"
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="block"
          data-testid="bec-trap-svg"
        >
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

          {/* V(x) fill */}
          <polygon
            points={[
              ...vPolyPoints,
              `${toSvgX(xMax).toFixed(1)},${zeroY.toFixed(1)}`,
              `${toSvgX(xMin).toFixed(1)},${zeroY.toFixed(1)}`,
            ].join(' ')}
            fill="var(--theme-accent)"
            fillOpacity={0.12}
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

          {/* Chemical potential level */}
          {hasData && (
            <>
              <line
                x1={PADDING_X}
                y1={muLineY}
                x2={PADDING_X + PLOT_W}
                y2={muLineY}
                stroke="var(--color-warning)"
                strokeWidth={1}
                strokeDasharray="4,3"
              />
              <text
                x={PADDING_X + PLOT_W + 2}
                y={muLineY + 3}
                fill="var(--color-warning)"
                fontSize={8}
                fontFamily="monospace"
              >
                μ
              </text>
            </>
          )}

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
            {(bec.trapAnisotropy[0] ?? 1.0) !== 1.0
              ? ` [ω×${(bec.trapAnisotropy[0] ?? 1.0).toFixed(1)}]`
              : ''}
          </text>
        </svg>

        {/* BEC observables readout */}
        <div className="px-2 pb-1.5 space-y-0.5 text-xs font-mono leading-tight text-text-secondary">
          {hasData ? (
            <>
              <div className="flex gap-3">
                <span>μ={chemicalPotential.toFixed(2)}</span>
                <span>ξ={healingLength < 100 ? healingLength.toFixed(3) : '∞'}</span>
                <span>c_s={soundSpeed.toFixed(2)}</span>
              </div>
              <div className="flex gap-3">
                <span>R_TF={thomasFermiRadius.toFixed(2)}</span>
                <span>n_max={maxDensity.toFixed(4)}</span>
              </div>
              <NormDriftRow totalNorm={totalNorm} normDrift={normDrift} />
            </>
          ) : (
            <span className="text-text-tertiary">Awaiting diagnostics...</span>
          )}
          {bec.initialCondition === 'blackHoleAnalog' && bec.diagnosticsEnabled ? (
            <HawkingHudRow bec={bec} />
          ) : null}
        </div>
      </div>
    </div>
  )
})

BECDiagnosticsInline.displayName = 'BECDiagnosticsInline'

/* ────────────────────────────────────────────────────────────── */
/*  Analog Hawking (sonic horizon) readout                        */
/* ────────────────────────────────────────────────────────────── */

interface HawkingHudRowProps {
  bec: BECDiagnosticsInlineProps['bec']
}

/**
 * Analytic Hawking diagnostics readout for the `blackHoleAnalog` BEC preset.
 * Shows horizon position x₀, surface gravity κ, and analog Hawking temperature
 * T_H = κ/(2π). Computed purely CPU-side from the waterfall profile — does
 * not require GPU diagnostics plumbing, so the readout populates immediately
 * when the preset is selected.
 */
const HawkingHudRow: React.FC<HawkingHudRowProps> = React.memo(({ bec }) => {
  // Resolve mass via the shared helper so the HUD and TdseBecConfigBuilder
  // agree when `bec.mass` is ever nulled/undefined upstream.
  const mass = resolveBecMass(bec)
  const n0 = computeWaterfallBackgroundDensity({
    interactionStrength: bec.interactionStrength,
  })

  // Box length along flow axis (axis 0) — the detrended waterfall profile
  // needs L_box to compute the parabolic counter-drift that makes ψ C¹ at
  // the periodic wrap. Must equal gridSize[0] · spacing[0] of the simulator
  // so HUD analytics and the GPU-seeded field stay consistent.
  const lBox = (bec.gridSize[0] ?? 64) * (bec.spacing[0] ?? 0.15)
  const waterfall = useMemo(
    () => ({
      vMax: bec.hawkingVmax,
      lh: bec.hawkingLh,
      // Match the simulator: TdseBecConfigBuilder overrides μ for the
      // waterfall init, giving background density n₀ = μ/g. Using the
      // exported helper keeps the HUD's κ and T_H consistent with the
      // GPU-seeded field.
      n0,
      deltaN: bec.hawkingDeltaN,
      g: bec.interactionStrength,
      mass,
      lBox,
    }),
    [bec.hawkingVmax, bec.hawkingLh, bec.hawkingDeltaN, bec.interactionStrength, n0, mass, lBox]
  )
  const readout = useMemo(() => hawkingReadout(waterfall), [waterfall])
  const cs0 = useMemo(() => asymptoticSoundSpeed(waterfall), [waterfall])
  // hasHorizon is a necessary-and-sufficient predicate — checks that
  // findHorizonX0 returns a finite value under the detrended profile.
  // A large L_h/L_box ratio can suppress the horizon even when |v_max| > c_s0.
  const horizonExists = hasHorizon(waterfall)

  const formatNum = (v: number, digits = 3) => (Number.isFinite(v) ? v.toFixed(digits) : '—')

  return (
    <div
      className="mt-1 pt-1 border-t border-[var(--border-subtle)] text-[10px]"
      data-testid="bec-hawking-hud"
    >
      <div className="flex gap-3">
        <span>x₀={formatNum(readout.horizonX0, 3)}</span>
        <span>κ={formatNum(readout.kappa, 3)}</span>
        <span>T_H={formatNum(readout.hawkingTemperature, 4)}</span>
      </div>
      {!horizonExists ? (
        <div
          className="mt-1 text-[var(--color-warning)]"
          data-testid="bec-hawking-no-horizon-warning"
        >
          No horizon — v_max must exceed local sound speed c_s0 = {formatNum(cs0, 3)}
        </div>
      ) : null}
    </div>
  )
})

HawkingHudRow.displayName = 'HawkingHudRow'
