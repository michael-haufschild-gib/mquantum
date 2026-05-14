/**
 * Transform Gizmo Geometry
 *
 * Generates translate (axis arrows) and rotate (axis circles) gizmo wireframes.
 * Extracted from gizmoGeometry.ts for file-size management.
 *
 * @module rendering/webgpu/passes/gizmoTransformGeometry
 */

const AXIS_COLORS: [number, number, number][] = [
  [1, 0.2, 0.2],
  [0.2, 1, 0.2],
  [0.2, 0.2, 1],
]
const DEFAULT_SHAFT_LENGTH = 3.0
const DEFAULT_RING_RADIUS = 2.5
const DEFAULT_RING_SEGMENTS = 48
const MIN_RING_SEGMENTS = 3
const MAX_RING_SEGMENTS = 256

function sanitizeAlpha(alpha: number): number {
  if (!Number.isFinite(alpha)) return 1
  return Math.min(Math.max(alpha, 0), 1)
}

function sanitizePositive(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback
}

function sanitizeSegments(segments: number): number {
  if (!Number.isFinite(segments)) return DEFAULT_RING_SEGMENTS
  return Math.min(Math.max(Math.trunc(segments), MIN_RING_SEGMENTS), MAX_RING_SEGMENTS)
}

function pushLine(
  out: number[],
  x0: number,
  y0: number,
  z0: number,
  x1: number,
  y1: number,
  z1: number,
  r: number,
  g: number,
  b: number,
  a: number
): void {
  out.push(x0, y0, z0, r, g, b, a)
  out.push(x1, y1, z1, r, g, b, a)
}

/**
 * Generate translate gizmo: 3 axis arrows (R=X, G=Y, B=Z) with arrowheads.
 * Centered at origin, extending along each positive axis.
 *
 * @param alpha - Opacity for all line segments
 * @param shaftLength - Length of each axis shaft
 * @returns Float32Array of line-list vertices (7 floats per vertex: x,y,z,r,g,b,a)
 */
export function generateTranslateGizmo(alpha = 1.0, shaftLength = 3.0): Float32Array {
  const out: number[] = []
  const safeAlpha = sanitizeAlpha(alpha)
  const safeShaftLength = sanitizePositive(shaftLength, DEFAULT_SHAFT_LENGTH)
  const headLen = 0.4
  const headW = 0.12

  const axes: [number, number, number][] = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ]

  const perps: [[number, number, number], [number, number, number]][] = [
    [
      [0, 1, 0],
      [0, 0, 1],
    ], // X axis perps
    [
      [1, 0, 0],
      [0, 0, 1],
    ], // Y axis perps
    [
      [1, 0, 0],
      [0, 1, 0],
    ], // Z axis perps
  ]

  for (let a = 0; a < 3; a++) {
    const [ax, ay, az] = axes[a]!
    const [r, g, b] = AXIS_COLORS[a]!
    const [perpA, perpB] = perps[a]!

    // Shaft
    pushLine(
      out,
      0,
      0,
      0,
      ax * safeShaftLength,
      ay * safeShaftLength,
      az * safeShaftLength,
      r,
      g,
      b,
      safeAlpha
    )

    // Arrowhead
    const tipX = ax * safeShaftLength
    const tipY = ay * safeShaftLength
    const tipZ = az * safeShaftLength
    const baseX = ax * (safeShaftLength - headLen)
    const baseY = ay * (safeShaftLength - headLen)
    const baseZ = az * (safeShaftLength - headLen)

    pushLine(
      out,
      tipX,
      tipY,
      tipZ,
      baseX + perpA[0] * headW,
      baseY + perpA[1] * headW,
      baseZ + perpA[2] * headW,
      r,
      g,
      b,
      safeAlpha
    )
    pushLine(
      out,
      tipX,
      tipY,
      tipZ,
      baseX - perpA[0] * headW,
      baseY - perpA[1] * headW,
      baseZ - perpA[2] * headW,
      r,
      g,
      b,
      safeAlpha
    )
    pushLine(
      out,
      tipX,
      tipY,
      tipZ,
      baseX + perpB[0] * headW,
      baseY + perpB[1] * headW,
      baseZ + perpB[2] * headW,
      r,
      g,
      b,
      safeAlpha
    )
    pushLine(
      out,
      tipX,
      tipY,
      tipZ,
      baseX - perpB[0] * headW,
      baseY - perpB[1] * headW,
      baseZ - perpB[2] * headW,
      r,
      g,
      b,
      safeAlpha
    )
  }

  return new Float32Array(out)
}

/**
 * Generate rotate gizmo: 3 axis rings (R=X, G=Y, B=Z).
 * Centered at origin.
 * @param alpha - Opacity
 * @param radius - Ring radius
 * @param segments - Segments per ring
 * @returns Float32Array of line-list vertices
 */
export function generateRotateGizmo(alpha = 1.0, radius = 2.5, segments = 48): Float32Array {
  const out: number[] = []
  const safeAlpha = sanitizeAlpha(alpha)
  const safeRadius = sanitizePositive(radius, DEFAULT_RING_RADIUS)
  const safeSegments = sanitizeSegments(segments)

  // X ring (YZ plane)
  for (let i = 0; i < safeSegments; i++) {
    const a0 = (i / safeSegments) * Math.PI * 2
    const a1 = ((i + 1) / safeSegments) * Math.PI * 2
    pushLine(
      out,
      0,
      Math.cos(a0) * safeRadius,
      Math.sin(a0) * safeRadius,
      0,
      Math.cos(a1) * safeRadius,
      Math.sin(a1) * safeRadius,
      AXIS_COLORS[0]![0],
      AXIS_COLORS[0]![1],
      AXIS_COLORS[0]![2],
      safeAlpha
    )
  }

  // Y ring (XZ plane)
  for (let i = 0; i < safeSegments; i++) {
    const a0 = (i / safeSegments) * Math.PI * 2
    const a1 = ((i + 1) / safeSegments) * Math.PI * 2
    pushLine(
      out,
      Math.cos(a0) * safeRadius,
      0,
      Math.sin(a0) * safeRadius,
      Math.cos(a1) * safeRadius,
      0,
      Math.sin(a1) * safeRadius,
      AXIS_COLORS[1]![0],
      AXIS_COLORS[1]![1],
      AXIS_COLORS[1]![2],
      safeAlpha
    )
  }

  // Z ring (XY plane)
  for (let i = 0; i < safeSegments; i++) {
    const a0 = (i / safeSegments) * Math.PI * 2
    const a1 = ((i + 1) / safeSegments) * Math.PI * 2
    pushLine(
      out,
      Math.cos(a0) * safeRadius,
      Math.sin(a0) * safeRadius,
      0,
      Math.cos(a1) * safeRadius,
      Math.sin(a1) * safeRadius,
      0,
      AXIS_COLORS[2]![0],
      AXIS_COLORS[2]![1],
      AXIS_COLORS[2]![2],
      safeAlpha
    )
  }

  return new Float32Array(out)
}
