/**
 * Harmonic Oscillator Combined Chart
 *
 * Dual-axis SVG combining the energy level ladder E_n = ℏω(n + ½)
 * with the probability density |ψ_n(x)|² for the dominant superposition term.
 * Left Y-axis: |ψ|² (blue curve). Right Y-axis: energy levels (accent lines).
 *
 * @module components/sections/Advanced/HOEnergyDiagram
 */

import React, { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'
import { useGeometryStore } from '@/stores/geometryStore'
import { generateQuantumPreset } from '@/lib/geometry/extended/schroedinger/presets'
import { getNamedPreset } from '@/lib/geometry/extended/schroedinger/presets'

/* ── SVG layout constants ── */
const WIDTH = 260
const HEIGHT = 150
const PX_L = 28
const PX_R = 24
const PY = 14
const PB = 16
const PW = WIDTH - PX_L - PX_R
const PH = HEIGHT - PY - PB

/** Blue secondary color for wavefunction curve (matches --dirac-particle) */
const WAVE_COLOR = 'oklch(0.7 0.15 220)'

/**
 * Evaluate the physicist's Hermite polynomial H_n(x) via recurrence.
 */
function hermite(n: number, x: number): number {
  if (n === 0) return 1
  if (n === 1) return 2 * x
  let h0 = 1
  let h1 = 2 * x
  for (let k = 2; k <= n; k++) {
    const h2 = 2 * x * h1 - 2 * (k - 1) * h0
    h0 = h1
    h1 = h2
  }
  return h1
}

/**
 * HO probability density |ψ_n(x)|² (unnormalized, auto-scaled).
 */
function hoProbDensity(n: number, x: number): number {
  const h = hermite(n, x)
  const gauss = Math.exp(-x * x)
  return h * h * gauss
}

/**
 * Combined energy level + wavefunction chart for the harmonic oscillator.
 * Dual Y-axis: left = |ψ|² (blue), right = E (accent).
 *
 * @example
 * ```tsx
 * <HOEnergyDiagram />
 * ```
 */
export const HOEnergyDiagram: React.FC = React.memo(() => {
  const dimension = useGeometryStore((s) => s.dimension)
  const { presetName, seed, termCount, maxQuantumNumber, frequencySpread } =
    useExtendedObjectStore(
      useShallow((s) => ({
        presetName: s.schroedinger.presetName,
        seed: s.schroedinger.seed,
        termCount: s.schroedinger.termCount,
        maxQuantumNumber: s.schroedinger.maxQuantumNumber,
        frequencySpread: s.schroedinger.frequencySpread,
      })),
    )

  const chart = useMemo(() => {
    const preset =
      (presetName !== 'custom' && getNamedPreset(presetName, dimension)) ||
      generateQuantumPreset(seed, dimension, termCount, maxQuantumNumber, frequencySpread)

    // ── Energy diagram data ──
    const weights = preset.coefficients.map(([re, im]) => re * re + im * im)
    const maxWeight = Math.max(...weights, 1e-10)
    const omega0 = preset.omega[0] ?? 1
    const maxE = Math.max(...preset.energies, 1)
    const maxN = Math.ceil(maxE / omega0 + 0.5)
    const displayMaxN = Math.min(maxN + 1, 12)

    const levels: { n: number; energy: number }[] = []
    for (let n = 0; n <= displayMaxN; n++) {
      levels.push({ n, energy: omega0 * (n + 0.5) })
    }

    const eMin = 0
    const eMax = levels[levels.length - 1]!.energy * 1.1
    const toEnergyY = (e: number) => PY + (1 - (e - eMin) / (eMax - eMin)) * PH

    const activeTerms = preset.energies.map((e, i) => ({
      energy: e,
      weight: weights[i]! / maxWeight,
    }))

    // ── Wavefunction data ──
    let dominantIdx = 0
    let maxW = 0
    for (let i = 0; i < weights.length; i++) {
      if (weights[i]! > maxW) { maxW = weights[i]!; dominantIdx = i }
    }
    const qn = preset.quantumNumbers[dominantIdx]?.[0] ?? 0
    const classicalR = Math.sqrt(2 * qn + 1)
    const xMax = Math.max(classicalR * 1.8, 3)
    const nSamples = 120

    let maxPsi = 0
    const samples: { x: number; psi: number }[] = []
    for (let i = 0; i < nSamples; i++) {
      const x = -xMax + (2 * xMax * i) / (nSamples - 1)
      const psi = hoProbDensity(qn, x)
      if (psi > maxPsi) maxPsi = psi
      samples.push({ x, psi })
    }

    const toX = (x: number) => PX_L + ((x + xMax) / (2 * xMax)) * PW
    const toWaveY = (p: number) => PY + (1 - p / (maxPsi * 1.1)) * PH

    const wavePoints = samples
      .map((s) => `${toX(s.x).toFixed(1)},${toWaveY(s.psi).toFixed(1)}`)
      .join(' ')

    // Find nodes
    const nodes: number[] = []
    for (let i = 1; i < samples.length; i++) {
      const prev = hermite(qn, samples[i - 1]!.x)
      const curr = hermite(qn, samples[i]!.x)
      if (prev * curr < 0) {
        const x0 = samples[i - 1]!.x
        const x1 = samples[i]!.x
        nodes.push(x0 - prev * (x1 - x0) / (curr - prev))
      }
    }

    return {
      levels, activeTerms, toEnergyY, omega0,
      wavePoints, nodes: nodes.map(toX),
      zeroY: toWaveY(0),
      classicalTurnX: [toX(-classicalR), toX(classicalR)],
      qn,
    }
  }, [presetName, seed, dimension, termCount, maxQuantumNumber, frequencySpread])

  return (
    <div data-testid="ho-energy-diagram">
      <p className="text-[10px] text-text-secondary mb-1">
        Energy Levels & Wavefunction |ψ<sub>n</sub>(x)|²
      </p>
      <div className="rounded-md overflow-hidden bg-[var(--bg-surface)]">
        <svg width="100%" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="block">
          {/* Energy level lines (accent, background) */}
          {chart.levels.map((lvl) => (
            <g key={lvl.n}>
              <line
                x1={PX_L} y1={chart.toEnergyY(lvl.energy)}
                x2={PX_L + PW} y2={chart.toEnergyY(lvl.energy)}
                stroke="var(--theme-accent)" strokeWidth={0.5} opacity={0.15}
              />
              <text
                x={PX_L + PW + 3} y={chart.toEnergyY(lvl.energy) + 3}
                fill="var(--text-tertiary)" fontSize={6} fontFamily="monospace"
              >
                {lvl.n}
              </text>
            </g>
          ))}

          {/* Active superposition terms (accent, highlighted) */}
          {chart.activeTerms.map((term, i) => (
            <line
              key={i}
              x1={PX_L} y1={chart.toEnergyY(term.energy)}
              x2={PX_L + PW} y2={chart.toEnergyY(term.energy)}
              stroke="var(--theme-accent)"
              strokeWidth={1 + term.weight * 1.5}
              opacity={0.25 + term.weight * 0.5}
            />
          ))}

          {/* Classical turning points */}
          {chart.classicalTurnX.map((tx, i) => (
            <line
              key={i}
              x1={tx} y1={PY} x2={tx} y2={PY + PH}
              stroke="var(--text-tertiary)" strokeWidth={0.5} strokeDasharray="1,3"
              opacity={0.4}
            />
          ))}

          {/* Node markers (blue) */}
          {chart.nodes.map((nx, i) => (
            <line
              key={i}
              x1={nx} y1={chart.zeroY - 4} x2={nx} y2={chart.zeroY + 4}
              stroke={WAVE_COLOR} strokeWidth={1} opacity={0.5}
            />
          ))}

          {/* Wavefunction curve (blue) */}
          <polyline
            points={chart.wavePoints}
            fill="none" stroke={WAVE_COLOR} strokeWidth={1.5} strokeLinejoin="round"
          />

          {/* Left Y-axis (wavefunction) */}
          <line
            x1={PX_L} y1={PY} x2={PX_L} y2={PY + PH}
            stroke="var(--text-secondary)" strokeWidth={0.5}
          />
          <text
            x={4} y={PY + PH / 2}
            textAnchor="middle" fill={WAVE_COLOR} fontSize={8} fontFamily="monospace"
            transform={`rotate(-90, 4, ${PY + PH / 2})`}
          >
            |ψ|²
          </text>

          {/* Right Y-axis (energy) */}
          <line
            x1={PX_L + PW} y1={PY} x2={PX_L + PW} y2={PY + PH}
            stroke="var(--theme-accent)" strokeWidth={0.5} opacity={0.4}
          />
          <text
            x={WIDTH - 2} y={PY + PH / 2}
            textAnchor="middle" fill="var(--theme-accent)" fontSize={8} fontFamily="monospace"
            transform={`rotate(90, ${WIDTH - 2}, ${PY + PH / 2})`}
          >
            E
          </text>

          {/* X-axis label */}
          <text
            x={PX_L + PW / 2} y={HEIGHT - 3}
            textAnchor="middle" fill="var(--text-tertiary)" fontSize={8} fontFamily="monospace"
          >
            x
          </text>

          {/* State label */}
          <text
            x={PX_L + 4} y={PY + 10}
            fill="var(--text-secondary)" fontSize={7} fontFamily="monospace"
          >
            n={chart.qn}
          </text>

          {/* ℏω bracket between n=0 and n=1 */}
          {chart.levels.length >= 2 && (
            <>
              <line
                x1={PX_L + PW + 14} y1={chart.toEnergyY(chart.levels[0]!.energy)}
                x2={PX_L + PW + 14} y2={chart.toEnergyY(chart.levels[1]!.energy)}
                stroke="var(--text-tertiary)" strokeWidth={0.5}
              />
              <text
                x={PX_L + PW + 16}
                y={(chart.toEnergyY(chart.levels[0]!.energy) + chart.toEnergyY(chart.levels[1]!.energy)) / 2 + 3}
                fill="var(--text-tertiary)" fontSize={6} fontFamily="monospace"
              >
                ℏω
              </text>
            </>
          )}
        </svg>
      </div>
    </div>
  )
})

HOEnergyDiagram.displayName = 'HOEnergyDiagram'
