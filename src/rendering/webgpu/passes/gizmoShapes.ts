/**
 * Gizmo Shape Generators
 *
 * Generates wireframe shapes for light gizmo rendering:
 * icosahedron (point), octahedron (directional), arrow, cone (spot),
 * sphere, and selection ring.
 *
 * @module rendering/webgpu/passes/gizmoShapes
 */

import { hexToRgb, pushLine } from './gizmoPrimitives'

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
  const out: number[] = []

  for (const [i0, i1] of ICO_EDGES) {
    const v0 = ICO_VERTS[i0]!
    const v1 = ICO_VERTS[i1]!
    pushLine(out, v0[0], v0[1], v0[2], v1[0], v1[1], v1[2], r, g, b, alpha)
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
  const out: number[] = []

  for (const [i0, i1] of OCT_EDGES) {
    const v0 = OCT_VERTS[i0]!
    const v1 = OCT_VERTS[i1]!
    pushLine(out, v0[0], v0[1], v0[2], v1[0], v1[1], v1[2], r, g, b, alpha)
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
  const out: number[] = []

  // Shaft from origin downward
  pushLine(out, 0, 0, 0, 0, -length, 0, r, g, b, alpha)

  // Arrowhead (3 lines forming a cone tip)
  const headLen = 0.3
  const headW = 0.15
  const tipY = -length
  const baseY = tipY + headLen
  pushLine(out, 0, tipY, 0, headW, baseY, 0, r, g, b, alpha)
  pushLine(out, 0, tipY, 0, -headW, baseY, 0, r, g, b, alpha)
  pushLine(out, 0, tipY, 0, 0, baseY, headW, r, g, b, alpha)
  pushLine(out, 0, tipY, 0, 0, baseY, -headW, r, g, b, alpha)

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
  const out: number[] = []

  const clampedAngle = Math.min(coneAngleDeg, 89)
  const radius = Math.tan((clampedAngle * Math.PI) / 180) * height
  const baseY = -height

  // Base circle
  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * Math.PI * 2
    const a1 = ((i + 1) / segments) * Math.PI * 2
    const x0 = Math.cos(a0) * radius
    const z0 = Math.sin(a0) * radius
    const x1 = Math.cos(a1) * radius
    const z1 = Math.sin(a1) * radius
    pushLine(out, x0, baseY, z0, x1, baseY, z1, r, g, b, alpha)
  }

  // Lines from apex to base circle (4 ribs)
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2
    const x = Math.cos(a) * radius
    const z = Math.sin(a) * radius
    pushLine(out, 0, 0, 0, x, baseY, z, r, g, b, alpha)
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
  const out: number[] = []

  // XY circle
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
      r,
      g,
      b,
      alpha
    )
  }
  // XZ circle
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
      r,
      g,
      b,
      alpha
    )
  }
  // YZ circle
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
      r,
      g,
      b,
      alpha
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
  const r = 0,
    g = 1,
    b = 0,
    a = 0.8
  const out: number[] = []

  // Inner circle
  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * Math.PI * 2
    const a1 = ((i + 1) / segments) * Math.PI * 2
    pushLine(
      out,
      Math.cos(a0) * innerRadius,
      Math.sin(a0) * innerRadius,
      0,
      Math.cos(a1) * innerRadius,
      Math.sin(a1) * innerRadius,
      0,
      r,
      g,
      b,
      a
    )
  }
  // Outer circle
  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * Math.PI * 2
    const a1 = ((i + 1) / segments) * Math.PI * 2
    pushLine(
      out,
      Math.cos(a0) * outerRadius,
      Math.sin(a0) * outerRadius,
      0,
      Math.cos(a1) * outerRadius,
      Math.sin(a1) * outerRadius,
      0,
      r,
      g,
      b,
      a
    )
  }
  // Radial spokes connecting inner to outer (every 4 segments)
  for (let i = 0; i < segments; i += 4) {
    const angle = (i / segments) * Math.PI * 2
    pushLine(
      out,
      Math.cos(angle) * innerRadius,
      Math.sin(angle) * innerRadius,
      0,
      Math.cos(angle) * outerRadius,
      Math.sin(angle) * outerRadius,
      0,
      r,
      g,
      b,
      a
    )
  }

  return new Float32Array(out)
}
