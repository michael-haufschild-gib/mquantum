/**
 * Gizmo Geometry Generators
 *
 * Generates line-list vertex data for light gizmo rendering.
 * Each vertex is 7 floats: [x, y, z, r, g, b, a].
 * All geometry is generated in local space centered at origin.
 *
 * @module rendering/webgpu/passes/gizmoGeometry
 */

/** Floats per vertex: x, y, z, r, g, b, a */
const STRIDE = 7

/** Ground plane Y position */
const GROUND_Y = 0

/** Minimum height above ground for visualization */
const MIN_HEIGHT = 0.1

/** Maximum ellipse size to prevent extreme scaling */
const MAX_ELLIPSE_RADIUS = 50

/** Segments for ellipse/circle approximation */
const ELLIPSE_SEGMENTS = 64

/** Axis colors: Red=X, Green=Y, Blue=Z */
const AXIS_COLORS: [number, number, number][] = [
  [1, 0.2, 0.2],
  [0.2, 1, 0.2],
  [0.2, 0.2, 1],
]

// ==========================================================================
// Color Utilities
// ==========================================================================

/**
 * Parse hex color string to [r, g, b] in 0-1 range.
 * @param hex - Color string like '#FF0000' or '#f00'
 * @returns RGB tuple in 0-1 range
 */
function hexToRgb(hex: string): [number, number, number] {
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

// ==========================================================================
// Transform Helpers
// ==========================================================================

/**
 * Apply a quaternion rotation to a 3D point.
 * @param px - Point x
 * @param py - Point y
 * @param pz - Point z
 * @param qx - Quaternion x
 * @param qy - Quaternion y
 * @param qz - Quaternion z
 * @param qw - Quaternion w
 * @returns Rotated point [x, y, z]
 */
export function rotateByQuaternion(
  px: number,
  py: number,
  pz: number,
  qx: number,
  qy: number,
  qz: number,
  qw: number
): [number, number, number] {
  // q * p * q^-1
  const ix = qw * px + qy * pz - qz * py
  const iy = qw * py + qz * px - qx * pz
  const iz = qw * pz + qx * py - qy * px
  const iw = -qx * px - qy * py - qz * pz

  return [
    ix * qw + iw * -qx + iy * -qz - iz * -qy,
    iy * qw + iw * -qy + iz * -qx - ix * -qz,
    iz * qw + iw * -qz + ix * -qy - iy * -qx,
  ]
}

/**
 * Transform an array of line-list vertices: scale, rotate (quaternion), translate.
 * Modifies vertex positions in-place in `src` and appends to `dst`.
 * @param src - Source vertex data (STRIDE floats per vertex)
 * @param dst - Destination array to push into
 * @param scale - Uniform scale factor
 * @param qx - Quaternion x (0 for identity)
 * @param qy - Quaternion y (0 for identity)
 * @param qz - Quaternion z (0 for identity)
 * @param qw - Quaternion w (1 for identity)
 * @param tx - Translation x
 * @param ty - Translation y
 * @param tz - Translation z
 */
export function transformAndAppend(
  src: Float32Array,
  dst: number[],
  scale: number,
  qx: number,
  qy: number,
  qz: number,
  qw: number,
  tx: number,
  ty: number,
  tz: number
): void {
  const vertCount = src.length / STRIDE
  for (let v = 0; v < vertCount; v++) {
    const base = v * STRIDE
    let px = src[base]! * scale
    let py = src[base + 1]! * scale
    let pz = src[base + 2]! * scale

    // Rotate
    if (qx !== 0 || qy !== 0 || qz !== 0 || qw !== 1) {
      ;[px, py, pz] = rotateByQuaternion(px, py, pz, qx, qy, qz, qw)
    }

    // Translate + push with color
    dst.push(
      px + tx,
      py + ty,
      pz + tz,
      src[base + 3]!,
      src[base + 4]!,
      src[base + 5]!,
      src[base + 6]!
    )
  }
}

/**
 * Transform and append billboard geometry (selection ring).
 * Uses camera right/up vectors to orient the ring toward the camera.
 * @param src - Source vertex data (XY plane ring)
 * @param dst - Destination array
 * @param scale - Uniform scale factor
 * @param camRight - Camera right vector [x, y, z]
 * @param camUp - Camera up vector [x, y, z]
 * @param tx - World position x
 * @param ty - World position y
 * @param tz - World position z
 */
export function transformBillboardAndAppend(
  src: Float32Array,
  dst: number[],
  scale: number,
  camRight: [number, number, number],
  camUp: [number, number, number],
  tx: number,
  ty: number,
  tz: number
): void {
  const vertCount = src.length / STRIDE
  for (let v = 0; v < vertCount; v++) {
    const base = v * STRIDE
    const lx = src[base]! * scale
    const ly = src[base + 1]! * scale
    // src z is 0 for billboard geometry

    // Billboard: local X maps to camera right, local Y maps to camera up
    const wx = lx * camRight[0] + ly * camUp[0] + tx
    const wy = lx * camRight[1] + ly * camUp[1] + ty
    const wz = lx * camRight[2] + ly * camUp[2] + tz

    dst.push(wx, wy, wz, src[base + 3]!, src[base + 4]!, src[base + 5]!, src[base + 6]!)
  }
}

// ==========================================================================
// Ground Visualization Helpers
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

// ==========================================================================
// Transform Gizmo Geometry (Local-Space)
// ==========================================================================

/**
 * Generate translate gizmo: 3 axis arrows with arrowheads (R=X, G=Y, B=Z).
 * Centered at origin, extends along +X, +Y, +Z.
 * @param alpha - Opacity
 * @param shaftLength - Arrow shaft length
 * @returns Float32Array of line-list vertices
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
    [[0, 1, 0], [0, 0, 1]], // X axis perps
    [[1, 0, 0], [0, 0, 1]], // Y axis perps
    [[1, 0, 0], [0, 1, 0]], // Z axis perps
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
      tipX, tipY, tipZ,
      baseX + perpA[0] * headW, baseY + perpA[1] * headW, baseZ + perpA[2] * headW,
      r, g, b, alpha
    )
    pushLine(
      out,
      tipX, tipY, tipZ,
      baseX - perpA[0] * headW, baseY - perpA[1] * headW, baseZ - perpA[2] * headW,
      r, g, b, alpha
    )
    pushLine(
      out,
      tipX, tipY, tipZ,
      baseX + perpB[0] * headW, baseY + perpB[1] * headW, baseZ + perpB[2] * headW,
      r, g, b, alpha
    )
    pushLine(
      out,
      tipX, tipY, tipZ,
      baseX - perpB[0] * headW, baseY - perpB[1] * headW, baseZ - perpB[2] * headW,
      r, g, b, alpha
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
      0, Math.cos(a0) * radius, Math.sin(a0) * radius,
      0, Math.cos(a1) * radius, Math.sin(a1) * radius,
      AXIS_COLORS[0]![0], AXIS_COLORS[0]![1], AXIS_COLORS[0]![2], alpha
    )
  }

  // Y ring (XZ plane)
  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * Math.PI * 2
    const a1 = ((i + 1) / segments) * Math.PI * 2
    pushLine(
      out,
      Math.cos(a0) * radius, 0, Math.sin(a0) * radius,
      Math.cos(a1) * radius, 0, Math.sin(a1) * radius,
      AXIS_COLORS[1]![0], AXIS_COLORS[1]![1], AXIS_COLORS[1]![2], alpha
    )
  }

  // Z ring (XY plane)
  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * Math.PI * 2
    const a1 = ((i + 1) / segments) * Math.PI * 2
    pushLine(
      out,
      Math.cos(a0) * radius, Math.sin(a0) * radius, 0,
      Math.cos(a1) * radius, Math.sin(a1) * radius, 0,
      AXIS_COLORS[2]![0], AXIS_COLORS[2]![1], AXIS_COLORS[2]![2], alpha
    )
  }

  return new Float32Array(out)
}
