/**
 * BEC Analysis Section
 *
 * Right-editor section for becDynamics mode. Displays:
 * - Diagnostics toggle + interval
 * - Live BEC observables (μ, ξ, c_s, R_TF, norm drift)
 * - Inline energy diagram (harmonic trap V(x) with chemical potential level)
 *
 * @module components/sections/Advanced/BECAnalysisSection
 */

import React, { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { Section } from '@/components/sections/Section'
import { ControlGroup } from '@/components/ui/ControlGroup'
import { Switch } from '@/components/ui/Switch'
import { Slider } from '@/components/ui/Slider'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'
import { useGeometryStore } from '@/stores/geometryStore'
import { useBecDiagnosticsStore } from '@/stores/becDiagnosticsStore'

/* ── SVG layout constants ── */
const WIDTH = 260
const HEIGHT = 130
const PADDING_X = 32
const PADDING_Y = 16
const PLOT_W = WIDTH - 2 * PADDING_X
const PLOT_H = HEIGHT - 2 * PADDING_Y

/**
 * Props for BECAnalysisSection.
 *
 * @param defaultOpen - Whether the section starts expanded
 */
export interface BECAnalysisSectionProps {
  defaultOpen?: boolean
}

/**
 * Analysis section shown in the right editor panel when quantumMode === 'becDynamics'.
 *
 * @param props - Component props
 * @returns The analysis section or null when not in BEC mode
 *
 * @example
 * ```tsx
 * <BECAnalysisSection defaultOpen={true} />
 * ```
 */
export const BECAnalysisSection: React.FC<BECAnalysisSectionProps> = React.memo(
  ({ defaultOpen = true }) => {
    const objectType = useGeometryStore((s) => s.objectType)
    const { bec, quantumMode, setDiagnosticsEnabled, setDiagnosticsInterval } =
      useExtendedObjectStore(
        useShallow((s) => ({
          bec: s.schroedinger.bec,
          quantumMode: s.schroedinger.quantumMode,
          setDiagnosticsEnabled: s.setBecDiagnosticsEnabled,
          setDiagnosticsInterval: s.setBecDiagnosticsInterval,
        })),
      )

    if (objectType !== 'schroedinger' || quantumMode !== 'becDynamics') return null

    return (
      <Section
        title="BEC Analysis"
        defaultOpen={defaultOpen}
        data-testid="bec-analysis-section"
      >
        {/* Diagnostics toggle + interval */}
        <ControlGroup
          title="Diagnostics"
          collapsible
          defaultOpen
          rightElement={
            <Switch
              checked={bec.diagnosticsEnabled}
              onCheckedChange={setDiagnosticsEnabled}
              data-testid="bec-diagnostics-enabled"
            />
          }
        >
          {bec.diagnosticsEnabled && (
            <Slider
              label="Interval (frames)"
              min={1}
              max={60}
              step={1}
              value={bec.diagnosticsInterval}
              onChange={setDiagnosticsInterval}
              showValue
              data-testid="bec-diagnostics-interval"
            />
          )}
        </ControlGroup>

        {/* Inline trap diagram + diagnostics readout */}
        {bec.diagnosticsEnabled && <BECDiagnosticsInline bec={bec} />}
      </Section>
    )
  },
)

BECAnalysisSection.displayName = 'BECAnalysisSection'

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
  } = useBecDiagnosticsStore(
    useShallow((s) => ({
      hasData: s.hasData,
      totalNorm: s.totalNorm,
      maxDensity: s.maxDensity,
      normDrift: s.normDrift,
      chemicalPotential: s.chemicalPotential,
      healingLength: s.healingLength,
      soundSpeed: s.soundSpeed,
      thomasFermiRadius: s.thomasFermiRadius,
    })),
  )

  // Compute trap potential profile for SVG
  const profile = useMemo(() => {
    const omega = bec.trapOmega
    const mass = bec.mass
    const spacing = bec.spacing[0] ?? 0.15
    const gridN = bec.gridSize[0] ?? 64
    const L = gridN * spacing * 0.5
    const nSamples = 100
    const xs: number[] = []
    const vs: number[] = []
    for (let i = 0; i < nSamples; i++) {
      const x = -L + (2 * L * i) / (nSamples - 1)
      xs.push(x)
      vs.push(0.5 * mass * omega * omega * x * x)
    }
    return { xs, vs, vMax: vs[0]!, vMin: 0 }
  }, [bec.trapOmega, bec.mass, bec.spacing, bec.gridSize])

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
      <div className="rounded-md overflow-hidden bg-[var(--bg-surface)]">
        <svg width="100%" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="block">
          {/* Zero line */}
          <line
            x1={PADDING_X} y1={zeroY}
            x2={PADDING_X + PLOT_W} y2={zeroY}
            stroke="var(--text-tertiary)" strokeWidth={0.5} strokeDasharray="2,2"
          />

          {/* V(x) fill */}
          <polygon
            points={[
              ...vPolyPoints,
              `${toSvgX(xMax).toFixed(1)},${zeroY.toFixed(1)}`,
              `${toSvgX(xMin).toFixed(1)},${zeroY.toFixed(1)}`,
            ].join(' ')}
            fill="var(--theme-accent)" fillOpacity={0.12}
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
                x1={PADDING_X} y1={muLineY}
                x2={PADDING_X + PLOT_W} y2={muLineY}
                stroke="#f59e0b" strokeWidth={1} strokeDasharray="4,3"
              />
              <text
                x={PADDING_X + PLOT_W + 2} y={muLineY + 3}
                fill="#f59e0b" fontSize={8} fontFamily="monospace"
              >
                μ
              </text>
            </>
          )}

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

        {/* BEC observables readout */}
        <div className="px-2 pb-1.5 space-y-0.5 text-[9px] font-mono leading-tight text-text-secondary">
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
              <div className="flex gap-3">
                <span className="text-text-tertiary">||ψ||²={totalNorm.toFixed(4)}</span>
                <span className={normDrift > 0.01 ? 'text-red-400' : 'text-text-tertiary'}>
                  Δ={normDrift >= 0 ? '+' : ''}{(normDrift * 100).toFixed(2)}%
                </span>
              </div>
            </>
          ) : (
            <span className="text-text-tertiary">Awaiting diagnostics...</span>
          )}
        </div>
      </div>
    </div>
  )
})

BECDiagnosticsInline.displayName = 'BECDiagnosticsInline'
