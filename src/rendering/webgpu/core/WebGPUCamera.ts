/**
 * WebGPU Camera System
 *
 * Manages camera state and computes view/projection matrices for WebGPU rendering.
 * Uses column-major Float32Arrays compatible with WGSL matrix layout.
 *
 * @module rendering/webgpu/core/WebGPUCamera
 */

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

/**
 * Multiply two 4x4 matrices (column-major): result = a * b
 * @param a
 * @param b
 */
function writeMultiplyMat4(out: Float32Array, a: Float32Array, b: Float32Array): void {
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0
      for (let k = 0; k < 4; k++) {
        sum += (a[row + k * 4] ?? 0) * (b[k + col * 4] ?? 0)
      }
      out[row + col * 4] = sum
    }
  }
}

/**
 * Invert a 4x4 matrix (column-major).
 * Returns identity matrix if singular.
 * @param m
 */
/** Scratch space for cofactor computation — avoids per-call allocation. */
const _invertCofactors = new Float32Array(16)

function writeInvertMat4(out: Float32Array, m: Float32Array): void {
  const inv = _invertCofactors

  const m0 = m[0] ?? 0,
    m1 = m[1] ?? 0,
    m2 = m[2] ?? 0,
    m3 = m[3] ?? 0
  const m4 = m[4] ?? 0,
    m5 = m[5] ?? 0,
    m6 = m[6] ?? 0,
    m7 = m[7] ?? 0
  const m8 = m[8] ?? 0,
    m9 = m[9] ?? 0,
    m10 = m[10] ?? 0,
    m11 = m[11] ?? 0
  const m12 = m[12] ?? 0,
    m13 = m[13] ?? 0,
    m14 = m[14] ?? 0,
    m15 = m[15] ?? 0

  inv[0] =
    m5 * m10 * m15 -
    m5 * m11 * m14 -
    m9 * m6 * m15 +
    m9 * m7 * m14 +
    m13 * m6 * m11 -
    m13 * m7 * m10
  inv[4] =
    -m4 * m10 * m15 +
    m4 * m11 * m14 +
    m8 * m6 * m15 -
    m8 * m7 * m14 -
    m12 * m6 * m11 +
    m12 * m7 * m10
  inv[8] =
    m4 * m9 * m15 - m4 * m11 * m13 - m8 * m5 * m15 + m8 * m7 * m13 + m12 * m5 * m11 - m12 * m7 * m9
  inv[12] =
    -m4 * m9 * m14 + m4 * m10 * m13 + m8 * m5 * m14 - m8 * m6 * m13 - m12 * m5 * m10 + m12 * m6 * m9
  inv[1] =
    -m1 * m10 * m15 +
    m1 * m11 * m14 +
    m9 * m2 * m15 -
    m9 * m3 * m14 -
    m13 * m2 * m11 +
    m13 * m3 * m10
  inv[5] =
    m0 * m10 * m15 -
    m0 * m11 * m14 -
    m8 * m2 * m15 +
    m8 * m3 * m14 +
    m12 * m2 * m11 -
    m12 * m3 * m10
  inv[9] =
    -m0 * m9 * m15 + m0 * m11 * m13 + m8 * m1 * m15 - m8 * m3 * m13 - m12 * m1 * m11 + m12 * m3 * m9
  inv[13] =
    m0 * m9 * m14 - m0 * m10 * m13 - m8 * m1 * m14 + m8 * m2 * m13 + m12 * m1 * m10 - m12 * m2 * m9
  inv[2] =
    m1 * m6 * m15 - m1 * m7 * m14 - m5 * m2 * m15 + m5 * m3 * m14 + m13 * m2 * m7 - m13 * m3 * m6
  inv[6] =
    -m0 * m6 * m15 + m0 * m7 * m14 + m4 * m2 * m15 - m4 * m3 * m14 - m12 * m2 * m7 + m12 * m3 * m6
  inv[10] =
    m0 * m5 * m15 - m0 * m7 * m13 - m4 * m1 * m15 + m4 * m3 * m13 + m12 * m1 * m7 - m12 * m3 * m5
  inv[14] =
    -m0 * m5 * m14 + m0 * m6 * m13 + m4 * m1 * m14 - m4 * m2 * m13 - m12 * m1 * m6 + m12 * m2 * m5
  inv[3] =
    -m1 * m6 * m11 + m1 * m7 * m10 + m5 * m2 * m11 - m5 * m3 * m10 - m9 * m2 * m7 + m9 * m3 * m6
  inv[7] =
    m0 * m6 * m11 - m0 * m7 * m10 - m4 * m2 * m11 + m4 * m3 * m10 + m8 * m2 * m7 - m8 * m3 * m6
  inv[11] =
    -m0 * m5 * m11 + m0 * m7 * m9 + m4 * m1 * m11 - m4 * m3 * m9 - m8 * m1 * m7 + m8 * m3 * m5
  inv[15] =
    m0 * m5 * m10 - m0 * m6 * m9 - m4 * m1 * m10 + m4 * m2 * m9 + m8 * m1 * m6 - m8 * m2 * m5

  let det = m0 * inv[0]! + m1 * inv[4]! + m2 * inv[8]! + m3 * inv[12]!

  if (Math.abs(det) < 1e-10) {
    // Write identity if singular
    out.fill(0)
    out[0] = 1
    out[5] = 1
    out[10] = 1
    out[15] = 1
    return
  }

  det = 1.0 / det
  for (let i = 0; i < 16; i++) {
    out[i] = inv[i]! * det
  }
}

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
      far: 1000,
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
      cameraFar: 1000,
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
   * Recompute all matrices from current state.
   */
  private updateMatrices(): void {
    writeLookAtMatrix(
      this.matrices.viewMatrix,
      this.state.position,
      this.state.target,
      this.state.up
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
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz)
    let azimuth = Math.atan2(dx, dz)
    let elevation = Math.asin(dy / distance)

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

    const dx = px - tx
    const dy = py - ty
    const dz = pz - tz

    // Clamp factor to reasonable range
    const clampedFactor = Math.max(0.1, Math.min(10, factor))

    this.state.position = [
      tx + dx * clampedFactor,
      ty + dy * clampedFactor,
      tz + dz * clampedFactor,
    ]
    this.dirty = true
  }

  /**
   * Pan the camera (move both position and target).
   * @param deltaX - Horizontal movement in world units
   * @param deltaY - Vertical movement in world units
   */
  pan(deltaX: number, deltaY: number): void {
    // Get camera's right and up vectors from view matrix
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
