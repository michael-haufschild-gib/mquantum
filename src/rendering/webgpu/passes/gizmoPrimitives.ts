/**
 * Gizmo Primitives
 *
 * Shared constants and low-level helpers used by gizmo geometry modules.
 * Each vertex is 7 floats: [x, y, z, r, g, b, a].
 *
 * @module rendering/webgpu/passes/gizmoPrimitives
 */

/** Floats per vertex: x, y, z, r, g, b, a */
export const STRIDE = 7

/** Ground plane Y position */
export const GROUND_Y = 0

/** Minimum height above ground for visualization */
export const MIN_HEIGHT = 0.1

/**
 * Parse hex color string to [r, g, b] in 0-1 range.
 * @param hex - Color string like '#FF0000' or '#f00'
 * @returns RGB tuple in 0-1 range
 */
export function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace('#', '')
  if (h.length === 3) {
    h = h[0]! + h[0]! + h[1]! + h[1]! + h[2]! + h[2]!
  }
  const n = parseInt(h, 16)
  return [(n >> 16) / 255, ((n >> 8) & 0xff) / 255, (n & 0xff) / 255]
}

/**
 * Push a line segment (2 vertices) into the output array.
 */
export function pushLine(
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
