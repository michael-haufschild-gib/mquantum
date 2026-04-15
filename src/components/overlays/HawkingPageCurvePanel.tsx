/**
 * HawkingPageCurvePanel
 *
 * Small SVG overlay rendering the analog-Hawking Page curve in real time.
 *
 * Two traces:
 *   - S_therm(t)  — cumulative thermal entropy of outgoing radiation (red).
 *   - S_page(t)   — island formula result = min(S_therm, S_BH) (cyan).
 * Plus:
 *   - Horizontal dashed line at S_BH.
 *   - Vertical dashed line at t_Page (where the curves split).
 *   - Optional secondary horizontal dashed line marking the normalized
 *     island extent when `islandOverlayEnabled` is on (deferred 3D channel
 *     placeholder; surfaces the island radius scalar in the HUD).
 *
 * Data source: `pageCurveStore` ring buffer. Trigger for new samples lives
 * in this component as a useEffect that subscribes to BEC config changes +
 * the BEC diagnostics readback generation, so the panel is self-contained.
 *
 * @module components/overlays/HawkingPageCurvePanel
 */

import { m, useMotionValue } from 'motion/react'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { useIsDesktop } from '@/hooks/useMediaQuery'
import { usePanelCollision } from '@/hooks/usePanelCollision'
import { getPageCurveSample, horizonPlaneArea } from '@/lib/physics/bec/pageCurve'
import { asymptoticSoundSpeed, hasHorizon, hawkingReadout } from '@/lib/physics/bec/sonicHorizon'
import { buildWaterfallParams } from '@/lib/physics/bec/waterfallParams'
import { useDiagnosticsStore } from '@/stores/diagnosticsStore'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'
import { useGeometryStore } from '@/stores/geometryStore'
import { useLayoutStore } from '@/stores/layoutStore'
import { usePageCurveStore } from '@/stores/pageCurveStore'

const WIDTH = 360
const HEIGHT = 180
const PAD_L = 36
const PAD_R = 8
const PAD_T = 18
const PAD_B = 22

/** Outer panel frame width in CSS px (includes padding for the SVG). */
const PANEL_W = WIDTH + 16
/** Outer panel frame height in CSS px (header + SVG + footer). */
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
 * Heavy inner panel — only mounted when the HUD toggle is on, not in cinematic
 * mode, and on a desktop viewport. Handles sampling, drawing, drag, and
 * sidebar-collision spring offsets (same pattern as QuantumCarpetPanel).
 */
const PageCurvePanelInner: React.FC = React.memo(() => {
  // `enabled` is always true here — outer gate mounts us only when the HUD
  // is on — but the horizon-context memo and sample-push effect still
  // discriminate on mode/initialCondition via this flag, so read it for
  // dep-array correctness.
  const enabled = usePageCurveStore((s) => s.pageCurveHudEnabled)
  const islandOverlayEnabled = usePageCurveStore((s) => s.islandOverlayEnabled)
  const dMaxFrac = usePageCurveStore((s) => s.dMaxFrac)
  const version = usePageCurveStore((s) => s.version)
  const bufferCount = usePageCurveStore((s) => s.buffer.count)
  const lastIslandRadius = usePageCurveStore((s) => s.lastIslandRadius)

  const config = useExtendedObjectStore((state) => state.schroedinger)
  const { dimension, objectType } = useGeometryStore(
    useShallow((s) => ({ dimension: s.dimension, objectType: s.objectType }))
  )
  const becGen = useDiagnosticsStore((s) => s.bec.readbackGeneration)
  const setPageCurveHudEnabled = usePageCurveStore((s) => s.setPageCurveHudEnabled)

  const bec = config.bec

  // Drag state + initial bottom-right position. Same convention as
  // QuantumCarpetPanel so both floating HUDs have the same behavior and
  // can't fight for the same pixels.
  const [isDragging, setIsDragging] = useState(false)
  const initializedRef = useRef(false)
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  useEffect(() => {
    if (initializedRef.current) return
    initializedRef.current = true
    const offsetX = window.innerWidth - PANEL_W - 16 - 16
    // Stacked above the Quantum Carpet panel so both fit on standard laptops.
    const offsetY = window.innerHeight - PANEL_H - 80 - 96 - 300
    x.set(Math.max(0, offsetX))
    y.set(Math.max(0, offsetY))
  }, [x, y])
  usePanelCollision(x, y, PANEL_W, PANEL_H, isDragging)

  const handleClose = useCallback(() => setPageCurveHudEnabled(false), [setPageCurveHudEnabled])

  // Capture the becGen value at view start so the time axis begins at t = 0
  // for each fresh BEC view session. Mode/initialCondition switches reset the
  // store; we mirror that here so `t` stays anchored to the user-visible run.
  const genRefRef = useRef<number | null>(null)
  // genRefRef.current === null is a sentinel meaning "set on next push"; the
  // value is the becGen reading at the moment t = 0 should be anchored.
  // `lastPushedGenRef` dedupes: without it, any dependency change (e.g. HUD
  // toggle, gridSize) re-runs the effect and pushes another sample for the
  // same becGen, producing duplicate timestamps.
  const lastPushedGenRef = useRef<number | null>(null)
  // Guards the reset effect so simply re-mounting the panel (HUD toggle,
  // cinematic mode, desktop breakpoint) does not wipe the running curve.
  const didInitResetRef = useRef(false)

  const becParams = useMemo(
    () =>
      buildWaterfallParams({
        hawkingVmax: bec.hawkingVmax,
        hawkingLh: bec.hawkingLh,
        hawkingDeltaN: bec.hawkingDeltaN,
        interactionStrength: bec.interactionStrength,
        mass: bec.mass,
        gridSize: bec.gridSize,
        spacing: bec.spacing,
      }),
    [
      bec.hawkingVmax,
      bec.hawkingLh,
      bec.hawkingDeltaN,
      bec.interactionStrength,
      bec.mass,
      bec.gridSize,
      bec.spacing,
    ]
  )

  // Synchronously evaluated horizon predicate — drives the empty-state UI.
  const horizonContext = useMemo(() => {
    const isBec =
      enabled &&
      objectType === 'schroedinger' &&
      config.quantumMode === 'becDynamics' &&
      bec.initialCondition === 'blackHoleAnalog'
    if (!isBec) return { isBec, horizonPresent: false, cs0: 0 }
    const horizonPresent = hasHorizon(becParams)
    const cs0 = asymptoticSoundSpeed(becParams)
    return { isBec, horizonPresent, cs0 }
  }, [enabled, objectType, config.quantumMode, bec.initialCondition, becParams])

  // Drive new samples whenever the BEC diagnostics advance. Cadence is
  // approximately `dt · stepsPerFrame · diagnosticsInterval` per tick.
  useEffect(() => {
    if (!enabled) return
    if (objectType !== 'schroedinger') return
    if (config.quantumMode !== 'becDynamics') return
    if (bec.initialCondition !== 'blackHoleAnalog') return
    if (lastPushedGenRef.current === becGen) return

    const horizonPresent = hasHorizon(becParams)
    const readout = hawkingReadout(becParams)
    const cs0 = asymptoticSoundSpeed(becParams)
    const areaH = horizonPlaneArea({
      gridSize: bec.gridSize,
      spacing: bec.spacing,
      horizonExists: horizonPresent,
    })
    // The supersonic region along axis 0 has extent (L_box/2 - x_horizon)·2 —
    // region |x| ≥ x_horizon within the box.
    const lBoxHalf = 0.5 * becParams.lBox
    const supersonicExtent = horizonPresent
      ? Math.max(0, lBoxHalf - Math.abs(readout.horizonX0))
      : 0
    const frameTime =
      (bec.dt ?? 0.002) * (bec.stepsPerFrame ?? 4) * Math.max(1, bec.diagnosticsInterval ?? 5)
    if (genRefRef.current === null) genRefRef.current = becGen
    const t = (becGen - genRefRef.current) * frameTime
    usePageCurveStore.getState().pushSample({
      t,
      tH: readout.hawkingTemperature,
      areaH,
      cs0,
      supersonicExtent,
    })
    lastPushedGenRef.current = becGen
  }, [
    enabled,
    objectType,
    config.quantumMode,
    bec.initialCondition,
    becParams,
    bec.gridSize,
    bec.spacing,
    bec.dt,
    bec.stepsPerFrame,
    bec.diagnosticsInterval,
    becGen,
    dimension,
  ])

  // Clear samples on mode/initialCondition change AND reset the time anchor
  // so the new view session starts at t = 0. Skip the initial mount so
  // re-opening the panel (HUD toggle, cinematic mode, breakpoint switch)
  // does not wipe an in-flight page curve.
  useEffect(() => {
    if (!didInitResetRef.current) {
      didInitResetRef.current = true
      return
    }
    usePageCurveStore.getState().clear()
    genRefRef.current = null
    lastPushedGenRef.current = null
  }, [bec.initialCondition, config.quantumMode, objectType])

  const snapshot = useMemo(() => {
    // `version` is the store's monotonic push counter — capturing it in the
    // output (a) forces this memo to recompute on every push and (b) makes
    // the dep array legitimate (no `void` suppression cheat). Downstream
    // consumers don't have to read it; it's a byproduct of the memo key.
    const store = usePageCurveStore.getState()
    const buf = store.buffer
    const n = bufferCount
    const out = {
      tMin: 0,
      tMax: 0,
      sMax: 0,
      sBH: store.lastSBH,
      tPage: null as number | null,
      thermPath: '',
      pagePath: '',
      hasData: false,
      bufferVersion: version,
    }
    if (n < 2) return out
    let tMin = Infinity
    let tMax = -Infinity
    let sMax = 0
    const thermPoints: TracePoint[] = []
    const pagePoints: TracePoint[] = []
    for (let i = 0; i < n; i++) {
      const s = getPageCurveSample(buf, i)
      if (!s) continue
      if (s.t < tMin) tMin = s.t
      if (s.t > tMax) tMax = s.t
      if (s.sTherm > sMax) sMax = s.sTherm
    }
    if (!Number.isFinite(tMin) || !Number.isFinite(tMax) || tMax <= tMin) return out
    const sMaxShown = Math.max(sMax, out.sBH * 1.2, 1e-6)
    const plotW = WIDTH - PAD_L - PAD_R
    const plotH = HEIGHT - PAD_T - PAD_B
    for (let i = 0; i < n; i++) {
      const s = getPageCurveSample(buf, i)
      if (!s) continue
      const x = PAD_L + ((s.t - tMin) / (tMax - tMin)) * plotW
      const yTh = PAD_T + plotH - (s.sTherm / sMaxShown) * plotH
      const yPg = PAD_T + plotH - (s.sPage / sMaxShown) * plotH
      thermPoints.push({ x, y: yTh })
      pagePoints.push({ x, y: yPg })
    }
    out.tMin = tMin
    out.tMax = tMax
    out.sMax = sMaxShown
    out.thermPath = buildPath(thermPoints)
    out.pagePath = buildPath(pagePoints)
    out.tPage = store.getPageTime()
    out.hasData = thermPoints.length > 1
    return out
  }, [version, bufferCount])

  const tPagePixel =
    snapshot.tPage !== null && snapshot.tMax > snapshot.tMin
      ? PAD_L +
        ((snapshot.tPage - snapshot.tMin) / (snapshot.tMax - snapshot.tMin)) *
          (WIDTH - PAD_L - PAD_R)
      : null
  const sBHPixel =
    snapshot.sMax > 0
      ? PAD_T + (HEIGHT - PAD_T - PAD_B) - (snapshot.sBH / snapshot.sMax) * (HEIGHT - PAD_T - PAD_B)
      : null

  // Island extent guide line. Positioned at y = islandRadius / dMaxFrac /
  // supersonicExtent — but we already lack the supersonic extent at render
  // time without a fresh recompute, so we normalize against `dMaxFrac` only:
  // the stored island radius peaks at `dMaxFrac · supersonicExtent`, so
  // `islandRadius / dMaxFrac` recovers the supersonic-extent fraction in
  // [0, supersonicExtent]. Map that into the plot box as a mid-band marker
  // (50 % of plot height when at its peak). The exact mapping is illustrative
  // — the deferred 3D GPU island channel will replace this UI marker.
  const showIslandLine =
    islandOverlayEnabled && snapshot.tPage !== null && lastIslandRadius > 0 && dMaxFrac > 0
  const islandPixel = showIslandLine
    ? PAD_T +
      (HEIGHT - PAD_T - PAD_B) -
      Math.min(1, lastIslandRadius / Math.max(dMaxFrac * 5, 1e-6)) * (HEIGHT - PAD_T - PAD_B) * 0.5
    : null

  const showEmptyState = horizonContext.isBec && !horizonContext.horizonPresent

  return (
    <m.div
      drag
      dragMomentum={false}
      style={{ x, y }}
      onDragStart={() => setIsDragging(true)}
      onDragEnd={() => setTimeout(() => setIsDragging(false), 100)}
      className="absolute top-20 start-4 z-[45] pointer-events-auto select-none"
      data-testid="hawking-page-curve-panel"
    >
      <div
        className="flex flex-col overflow-hidden rounded-2xl shadow-[var(--shadow-hard)]"
        style={{ width: PANEL_W }}
      >
        <div className="flex items-center gap-2 px-3 py-1.5 glass-panel">
          <span className="text-xs font-medium text-primary/80 whitespace-nowrap">
            Hawking Page Curve
          </span>
          <span className="text-xs text-neutral-500 ms-auto">
            S_BH&nbsp;
            {!showEmptyState && snapshot.hasData && snapshot.sBH > 0
              ? snapshot.sBH.toExponential(2)
              : '—'}
          </span>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleClose}
            ariaLabel="Close Hawking Page Curve panel"
            className="!p-1 !min-w-0"
            title="Close"
            data-testid="hawking-page-curve-close"
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
            aria-label="Page curve"
            data-testid="hawking-page-curve-svg"
            data-island-overlay={islandOverlayEnabled ? 'on' : 'off'}
            data-has-horizon={horizonContext.horizonPresent ? 'on' : 'off'}
          >
            {/* Axes */}
            <rect
              x={PAD_L}
              y={PAD_T}
              width={WIDTH - PAD_L - PAD_R}
              height={HEIGHT - PAD_T - PAD_B}
              fill="var(--color-glass)"
              stroke="var(--color-panel-border)"
              strokeWidth={1}
            />
            {/* Empty state — supersedes the traces when no horizon exists. */}
            {showEmptyState && (
              <g data-testid="hawking-empty-state">
                <text
                  x={WIDTH / 2}
                  y={HEIGHT / 2 - 6}
                  fontSize={11}
                  fontFamily="monospace"
                  textAnchor="middle"
                  fill="var(--color-warning)"
                >
                  No horizon — raise v_max above c_s0
                </text>
                <text
                  x={WIDTH / 2}
                  y={HEIGHT / 2 + 10}
                  fontSize={10}
                  fontFamily="monospace"
                  textAnchor="middle"
                  fill="var(--color-text-tertiary)"
                >
                  c_s0 ≈ {horizonContext.cs0.toFixed(3)}
                </text>
              </g>
            )}
            {/* S_BH line — only meaningful when a horizon exists. */}
            {!showEmptyState && sBHPixel !== null && (
              <line
                x1={PAD_L}
                x2={WIDTH - PAD_R}
                y1={sBHPixel}
                y2={sBHPixel}
                stroke="var(--color-warning)"
                strokeDasharray="3 3"
                strokeWidth={1}
              />
            )}
            {/* t_Page line */}
            {!showEmptyState && tPagePixel !== null && (
              <line
                x1={tPagePixel}
                x2={tPagePixel}
                y1={PAD_T}
                y2={HEIGHT - PAD_B}
                stroke="var(--color-text-secondary)"
                strokeDasharray="2 3"
                strokeWidth={1}
              />
            )}
            {/* Island extent guide — only after t_Page and when the toggle is on. */}
            {islandPixel !== null && (
              <>
                <line
                  x1={PAD_L}
                  x2={WIDTH - PAD_R}
                  y1={islandPixel}
                  y2={islandPixel}
                  stroke="var(--color-accent)"
                  strokeDasharray="1 4"
                  strokeWidth={1}
                  data-testid="hawking-island-extent-line"
                />
                <text
                  x={WIDTH - PAD_R - 2}
                  y={islandPixel - 2}
                  fontSize={9}
                  fontFamily="monospace"
                  textAnchor="end"
                  fill="var(--color-accent)"
                >
                  island d*
                </text>
              </>
            )}
            {/* S_therm trace */}
            {!showEmptyState && snapshot.hasData && (
              <path
                d={snapshot.thermPath}
                fill="none"
                stroke="var(--color-danger)"
                strokeWidth={1.5}
                strokeLinejoin="round"
                data-testid="hawking-stherm-path"
              />
            )}
            {/* S_page trace */}
            {!showEmptyState && snapshot.hasData && (
              <path
                d={snapshot.pagePath}
                fill="none"
                stroke="var(--color-accent)"
                strokeWidth={1.5}
                strokeLinejoin="round"
                data-testid="hawking-spage-path"
              />
            )}
            {/* Legend */}
            <g
              transform={`translate(${PAD_L + 4} ${PAD_T + 4})`}
              fontSize={10}
              fontFamily="monospace"
              fill="var(--color-text-primary)"
            >
              <rect x={0} y={0} width={86} height={30} fill="var(--color-overlay)" rx={2} />
              <line x1={4} y1={9} x2={14} y2={9} stroke="var(--color-danger)" strokeWidth={2} />
              <text x={18} y={12}>
                S_therm
              </text>
              <line x1={4} y1={22} x2={14} y2={22} stroke="var(--color-accent)" strokeWidth={2} />
              <text x={18} y={25}>
                S_page
              </text>
            </g>
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
              S {snapshot.hasData ? snapshot.sMax.toExponential(1) : '—'}
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
          <span>t_Page: {snapshot.tPage !== null ? snapshot.tPage.toFixed(3) : '—'}</span>
          <span>samples: {bufferCount}</span>
        </div>
      </div>
    </m.div>
  )
})

PageCurvePanelInner.displayName = 'PageCurvePanelInner'

/**
 * Page curve + island-formula HUD overlay for the analog Hawking BEC.
 * Thin gate that mounts the heavy inner panel only when enabled, not in
 * cinematic mode, and on a desktop viewport — same contract as
 * {@link QuantumCarpetPanel}.
 *
 * @returns The panel, or null when hidden.
 */
export const HawkingPageCurvePanel: React.FC = React.memo(() => {
  const enabled = usePageCurveStore((s) => s.pageCurveHudEnabled)
  const isCinematic = useLayoutStore((s) => s.isCinematicMode)
  const isDesktop = useIsDesktop()
  if (!enabled || isCinematic || !isDesktop) return null
  return <PageCurvePanelInner />
})

HawkingPageCurvePanel.displayName = 'HawkingPageCurvePanel'
