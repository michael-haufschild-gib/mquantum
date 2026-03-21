/**
 * Canvas Click-to-World Raycasting
 *
 * Converts screen-space click coordinates to 3D world-space positions
 * by unprojecting through the inverse view-projection matrix and
 * intersecting with the bounding cube.
 *
 * @module rendering/webgpu/utils/raycasting
 */

/** Result of a raycast from screen space into the 3D volume. */
export interface RaycastResult {
  /** Whether the ray intersected the bounding volume */
  hit: boolean
  /** 3D world-space position of the intersection (midpoint of entry/exit) */
  worldPosition: [number, number, number]
  /** Ray origin in world space */
  rayOrigin: [number, number, number]
  /** Normalized ray direction in world space */
  rayDirection: [number, number, number]
}

/**
 * Raycast from a canvas click position into the 3D bounding volume.
 *
 * @param clickX - Click X relative to canvas (pixels)
 * @param clickY - Click Y relative to canvas (pixels)
 * @param canvasWidth - Canvas width (pixels)
 * @param canvasHeight - Canvas height (pixels)
 * @param viewMatrix - 4x4 column-major view matrix (Float32Array[16])
 * @param projectionMatrix - 4x4 column-major projection matrix (Float32Array[16])
 * @param boundingRadius - Half-extent of the cubic bounding volume
 * @returns Raycast result with hit status and world position
 */
export function raycastCanvas(
  clickX: number,
  clickY: number,
  canvasWidth: number,
  canvasHeight: number,
  viewMatrix: Float32Array,
  projectionMatrix: Float32Array,
  boundingRadius: number
): RaycastResult {
  // Convert click to NDC [-1, 1]
  const ndcX = (2 * clickX) / canvasWidth - 1
  const ndcY = 1 - (2 * clickY) / canvasHeight

  // Compute inverse view-projection matrix
  const vp = multiplyMat4(projectionMatrix, viewMatrix)
  const invVP = invertMat4(vp)
  if (!invVP) {
    return { hit: false, worldPosition: [0, 0, 0], rayOrigin: [0, 0, 0], rayDirection: [0, 0, 1] }
  }

  // Unproject near and far points
  const near = transformPoint(invVP, [ndcX, ndcY, -1])
  const far = transformPoint(invVP, [ndcX, ndcY, 1])

  // Ray direction
  const dx = far[0] - near[0]
  const dy = far[1] - near[1]
  const dz = far[2] - near[2]
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz)
  const dir: [number, number, number] = len > 0 ? [dx / len, dy / len, dz / len] : [0, 0, 1]

  // AABB intersection with [-br, br]^3
  const br = boundingRadius
  const { tMin, tMax, hit } = rayAABB(near, dir, -br, br)

  if (!hit) {
    return { hit: false, worldPosition: [0, 0, 0], rayOrigin: near, rayDirection: dir }
  }

  // Midpoint of intersection = "click inside volume" semantic
  const tMid = (tMin + tMax) * 0.5
  const worldPosition: [number, number, number] = [
    near[0] + dir[0] * tMid,
    near[1] + dir[1] * tMid,
    near[2] + dir[2] * tMid,
  ]

  return { hit: true, worldPosition, rayOrigin: near, rayDirection: dir }
}

// ─── Matrix utilities (column-major 4x4) ─────────────────────────────────

function multiplyMat4(a: Float32Array, b: Float32Array): Float32Array {
  const out = new Float32Array(16)
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      out[col * 4 + row] =
        a[0 * 4 + row]! * b[col * 4 + 0]! +
        a[1 * 4 + row]! * b[col * 4 + 1]! +
        a[2 * 4 + row]! * b[col * 4 + 2]! +
        a[3 * 4 + row]! * b[col * 4 + 3]!
    }
  }
  return out
}

function invertMat4(m: Float32Array): Float32Array | null {
  const inv = new Float32Array(16)
  const m00 = m[0]!,
    m01 = m[1]!,
    m02 = m[2]!,
    m03 = m[3]!
  const m10 = m[4]!,
    m11 = m[5]!,
    m12 = m[6]!,
    m13 = m[7]!
  const m20 = m[8]!,
    m21 = m[9]!,
    m22 = m[10]!,
    m23 = m[11]!
  const m30 = m[12]!,
    m31 = m[13]!,
    m32 = m[14]!,
    m33 = m[15]!

  const b00 = m00 * m11 - m01 * m10,
    b01 = m00 * m12 - m02 * m10
  const b02 = m00 * m13 - m03 * m10,
    b03 = m01 * m12 - m02 * m11
  const b04 = m01 * m13 - m03 * m11,
    b05 = m02 * m13 - m03 * m12
  const b06 = m20 * m31 - m21 * m30,
    b07 = m20 * m32 - m22 * m30
  const b08 = m20 * m33 - m23 * m30,
    b09 = m21 * m32 - m22 * m31
  const b10 = m21 * m33 - m23 * m31,
    b11 = m22 * m33 - m23 * m32

  let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06
  if (Math.abs(det) < 1e-12) return null
  det = 1.0 / det

  inv[0] = (m11 * b11 - m12 * b10 + m13 * b09) * det
  inv[1] = (m02 * b10 - m01 * b11 - m03 * b09) * det
  inv[2] = (m31 * b05 - m32 * b04 + m33 * b03) * det
  inv[3] = (m22 * b04 - m21 * b05 - m23 * b03) * det
  inv[4] = (m12 * b08 - m10 * b11 - m13 * b07) * det
  inv[5] = (m00 * b11 - m02 * b08 + m03 * b07) * det
  inv[6] = (m32 * b02 - m30 * b05 - m33 * b01) * det
  inv[7] = (m20 * b05 - m22 * b02 + m23 * b01) * det
  inv[8] = (m10 * b10 - m11 * b08 + m13 * b06) * det
  inv[9] = (m01 * b08 - m00 * b10 - m03 * b06) * det
  inv[10] = (m30 * b04 - m31 * b02 + m33 * b00) * det
  inv[11] = (m21 * b02 - m20 * b04 - m23 * b00) * det
  inv[12] = (m11 * b07 - m10 * b09 - m12 * b06) * det
  inv[13] = (m00 * b09 - m01 * b07 + m02 * b06) * det
  inv[14] = (m31 * b01 - m30 * b03 - m32 * b00) * det
  inv[15] = (m20 * b03 - m21 * b01 + m22 * b00) * det
  return inv
}

function transformPoint(m: Float32Array, p: [number, number, number]): [number, number, number] {
  const x = p[0],
    y = p[1],
    z = p[2]
  const w = m[3]! * x + m[7]! * y + m[11]! * z + m[15]!
  const iw = w !== 0 ? 1 / w : 1
  return [
    (m[0]! * x + m[4]! * y + m[8]! * z + m[12]!) * iw,
    (m[1]! * x + m[5]! * y + m[9]! * z + m[13]!) * iw,
    (m[2]! * x + m[6]! * y + m[10]! * z + m[14]!) * iw,
  ]
}

function rayAABB(
  origin: [number, number, number],
  dir: [number, number, number],
  bMin: number,
  bMax: number
): { tMin: number; tMax: number; hit: boolean } {
  let tMin = -Infinity
  let tMax = Infinity
  for (let i = 0; i < 3; i++) {
    const d = dir[i]!
    const o = origin[i]!
    if (Math.abs(d) < 1e-12) {
      if (o < bMin || o > bMax) return { tMin: 0, tMax: 0, hit: false }
    } else {
      const invD = 1 / d
      let t1 = (bMin - o) * invD
      let t2 = (bMax - o) * invD
      if (t1 > t2) {
        const tmp = t1
        t1 = t2
        t2 = tmp
      }
      tMin = Math.max(tMin, t1)
      tMax = Math.min(tMax, t2)
      if (tMin > tMax) return { tMin: 0, tMax: 0, hit: false }
    }
  }
  return { tMin: Math.max(tMin, 0), tMax, hit: tMax >= 0 }
}
