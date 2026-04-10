/**
 * WebGPU Camera System
 *
 * Manages camera state and computes view/projection matrices for WebGPU rendering.
 * Uses column-major Float32Arrays compatible with WGSL matrix layout.
 *
 * @module rendering/webgpu/core/WebGPUCamera
 */

import { writeInvertMat4, writeMultiplyMat4 } from '../utils/mat4'

// ============================================================================
// Types
// ============================================================================

/** Orbital camera parameters: position, target, clipping planes, and field of view. */
export interface WebGPUCameraState {
  /** Camera position in world space */
  position: [number, number, number]
  /** Look-at target in world space */
  target: [number, number, number]
  /** Up vector */
  up: [number, number, number]
  /** Field of view in degrees */
  fov: number
  /** Near clipping plane */
  near: number
  /** Far clipping plane */
  far: number
  /** Aspect ratio (width / height) */
  aspect: number
}

/** Pre-computed camera matrices in column-major layout for GPU uniform upload. */
export interface WebGPUCameraMatrices {
  /** View matrix (world to camera) - column-major Float32Array */
  viewMatrix: Float32Array
  /** Projection matrix - column-major Float32Array */
  projectionMatrix: Float32Array
  /** Combined view-projection matrix - column-major Float32Array */
  viewProjectionMatrix: Float32Array
  /** Inverse view matrix (camera to world) */
  inverseViewMatrix: Float32Array
  /** Inverse projection matrix */
  inverseProjectionMatrix: Float32Array
  /** Camera position as vec3 for uniforms */
  cameraPosition: { x: number; y: number; z: number }
  /** Near plane distance */
  cameraNear: number
  /** Far plane distance */
  cameraFar: number
  /** Field of view in degrees */
  fov: number
}

// ============================================================================
// Matrix Math (column-major for WebGPU/WGSL compatibility)
// ============================================================================

/**
 * Create a look-at view matrix (column-major).
 * Transforms from world space to camera/view space.
 * @param eye
 * @param target
 * @param up
 */
function writeLookAtMatrix(
  out: Float32Array,
  eye: [number, number, number],
  target: [number, number, number],
  up: [number, number, number]
): void {
  // Compute forward (z-axis, pointing towards target)
  let fx = target[0] - eye[0]
  let fy = target[1] - eye[1]
  let fz = target[2] - eye[2]
  const fLen = Math.sqrt(fx * fx + fy * fy + fz * fz)
  if (fLen > 0) {
    fx /= fLen
    fy /= fLen
    fz /= fLen
  }

  // Compute right (x-axis) = forward x up
  let rx = fy * up[2] - fz * up[1]
  let ry = fz * up[0] - fx * up[2]
  let rz = fx * up[1] - fy * up[0]
  const rLen = Math.sqrt(rx * rx + ry * ry + rz * rz)
  if (rLen > 0) {
    rx /= rLen
    ry /= rLen
    rz /= rLen
  }

  // Compute true up (y-axis) = right x forward
  const ux = ry * fz - rz * fy
  const uy = rz * fx - rx * fz
  const uz = rx * fy - ry * fx

  // Write view matrix (column-major) into pre-allocated output
  out[0] = rx
  out[1] = ux
  out[2] = -fx
  out[3] = 0
  out[4] = ry
  out[5] = uy
  out[6] = -fy
  out[7] = 0
  out[8] = rz
  out[9] = uz
  out[10] = -fz
  out[11] = 0
  out[12] = -(rx * eye[0] + ry * eye[1] + rz * eye[2])
  out[13] = -(ux * eye[0] + uy * eye[1] + uz * eye[2])
  out[14] = fx * eye[0] + fy * eye[1] + fz * eye[2]
  out[15] = 1
}

/**
 * Create a reverse-Z perspective projection matrix (column-major).
 * Maps near plane to depth 1 and far plane to depth 0, concentrating
 * floating-point precision near the camera where it matters most.
 *
 * @param fovY - Vertical field of view in degrees
 * @param aspect - Aspect ratio (width / height)
 * @param near - Near clipping plane
 * @param far - Far clipping plane
 */
function writePerspectiveMatrix(
  out: Float32Array,
  fovY: number,
  aspect: number,
  near: number,
  far: number
): void {
  const fovRad = (fovY * Math.PI) / 180
  const f = 1.0 / Math.tan(fovRad / 2)
  const rangeInv = 1 / (far - near)

  out[0] = f / aspect
  out[1] = 0
  out[2] = 0
  out[3] = 0
  out[4] = 0
  out[5] = f
  out[6] = 0
  out[7] = 0
  out[8] = 0
  out[9] = 0
  out[10] = near * rangeInv
  out[11] = -1
  out[12] = 0
  out[13] = 0
  out[14] = far * near * rangeInv
  out[15] = 0
}

/** Minimum distance from camera to target, preventing NaN in orbit and degenerate matrices. */
const MIN_CAMERA_DISTANCE = 0.01

// ============================================================================
// Camera Class
// ============================================================================

/**
 * WebGPU Camera.
 *
 * Manages camera state and computes matrices for GPU rendering.
 */
export class WebGPUCamera {
  private state: WebGPUCameraState
  private matrices: WebGPUCameraMatrices
  private dirty = true

  constructor(initialState?: Partial<WebGPUCameraState>) {
    this.state = {
      position: [0, 3.125, 7.5], // Match WebGL default camera position
      target: [0, 0, 0],
      up: [0, 1, 0],
      fov: 60, // Match WebGL camera fov
      near: 0.1,
      far: 10000,
      aspect: 1,
      ...initialState,
    }

    // Initialize matrices
    this.matrices = {
      viewMatrix: new Float32Array(16),
      projectionMatrix: new Float32Array(16),
      viewProjectionMatrix: new Float32Array(16),
      inverseViewMatrix: new Float32Array(16),
      inverseProjectionMatrix: new Float32Array(16),
      cameraPosition: { x: 0, y: 0, z: 0 },
      cameraNear: 0.1,
      cameraFar: 10000,
      fov: 60,
    }

    this.updateMatrices()
  }

  /**
   * Set camera position.
   * @param x
   * @param y
   * @param z
   */
  setPosition(x: number, y: number, z: number): void {
    this.state.position = [x, y, z]
    this.dirty = true
  }

  /**
   * Set look-at target.
   * @param x
   * @param y
   * @param z
   */
  setTarget(x: number, y: number, z: number): void {
    this.state.target = [x, y, z]
    this.dirty = true
  }

  /**
   * Set field of view in degrees.
   * @param fov
   */
  setFov(fov: number): void {
    this.state.fov = fov
    this.dirty = true
  }

  /**
   * Set aspect ratio (width / height).
   * @param aspect
   */
  setAspect(aspect: number): void {
    if (this.state.aspect === aspect) return
    this.state.aspect = aspect
    this.dirty = true
  }

  /**
   * Set near/far clipping planes.
   * @param near
   * @param far
   */
  setClippingPlanes(near: number, far: number): void {
    this.state.near = near
    this.state.far = far
    this.dirty = true
  }

  /**
   * Get current camera state.
   */
  getState(): Readonly<WebGPUCameraState> {
    return this.state
  }

  /**
   * Get computed matrices. Updates if dirty.
   */
  getMatrices(): WebGPUCameraMatrices {
    if (this.dirty) {
      this.updateMatrices()
    }
    return this.matrices
  }

  /**
   * Nudge the target away from position so |target − position| ≥
   * MIN_CAMERA_DISTANCE. Returns a safe target vector without mutating
   * `this.state.target` — external code that set the target still sees its
   * own value. Called from `updateMatrices()` to ensure `writeLookAtMatrix`
   * never produces a zero-basis (non-invertible) view matrix regardless of
   * how `initialState`, `setPosition()`, or `setTarget()` were called.
   */
  private getSafeTarget(): [number, number, number] {
    const [px, py, pz] = this.state.position
    const [tx, ty, tz] = this.state.target
    const dx = tx - px
    const dy = ty - py
    const dz = tz - pz
    const distSq = dx * dx + dy * dy + dz * dz
    if (distSq >= MIN_CAMERA_DISTANCE * MIN_CAMERA_DISTANCE) {
      return this.state.target
    }
    // Degenerate or near-degenerate separation. Re-project the target along
    // the existing offset direction if we have one, otherwise fall back to
    // world −Z so lookAt has a deterministic forward axis.
    const dist = Math.sqrt(distSq)
    if (dist > 0) {
      const scale = MIN_CAMERA_DISTANCE / dist
      return [px + dx * scale, py + dy * scale, pz + dz * scale]
    }
    return [px, py, pz - MIN_CAMERA_DISTANCE]
  }

  /**
   * Pick an up-axis that is not collinear with forward. Needed because
   * `writeLookAtMatrix` computes `right = cross(forward, up)`, which is
   * zero-length whenever forward ∥ up and produces a singular view matrix.
   * A caller can legally set `state.up=[0,1,0]` and look straight down the
   * Y axis, so we must swap to a fallback axis without mutating `state.up`.
   */
  private getSafeUp(safeTarget: [number, number, number]): [number, number, number] {
    const [px, py, pz] = this.state.position
    let fx = safeTarget[0] - px
    let fy = safeTarget[1] - py
    let fz = safeTarget[2] - pz
    const fLen = Math.hypot(fx, fy, fz) || 1
    fx /= fLen
    fy /= fLen
    fz /= fLen

    // A zero-length (or near-zero) `state.up` cannot be used as-is: the
    // collinearity check below would normalise by 0 → a garbage cosTheta,
    // and `writeLookAtMatrix` would cross a zero vector into the right
    // axis. Force a valid world axis before any further reasoning.
    const [ux, uy, uz] = this.state.up
    const upLen = Math.hypot(ux, uy, uz)
    const EPSILON = 1e-6
    if (upLen < EPSILON) {
      return Math.abs(fy) < 0.9 ? [0, 1, 0] : [1, 0, 0]
    }

    const cosTheta = (fx * ux + fy * uy + fz * uz) / upLen
    if (Math.abs(cosTheta) <= 0.999) {
      return this.state.up
    }
    // Forward is (nearly) parallel to the configured up. Pick a world axis
    // that is provably non-collinear with forward: if forward is dominated
    // by the X component, fall back to world +Z, otherwise world +X.
    return Math.abs(fx) < 0.9 ? [1, 0, 0] : [0, 0, 1]
  }

  /**
   * Recompute all matrices from current state.
   */
  private updateMatrices(): void {
    const safeTarget = this.getSafeTarget()
    writeLookAtMatrix(
      this.matrices.viewMatrix,
      this.state.position,
      safeTarget,
      this.getSafeUp(safeTarget)
    )
    writePerspectiveMatrix(
      this.matrices.projectionMatrix,
      this.state.fov,
      this.state.aspect,
      this.state.near,
      this.state.far
    )
    writeMultiplyMat4(
      this.matrices.viewProjectionMatrix,
      this.matrices.projectionMatrix,
      this.matrices.viewMatrix
    )
    writeInvertMat4(this.matrices.inverseViewMatrix, this.matrices.viewMatrix)
    writeInvertMat4(this.matrices.inverseProjectionMatrix, this.matrices.projectionMatrix)

    this.matrices.cameraPosition.x = this.state.position[0]
    this.matrices.cameraPosition.y = this.state.position[1]
    this.matrices.cameraPosition.z = this.state.position[2]
    this.matrices.cameraNear = this.state.near
    this.matrices.cameraFar = this.state.far
    this.matrices.fov = this.state.fov

    this.dirty = false
  }

  /**
   * Orbit the camera around the target.
   * @param deltaAzimuth - Horizontal angle change in radians
   * @param deltaElevation - Vertical angle change in radians
   */
  orbit(deltaAzimuth: number, deltaElevation: number): void {
    const [px, py, pz] = this.state.position
    const [tx, ty, tz] = this.state.target

    // Get offset from target
    let dx = px - tx
    let dy = py - ty
    let dz = pz - tz

    // Current distance and angles
    const distance = Math.max(Math.sqrt(dx * dx + dy * dy + dz * dz), MIN_CAMERA_DISTANCE)
    let azimuth = Math.atan2(dx, dz)
    let elevation = Math.asin(Math.max(-1, Math.min(1, dy / distance)))

    // Apply deltas
    azimuth += deltaAzimuth
    elevation += deltaElevation

    // Clamp elevation to avoid gimbal lock
    const maxElevation = Math.PI / 2 - 0.01
    elevation = Math.max(-maxElevation, Math.min(maxElevation, elevation))

    // Convert back to position
    const cosElev = Math.cos(elevation)
    dx = distance * cosElev * Math.sin(azimuth)
    dy = distance * Math.sin(elevation)
    dz = distance * cosElev * Math.cos(azimuth)

    this.state.position = [tx + dx, ty + dy, tz + dz]
    this.dirty = true
  }

  /**
   * Zoom by adjusting distance to target.
   * @param factor - Zoom factor (< 1 to zoom in, > 1 to zoom out)
   */
  zoom(factor: number): void {
    const [px, py, pz] = this.state.position
    const [tx, ty, tz] = this.state.target

    let dx = px - tx
    let dy = py - ty
    let dz = pz - tz

    // Clamp factor to reasonable range
    const clampedFactor = Math.max(0.1, Math.min(10, factor))
    dx *= clampedFactor
    dy *= clampedFactor
    dz *= clampedFactor

    // Enforce minimum distance to prevent degenerate matrices and NaN in orbit
    let newDistance = Math.sqrt(dx * dx + dy * dy + dz * dz)

    // Degenerate seed: raw offset was (near) zero because `state.position`
    // and `state.target` had coincided. Simply returning would permanently
    // wedge the camera — the user can never escape the degenerate state.
    // Re-seed the offset direction from `getSafeTarget()`, which is
    // guaranteed to be at least MIN_CAMERA_DISTANCE away from position,
    // then apply the same clampedFactor so the visible zoom gesture still
    // lands in the right relative magnitude.
    if (newDistance < MIN_CAMERA_DISTANCE) {
      const [stx, sty, stz] = this.getSafeTarget()
      dx = (px - stx) * clampedFactor
      dy = (py - sty) * clampedFactor
      dz = (pz - stz) * clampedFactor
      newDistance = Math.sqrt(dx * dx + dy * dy + dz * dz)
      // Even the safe seed can undershoot when clampedFactor < 1 —
      // refuse the gesture only in that unrecoverable case.
      if (newDistance < MIN_CAMERA_DISTANCE) return
    }

    this.state.position = [tx + dx, ty + dy, tz + dz]
    this.dirty = true
  }

  /**
   * Pan the camera (move both position and target).
   * @param deltaX - Horizontal movement in world units
   * @param deltaY - Vertical movement in world units
   */
  pan(deltaX: number, deltaY: number): void {
    // Ensure matrices are up-to-date before reading basis vectors.
    // Without this, orbit/zoom since the last getMatrices() would leave
    // the view matrix stale, causing pan to move in the wrong direction.
    if (this.dirty) this.updateMatrices()
    const vm = this.matrices.viewMatrix

    // Right vector is column 0 of inverse view matrix (or row 0 of view matrix)
    const rx = vm[0] ?? 0
    const ry = vm[4] ?? 0
    const rz = vm[8] ?? 0

    // Up vector is column 1 of inverse view matrix (or row 1 of view matrix)
    const ux = vm[1] ?? 0
    const uy = vm[5] ?? 0
    const uz = vm[9] ?? 0

    // Apply pan
    const [px, py, pz] = this.state.position
    const [tx, ty, tz] = this.state.target

    this.state.position = [
      px + rx * deltaX + ux * deltaY,
      py + ry * deltaX + uy * deltaY,
      pz + rz * deltaX + uz * deltaY,
    ]
    this.state.target = [
      tx + rx * deltaX + ux * deltaY,
      ty + ry * deltaX + uy * deltaY,
      tz + rz * deltaX + uz * deltaY,
    ]
    this.dirty = true
  }
}
