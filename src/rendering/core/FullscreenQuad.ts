/**
 * Shared Fullscreen Quad Geometry
 *
 * OPTIMIZATION: Provides a single shared PlaneGeometry(2, 2) instance for all
 * fullscreen passes instead of each pass creating its own geometry.
 * This reduces memory allocation and slightly improves initialization time.
 *
 * @module rendering/core/FullscreenQuad
 */

import * as THREE from 'three'

/** Singleton fullscreen quad geometry (2x2 plane centered at origin) */
let sharedGeometry: THREE.PlaneGeometry | null = null

/** Reference count for proper disposal */
let referenceCount = 0

/**
 * Gets the shared fullscreen quad geometry.
 * Call `releaseFullscreenQuadGeometry()` when done to allow proper disposal.
 *
 * @returns Shared PlaneGeometry(2, 2) instance
 *
 * @example
 * ```typescript
 * const geometry = getFullscreenQuadGeometry();
 * const mesh = new THREE.Mesh(geometry, material);
 * // Later, when disposing the pass:
 * releaseFullscreenQuadGeometry();
 * ```
 */
export function getFullscreenQuadGeometry(): THREE.PlaneGeometry {
  if (!sharedGeometry) {
    sharedGeometry = new THREE.PlaneGeometry(2, 2)
    // Disable auto-update bounds since this never changes
    sharedGeometry.boundingBox = new THREE.Box3(
      new THREE.Vector3(-1, -1, 0),
      new THREE.Vector3(1, 1, 0)
    )
    sharedGeometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), Math.SQRT2)
  }
  referenceCount++
  return sharedGeometry
}

/**
 * Releases a reference to the shared fullscreen quad geometry.
 * When all references are released, the geometry is disposed.
 */
export function releaseFullscreenQuadGeometry(): void {
  referenceCount = Math.max(0, referenceCount - 1)
  if (referenceCount === 0 && sharedGeometry) {
    sharedGeometry.dispose()
    sharedGeometry = null
  }
}

/**
 * Gets the current reference count (for debugging).
 * @returns The current reference count
 */
export function getFullscreenQuadRefCount(): number {
  return referenceCount
}

/**
 * Shared orthographic camera for fullscreen rendering.
 * Uses NDC coordinates (-1 to 1 range).
 */
let sharedCamera: THREE.OrthographicCamera | null = null
let cameraRefCount = 0

/**
 * Gets the shared orthographic camera for fullscreen passes.
 * The camera uses NDC coordinates from -1 to 1.
 *
 * @returns Shared OrthographicCamera instance
 */
export function getFullscreenCamera(): THREE.OrthographicCamera {
  if (!sharedCamera) {
    sharedCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  }
  cameraRefCount++
  return sharedCamera
}

/**
 * Releases a reference to the shared fullscreen camera.
 */
export function releaseFullscreenCamera(): void {
  cameraRefCount = Math.max(0, cameraRefCount - 1)
  // Cameras don't need disposal, but we can null it to free memory
  if (cameraRefCount === 0 && sharedCamera) {
    sharedCamera = null
  }
}
