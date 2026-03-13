/**
 * Dirac Analysis Section
 *
 * Right-editor section for diracEquation mode. Displays:
 * - Diagnostics toggle + interval
 * - Live Dirac observables (upper/lower spinor fractions, norm, drift)
 * - Characteristic scales (Compton wavelength, ZBW frequency, Klein threshold)
 *
 * @module components/sections/Advanced/DiracAnalysisSection
 */

import React, { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { Section } from '@/components/sections/Section'
import { UnavailableSection } from '@/components/sections/UnavailableSection'
import { ControlGroup } from '@/components/ui/ControlGroup'
import { Switch } from '@/components/ui/Switch'
import { Slider } from '@/components/ui/Slider'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'
import { useGeometryStore } from '@/stores/geometryStore'
import { useDiracDiagnosticsStore } from '@/stores/diracDiagnosticsStore'

/**
 * Props for DiracAnalysisSection.
 *
 * @param defaultOpen - Whether the section starts expanded
 */
export interface DiracAnalysisSectionProps {
  defaultOpen?: boolean
}

/**
 * Analysis section shown in the right editor panel when quantumMode === 'diracEquation'.
 *
 * @param props - Component props
 * @returns The analysis section or null when not in Dirac mode
 *
 * @example
 * ```tsx
 * <DiracAnalysisSection defaultOpen={true} />
 * ```
 */
export const DiracAnalysisSection: React.FC<DiracAnalysisSectionProps> = React.memo(
  ({ defaultOpen = true }) => {
    const objectType = useGeometryStore((s) => s.objectType)
    const { dirac, quantumMode, setDiagnosticsEnabled, setDiagnosticsInterval } =
      useExtendedObjectStore(
        useShallow((s) => ({
          dirac: s.schroedinger.dirac,
          quantumMode: s.schroedinger.quantumMode,
          setDiagnosticsEnabled: s.setDiracDiagnosticsEnabled,
          setDiagnosticsInterval: s.setDiracDiagnosticsInterval,
        })),
      )

    if (objectType !== 'schroedinger') return null
    if (quantumMode !== 'diracEquation') {
      const isComputeMode = quantumMode === 'freeScalarField' || quantumMode === 'tdseDynamics' || quantumMode === 'becDynamics'
      if (!isComputeMode) return null
      return <UnavailableSection title="Dirac Analysis" reason="Switch to Dirac Equation mode" />
    }

    return (
      <Section
        title="Dirac Analysis"
        defaultOpen={defaultOpen}
        data-testid="dirac-analysis-section"
      >
        {/* Diagnostics toggle + interval */}
        <ControlGroup
          title="Diagnostics"
          collapsible
          defaultOpen
          rightElement={
            <Switch
              checked={dirac.diagnosticsEnabled}
              onCheckedChange={setDiagnosticsEnabled}
              data-testid="dirac-diagnostics-enabled"
            />
          }
        >
          {dirac.diagnosticsEnabled && (
            <Slider
              label="Interval (frames)"
              min={1}
              max={60}
              step={1}
              value={dirac.diagnosticsInterval}
              onChange={setDiagnosticsInterval}
              showValue
              data-testid="dirac-diagnostics-interval"
            />
          )}
        </ControlGroup>

        {/* E(k) dispersion diagram */}
        <DiracDispersionDiagram mass={dirac.mass} speedOfLight={dirac.speedOfLight} />

        {/* Diagnostics readout */}
        {dirac.diagnosticsEnabled && <DiracDiagnosticsInline />}
      </Section>
    )
  },
)

DiracAnalysisSection.displayName = 'DiracAnalysisSection'

/* ────────────────────────────────────────────────────────────── */
/*  E(k) dispersion diagram                                       */
/* ────────────────────────────────────────────────────────────── */

const DISP_WIDTH = 260
const DISP_HEIGHT = 130
const DISP_PX = 32
const DISP_PY = 16
const DISP_PW = DISP_WIDTH - 2 * DISP_PX
const DISP_PH = DISP_HEIGHT - 2 * DISP_PY

interface DiracDispersionDiagramProps {
  mass: number
  speedOfLight: number
}

/**
 * Inline SVG showing the relativistic E(k) = ±√((ck)²+(mc²)²) dispersion
 * with the mass gap 2mc² and Klein threshold marked.
 */
const DiracDispersionDiagram: React.FC<DiracDispersionDiagramProps> = React.memo(
  ({ mass, speedOfLight }) => {
    const mc2 = mass * speedOfLight * speedOfLight
    const kleinV = 2 * mc2

    const { posPoints, negPoints } = useMemo(() => {
      const nSamples = 80
      const kMax = 4 * mass * speedOfLight // reasonable k range
      const eMax = Math.sqrt((speedOfLight * kMax) ** 2 + mc2 ** 2) * 1.1

      const toX = (k: number) => DISP_PX + ((k + kMax) / (2 * kMax)) * DISP_PW
      const toY = (e: number) => DISP_PY + (1 - (e + eMax) / (2 * eMax)) * DISP_PH

      const pos: string[] = []
      const neg: string[] = []
      for (let i = 0; i < nSamples; i++) {
        const k = -kMax + (2 * kMax * i) / (nSamples - 1)
        const e = Math.sqrt((speedOfLight * k) ** 2 + mc2 ** 2)
        pos.push(`${toX(k).toFixed(1)},${toY(e).toFixed(1)}`)
        neg.push(`${toX(k).toFixed(1)},${toY(-e).toFixed(1)}`)
      }
      return { posPoints: pos.join(' '), negPoints: neg.join(' ') }
    }, [mass, speedOfLight, mc2])

    const eMax = Math.sqrt((speedOfLight * 4 * mass * speedOfLight) ** 2 + mc2 ** 2) * 1.1
    const toY = (e: number) => DISP_PY + (1 - (e + eMax) / (2 * eMax)) * DISP_PH
    const zeroY = toY(0)
    const mc2Y = toY(mc2)
    const negMc2Y = toY(-mc2)
    const kleinY = toY(kleinV)

    return (
      <div className="mt-2" data-testid="dirac-dispersion">
        <div className="rounded-md overflow-hidden bg-[var(--bg-surface)]">
          <svg width="100%" viewBox={`0 0 ${DISP_WIDTH} ${DISP_HEIGHT}`} className="block">
            {/* Zero energy line */}
            <line
              x1={DISP_PX} y1={zeroY} x2={DISP_PX + DISP_PW} y2={zeroY}
              stroke="var(--text-tertiary)" strokeWidth={0.5} strokeDasharray="2,2"
            />

            {/* Mass gap lines ±mc² */}
            <line
              x1={DISP_PX} y1={mc2Y} x2={DISP_PX + DISP_PW} y2={mc2Y}
              stroke="var(--theme-accent)" strokeWidth={0.5} strokeDasharray="3,3" opacity={0.5}
            />
            <line
              x1={DISP_PX} y1={negMc2Y} x2={DISP_PX + DISP_PW} y2={negMc2Y}
              stroke="var(--theme-accent)" strokeWidth={0.5} strokeDasharray="3,3" opacity={0.5}
            />

            {/* Klein threshold */}
            <line
              x1={DISP_PX} y1={kleinY} x2={DISP_PX + DISP_PW} y2={kleinY}
              stroke="var(--color-warning)" strokeWidth={1} strokeDasharray="4,3"
            />
            <text
              x={DISP_PX + DISP_PW + 2} y={kleinY + 3}
              fill="var(--color-warning)" fontSize={7} fontFamily="monospace"
            >
              V_K
            </text>

            {/* Positive energy branch (particle) */}
            <polyline
              points={posPoints}
              fill="none" stroke="var(--dirac-particle)" strokeWidth={2} strokeLinejoin="round"
            />

            {/* Negative energy branch (antiparticle) */}
            <polyline
              points={negPoints}
              fill="none" stroke="var(--dirac-antiparticle)" strokeWidth={2} strokeLinejoin="round"
            />

            {/* Mass gap label */}
            <text
              x={DISP_PX + 2} y={(mc2Y + negMc2Y) / 2 + 3}
              fill="var(--text-tertiary)" fontSize={7} fontFamily="monospace"
            >
              2mc²
            </text>

            {/* Axes */}
            <line
              x1={DISP_PX + DISP_PW / 2} y1={DISP_PY}
              x2={DISP_PX + DISP_PW / 2} y2={DISP_PY + DISP_PH}
              stroke="var(--text-secondary)" strokeWidth={0.5}
            />

            {/* Axis labels */}
            <text
              x={DISP_PX + DISP_PW / 2} y={DISP_HEIGHT - 2}
              textAnchor="middle" fill="var(--text-tertiary)" fontSize={8} fontFamily="monospace"
            >
              k
            </text>
            <text
              x={4} y={DISP_PY + DISP_PH / 2}
              textAnchor="middle" fill="var(--text-tertiary)" fontSize={8} fontFamily="monospace"
              transform={`rotate(-90, 4, ${DISP_PY + DISP_PH / 2})`}
            >
              E(k)
            </text>
          </svg>
        </div>
      </div>
    )
  },
)

DiracDispersionDiagram.displayName = 'DiracDispersionDiagram'

/* ────────────────────────────────────────────────────────────── */
/*  Inline Dirac diagnostics display                              */
/* ────────────────────────────────────────────────────────────── */

const DiracDiagnosticsInline: React.FC = React.memo(() => {
  const {
    hasData,
    totalNorm,
    normDrift,
    maxDensity,
    particleFraction,
    antiparticleFraction,
    comptonWavelength,
    zitterbewegungFreq,
    kleinThreshold,
  } = useDiracDiagnosticsStore(
    useShallow((s) => ({
      hasData: s.hasData,
      totalNorm: s.totalNorm,
      normDrift: s.normDrift,
      maxDensity: s.maxDensity,
      particleFraction: s.particleFraction,
      antiparticleFraction: s.antiparticleFraction,
      comptonWavelength: s.comptonWavelength,
      zitterbewegungFreq: s.zitterbewegungFreq,
      kleinThreshold: s.kleinThreshold,
    })),
  )

  return (
    <div className="mt-2" data-testid="dirac-analysis-inline">
      <div className="rounded-md overflow-hidden bg-[var(--bg-surface)]">
        <div className="px-2 py-1.5 space-y-0.5 text-[9px] font-mono leading-tight text-text-secondary">
          {hasData ? (
            <>
              {/* Upper / lower spinor component fractions */}
              <div className="flex gap-3">
                <span>Upper={(particleFraction * 100).toFixed(1)}%</span>
                <span>Lower={(antiparticleFraction * 100).toFixed(1)}%</span>
              </div>

              {/* Norm and density */}
              <div className="flex gap-3">
                <span className="text-text-tertiary">||ψ||²={totalNorm.toFixed(4)}</span>
                <span className={normDrift > 0.01 ? 'text-red-400' : 'text-text-tertiary'}>
                  Δ={normDrift >= 0 ? '+' : ''}{(normDrift * 100).toFixed(2)}%
                </span>
              </div>
              <div className="flex gap-3">
                <span>n_max={maxDensity.toFixed(4)}</span>
              </div>

              {/* Characteristic scales */}
              <div className="mt-1 pt-1 border-t border-[var(--border-subtle)]">
                <div className="flex gap-3">
                  <span>λ_C={comptonWavelength.toFixed(3)}</span>
                  <span>ω_Z={zitterbewegungFreq.toFixed(2)}</span>
                </div>
                <div className="flex gap-3">
                  <span>V_K={kleinThreshold.toFixed(2)}</span>
                </div>
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

DiracDiagnosticsInline.displayName = 'DiracDiagnosticsInline'
