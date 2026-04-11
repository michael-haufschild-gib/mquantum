/**
 * Inline SVG chart of the cosmological entanglement trajectory
 * `S(L_A, η)` vs `log|η|`.
 *
 * A thin render-only companion to {@link FSFEntanglementProbe}: the
 * probe component owns the worker pipeline and produces a
 * {@link CosmologicalEntropyTrajectory}; this component only paints it.
 * Lives in its own file so the probe stays under the 500-line
 * `max-lines` budget.
 *
 * @module components/sections/Analysis/FSFCosmoTrajectoryChart
 */

import React, { useMemo } from 'react'

const TRAJ_WIDTH = 260
const TRAJ_HEIGHT = 120
const TRAJ_PX = 34
const TRAJ_PY = 14
const TRAJ_PW = TRAJ_WIDTH - 2 * TRAJ_PX
const TRAJ_PH = TRAJ_HEIGHT - 2 * TRAJ_PY

/**
 * Props for {@link FSFCosmoTrajectoryChart}.
 */
export interface FSFCosmoTrajectoryChartProps {
  /** Trajectory output from `computeCosmologicalEntropyTrajectory`. */
  trajectory: {
    etas: number[]
    entropies: number[]
  }
  /** Current conformal-time setting in the FSF config. */
  currentEta: number
}

/**
 * Inline SVG chart of the cosmological entanglement trajectory
 * `S(L_A, η)` vs `log|η|`. A vertical marker highlights the current
 * `eta0` so the user can see where in the cosmological history the
 * simulator is currently parked relative to the probed range.
 *
 * The x-axis is `log|η|` (conformal time; increases from left to
 * right toward the far past). The y-axis is the entropy `S(L_A; η)`
 * in nats. The upstream sweep pins its middle sample to `eta0`
 * bit-identically, so the marker line sits exactly on top of the
 * polyline vertex at the current parameter.
 *
 * @param props - Chart data and current η marker.
 * @returns A themed SVG suitable for the analysis panel.
 */
export const FSFCosmoTrajectoryChart: React.FC<FSFCosmoTrajectoryChartProps> = React.memo(
  ({ trajectory, currentEta }) => {
    const chart = useMemo(() => {
      const { etas, entropies } = trajectory
      if (etas.length === 0) return null
      let xMin = Number.POSITIVE_INFINITY
      let xMax = Number.NEGATIVE_INFINITY
      let yMin = Number.POSITIVE_INFINITY
      let yMax = Number.NEGATIVE_INFINITY
      const xs: number[] = []
      for (let i = 0; i < etas.length; i++) {
        const x = Math.log(Math.abs(etas[i]!))
        xs.push(x)
        if (x < xMin) xMin = x
        if (x > xMax) xMax = x
        const y = entropies[i]!
        if (y < yMin) yMin = y
        if (y > yMax) yMax = y
      }
      const xRange = Math.max(xMax - xMin, 1e-6)
      const yPad = Math.max((yMax - yMin) * 0.08, 0.01)
      const yLo = yMin - yPad
      const yHi = yMax + yPad
      const yRange = Math.max(yHi - yLo, 1e-6)
      const toX = (x: number): number => TRAJ_PX + ((x - xMin) / xRange) * TRAJ_PW
      const toY = (y: number): number => TRAJ_PY + (1 - (y - yLo) / yRange) * TRAJ_PH

      const pts = xs
        .map((x, i) => `${toX(x).toFixed(1)},${toY(entropies[i]!).toFixed(1)}`)
        .join(' ')

      let markerX: number | null = null
      if (Number.isFinite(currentEta) && currentEta !== 0) {
        const xm = Math.log(Math.abs(currentEta))
        if (xm >= xMin && xm <= xMax) markerX = toX(xm)
      }
      return { pts, markerX, yLo, yHi, xMin, xMax }
    }, [trajectory, currentEta])

    if (!chart) return null
    return (
      <div className="mt-2">
        <p className="text-[10px] text-text-tertiary uppercase tracking-wider">
          Cosmological trajectory S(L_A, η)
        </p>
        <div className="rounded-md overflow-hidden bg-[var(--bg-surface)]">
          <svg width="100%" viewBox={`0 0 ${TRAJ_WIDTH} ${TRAJ_HEIGHT}`} className="block">
            <polyline
              points={chart.pts}
              fill="none"
              stroke="var(--theme-accent)"
              strokeWidth={1.5}
              strokeLinejoin="round"
            />
            {chart.markerX !== null && (
              <line
                x1={chart.markerX}
                y1={TRAJ_PY}
                x2={chart.markerX}
                y2={TRAJ_PY + TRAJ_PH}
                stroke="var(--text-secondary)"
                strokeWidth={0.75}
                strokeDasharray="2,3"
                opacity={0.8}
              />
            )}
            <text
              x={TRAJ_PX + TRAJ_PW / 2}
              y={TRAJ_HEIGHT - 2}
              textAnchor="middle"
              fill="var(--text-tertiary)"
              fontSize={8}
              fontFamily="monospace"
            >
              log |η|
            </text>
            <text
              x={4}
              y={TRAJ_PY + TRAJ_PH / 2}
              textAnchor="middle"
              fill="var(--text-tertiary)"
              fontSize={8}
              fontFamily="monospace"
              transform={`rotate(-90, 4, ${TRAJ_PY + TRAJ_PH / 2})`}
            >
              S(L_A, η)
            </text>
          </svg>
        </div>
      </div>
    )
  }
)

FSFCosmoTrajectoryChart.displayName = 'FSFCosmoTrajectoryChart'
