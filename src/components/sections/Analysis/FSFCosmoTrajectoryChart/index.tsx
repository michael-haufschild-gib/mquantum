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

/** Normalised trajectory data after the defensive filter pass. */
interface FilteredTrajectory {
  xs: number[]
  ys: number[]
  xMin: number
  xMax: number
  yMin: number
  yMax: number
}

/**
 * Build `(log|η|, S)` arrays from a trajectory and compute their
 * bounding box, dropping any sample with `η === 0`, non-finite η,
 * or non-finite entropy. A shorter `entropies` array than `etas`
 * is also handled (the tail is ignored). Returns `null` when no
 * valid samples survive so the caller can bail cleanly instead
 * of feeding `NaN` / `Infinity` into the SVG geometry.
 *
 * @param etas - η values from the sweep
 * @param entropies - Matching entropies in nats
 * @returns Filtered arrays + bounding box, or null when empty
 */
function filterTrajectorySamples(
  etas: readonly number[],
  entropies: readonly number[]
): FilteredTrajectory | null {
  const sampleCount = Math.min(etas.length, entropies.length)
  if (sampleCount === 0) return null
  const xs: number[] = []
  const ys: number[] = []
  let xMin = Number.POSITIVE_INFINITY
  let xMax = Number.NEGATIVE_INFINITY
  let yMin = Number.POSITIVE_INFINITY
  let yMax = Number.NEGATIVE_INFINITY
  for (let i = 0; i < sampleCount; i++) {
    const eta = etas[i]!
    const y = entropies[i]!
    if (!Number.isFinite(eta) || eta === 0 || !Number.isFinite(y)) continue
    const x = Math.log(Math.abs(eta))
    xs.push(x)
    ys.push(y)
    if (x < xMin) xMin = x
    if (x > xMax) xMax = x
    if (y < yMin) yMin = y
    if (y > yMax) yMax = y
  }
  if (xs.length === 0) return null
  return { xs, ys, xMin, xMax, yMin, yMax }
}

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
      // Defensive filter: one η === 0, non-finite η, non-finite entropy,
      // or a shorter `entropies` array than `etas` would otherwise feed
      // NaN / Infinity into the geometry. Extracted into a helper so
      // this useMemo body stays under the cognitive-complexity budget.
      const filtered = filterTrajectorySamples(trajectory.etas, trajectory.entropies)
      if (!filtered) return null
      const { xs, ys, xMin, xMax, yMin, yMax } = filtered
      const xRange = Math.max(xMax - xMin, 1e-6)
      const yPad = Math.max((yMax - yMin) * 0.08, 0.01)
      const yLo = yMin - yPad
      const yHi = yMax + yPad
      const yRange = Math.max(yHi - yLo, 1e-6)
      const toX = (x: number): number => TRAJ_PX + ((x - xMin) / xRange) * TRAJ_PW
      const toY = (y: number): number => TRAJ_PY + (1 - (y - yLo) / yRange) * TRAJ_PH

      const pts = xs.map((x, i) => `${toX(x).toFixed(1)},${toY(ys[i]!).toFixed(1)}`).join(' ')

      let markerX: number | null = null
      if (Number.isFinite(currentEta) && currentEta !== 0) {
        const xm = Math.log(Math.abs(currentEta))
        if (xm >= xMin && xm <= xMax) markerX = toX(xm)
      }
      return { pts, markerX, yLo, yHi, xMin, xMax }
    }, [trajectory, currentEta])

    if (!chart) return null
    return (
      <div className="mt-2" data-testid="fsf-cosmo-trajectory">
        <p className="text-3xs text-text-tertiary uppercase tracking-wider">
          Cosmological trajectory S(L_A, η)
        </p>
        <div className="rounded-md overflow-hidden bg-[var(--bg-surface)]">
          <svg
            width="100%"
            viewBox={`0 0 ${TRAJ_WIDTH} ${TRAJ_HEIGHT}`}
            className="block"
            data-testid="fsf-cosmo-trajectory-svg"
          >
            <polyline
              points={chart.pts}
              fill="none"
              stroke="var(--theme-accent)"
              strokeWidth={1.5}
              strokeLinejoin="round"
              data-testid="fsf-cosmo-trajectory-polyline"
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
                data-testid="fsf-cosmo-trajectory-marker"
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
