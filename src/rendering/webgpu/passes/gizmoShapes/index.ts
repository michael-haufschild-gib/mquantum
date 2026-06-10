/**
 * Gizmo Shape Generators
 *
 * Generates wireframe shapes for light gizmo rendering:
 * icosahedron (point), octahedron (directional), arrow, cone (spot),
 * sphere, and selection ring.
 *
 * @module rendering/webgpu/passes/gizmoShapes
 */

import { hexToRgb, pushLine } from '../gizmoPrimitives'

const DEFAULT_ALPHA = 1
const DEFAULT_ARROW_LENGTH = 2.0
const DEFAULT_CONE_ANGLE_DEG = 1
const DEFAULT_CONE_SEGMENTS = 16
const DEFAULT_CONE_HEIGHT = 2.0
const DEFAULT_SPHERE_RADIUS = 0.3
const DEFAULT_SPHERE_SEGMENTS = 12
const DEFAULT_RING_INNER_RADIUS = 1.2
const DEFAULT_RING_OUTER_RADIUS = 1.4
const DEFAULT_RING_SEGMENTS = 32
const MIN_SEGMENTS = 3
const MAX_SEGMENTS = 256
const MIN_CONE_ANGLE_DEG = 1
const MAX_CONE_ANGLE_DEG = 89

function sanitizeAlpha(alpha: number): number {
  if (!Number.isFinite(alpha)) return DEFAULT_ALPHA
  return Math.min(Math.max(alpha, 0), 1)
}

function sanitizePositive(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback
}

function sanitizeSegments(segments: number, fallback: number): number {
  if (!Number.isFinite(segments)) return fallback
  return Math.min(Math.max(Math.trunc(segments), MIN_SEGMENTS), MAX_SEGMENTS)
}

function sanitizeConeAngleDeg(angle: number): number {
  if (!Number.isFinite(angle)) return DEFAULT_CONE_ANGLE_DEG
  return Math.min(Math.max(angle, MIN_CONE_ANGLE_DEG), MAX_CONE_ANGLE_DEG)
}

// ==========================================================================
// Icosahedron Wireframe (Point Light)
// ==========================================================================

/** Golden ratio */
const PHI = (1 + Math.sqrt(5)) / 2

/** Icosahedron vertices (normalized to unit sphere) */
const ICO_VERTS: [number, number, number][] = (() => {
  const raw: [number, number, number][] = [
    [-1, PHI, 0],
    [1, PHI, 0],
    [-1, -PHI, 0],
    [1, -PHI, 0],
    [0, -1, PHI],
    [0, 1, PHI],
    [0, -1, -PHI],
    [0, 1, -PHI],
    [PHI, 0, -1],
    [PHI, 0, 1],
    [-PHI, 0, -1],
    [-PHI, 0, 1],
  ]
  return raw.map(([x, y, z]) => {
    const len = Math.sqrt(x * x + y * y + z * z)
    return [x / len, y / len, z / len] as [number, number, number]
  })
})()

/** Icosahedron edge pairs (vertex indices) */
const ICO_EDGES: [number, number][] = [
  [0, 11],
  [0, 5],
  [0, 1],
  [0, 7],
  [0, 10],
  [1, 5],
  [1, 9],
  [1, 8],
  [1, 7],
  [2, 11],
  [2, 4],
  [2, 3],
  [2, 6],
  [2, 10],
  [3, 4],
  [3, 9],
  [3, 8],
  [3, 6],
  [4, 5],
  [4, 9],
  [4, 11],
  [5, 9],
  [5, 11],
  [6, 7],
  [6, 8],
  [6, 10],
  [7, 8],
  [7, 10],
  [8, 9],
  [10, 11],
]

/**
 * Generate wireframe icosahedron for point lights.
 * @param color - Hex color string
 * @param alpha - Opacity (0-1)
 * @returns Float32Array of line-list vertices
 */
export function generateIcosahedronWireframe(color: string, alpha: number): Float32Array {
  const [r, g, b] = hexToRgb(color)
  const safeAlpha = sanitizeAlpha(alpha)
  const out: number[] = []

  for (const [i0, i1] of ICO_EDGES) {
    const v0 = ICO_VERTS[i0]!
    const v1 = ICO_VERTS[i1]!
    pushLine(out, v0[0], v0[1], v0[2], v1[0], v1[1], v1[2], r, g, b, safeAlpha)
  }

  return new Float32Array(out)
}

// ==========================================================================
// Octahedron Wireframe (Directional Light)
// ==========================================================================

/** Octahedron vertices (unit distance along each axis) */
const OCT_VERTS: [number, number, number][] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
]

/** Octahedron edges */
const OCT_EDGES: [number, number][] = [
  [0, 2],
  [0, 3],
  [0, 4],
  [0, 5],
  [1, 2],
  [1, 3],
  [1, 4],
  [1, 5],
  [2, 4],
  [2, 5],
  [3, 4],
  [3, 5],
]

/**
 * Generate wireframe octahedron for directional lights.
 * @param color - Hex color string
 * @param alpha - Opacity (0-1)
 * @returns Float32Array of line-list vertices
 */
export function generateOctahedronWireframe(color: string, alpha: number): Float32Array {
  const [r, g, b] = hexToRgb(color)
  const safeAlpha = sanitizeAlpha(alpha)
  const out: number[] = []

  for (const [i0, i1] of OCT_EDGES) {
    const v0 = OCT_VERTS[i0]!
    const v1 = OCT_VERTS[i1]!
    pushLine(out, v0[0], v0[1], v0[2], v1[0], v1[1], v1[2], r, g, b, safeAlpha)
  }

  return new Float32Array(out)
}

// ==========================================================================
// Direction Arrow
// ==========================================================================

/**
 * Generate an arrow from origin along -Y (default direction).
 * The arrow is later rotated to match light direction.
 * @param color - Hex color string
 * @param alpha - Opacity (0-1)
 * @param length - Arrow shaft length
 * @returns Float32Array of line-list vertices
 */
export function generateArrow(color: string, alpha: number, length = 2.0): Float32Array {
  const [r, g, b] = hexToRgb(color)
  const safeAlpha = sanitizeAlpha(alpha)
  const safeLength = sanitizePositive(length, DEFAULT_ARROW_LENGTH)
  const out: number[] = []

  // Shaft from origin downward
  pushLine(out, 0, 0, 0, 0, -safeLength, 0, r, g, b, safeAlpha)

  // Arrowhead (3 lines forming a cone tip)
  const headLen = 0.3
  const headW = 0.15
  const tipY = -safeLength
  const baseY = tipY + headLen
  pushLine(out, 0, tipY, 0, headW, baseY, 0, r, g, b, safeAlpha)
  pushLine(out, 0, tipY, 0, -headW, baseY, 0, r, g, b, safeAlpha)
  pushLine(out, 0, tipY, 0, 0, baseY, headW, r, g, b, safeAlpha)
  pushLine(out, 0, tipY, 0, 0, baseY, -headW, r, g, b, safeAlpha)

  return new Float32Array(out)
}

// ==========================================================================
// Cone Wireframe (Spot Light)
// ==========================================================================

/**
 * Generate wireframe cone for spot lights.
 * Cone extends along -Y from origin.
 * @param coneAngleDeg - Cone half-angle in degrees
 * @param color - Hex color string
 * @param alpha - Opacity (0-1)
 * @param segments - Number of circle segments
 * @param height - Cone height
 * @returns Float32Array of line-list vertices
 */
export function generateConeWireframe(
  coneAngleDeg: number,
  color: string,
  alpha: number,
  segments = 16,
  height = 2.0
): Float32Array {
  const [r, g, b] = hexToRgb(color)
  const safeAlpha = sanitizeAlpha(alpha)
  const safeSegments = sanitizeSegments(segments, DEFAULT_CONE_SEGMENTS)
  const safeHeight = sanitizePositive(height, DEFAULT_CONE_HEIGHT)
  const out: number[] = []

  const clampedAngle = sanitizeConeAngleDeg(coneAngleDeg)
  const radius = Math.tan((clampedAngle * Math.PI) / 180) * safeHeight
  const baseY = -safeHeight

  // Base circle
  for (let i = 0; i < safeSegments; i++) {
    const a0 = (i / safeSegments) * Math.PI * 2
    const a1 = ((i + 1) / safeSegments) * Math.PI * 2
    const x0 = Math.cos(a0) * radius
    const z0 = Math.sin(a0) * radius
    const x1 = Math.cos(a1) * radius
    const z1 = Math.sin(a1) * radius
    pushLine(out, x0, baseY, z0, x1, baseY, z1, r, g, b, safeAlpha)
  }

  // Lines from apex to base circle (4 ribs)
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2
    const x = Math.cos(a) * radius
    const z = Math.sin(a) * radius
    pushLine(out, 0, 0, 0, x, baseY, z, r, g, b, safeAlpha)
  }

  return new Float32Array(out)
}

// ==========================================================================
// Small Sphere Wireframe (Spot Light Apex)
// ==========================================================================

/**
 * Generate wireframe sphere (3 great circles).
 * @param color - Hex color string
 * @param alpha - Opacity (0-1)
 * @param radius - Sphere radius
 * @param segments - Segments per circle
 * @returns Float32Array of line-list vertices
 */
export function generateSphereWireframe(
  color: string,
  alpha: number,
  radius = 0.3,
  segments = 12
): Float32Array {
  const [r, g, b] = hexToRgb(color)
  const safeAlpha = sanitizeAlpha(alpha)
  const safeRadius = sanitizePositive(radius, DEFAULT_SPHERE_RADIUS)
  const safeSegments = sanitizeSegments(segments, DEFAULT_SPHERE_SEGMENTS)
  const out: number[] = []

  // XY circle
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
      r,
      g,
      b,
      safeAlpha
    )
  }
  // XZ circle
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
      r,
      g,
      b,
      safeAlpha
    )
  }
  // YZ circle
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
      r,
      g,
      b,
      safeAlpha
    )
  }

  return new Float32Array(out)
}

// ==========================================================================
// Selection Ring
// ==========================================================================

/**
 * Generate a billboard selection ring (in XY plane, billboarded in shader).
 * @param innerRadius - Inner radius
 * @param outerRadius - Outer radius
 * @param segments - Number of segments
 * @returns Float32Array of line-list vertices (green, alpha 0.8)
 */
export function generateSelectionRing(
  innerRadius = 1.2,
  outerRadius = 1.4,
  segments = 32
): Float32Array {
  const safeInnerRadius = sanitizePositive(innerRadius, DEFAULT_RING_INNER_RADIUS)
  const requestedOuterRadius = sanitizePositive(outerRadius, DEFAULT_RING_OUTER_RADIUS)
  const safeOuterRadius =
    requestedOuterRadius > safeInnerRadius
      ? requestedOuterRadius
      : Math.max(DEFAULT_RING_OUTER_RADIUS, safeInnerRadius + 0.1)
  const safeSegments = sanitizeSegments(segments, DEFAULT_RING_SEGMENTS)
  const r = 0,
    g = 1,
    b = 0,
    a = 0.8
  const out: number[] = []

  // Inner circle
  for (let i = 0; i < safeSegments; i++) {
    const a0 = (i / safeSegments) * Math.PI * 2
    const a1 = ((i + 1) / safeSegments) * Math.PI * 2
    pushLine(
      out,
      Math.cos(a0) * safeInnerRadius,
      Math.sin(a0) * safeInnerRadius,
      0,
      Math.cos(a1) * safeInnerRadius,
      Math.sin(a1) * safeInnerRadius,
      0,
      r,
      g,
      b,
      a
    )
  }
  // Outer circle
  for (let i = 0; i < safeSegments; i++) {
    const a0 = (i / safeSegments) * Math.PI * 2
    const a1 = ((i + 1) / safeSegments) * Math.PI * 2
    pushLine(
      out,
      Math.cos(a0) * safeOuterRadius,
      Math.sin(a0) * safeOuterRadius,
      0,
      Math.cos(a1) * safeOuterRadius,
      Math.sin(a1) * safeOuterRadius,
      0,
      r,
      g,
      b,
      a
    )
  }
  // Radial spokes connecting inner to outer (every 4 segments)
  for (let i = 0; i < safeSegments; i += 4) {
    const angle = (i / safeSegments) * Math.PI * 2
    pushLine(
      out,
      Math.cos(angle) * safeInnerRadius,
      Math.sin(angle) * safeInnerRadius,
      0,
      Math.cos(angle) * safeOuterRadius,
      Math.sin(angle) * safeOuterRadius,
      0,
      r,
      g,
      b,
      a
    )
  }

  return new Float32Array(out)
}
