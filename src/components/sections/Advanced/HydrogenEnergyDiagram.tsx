/**
 * Hydrogen Combined Chart
 *
 * Dual-axis SVG combining the energy level diagram E_n = −13.6/n² eV
 * with the radial probability density r²|R_{nl}(r)|².
 * Left Y-axis: r²|R|² (blue curve). Right Y-axis: energy levels (accent lines).
 *
 * @module components/sections/Advanced/HydrogenEnergyDiagram
 */

import React, { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'

/* ── SVG layout constants ── */
const WIDTH = 260
const HEIGHT = 150
const PX_L = 28
const PX_R = 24
const PY = 14
const PB = 16
const PW = WIDTH - PX_L - PX_R
const PH = HEIGHT - PY - PB

/** Blue secondary color for radial curve (matches --dirac-particle) */
const WAVE_COLOR = 'oklch(0.7 0.15 220)'

/** Spectroscopic notation for l values */
const L_LABELS = ['s', 'p', 'd', 'f', 'g', 'h']

/**
 * Associated Laguerre polynomial L_p^k(x) via recurrence.
 */
function laguerre(p: number, k: number, x: number): number {
  if (p === 0) return 1
  if (p === 1) return 1 + k - x
  let l0 = 1
  let l1 = 1 + k - x
  for (let j = 2; j <= p; j++) {
    const l2 = ((2 * j - 1 + k - x) * l1 - (j - 1 + k) * l0) / j
    l0 = l1
    l1 = l2
  }
  return l1
}

/**
 * Radial probability density P(r) = r²|R_{nl}(r)|² (unnormalized).
 */
function hydrogenRadialProb(n: number, l: number, r: number): number {
  const rho = (2 * r) / n
  const rhoL = Math.pow(rho, l)
  const expFactor = Math.exp(-rho / 2)
  const lagVal = laguerre(n - l - 1, 2 * l + 1, rho)
  const R = rhoL * expFactor * lagVal
  return r * r * R * R
}

/**
 * Combined energy level + radial probability chart for hydrogen orbitals.
 * Dual Y-axis: left = r²|R|² (blue), right = E (accent).
 *
 * @example
 * ```tsx
 * <HydrogenEnergyDiagram />
 * ```
 */
export const HydrogenEnergyDiagram: React.FC = React.memo(() => {
  const { n, l } = useExtendedObjectStore(
    useShallow((s) => ({
      n: s.schroedinger.principalQuantumNumber,
      l: s.schroedinger.azimuthalQuantumNumber,
    })),
  )

  const chart = useMemo(() => {
    // ── Energy diagram data ──
    const maxN = Math.max(n + 1, 4)
    const energyLevels: { n: number; energy: number; sublevels: number[] }[] = []
    for (let ni = 1; ni <= maxN; ni++) {
      const energy = -13.6 / (ni * ni)
      const subs: number[] = []
      for (let li = 0; li < ni; li++) subs.push(li)
      energyLevels.push({ n: ni, energy, sublevels: subs })
    }

    const eMin = energyLevels[0]!.energy * 1.15
    const eMax = 1
    const toEnergyY = (e: number) => PY + (1 - (e - eMin) / (eMax - eMin)) * PH

    // ── Radial probability data ──
    const rMax = n * n * 2.5 + 2
    const nSamples = 150

    let maxP = 0
    const samples: { r: number; p: number }[] = []
    for (let i = 0; i < nSamples; i++) {
      const r = (rMax * i) / (nSamples - 1)
      const p = hydrogenRadialProb(n, l, r)
      if (p > maxP) maxP = p
      samples.push({ r, p })
    }

    const toX = (r: number) => PX_L + (r / rMax) * PW
    const toRadialY = (p: number) => PY + (1 - p / (maxP * 1.1)) * PH

    const radialPoints = samples
      .map((s) => `${toX(s.r).toFixed(1)},${toRadialY(s.p).toFixed(1)}`)
      .join(' ')

    // Find radial nodes via sign changes in Laguerre polynomial
    const nodes: number[] = []
    for (let i = 2; i < samples.length; i++) {
      const r0 = samples[i - 1]!.r
      const r1 = samples[i]!.r
      const rho0 = (2 * r0) / n
      const rho1 = (2 * r1) / n
      const R0 = laguerre(n - l - 1, 2 * l + 1, rho0)
      const R1 = laguerre(n - l - 1, 2 * l + 1, rho1)
      if (R0 * R1 < 0 && r0 > 0) {
        nodes.push(r0 - R0 * (r1 - r0) / (R1 - R0))
      }
    }

    // Classical turning point
    const classicalR = n * n * (1 + Math.sqrt(Math.max(0, 1 - (l * (l + 1)) / (n * n))))

    return {
      energyLevels, toEnergyY, maxN,
      radialPoints, nodes: nodes.map(toX),
      zeroY: toRadialY(0),
      classicalTurnX: toX(classicalR),
    }
  }, [n, l])

  return (
    <div data-testid="hydrogen-energy-diagram">
      <p className="text-[10px] text-text-secondary mb-1">
        Energy Levels & Radial Probability r²|R<sub>nl</sub>(r)|²
      </p>
      <div className="rounded-md overflow-hidden bg-[var(--bg-surface)]">
        <svg width="100%" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="block">
          {/* Ionization threshold (E=0) */}
          <line
            x1={PX_L} y1={chart.toEnergyY(0)} x2={PX_L + PW} y2={chart.toEnergyY(0)}
            stroke="var(--text-tertiary)" strokeWidth={0.5} strokeDasharray="2,2"
          />

          {/* Energy levels with sublevel lines */}
          {chart.energyLevels.map((lvl) => {
            const y = chart.toEnergyY(lvl.energy)
            const subCount = lvl.sublevels.length
            const subWidth = Math.min(PW * 0.5 / subCount, 24)
            const totalWidth = subCount * subWidth
            const startX = PX_L + (PW - totalWidth) / 2

            return (
              <g key={lvl.n}>
                {/* Sublevel lines */}
                {lvl.sublevels.map((li) => {
                  const isActive = lvl.n === n && li === l
                  const sx = startX + li * subWidth + 2
                  const ex = sx + subWidth - 4

                  return (
                    <g key={li}>
                      <line
                        x1={sx} y1={y} x2={ex} y2={y}
                        stroke={isActive ? 'var(--theme-accent)' : 'var(--theme-accent)'}
                        strokeWidth={isActive ? 2 : 0.5}
                        opacity={isActive ? 0.9 : 0.15}
                      />
                      <text
                        x={(sx + ex) / 2} y={y + 8}
                        textAnchor="middle"
                        fill={isActive ? 'var(--theme-accent)' : 'var(--text-tertiary)'}
                        fontSize={5} fontFamily="monospace"
                        opacity={isActive ? 1 : 0.4}
                      >
                        {L_LABELS[li] ?? li}
                      </text>
                    </g>
                  )
                })}

                {/* Energy value on right */}
                <text
                  x={PX_L + PW + 3} y={y + 3}
                  fill="var(--text-tertiary)" fontSize={6} fontFamily="monospace"
                >
                  {lvl.energy.toFixed(1)}
                </text>
              </g>
            )
          })}

          {/* Classical turning point */}
          <line
            x1={chart.classicalTurnX} y1={PY}
            x2={chart.classicalTurnX} y2={PY + PH}
            stroke="var(--text-tertiary)" strokeWidth={0.5} strokeDasharray="1,3"
            opacity={0.4}
          />

          {/* Node markers (blue) */}
          {chart.nodes.map((nx, i) => (
            <line
              key={i}
              x1={nx} y1={chart.zeroY - 4} x2={nx} y2={chart.zeroY + 4}
              stroke={WAVE_COLOR} strokeWidth={1} opacity={0.5}
            />
          ))}

          {/* Radial probability curve (blue) */}
          <polyline
            points={chart.radialPoints}
            fill="none" stroke={WAVE_COLOR} strokeWidth={1.5} strokeLinejoin="round"
          />

          {/* Left Y-axis (radial probability) */}
          <line
            x1={PX_L} y1={PY} x2={PX_L} y2={PY + PH}
            stroke="var(--text-secondary)" strokeWidth={0.5}
          />
          <text
            x={4} y={PY + PH / 2}
            textAnchor="middle" fill={WAVE_COLOR} fontSize={8} fontFamily="monospace"
            transform={`rotate(-90, 4, ${PY + PH / 2})`}
          >
            r²|R|²
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
            E (eV)
          </text>

          {/* X-axis label */}
          <text
            x={PX_L + PW / 2} y={HEIGHT - 3}
            textAnchor="middle" fill="var(--text-tertiary)" fontSize={8} fontFamily="monospace"
          >
            r (a₀)
          </text>

          {/* State label */}
          <text
            x={PX_L + 4} y={PY + 10}
            fill="var(--text-secondary)" fontSize={7} fontFamily="monospace"
          >
            n={n}, l={l}
          </text>
        </svg>
      </div>
    </div>
  )
})

HydrogenEnergyDiagram.displayName = 'HydrogenEnergyDiagram'
