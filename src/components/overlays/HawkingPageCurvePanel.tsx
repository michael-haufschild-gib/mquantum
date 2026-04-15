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
 *
 * Data source: `pageCurveStore` ring buffer. Trigger for new samples lives
 * in this component as a useEffect that subscribes to BEC config changes +
 * the BEC diagnostics readback generation, so the panel is self-contained.
 *
 * @module components/overlays/HawkingPageCurvePanel
 */

import React, { useEffect, useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { getPageCurveSample, horizonPlaneArea } from '@/lib/physics/bec/pageCurve'
import {
  asymptoticSoundSpeed,
  hasHorizon,
  hawkingReadout,
  type WaterfallParams,
} from '@/lib/physics/bec/sonicHorizon'
import { useDiagnosticsStore } from '@/stores/diagnosticsStore'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'
import { useGeometryStore } from '@/stores/geometryStore'
import { usePageCurveStore } from '@/stores/pageCurveStore'

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
 * Overlay panel that renders the Page curve when the `pageCurveHudEnabled`
 * flag is on and the current object is in BEC mode. Drives sample updates
 * from a BEC-diagnostics subscription so no extra render-pass plumbing is
 * needed.
 */
export function HawkingPageCurvePanel(): React.ReactElement | null {
  const enabled = usePageCurveStore((s) => s.pageCurveHudEnabled)
  const version = usePageCurveStore((s) => s.version)
  const bufferCount = usePageCurveStore((s) => s.buffer.count)

  const config = useExtendedObjectStore((state) => state.schroedinger)
  const { dimension, objectType } = useGeometryStore(
    useShallow((s) => ({ dimension: s.dimension, objectType: s.objectType }))
  )
  const becGen = useDiagnosticsStore((s) => s.bec.readbackGeneration)

  const bec = config.bec

  // Drive new samples whenever the BEC diagnostics advance. Cadence is
  // approximately `dt · stepsPerFrame · diagnosticsInterval` per tick.
  useEffect(() => {
    if (!enabled) return
    if (objectType !== 'schroedinger') return
    if (config.quantumMode !== 'becDynamics') return
    if (bec.initialCondition !== 'blackHoleAnalog') return

    const params: WaterfallParams = {
      vMax: bec.hawkingVmax,
      lh: bec.hawkingLh,
      n0: 1.0,
      deltaN: bec.hawkingDeltaN,
      g: bec.interactionStrength,
      mass: bec.mass,
      lBox: (bec.gridSize[0] ?? 64) * (bec.spacing[0] ?? 0.15),
    }
    const horizonPresent = hasHorizon(params)
    const readout = hawkingReadout(params)
    const cs0 = asymptoticSoundSpeed(params)
    const areaH = horizonPlaneArea({
      gridSize: bec.gridSize,
      spacing: bec.spacing,
      horizonExists: horizonPresent,
    })
    // The supersonic region along axis 0 has extent (L_box/2 - x_horizon)·2 —
    // region |x| ≥ x_horizon within the box.
    const lBoxHalf = 0.5 * params.lBox
    const supersonicExtent = horizonPresent
      ? Math.max(0, lBoxHalf - Math.abs(readout.horizonX0))
      : 0
    const frameTime =
      (bec.dt ?? 0.002) * (bec.stepsPerFrame ?? 4) * Math.max(1, bec.diagnosticsInterval ?? 5)
    const t = becGen * frameTime
    usePageCurveStore.getState().pushSample({
      t,
      tH: readout.hawkingTemperature,
      areaH,
      cs0,
      supersonicExtent,
    })
  }, [
    enabled,
    objectType,
    config.quantumMode,
    bec.initialCondition,
    bec.hawkingVmax,
    bec.hawkingLh,
    bec.hawkingDeltaN,
    bec.interactionStrength,
    bec.mass,
    bec.gridSize,
    bec.spacing,
    bec.dt,
    bec.stepsPerFrame,
    bec.diagnosticsInterval,
    becGen,
    dimension,
  ])

  // Clear samples on mode/initialCondition change.
  useEffect(() => {
    usePageCurveStore.getState().clear()
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

  if (!enabled) return null

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

  return (
    <div
      className="glass-panel absolute right-4 top-4 rounded-md border border-border-default p-2 shadow-lg"
      data-testid="hawking-page-curve-panel"
      style={{ width: WIDTH + 16, zIndex: 40 }}
    >
      <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
        <span>Hawking Page Curve</span>
        <span className="text-text-tertiary">
          S_BH&nbsp;{snapshot.hasData && snapshot.sBH > 0 ? snapshot.sBH.toExponential(2) : '—'}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        width={WIDTH}
        height={HEIGHT}
        role="img"
        aria-label="Page curve"
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
        {/* S_BH line */}
        {sBHPixel !== null && (
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
        {tPagePixel !== null && (
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
        {/* S_therm trace */}
        {snapshot.hasData && (
          <path
            d={snapshot.thermPath}
            fill="none"
            stroke="var(--color-danger)"
            strokeWidth={1.5}
            strokeLinejoin="round"
          />
        )}
        {/* S_page trace */}
        {snapshot.hasData && (
          <path
            d={snapshot.pagePath}
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth={1.5}
            strokeLinejoin="round"
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
      <div className="mt-1 flex justify-between text-[10px] text-text-tertiary">
        <span>t_Page: {snapshot.tPage !== null ? snapshot.tPage.toFixed(3) : '—'}</span>
        <span>samples: {bufferCount}</span>
      </div>
    </div>
  )
}
