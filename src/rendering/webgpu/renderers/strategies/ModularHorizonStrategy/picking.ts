import {
  crossProduct3D,
  dotProduct,
  normalize,
  scaleVector,
  subtractVectors,
} from '@/lib/math/vector'
import { DISPLAY_RADIUS, intersectExteriorShell } from '@/lib/physics/modularHorizon/exterior'

import { CAMERA_UNIFORMS_LAYOUT } from '../../cameraLayout'

/** Recover the intrinsic disk point hit in either horizon model. */
export function pickHorizon(
  x: number,
  y: number,
  camera: Float32Array,
  axes: Float32Array
): [number, number] | null {
  const layout = CAMERA_UNIFORMS_LAYOUT.index
  function transform(offset: number, v: number[]) {
    return [0, 1, 2, 3].map((i) =>
      v.reduce((sum, n, j) => sum + camera[offset + 4 * j + i]! * n, 0)
    )
  }
  if (axes[15]) {
    const view = transform(layout.inverseProjectionMatrix, [x, y, 0.5, 1])
    const world = transform(layout.inverseViewMatrix, view)
    const point = transform(layout.inverseModelMatrix, world)
    const eye = Array.from(camera.slice(layout.cameraPositionModel, layout.cameraPositionModel + 3))
    const u = Array.from(axes.slice(12, 15)),
      v = Array.from(axes.slice(16, 19))
    const n = scaleVector(crossProduct3D(u, v), 1 / DISPLAY_RADIUS)
    const toIntrinsic = (vec: number[]) =>
      [u, v, n].map((axis) => dotProduct(axis, vec) / DISPLAY_RADIUS ** 2)
    const origin = toIntrinsic(eye)
    const target = point.slice(0, 3).map((component) => component / point[3]!)
    return intersectExteriorShell(
      origin,
      normalize(toIntrinsic(subtractVectors(target, eye))),
      axes[19]!,
      !!axes[23]
    )
  }
  function clip(v: number[]) {
    return transform(layout.viewProjectionMatrix, transform(layout.modelMatrix, v))
  }
  const origin = clip([0, 0, 0, 1])
  const u = clip([...axes.slice(12, 15), 0]),
    v = clip([...axes.slice(16, 19), 0])
  const a = u[0]! - x * u[3]!,
    b = v[0]! - x * v[3]!,
    c = u[1]! - y * u[3]!,
    d = v[1]! - y * v[3]!
  const rx = x * origin[3]! - origin[0]!,
    ry = y * origin[3]! - origin[1]!,
    det = a * d - b * c
  if (Math.abs(det) < 1e-6) return null
  const s = (rx * d - b * ry) / det,
    t = (a * ry - rx * c) / det
  return Math.hypot(s, t) < 0.99999 && origin[3]! + s * u[3]! + t * v[3]! > 0 ? [s, t] : null
}

export const horizonProjection: { axes?: Float32Array; camera?: Float32Array } = {}
