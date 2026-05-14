/**
 * Canvas Click-to-World Raycasting
 *
 * Converts screen-space click coordinates to 3D world-space positions
 * by unprojecting through the inverse view-projection matrix and
 * intersecting with the bounding cube.
 *
 * @module rendering/webgpu/utils/raycasting
 */

import { invertMat4, multiplyMat4, transformPoint } from './sceneMath'

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

function missResult(): RaycastResult {
  return {
    hit: false,
    worldPosition: [0, 0, 0],
    rayOrigin: [0, 0, 0],
    rayDirection: [0, 0, 1],
  }
}

function isFiniteVector3(value: [number, number, number]): boolean {
  return value.every(Number.isFinite)
}

function hasFiniteRaycastInputs(
  clickX: number,
  clickY: number,
  canvasWidth: number,
  canvasHeight: number,
  boundingRadius: number
): boolean {
  return (
    Number.isFinite(clickX) &&
    Number.isFinite(clickY) &&
    Number.isFinite(canvasWidth) &&
    Number.isFinite(canvasHeight) &&
    Number.isFinite(boundingRadius) &&
    canvasWidth > 0 &&
    canvasHeight > 0 &&
    boundingRadius > 0
  )
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
  if (!hasFiniteRaycastInputs(clickX, clickY, canvasWidth, canvasHeight, boundingRadius)) {
    return missResult()
  }

  // Convert click to NDC [-1, 1]
  const ndcX = (2 * clickX) / canvasWidth - 1
  const ndcY = 1 - (2 * clickY) / canvasHeight

  // Compute inverse view-projection matrix
  const vp = multiplyMat4(projectionMatrix, viewMatrix)
  const invVP = invertMat4(vp)
  if (!invVP) {
    return missResult()
  }

  // Unproject near and far points
  const near = transformPoint(invVP, [ndcX, ndcY, -1])
  const far = transformPoint(invVP, [ndcX, ndcY, 1])
  if (!isFiniteVector3(near) || !isFiniteVector3(far)) {
    return missResult()
  }

  // Ray direction
  const dx = far[0] - near[0]
  const dy = far[1] - near[1]
  const dz = far[2] - near[2]
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz)
  if (!Number.isFinite(len) || len <= 0) {
    return missResult()
  }
  const dir: [number, number, number] = [dx / len, dy / len, dz / len]

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
  if (!isFiniteVector3(worldPosition)) {
    return missResult()
  }

  return { hit: true, worldPosition, rayOrigin: near, rayDirection: dir }
}

// ─── Ray-AABB intersection ───────────────────────────────────────────────

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
