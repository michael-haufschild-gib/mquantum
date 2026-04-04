/**
 * Kaluza-Klein Compactification Section
 *
 * Self-contained right-panel section for KK compactification controls
 * and energy level diagram. Visible only when TDSE or BEC mode is active.
 *
 * Contains:
 * - Per-dimension compact/extended toggle
 * - Per-dimension compactification radius R slider
 * - KK energy level diagram (SVG) showing discrete mass spectrum
 *
 * @module components/sections/Geometry/SchroedingerControls/KKCompactificationSection
 */

import React, { useCallback, useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { Section } from '@/components/sections/Section'
import { Slider } from '@/components/ui/Slider'
import { Switch } from '@/components/ui/Switch'
import { computeKKSpectrum, computeMaxCompactRadius } from '@/lib/physics/compactification'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'
import { useGeometryStore } from '@/stores/geometryStore'

const AXIS_LABELS = ['x', 'y', 'z', 'w', 'v', 'u', 't', 's', 'r', 'q', 'p', 'o']

/* ── SVG layout constants ── */
const WIDTH = 260
const HEIGHT = 140
const PX_L = 38
const PX_R = 12
const PY = 10
const PB = 16
const PW = WIDTH - PX_L - PX_R
const PH = HEIGHT - PY - PB
const MAX_KK_LEVELS = 8

/**
 * KK Compactification section for the right panel.
 * Shows controls and energy diagram only when TDSE/BEC mode has
 * at least one compact dimension.
 *
 * @param props - Section props
 * @returns The section, or null when not applicable
 */
export const KKCompactificationSection: React.FC<{ defaultOpen?: boolean }> = React.memo(
  ({ defaultOpen = true }) => {
    const dimension = useGeometryStore((s) => s.dimension)
    const {
      quantumMode,
      tdse,
      bec,
      setTdseCompactDim,
      setTdseCompactRadius,
      setBecCompactDim,
      setBecCompactRadius,
    } = useExtendedObjectStore(
      useShallow((s) => ({
        quantumMode: s.schroedinger.quantumMode,
        tdse: s.schroedinger.tdse,
        bec: s.schroedinger.bec,
        setTdseCompactDim: s.setTdseCompactDim,
        setTdseCompactRadius: s.setTdseCompactRadius,
        setBecCompactDim: s.setBecCompactDim,
        setBecCompactRadius: s.setBecCompactRadius,
      }))
    )

    const isTdse = quantumMode === 'tdseDynamics'
    const isBec = quantumMode === 'becDynamics'
    const isActive = isTdse || isBec

    const config = isBec ? bec : tdse
    const latticeDim = config.latticeDim ?? 3
    const configCompactDims = config.compactDims
    const compactDims = useMemo(() => configCompactDims ?? [], [configCompactDims])
    const compactRadii = config.compactRadii ?? []
    const hbar = isBec ? (bec.hbar ?? 1.0) : (tdse.hbar ?? 1.0)
    const mass = isBec ? (bec.mass ?? 1.0) : (tdse.mass ?? 1.0)

    const hasAnyCompact = compactDims.some(Boolean)

    const setCompactDim = isBec ? setBecCompactDim : setTdseCompactDim
    const setCompactRadius = isBec ? setBecCompactRadius : setTdseCompactRadius

    // R_max: compact extent must not exceed extended dims' extent
    const configGridSize = config.gridSize
    const configSpacing = config.spacing
    const rMax = useMemo(
      () =>
        computeMaxCompactRadius(
          configGridSize ?? [],
          configSpacing ?? [],
          compactDims,
          Math.min(latticeDim, dimension)
        ),
      [configGridSize, configSpacing, compactDims, latticeDim, dimension]
    )

    if (!isActive) return null

    return (
      <Section
        title="KK Compactification"
        defaultOpen={defaultOpen}
        data-testid="kk-compactification-section"
      >
        <div className="space-y-3">
          {/* Per-dimension compact toggle + R slider */}
          {Array.from({ length: Math.min(latticeDim, dimension) }, (_, d) => (
            <CompactDimControl
              key={d}
              dimIndex={d}
              label={AXIS_LABELS[d] ?? `d${d}`}
              compact={compactDims[d] ?? false}
              radius={compactRadii[d] ?? 0.15}
              maxRadius={rMax}
              onCompactChange={setCompactDim}
              onRadiusChange={setCompactRadius}
            />
          ))}

          {/* KK Energy Level Diagram */}
          {hasAnyCompact && (
            <KKEnergyDiagram
              compactDims={compactDims}
              compactRadii={compactRadii}
              latticeDim={Math.min(latticeDim, dimension)}
              hbar={hbar}
              mass={mass}
            />
          )}
        </div>
      </Section>
    )
  }
)

KKCompactificationSection.displayName = 'KKCompactificationSection'

/* ────────────────────────────────────────────────────────────── */
/*  Per-dimension compact control                                  */
/* ────────────────────────────────────────────────────────────── */

interface CompactDimControlProps {
  dimIndex: number
  label: string
  compact: boolean
  radius: number
  maxRadius: number
  onCompactChange: (dimIndex: number, compact: boolean) => void
  onRadiusChange: (dimIndex: number, radius: number) => void
}

const CompactDimControl: React.FC<CompactDimControlProps> = React.memo(
  ({ dimIndex, label, compact, radius, maxRadius, onCompactChange, onRadiusChange }) => {
    const handleCompactToggle = useCallback(
      (v: boolean) => onCompactChange(dimIndex, v),
      [dimIndex, onCompactChange]
    )
    const handleRadiusChange = useCallback(
      (v: number) => onRadiusChange(dimIndex, v),
      [dimIndex, onRadiusChange]
    )

    return (
      <div className="space-y-1.5">
        <Switch
          label={`Compact ${label}`}
          tooltip={`Make the ${label}-dimension compact (periodic with radius R). When compact, this dimension becomes a Kaluza-Klein circle of circumference 2πR.`}
          checked={compact}
          onCheckedChange={handleCompactToggle}
          data-testid={`kk-compact-${dimIndex}`}
        />
        {compact && (
          <Slider
            label={`R (${label})`}
            tooltip="Compactification radius. L = 2πR is the physical extent. Small R → large mass gap → dimension becomes invisible. Large R → continuous spectrum → ordinary extended dimension."
            min={0.01}
            max={Math.max(0.02, maxRadius)}
            step={0.01}
            value={radius}
            onChange={handleRadiusChange}
            showValue
            data-testid={`kk-radius-${dimIndex}`}
          />
        )}
      </div>
    )
  }
)

CompactDimControl.displayName = 'CompactDimControl'

/* ────────────────────────────────────────────────────────────── */
/*  KK Energy Level Diagram (SVG)                                  */
/* ────────────────────────────────────────────────────────────── */

interface KKEnergyDiagramProps {
  compactDims: boolean[]
  compactRadii: number[]
  latticeDim: number
  hbar: number
  mass: number
}

/** Palette for per-dimension level colors */
const DIM_COLORS = [
  'var(--accent)',
  'var(--dirac-particle)',
  'var(--chart-pass-1)',
  'var(--chart-pass-3)',
  'var(--chart-pass-4)',
  'var(--chart-pass-6)',
]

/**
 * SVG energy level diagram showing the discrete KK mass/energy spectrum.
 * Each compact dimension contributes a tower of energy levels E_n = (nℏ)²/(2mR²).
 * Multiple compact dimensions are shown side-by-side with distinct colors.
 */
const KKEnergyDiagram: React.FC<KKEnergyDiagramProps> = React.memo(
  ({ compactDims, compactRadii, latticeDim, hbar, mass }) => {
    const spectra = useMemo(() => {
      const result: { dimIndex: number; label: string; levels: { n: number; energy: number }[] }[] =
        []
      for (let d = 0; d < latticeDim; d++) {
        if (compactDims[d]) {
          result.push({
            dimIndex: d,
            label: AXIS_LABELS[d] ?? `d${d}`,
            levels: computeKKSpectrum(compactRadii[d] ?? 1.0, hbar, mass, MAX_KK_LEVELS),
          })
        }
      }
      return result
    }, [compactDims, compactRadii, latticeDim, hbar, mass])

    if (spectra.length === 0) return null

    // Find global energy max for Y-axis scaling
    const eMax = Math.max(
      ...spectra.flatMap((s) => s.levels.map((l) => l.energy)),
      1e-6
    )

    const colWidth = PW / spectra.length

    return (
      <div className="border-t border-border-subtle pt-2">
        <p className="text-[10px] text-text-tertiary mb-1">
          KK Energy Spectrum — E<sub>n</sub> = (n\u210F)\u00B2 / (2mR\u00B2)
        </p>
        <svg
          width={WIDTH}
          height={HEIGHT}
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="w-full"
          data-testid="kk-energy-diagram"
        >
          {/* Y-axis label */}
          <text
            x={4}
            y={PY + PH / 2}
            textAnchor="middle"
            dominantBaseline="central"
            transform={`rotate(-90, 4, ${PY + PH / 2})`}
            className="fill-text-tertiary"
            fontSize={9}
          >
            E
          </text>

          {/* Y-axis ticks */}
          {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
            const y = PY + PH * (1 - frac)
            const eVal = eMax * frac
            return (
              <g key={frac}>
                <line
                  x1={PX_L - 4}
                  y1={y}
                  x2={PX_L}
                  y2={y}
                  className="stroke-border-subtle"
                  strokeWidth={0.5}
                />
                <text
                  x={PX_L - 6}
                  y={y}
                  textAnchor="end"
                  dominantBaseline="central"
                  className="fill-text-tertiary"
                  fontSize={8}
                >
                  {eVal < 10 ? eVal.toFixed(1) : eVal.toFixed(0)}
                </text>
              </g>
            )
          })}

          {/* Vertical axis line */}
          <line
            x1={PX_L}
            y1={PY}
            x2={PX_L}
            y2={PY + PH}
            className="stroke-border-default"
            strokeWidth={0.5}
          />

          {/* Per-dimension energy levels */}
          {spectra.map((spec, si) => {
            const xCenter = PX_L + colWidth * (si + 0.5)
            const lineHalfW = Math.min(colWidth * 0.35, 30)
            const color = DIM_COLORS[si % DIM_COLORS.length]!

            return (
              <g key={spec.dimIndex}>
                {/* Column label */}
                <text
                  x={xCenter}
                  y={HEIGHT - 3}
                  textAnchor="middle"
                  className="fill-text-secondary"
                  fontSize={9}
                >
                  {spec.label} (R={compactRadii[spec.dimIndex]?.toFixed(2)})
                </text>

                {/* Energy levels */}
                {spec.levels.map((level) => {
                  const y = PY + PH * (1 - level.energy / eMax)
                  return (
                    <g key={level.n}>
                      <line
                        x1={xCenter - lineHalfW}
                        y1={y}
                        x2={xCenter + lineHalfW}
                        y2={y}
                        stroke={color}
                        strokeWidth={level.n === 0 ? 1.5 : 1}
                        opacity={level.n === 0 ? 1 : 0.7}
                      />
                      <text
                        x={xCenter + lineHalfW + 3}
                        y={y}
                        dominantBaseline="central"
                        className="fill-text-tertiary"
                        fontSize={7}
                      >
                        n={level.n}
                      </text>
                    </g>
                  )
                })}
              </g>
            )
          })}
        </svg>
      </div>
    )
  }
)

KKEnergyDiagram.displayName = 'KKEnergyDiagram'
