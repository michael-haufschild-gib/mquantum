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

import { m, useMotionValue } from 'motion/react'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { useIsDesktop } from '@/hooks/useMediaQuery'
import { usePanelCollision } from '@/hooks/usePanelCollision'
import {
  getWormholeSample,
  useWormholeCoherenceStore,
} from '@/stores/diagnostics/wormholeCoherenceStore'
import { useExtendedObjectStore } from '@/stores/scene/extendedObjectStore'
import { useGeometryStore } from '@/stores/scene/geometryStore'
import { useLayoutStore } from '@/stores/ui/layoutStore'

const WIDTH = 360
const HEIGHT = 180
const PAD_L = 36
const PAD_R = 8
const PAD_T = 18
const PAD_B = 22
const PANEL_W = WIDTH + 16
const PANEL_H = HEIGHT + 64

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
 * Heavy inner panel — only mounted when the Wormhole-coherence HUD is
 * enabled. Uses the same drag + sidebar-collision convention as
 * {@link QuantumCarpetPanel} / {@link HawkingPageCurvePanel} so all
 * floating HUDs share consistent behavior and get pushed aside by the
 * editor panels instead of being obscured.
 */
const WormholeCoherencePanelInner: React.FC = React.memo(() => {
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
  const setTdseWormholeHudEnabled = useExtendedObjectStore((s) => s.setTdseWormholeHudEnabled)

  const hudEnabled = !!config.tdse.wormholeCoherenceHudEnabled
  const modeActive = objectType === 'schroedinger' && config.quantumMode === 'tdseDynamics'

  // Drag + panel-collision, matching Carpet / Hawking panels. Initial
  // position: bottom-right, stacked below the Hawking panel so both fit
  // on standard laptops.
  const [isDragging, setIsDragging] = useState(false)
  const initializedRef = useRef(false)
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  useEffect(() => {
    if (initializedRef.current) return
    initializedRef.current = true
    const offsetX = window.innerWidth - PANEL_W - 16 - 16
    const offsetY = window.innerHeight - PANEL_H - 80 - 96
    x.set(Math.max(0, offsetX))
    y.set(Math.max(0, offsetY))
  }, [x, y])
  usePanelCollision(x, y, PANEL_W, PANEL_H, isDragging)

  const handleClose = useCallback(
    () => setTdseWormholeHudEnabled(false),
    [setTdseWormholeHudEnabled]
  )

  // Clear samples on mode switch, wormhole enable flip, or HUD disable so
  // stale traces from a previous run don't leak into the new session.
  useEffect(() => {
    useWormholeCoherenceStore.getState().clear()
  }, [
    objectType,
    config.quantumMode,
    config.tdse.wormholeCouplingEnabled,
    config.tdse.wormholeCouplingG,
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

  if (!modeActive) return null

  return (
    <m.div
      drag
      dragMomentum={false}
      style={{ x, y }}
      onDragStart={() => setIsDragging(true)}
      onDragEnd={() => setTimeout(() => setIsDragging(false), 100)}
      className="absolute top-20 start-4 z-[45] pointer-events-auto select-none"
      data-testid="wormhole-coherence-panel"
    >
      <div
        className="flex flex-col overflow-hidden rounded-2xl shadow-[var(--shadow-hard)]"
        style={{ width: PANEL_W }}
      >
        <div className="flex items-center gap-2 px-3 py-1.5 surface-panel">
          <span className="text-xs font-medium text-primary/80 whitespace-nowrap">
            Wormhole I(L:R)
          </span>
          <span className="flex gap-2 text-xs text-neutral-500 ms-auto">
            <span>ax&nbsp;{lastAxis}</span>
            <span>g&nbsp;{lastG.toFixed(2)}</span>
            <span className="text-neutral-300">
              I&nbsp;{snapshot.hasData ? lastCoherence.toFixed(3) : '—'}
            </span>
          </span>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleClose}
            ariaLabel="Close wormhole coherence panel"
            className="!p-1 !min-w-0"
            tooltip="Close the wormhole coherence panel"
            data-testid="wormhole-coherence-close"
          >
            <Icon name="cross" size={10} />
          </Button>
        </div>
        <div className="bg-black/90 p-2">
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
              fill="var(--color-control)"
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
        </div>
        <div className="flex items-center justify-between px-3 py-1 bg-black/80 text-xs text-neutral-500">
          <span>samples: {bufferCount}</span>
        </div>
      </div>
    </m.div>
  )
})

WormholeCoherencePanelInner.displayName = 'WormholeCoherencePanelInner'

/**
 * Wormhole-coherence HUD overlay for the TDSE double-trace-coupling mode.
 * Thin gate: mounts the heavy inner only when the HUD toggle is on, the
 * current mode is TDSE, not in cinematic mode, and on a desktop viewport.
 *
 * @returns The panel, or null when hidden.
 */
export const WormholeCoherencePanel: React.FC = React.memo(() => {
  const hudEnabled = useExtendedObjectStore(
    (s) => !!s.schroedinger.tdse.wormholeCoherenceHudEnabled
  )
  const isCinematic = useLayoutStore((s) => s.isCinematicMode)
  const isDesktop = useIsDesktop()
  if (!hudEnabled || isCinematic || !isDesktop) return null
  return <WormholeCoherencePanelInner />
})

WormholeCoherencePanel.displayName = 'WormholeCoherencePanel'
