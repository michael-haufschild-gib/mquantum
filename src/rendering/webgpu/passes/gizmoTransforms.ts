/**
 * Gizmo Transform Helpers
 *
 * Quaternion rotation and vertex transformation utilities for gizmo rendering.
 * Transforms line-list vertex data: scale, rotate, translate, billboard.
 *
 * @module rendering/webgpu/passes/gizmoTransforms
 */

import { STRIDE } from './gizmoPrimitives'

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
