/**
 * Pure helpers for the Page-curve HUD — kept in a non-component module so
 * React Fast Refresh stays single-concern in `PageCurveSvg.tsx`.
 *
 * @module components/overlays/pageCurve/snapshot
 */

import { getPageCurveSample, type PageCurveRingBuffer } from '@/lib/physics/bec/pageCurve'

/** Layout width of the Page-curve SVG in CSS px. */
export const PAGE_CURVE_WIDTH = 360
/** Layout height of the Page-curve SVG in CSS px. */
export const PAGE_CURVE_HEIGHT = 180
/** Left padding inside the SVG viewBox — reserved for the y-axis label column. */
export const PAD_L = 36
/** Right padding inside the SVG viewBox. */
export const PAD_R = 8
/** Top padding inside the SVG viewBox — reserved for the legend. */
export const PAD_T = 18
/** Bottom padding inside the SVG viewBox — reserved for the t-axis labels. */
export const PAD_B = 22

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

/** Plot-space snapshot derived from the ring buffer + latest S_BH. */
export interface PageCurveSnapshot {
  tMin: number
  tMax: number
  sMax: number
  sBH: number
  tPage: number | null
  thermPath: string
  pagePath: string
  hasData: boolean
  /** Memoization key tying this snapshot to the store's push counter. */
  bufferVersion: number
}

/**
 * Derive a fresh {@link PageCurveSnapshot} from the store's ring buffer.
 *
 * Kept pure so the parent can memoize against `(version, bufferCount)`;
 * also callable from tests without rendering. The `version` arg is
 * included in the output so subsequent memos stay honest about their key.
 *
 * @param buffer - Ring buffer from usePageCurveStore.
 * @param bufferCount - Current sample count (included in the memo key).
 * @param lastSBH - Latest S_BH scalar (cached in the store).
 * @param version - Push counter (included in the memo key).
 * @param tPageAtSample - Page-time evaluator — supplied by the caller so
 *   the snapshot can include the current crossing without re-computing it.
 * @returns Plot-ready snapshot.
 */
export function buildPageCurveSnapshot(
  buffer: PageCurveRingBuffer,
  bufferCount: number,
  lastSBH: number,
  version: number,
  tPageAtSample: () => number | null
): PageCurveSnapshot {
  const out: PageCurveSnapshot = {
    tMin: 0,
    tMax: 0,
    sMax: 0,
    sBH: lastSBH,
    tPage: null,
    thermPath: '',
    pagePath: '',
    hasData: false,
    bufferVersion: version,
  }
  const n = bufferCount
  if (n < 2) return out
  let tMin = Infinity
  let tMax = -Infinity
  let sMax = 0
  const thermPoints: TracePoint[] = []
  const pagePoints: TracePoint[] = []
  for (let i = 0; i < n; i++) {
    const s = getPageCurveSample(buffer, i)
    if (!s) continue
    if (s.t < tMin) tMin = s.t
    if (s.t > tMax) tMax = s.t
    if (s.sTherm > sMax) sMax = s.sTherm
  }
  if (!Number.isFinite(tMin) || !Number.isFinite(tMax) || tMax <= tMin) return out
  const sMaxShown = Math.max(sMax, out.sBH * 1.2, 1e-6)
  const plotW = PAGE_CURVE_WIDTH - PAD_L - PAD_R
  const plotH = PAGE_CURVE_HEIGHT - PAD_T - PAD_B
  for (let i = 0; i < n; i++) {
    const s = getPageCurveSample(buffer, i)
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
  out.tPage = tPageAtSample()
  out.hasData = thermPoints.length > 1
  return out
}
