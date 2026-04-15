/**
 * WormholeCoherencePanel
 *
 * Small SVG overlay that renders `I(L:R)(t)` — the mirror-coherence
 * between the wavefunction and its reflection across the chosen
 * wormhole axis — in real time. Data source is the
 * {@link useWormholeCoherenceStore} ring buffer, which is populated
 * from inside the TDSE compute pass at the diagnostic readback cadence.
 *
 * The panel only renders when the current Schroedinger config is in
 * TDSE mode AND `wormholeCoherenceHudEnabled === true`. It is
 * mounted next to {@link HawkingPageCurvePanel} in `App.tsx`; its
 * z-index/position is picked to avoid visual overlap with that panel.
 *
 * @module components/overlays/WormholeCoherencePanel
 */

import React, { useEffect, useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { useExtendedObjectStore } from '@/stores/extendedObjectStore'
import { useGeometryStore } from '@/stores/geometryStore'
import { getWormholeSample, useWormholeCoherenceStore } from '@/stores/wormholeCoherenceStore'

const WIDTH = 360
const HEIGHT = 180
const PAD_L = 36
const PAD_R = 8
const PAD_T = 18
const PAD_B = 22

interface TracePoint {
  x: number
  y: number
}

function buildPath(points: TracePoint[]): string {
  if (points.length === 0) return ''
  let d = `M ${points[0]!.x.toFixed(2)} ${points[0]!.y.toFixed(2)}`
  for (let i = 1; i < points.length; i++) {
    d += ` L ${points[i]!.x.toFixed(2)} ${points[i]!.y.toFixed(2)}`
  }
  return d
}

/**
 * Overlay panel rendering the wormhole coherence trace. Header badges
 * surface the current `I` value, mirror-axis index, and coupling `g`.
 *
 * @returns React element or `null` when the HUD is disabled.
 */
export function WormholeCoherencePanel(): React.ReactElement | null {
  const { lastCoherence, lastAxis, lastG, version, bufferCount } = useWormholeCoherenceStore(
    useShallow((s) => ({
      lastCoherence: s.lastCoherence,
      lastAxis: s.lastAxis,
      lastG: s.lastG,
      version: s.version,
      bufferCount: s.buffer.count,
    }))
  )

  const config = useExtendedObjectStore((state) => state.schroedinger)
  const { objectType } = useGeometryStore(useShallow((s) => ({ objectType: s.objectType })))

  const hudEnabled = !!config.tdse.wormholeCoherenceHudEnabled
  const modeActive = objectType === 'schroedinger' && config.quantumMode === 'tdseDynamics'

  // Clear samples on mode switch, wormhole enable flip, or HUD disable so
  // stale traces from a previous run don't leak into the new session.
  useEffect(() => {
    useWormholeCoherenceStore.getState().clear()
  }, [
    objectType,
    config.quantumMode,
    config.tdse.wormholeCouplingEnabled,
    config.tdse.wormholeMirrorAxis,
    hudEnabled,
  ])

  const snapshot = useMemo(() => {
    // Capturing `version` in the memo value makes the dep array legit
    // (no `void version` cheat) — the store bumps it on every push.
    const store = useWormholeCoherenceStore.getState()
    const buf = store.buffer
    const n = bufferCount
    const out = {
      tMin: 0,
      tMax: 0,
      path: '',
      hasData: false,
      bufferVersion: version,
    }
    if (n < 2) return out
    let tMin = Infinity
    let tMax = -Infinity
    for (let i = 0; i < n; i++) {
      const s = getWormholeSample(buf, i)
      if (!s) continue
      if (s.t < tMin) tMin = s.t
      if (s.t > tMax) tMax = s.t
    }
    if (!Number.isFinite(tMin) || !Number.isFinite(tMax) || tMax <= tMin) return out
    const plotW = WIDTH - PAD_L - PAD_R
    const plotH = HEIGHT - PAD_T - PAD_B
    const points: TracePoint[] = []
    for (let i = 0; i < n; i++) {
      const s = getWormholeSample(buf, i)
      if (!s) continue
      const x = PAD_L + ((s.t - tMin) / (tMax - tMin)) * plotW
      // `I` is already clamped to [0, 1] by `pushSample`.
      const y = PAD_T + plotH - s.I * plotH
      points.push({ x, y })
    }
    out.tMin = tMin
    out.tMax = tMax
    out.path = buildPath(points)
    out.hasData = points.length > 1
    return out
  }, [version, bufferCount])

  if (!hudEnabled || !modeActive) return null

  return (
    <div
      className="glass-panel absolute right-4 top-[220px] rounded-md border border-border-default p-2 shadow-lg"
      data-testid="wormhole-coherence-panel"
      style={{ width: WIDTH + 16, zIndex: 40 }}
    >
      <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
        <span>Wormhole Coherence I(L:R)</span>
        <span className="flex gap-2 text-text-tertiary">
          <span>ax&nbsp;{lastAxis}</span>
          <span>g&nbsp;{lastG.toFixed(2)}</span>
          <span className="text-text-primary">
            I&nbsp;{snapshot.hasData ? lastCoherence.toFixed(3) : '—'}
          </span>
        </span>
      </div>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        width={WIDTH}
        height={HEIGHT}
        role="img"
        aria-label="Wormhole coherence"
      >
        {/* Axes background */}
        <rect
          x={PAD_L}
          y={PAD_T}
          width={WIDTH - PAD_L - PAD_R}
          height={HEIGHT - PAD_T - PAD_B}
          fill="var(--color-glass)"
          stroke="var(--color-panel-border)"
          strokeWidth={1}
        />
        {/* Horizontal guide at I = 1 */}
        <line
          x1={PAD_L}
          x2={WIDTH - PAD_R}
          y1={PAD_T}
          y2={PAD_T}
          stroke="var(--color-warning)"
          strokeDasharray="3 3"
          strokeWidth={1}
        />
        {/* Coherence trace */}
        {snapshot.hasData && (
          <path
            d={snapshot.path}
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth={1.5}
            strokeLinejoin="round"
          />
        )}
        {/* Axis labels */}
        <text
          x={PAD_L}
          y={HEIGHT - 4}
          fontSize={10}
          fontFamily="monospace"
          fill="var(--color-text-tertiary)"
        >
          t {snapshot.hasData ? snapshot.tMin.toFixed(2) : '—'}
        </text>
        <text
          x={WIDTH - PAD_R}
          y={HEIGHT - 4}
          fontSize={10}
          fontFamily="monospace"
          textAnchor="end"
          fill="var(--color-text-tertiary)"
        >
          t {snapshot.hasData ? snapshot.tMax.toFixed(2) : '—'}
        </text>
        <text
          x={4}
          y={PAD_T + 10}
          fontSize={10}
          fontFamily="monospace"
          fill="var(--color-text-tertiary)"
        >
          1
        </text>
        <text
          x={4}
          y={HEIGHT - PAD_B}
          fontSize={10}
          fontFamily="monospace"
          fill="var(--color-text-tertiary)"
        >
          0
        </text>
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-text-tertiary">
        <span>samples: {bufferCount}</span>
      </div>
    </div>
  )
}
