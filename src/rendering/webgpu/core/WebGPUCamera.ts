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
function createLookAtMatrix(
  eye: [number, number, number],
  target: [number, number, number],
  up: [number, number, number]
): Float32Array {
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

  // Create view matrix (column-major)
  // View matrix = inverse of camera matrix
  // For orthonormal basis, inverse = transpose of rotation part + negated translation
  const m = new Float32Array(16)

  // Column 0 (right)
  m[0] = rx
  m[1] = ux
  m[2] = -fx
  m[3] = 0

  // Column 1 (up)
  m[4] = ry
  m[5] = uy
  m[6] = -fy
  m[7] = 0

  // Column 2 (forward, negated for view)
  m[8] = rz
  m[9] = uz
  m[10] = -fz
  m[11] = 0

  // Column 3 (translation)
  m[12] = -(rx * eye[0] + ry * eye[1] + rz * eye[2])
  m[13] = -(ux * eye[0] + uy * eye[1] + uz * eye[2])
  m[14] = fx * eye[0] + fy * eye[1] + fz * eye[2]
  m[15] = 1

  return m
}

/**
 * Create a perspective projection matrix (column-major).
 * Uses reverse-Z for better depth precision (common in modern renderers).
 *
 * @param fovY - Vertical field of view in degrees
 * @param aspect - Aspect ratio (width / height)
 * @param near - Near clipping plane
 * @param far - Far clipping plane
 */
function createPerspectiveMatrix(
  fovY: number,
  aspect: number,
  near: number,
  far: number
): Float32Array {
  const fovRad = (fovY * Math.PI) / 180
  const f = 1.0 / Math.tan(fovRad / 2)

  const m = new Float32Array(16)

  // Standard perspective matrix (column-major)
  // Note: WebGPU uses clip space z in [0, 1] not [-1, 1] like OpenGL
  const nf = 1 / (near - far)

  // Column 0
  m[0] = f / aspect
  m[1] = 0
  m[2] = 0
  m[3] = 0

  // Column 1
  m[4] = 0
  m[5] = f
  m[6] = 0
  m[7] = 0

  // Column 2 - WebGPU depth range is [0, 1]
  m[8] = 0
  m[9] = 0
  m[10] = far * nf
  m[11] = -1

  // Column 3
  m[12] = 0
  m[13] = 0
  m[14] = near * far * nf
  m[15] = 0

  return m
}

/**
 * Multiply two 4x4 matrices (column-major): result = a * b
 * @param a
 * @param b
 */
function multiplyMat4(a: Float32Array, b: Float32Array): Float32Array {
  const result = new Float32Array(16)

  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0
      for (let k = 0; k < 4; k++) {
        sum += (a[row + k * 4] ?? 0) * (b[k + col * 4] ?? 0)
      }
      result[row + col * 4] = sum
    }
  }

  return result
}

/**
 * Invert a 4x4 matrix (column-major).
 * Returns identity matrix if singular.
 * @param m
 */
function invertMat4(m: Float32Array): Float32Array {
  const inv = new Float32Array(16)

  // Extract matrix elements with null coalescing for TypeScript
  const m0 = m[0] ?? 0, m1 = m[1] ?? 0, m2 = m[2] ?? 0, m3 = m[3] ?? 0
  const m4 = m[4] ?? 0, m5 = m[5] ?? 0, m6 = m[6] ?? 0, m7 = m[7] ?? 0
  const m8 = m[8] ?? 0, m9 = m[9] ?? 0, m10 = m[10] ?? 0, m11 = m[11] ?? 0
  const m12 = m[12] ?? 0, m13 = m[13] ?? 0, m14 = m[14] ?? 0, m15 = m[15] ?? 0

  inv[0] = m5 * m10 * m15 - m5 * m11 * m14 - m9 * m6 * m15 + m9 * m7 * m14 + m13 * m6 * m11 - m13 * m7 * m10
  inv[4] = -m4 * m10 * m15 + m4 * m11 * m14 + m8 * m6 * m15 - m8 * m7 * m14 - m12 * m6 * m11 + m12 * m7 * m10
  inv[8] = m4 * m9 * m15 - m4 * m11 * m13 - m8 * m5 * m15 + m8 * m7 * m13 + m12 * m5 * m11 - m12 * m7 * m9
  inv[12] = -m4 * m9 * m14 + m4 * m10 * m13 + m8 * m5 * m14 - m8 * m6 * m13 - m12 * m5 * m10 + m12 * m6 * m9
  inv[1] = -m1 * m10 * m15 + m1 * m11 * m14 + m9 * m2 * m15 - m9 * m3 * m14 - m13 * m2 * m11 + m13 * m3 * m10
  inv[5] = m0 * m10 * m15 - m0 * m11 * m14 - m8 * m2 * m15 + m8 * m3 * m14 + m12 * m2 * m11 - m12 * m3 * m10
  inv[9] = -m0 * m9 * m15 + m0 * m11 * m13 + m8 * m1 * m15 - m8 * m3 * m13 - m12 * m1 * m11 + m12 * m3 * m9
  inv[13] = m0 * m9 * m14 - m0 * m10 * m13 - m8 * m1 * m14 + m8 * m2 * m13 + m12 * m1 * m10 - m12 * m2 * m9
  inv[2] = m1 * m6 * m15 - m1 * m7 * m14 - m5 * m2 * m15 + m5 * m3 * m14 + m13 * m2 * m7 - m13 * m3 * m6
  inv[6] = -m0 * m6 * m15 + m0 * m7 * m14 + m4 * m2 * m15 - m4 * m3 * m14 - m12 * m2 * m7 + m12 * m3 * m6
  inv[10] = m0 * m5 * m15 - m0 * m7 * m13 - m4 * m1 * m15 + m4 * m3 * m13 + m12 * m1 * m7 - m12 * m3 * m5
  inv[14] = -m0 * m5 * m14 + m0 * m6 * m13 + m4 * m1 * m14 - m4 * m2 * m13 - m12 * m1 * m6 + m12 * m2 * m5
  inv[3] = -m1 * m6 * m11 + m1 * m7 * m10 + m5 * m2 * m11 - m5 * m3 * m10 - m9 * m2 * m7 + m9 * m3 * m6
  inv[7] = m0 * m6 * m11 - m0 * m7 * m10 - m4 * m2 * m11 + m4 * m3 * m10 + m8 * m2 * m7 - m8 * m3 * m6
  inv[11] = -m0 * m5 * m11 + m0 * m7 * m9 + m4 * m1 * m11 - m4 * m3 * m9 - m8 * m1 * m7 + m8 * m3 * m5
  inv[15] = m0 * m5 * m10 - m0 * m6 * m9 - m4 * m1 * m10 + m4 * m2 * m9 + m8 * m1 * m6 - m8 * m2 * m5

  let det = m0 * (inv[0] ?? 0) + m1 * (inv[4] ?? 0) + m2 * (inv[8] ?? 0) + m3 * (inv[12] ?? 0)

  if (Math.abs(det) < 1e-10) {
    // Return identity if singular
    return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])
  }

  det = 1.0 / det

  const result = new Float32Array(16)
  for (let i = 0; i < 16; i++) {
    result[i] = (inv[i] ?? 0) * det
  }

  return result
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
  getState(): WebGPUCameraState {
    return { ...this.state }
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
    // View matrix
    this.matrices.viewMatrix = createLookAtMatrix(
      this.state.position,
      this.state.target,
      this.state.up
    )

    // Projection matrix
    this.matrices.projectionMatrix = createPerspectiveMatrix(
      this.state.fov,
      this.state.aspect,
      this.state.near,
      this.state.far
    )

    // ViewProjection = Projection * View
    this.matrices.viewProjectionMatrix = multiplyMat4(
      this.matrices.projectionMatrix,
      this.matrices.viewMatrix
    )

    // Inverse matrices
    this.matrices.inverseViewMatrix = invertMat4(this.matrices.viewMatrix)
    this.matrices.inverseProjectionMatrix = invertMat4(this.matrices.projectionMatrix)

    // Camera position and parameters
    this.matrices.cameraPosition = {
      x: this.state.position[0],
      y: this.state.position[1],
      z: this.state.position[2],
    }
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
