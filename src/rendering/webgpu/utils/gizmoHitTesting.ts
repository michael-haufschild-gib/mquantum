/**
 * Gizmo hit-testing utilities for scene-level light interaction.
 *
 * Provides raycasting, axis/ring hit detection, and ground target
 * intersection for translate/rotate gizmos.
 *
 * @module rendering/webgpu/utils/gizmoHitTesting
 */

import { rotationToDirection } from '@/lib/lighting/lightSource'

import {
  calculateGroundIntersection,
  calculateSphereGroundIntersection,
} from '../passes/gizmoGround'
import { invertMat4, multiplyMat4, transformPoint } from './sceneMath'

/** Gizmo scale formula (matches LightGizmoPass) */
const GIZMO_BASE_SIZE = 0.3

/** Translate gizmo shaft length (matches generateTranslateGizmo default) */
const TRANSLATE_SHAFT = 3.0
/** Rotate gizmo ring radius (matches generateRotateGizmo default) */
const ROTATE_RING_RADIUS = 2.5
/** Hit threshold in world units (before scaling) */
const AXIS_HIT_THRESHOLD = 0.4
/** Ground target hit radius */
const GROUND_TARGET_RADIUS = 0.5

/** Discriminator for which gizmo axis or ring was grabbed. */
export type GizmoDragKind =
  | 'translate-x'
  | 'translate-y'
  | 'translate-z'
  | 'rotate-x'
  | 'rotate-y'
  | 'rotate-z'
  | 'ground-target'

/** Mutable state for an active gizmo drag operation. */
export interface GizmoDragState {
  kind: GizmoDragKind
  lightId: string
  startLightPos: [number, number, number]
  startLightRot: [number, number, number]
  /** For translate: initial parameter along grabbed axis */
  startAxisT: number
  /** For rotate: initial angle on the ring */
  startAngle: number
  /** For ground-target: initial ground intersection pos */
  startGroundPos: [number, number, number]
  /** Light type, needed for ground target behavior */
  lightType: 'point' | 'directional' | 'spot'
}

/**
 * Scale factor for a gizmo based on its distance from the camera.
 * @param lightPos - World position of the light
 * @param camPos - Camera position
 */
export function gizmoScale(
  lightPos: [number, number, number],
  camPos: [number, number, number]
): number {
  const dx = lightPos[0] - camPos[0]
  const dy = lightPos[1] - camPos[1]
  const dz = lightPos[2] - camPos[2]
  return (
    Math.max(0.1, Math.min(2.0, Math.sqrt(dx * dx + dy * dy + dz * dz) * 0.1)) * GIZMO_BASE_SIZE
  )
}

/**
 * Compute a world-space mouse ray from screen coordinates.
 * @param clientX - Mouse X in client coords
 * @param clientY - Mouse Y in client coords
 * @param rect - Canvas bounding rect
 * @param matrices - Camera projection/view matrices and position
 */
export function computeMouseRay(
  clientX: number,
  clientY: number,
  rect: DOMRect,
  matrices: {
    projectionMatrix: Float32Array
    viewMatrix: Float32Array
    cameraPosition: { x: number; y: number; z: number }
  }
): { origin: [number, number, number]; dir: [number, number, number] } | null {
  if (
    !Number.isFinite(clientX) ||
    !Number.isFinite(clientY) ||
    !Number.isFinite(rect.left) ||
    !Number.isFinite(rect.top) ||
    !Number.isFinite(rect.width) ||
    !Number.isFinite(rect.height) ||
    rect.width <= 0 ||
    rect.height <= 0
  ) {
    return null
  }

  const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1
  const ndcY = -(((clientY - rect.top) / rect.height) * 2 - 1)

  const invVP = invertMat4(multiplyMat4(matrices.projectionMatrix, matrices.viewMatrix))
  if (!invVP) return null

  // WebGPU clip z is [0, 1] (not [-1, 1] like OpenGL)
  const near = transformPoint(invVP, [ndcX, ndcY, 0])
  const far = transformPoint(invVP, [ndcX, ndcY, 1])
  if (!near.every(Number.isFinite) || !far.every(Number.isFinite)) return null

  const dx = far[0] - near[0]
  const dy = far[1] - near[1]
  const dz = far[2] - near[2]
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz)
  if (!Number.isFinite(len) || len < 0.0001) return null

  const cp = matrices.cameraPosition
  if (!Number.isFinite(cp.x) || !Number.isFinite(cp.y) || !Number.isFinite(cp.z)) return null

  return {
    origin: [cp.x, cp.y, cp.z],
    dir: [dx / len, dy / len, dz / len],
  }
}

/**
 * Find the closest parameter t on an axis line to a ray, and the minimum distance.
 * Axis: P + t * A, Ray: O + s * D
 * @returns [t, minDist]
 */
export function rayAxisClosest(
  rayO: [number, number, number],
  rayD: [number, number, number],
  axisP: [number, number, number],
  axisA: [number, number, number]
): [number, number] {
  const wx = rayO[0] - axisP[0]
  const wy = rayO[1] - axisP[1]
  const wz = rayO[2] - axisP[2]

  const a = rayD[0] * rayD[0] + rayD[1] * rayD[1] + rayD[2] * rayD[2]
  const b = rayD[0] * axisA[0] + rayD[1] * axisA[1] + rayD[2] * axisA[2]
  const c = axisA[0] * axisA[0] + axisA[1] * axisA[1] + axisA[2] * axisA[2]
  const d = rayD[0] * wx + rayD[1] * wy + rayD[2] * wz
  const e = axisA[0] * wx + axisA[1] * wy + axisA[2] * wz

  const denom = a * c - b * b
  if (Math.abs(denom) < 1e-10) return [0, Infinity]

  const t = (a * e - b * d) / denom
  const s = (b * e - c * d) / denom

  const cpx = axisP[0] + t * axisA[0] - (rayO[0] + s * rayD[0])
  const cpy = axisP[1] + t * axisA[1] - (rayO[1] + s * rayD[1])
  const cpz = axisP[2] + t * axisA[2] - (rayO[2] + s * rayD[2])
  const dist = Math.sqrt(cpx * cpx + cpy * cpy + cpz * cpz)

  return [t, dist]
}

/**
 * Intersect ray with a plane. Returns the intersection point or null.
 * Plane defined by a normal and a point on the plane.
 * @param rayO - Ray origin
 * @param rayD - Ray direction
 * @param planeN - Plane normal
 * @param planeP - Point on the plane
 */
export function rayPlaneIntersect(
  rayO: [number, number, number],
  rayD: [number, number, number],
  planeN: [number, number, number],
  planeP: [number, number, number]
): [number, number, number] | null {
  const denom = planeN[0] * rayD[0] + planeN[1] * rayD[1] + planeN[2] * rayD[2]
  if (Math.abs(denom) < 1e-10) return null

  const px = planeP[0] - rayO[0]
  const py = planeP[1] - rayO[1]
  const pz = planeP[2] - rayO[2]
  const t = (planeN[0] * px + planeN[1] * py + planeN[2] * pz) / denom
  if (t < 0) return null

  return [rayO[0] + t * rayD[0], rayO[1] + t * rayD[1], rayO[2] + t * rayD[2]]
}

/** Unit axis vectors, indexed by XYZ. */
const UNIT_AXES: [number, number, number][] = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
]

/** Translate drag kind names, indexed by XYZ. */
const TRANSLATE_KINDS: GizmoDragKind[] = ['translate-x', 'translate-y', 'translate-z']
/** Rotate drag kind names, indexed by XYZ. */
const ROTATE_KINDS: GizmoDragKind[] = ['rotate-x', 'rotate-y', 'rotate-z']

/** Compute ring angle for a given axis index and displacement from center. */
function computeRingAngle(axisIdx: number, dx: number, dy: number, dz: number): number {
  if (axisIdx === 0) return Math.atan2(dz, dy)
  if (axisIdx === 1) return Math.atan2(dx, dz)
  return Math.atan2(dy, dx)
}

type GizmoHitResult = { kind: GizmoDragKind; axisT: number; angle: number }

/**
 * Test if a ray hits a translate gizmo (axis shafts).
 */
function testTranslateHit(
  ray: { origin: [number, number, number]; dir: [number, number, number] },
  lightPos: [number, number, number],
  scale: number
): GizmoHitResult | null {
  let bestDist = Infinity
  let bestKind: GizmoDragKind | null = null
  let bestT = 0

  for (let i = 0; i < 3; i++) {
    const [t, dist] = rayAxisClosest(ray.origin, ray.dir, lightPos, UNIT_AXES[i]!)
    const withinShaft = t > 0 && t < TRANSLATE_SHAFT * scale
    const withinThreshold = dist < AXIS_HIT_THRESHOLD * scale && dist < bestDist
    if (withinShaft && withinThreshold) {
      bestDist = dist
      bestKind = TRANSLATE_KINDS[i]!
      bestT = t
    }
  }

  return bestKind ? { kind: bestKind, axisT: bestT, angle: 0 } : null
}

/**
 * Test if a ray hits a rotate gizmo (axis rings).
 */
function testRotateHit(
  ray: { origin: [number, number, number]; dir: [number, number, number] },
  lightPos: [number, number, number],
  scale: number
): GizmoHitResult | null {
  const ringRadius = ROTATE_RING_RADIUS * scale
  const tolerance = AXIS_HIT_THRESHOLD * scale
  let bestDist = Infinity
  let bestKind: GizmoDragKind | null = null
  let bestAngle = 0

  for (let i = 0; i < 3; i++) {
    const hit = rayPlaneIntersect(ray.origin, ray.dir, UNIT_AXES[i]!, lightPos)
    if (!hit) continue

    const dx = hit[0] - lightPos[0]
    const dy = hit[1] - lightPos[1]
    const dz = hit[2] - lightPos[2]
    const distFromCenter = Math.sqrt(dx * dx + dy * dy + dz * dz)
    const ringError = Math.abs(distFromCenter - ringRadius)

    if (ringError < tolerance && ringError < bestDist) {
      bestDist = ringError
      bestKind = ROTATE_KINDS[i]!
      bestAngle = computeRingAngle(i, dx, dy, dz)
    }
  }

  return bestKind ? { kind: bestKind, axisT: 0, angle: bestAngle } : null
}

/**
 * Test if a mouse ray hits any transform gizmo axis or ring for the selected light.
 * @returns The drag kind and initial parameters, or null if no hit
 */
export function testGizmoHit(
  ray: { origin: [number, number, number]; dir: [number, number, number] },
  lightPos: [number, number, number],
  scale: number,
  mode: 'translate' | 'rotate'
): GizmoHitResult | null {
  return mode === 'translate'
    ? testTranslateHit(ray, lightPos, scale)
    : testRotateHit(ray, lightPos, scale)
}

/** Light data needed for ground target hit testing. */
interface GroundTargetLight {
  id: string
  type: string
  position: [number, number, number]
  rotation: [number, number, number]
  range: number
}

/**
 * Compute the XZ ground target position for a light, or null if it has none.
 */
function getGroundTargetXZ(light: GroundTargetLight): [number, number] | null {
  if (light.type === 'spot' || light.type === 'directional') {
    const dir = rotationToDirection(light.rotation)
    const gi = calculateGroundIntersection(light.position, dir)
    return gi ? [gi[0], gi[2]] : null
  }

  if (light.type === 'point') {
    const si = calculateSphereGroundIntersection(light.position, light.range)
    return si ? [si.center[0], si.center[2]] : null
  }

  return null
}

/**
 * Test if a mouse ray hits any ground target.
 * @returns The light ID if hit, null otherwise
 */
export function testGroundTargetHit(
  ray: { origin: [number, number, number]; dir: [number, number, number] },
  lights: GroundTargetLight[]
): string | null {
  const groundHit = rayPlaneIntersect(ray.origin, ray.dir, [0, 1, 0], [0, 0, 0])
  if (!groundHit) return null

  let closestDist = Infinity
  let closestId: string | null = null

  for (const light of lights) {
    const target = getGroundTargetXZ(light)
    if (!target) continue

    const dx = groundHit[0] - target[0]
    const dz = groundHit[2] - target[1]
    const dist = Math.sqrt(dx * dx + dz * dz)

    if (dist < GROUND_TARGET_RADIUS && dist < closestDist) {
      closestDist = dist
      closestId = light.id
    }
  }

  return closestId
}
