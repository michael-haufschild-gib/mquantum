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
    pushLine(out, 0, 0, 0, ax * shaftLength, ay * shaftLength, az * shaftLength, r, g, b, alpha)

    // Arrowhead
    const tipX = ax * shaftLength
    const tipY = ay * shaftLength
    const tipZ = az * shaftLength
    const baseX = ax * (shaftLength - headLen)
    const baseY = ay * (shaftLength - headLen)
    const baseZ = az * (shaftLength - headLen)

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
      alpha
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
      alpha
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
      alpha
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
      alpha
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

  // X ring (YZ plane)
  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * Math.PI * 2
    const a1 = ((i + 1) / segments) * Math.PI * 2
    pushLine(
      out,
      0,
      Math.cos(a0) * radius,
      Math.sin(a0) * radius,
      0,
      Math.cos(a1) * radius,
      Math.sin(a1) * radius,
      AXIS_COLORS[0]![0],
      AXIS_COLORS[0]![1],
      AXIS_COLORS[0]![2],
      alpha
    )
  }

  // Y ring (XZ plane)
  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * Math.PI * 2
    const a1 = ((i + 1) / segments) * Math.PI * 2
    pushLine(
      out,
      Math.cos(a0) * radius,
      0,
      Math.sin(a0) * radius,
      Math.cos(a1) * radius,
      0,
      Math.sin(a1) * radius,
      AXIS_COLORS[1]![0],
      AXIS_COLORS[1]![1],
      AXIS_COLORS[1]![2],
      alpha
    )
  }

  // Z ring (XY plane)
  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * Math.PI * 2
    const a1 = ((i + 1) / segments) * Math.PI * 2
    pushLine(
      out,
      Math.cos(a0) * radius,
      Math.sin(a0) * radius,
      0,
      Math.cos(a1) * radius,
      Math.sin(a1) * radius,
      0,
      AXIS_COLORS[2]![0],
      AXIS_COLORS[2]![1],
      AXIS_COLORS[2]![2],
      alpha
    )
  }

  return new Float32Array(out)
}
