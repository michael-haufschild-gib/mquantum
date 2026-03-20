/**
 * Gizmo Ground Visualization
 *
 * Ray-ground intersection calculations and ground-plane geometry generators
 * for light gizmo rendering (ellipses, circles, targets, dashed lines).
 *
 * @module rendering/webgpu/passes/gizmoGround
 */

import { GROUND_Y, hexToRgb, MIN_HEIGHT, pushLine } from './gizmoPrimitives'

/** Maximum ellipse size to prevent extreme scaling */
const MAX_ELLIPSE_RADIUS = 50

/** Segments for ellipse/circle approximation */
const ELLIPSE_SEGMENTS = 64

// ==========================================================================
// Ground Intersection Calculations
// ==========================================================================

/**
 * Calculate ray-ground intersection point.
 * Returns null if light is below ground or direction points upward.
 * @param position - Light world position [x, y, z]
 * @param direction - Normalized direction vector [x, y, z]
 * @returns Intersection point [x, y, z] or null
 */
export function calculateGroundIntersection(
  position: [number, number, number],
  direction: [number, number, number]
): [number, number, number] | null {
  const [px, py, pz] = position
  const [dx, dy, dz] = direction

  if (py <= GROUND_Y + MIN_HEIGHT) return null
  if (dy >= 0) return null

  const t = (GROUND_Y - py) / dy
  if (t <= 0) return null

  return [px + t * dx, GROUND_Y, pz + t * dz]
}

/**
 * Calculate point light sphere-ground intersection.
 * Returns circle center and radius, or null if no intersection.
 * @param position - Light position [x, y, z]
 * @param range - Light range (sphere radius). 0 = infinite, no visualization.
 * @returns Circle center [x, y, z] and radius, or null
 */
export function calculateSphereGroundIntersection(
  position: [number, number, number],
  range: number
): { center: [number, number, number]; radius: number } | null {
  const [px, py, pz] = position
  if (range <= 0 || py <= 0 || py >= range) return null

  const circleRadius = Math.sqrt(range * range - py * py)
  return {
    center: [px, GROUND_Y + 0.01, pz],
    radius: circleRadius,
  }
}

// ==========================================================================
// Ground Visualization Geometry (World-Space)
// ==========================================================================

/**
 * Generate dashed line from start to end in world space.
 * @param x0 - Start x
 * @param y0 - Start y
 * @param z0 - Start z
 * @param x1 - End x
 * @param y1 - End y
 * @param z1 - End z
 * @param color - Hex color string
 * @param alpha - Opacity
 * @param dashSize - Length of each dash
 * @param gapSize - Length of each gap
 * @returns Array of vertex floats (push directly into allVertices)
 */
export function generateDashedLine(
  x0: number,
  y0: number,
  z0: number,
  x1: number,
  y1: number,
  z1: number,
  color: string,
  alpha: number,
  dashSize = 0.3,
  gapSize = 0.15
): number[] {
  const [r, g, b] = hexToRgb(color)
  const out: number[] = []

  const dx = x1 - x0
  const dy = y1 - y0
  const dz = z1 - z0
  const totalLen = Math.sqrt(dx * dx + dy * dy + dz * dz)
  if (totalLen < 0.001) return out

  const nx = dx / totalLen
  const ny = dy / totalLen
  const nz = dz / totalLen

  let t = 0
  let drawing = true
  while (t < totalLen) {
    const segLen = drawing ? dashSize : gapSize
    const end = Math.min(t + segLen, totalLen)
    if (drawing) {
      pushLine(
        out,
        x0 + nx * t,
        y0 + ny * t,
        z0 + nz * t,
        x0 + nx * end,
        y0 + ny * end,
        z0 + nz * end,
        r,
        g,
        b,
        alpha
      )
    }
    t = end
    drawing = !drawing
  }

  return out
}

/**
 * Generate ellipse outline on ground plane for spotlight cone intersection.
 * @param position - Light position [x, y, z]
 * @param direction - Light direction (normalized) [x, y, z]
 * @param coneAngle - Cone half-angle in degrees
 * @param intersection - Ground intersection point [x, y, z]
 * @param color - Hex color string
 * @param alpha - Opacity
 * @returns Array of vertex floats
 */
export function generateGroundEllipse(
  position: [number, number, number],
  direction: [number, number, number],
  coneAngle: number,
  intersection: [number, number, number],
  color: string,
  alpha: number
): number[] {
  const [r, g, b] = hexToRgb(color)
  const out: number[] = []

  const dx = intersection[0] - position[0]
  const dy = intersection[1] - position[1]
  const dz = intersection[2] - position[2]
  const distance = Math.sqrt(dx * dx + dy * dy + dz * dz)

  const coneRadians = (Math.min(coneAngle, 89) * Math.PI) / 180
  const baseRadius = distance * Math.tan(coneRadians)

  const cosAngle = Math.abs(direction[1])
  const semiMajor = Math.min(baseRadius / Math.max(cosAngle, 0.1), MAX_ELLIPSE_RADIUS)
  const semiMinor = Math.min(baseRadius, MAX_ELLIPSE_RADIUS)

  const ellipseRotation = Math.atan2(direction[0], direction[2])
  const cosR = Math.cos(ellipseRotation)
  const sinR = Math.sin(ellipseRotation)

  const ix = intersection[0]
  const iz = intersection[2]

  for (let i = 0; i < ELLIPSE_SEGMENTS; i++) {
    const a0 = (i / ELLIPSE_SEGMENTS) * Math.PI * 2
    const a1 = ((i + 1) / ELLIPSE_SEGMENTS) * Math.PI * 2

    const lx0 = Math.cos(a0) * semiMinor
    const lz0 = Math.sin(a0) * semiMajor
    const lx1 = Math.cos(a1) * semiMinor
    const lz1 = Math.sin(a1) * semiMajor

    pushLine(
      out,
      ix + lx0 * cosR - lz0 * sinR,
      GROUND_Y + 0.01,
      iz + lx0 * sinR + lz0 * cosR,
      ix + lx1 * cosR - lz1 * sinR,
      GROUND_Y + 0.01,
      iz + lx1 * sinR + lz1 * cosR,
      r,
      g,
      b,
      alpha
    )
  }

  return out
}

/**
 * Generate circle outline on ground plane for point light range.
 * @param centerX - Circle center X
 * @param centerZ - Circle center Z
 * @param radius - Circle radius
 * @param color - Hex color string
 * @param alpha - Opacity
 * @param segments - Number of line segments
 * @returns Array of vertex floats
 */
export function generateGroundCircle(
  centerX: number,
  centerZ: number,
  radius: number,
  color: string,
  alpha: number,
  segments = 64
): number[] {
  const [r, g, b] = hexToRgb(color)
  const out: number[] = []

  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * Math.PI * 2
    const a1 = ((i + 1) / segments) * Math.PI * 2
    pushLine(
      out,
      centerX + Math.cos(a0) * radius,
      GROUND_Y + 0.01,
      centerZ + Math.sin(a0) * radius,
      centerX + Math.cos(a1) * radius,
      GROUND_Y + 0.01,
      centerZ + Math.sin(a1) * radius,
      r,
      g,
      b,
      alpha
    )
  }

  return out
}

/**
 * Generate ground target ring (outer + inner ring with crosshairs).
 * @param centerX - Target center X
 * @param centerZ - Target center Z
 * @param color - Hex color string
 * @param alpha - Opacity
 * @param outerRadius - Outer ring radius
 * @param segments - Ring segments
 * @returns Array of vertex floats
 */
export function generateGroundTarget(
  centerX: number,
  centerZ: number,
  color: string,
  alpha: number,
  outerRadius = 0.5,
  segments = 32
): number[] {
  const [r, g, b] = hexToRgb(color)
  const out: number[] = []

  const innerRadius = outerRadius * 0.6

  // Outer circle
  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * Math.PI * 2
    const a1 = ((i + 1) / segments) * Math.PI * 2
    pushLine(
      out,
      centerX + Math.cos(a0) * outerRadius,
      GROUND_Y + 0.02,
      centerZ + Math.sin(a0) * outerRadius,
      centerX + Math.cos(a1) * outerRadius,
      GROUND_Y + 0.02,
      centerZ + Math.sin(a1) * outerRadius,
      r,
      g,
      b,
      alpha
    )
  }

  // Inner circle
  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * Math.PI * 2
    const a1 = ((i + 1) / segments) * Math.PI * 2
    pushLine(
      out,
      centerX + Math.cos(a0) * innerRadius,
      GROUND_Y + 0.02,
      centerZ + Math.sin(a0) * innerRadius,
      centerX + Math.cos(a1) * innerRadius,
      GROUND_Y + 0.02,
      centerZ + Math.sin(a1) * innerRadius,
      r,
      g,
      b,
      alpha
    )
  }

  // Cross lines
  pushLine(
    out,
    centerX - outerRadius,
    GROUND_Y + 0.02,
    centerZ,
    centerX + outerRadius,
    GROUND_Y + 0.02,
    centerZ,
    r,
    g,
    b,
    alpha * 0.5
  )
  pushLine(
    out,
    centerX,
    GROUND_Y + 0.02,
    centerZ - outerRadius,
    centerX,
    GROUND_Y + 0.02,
    centerZ + outerRadius,
    r,
    g,
    b,
    alpha * 0.5
  )

  return out
}
