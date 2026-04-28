/**
 * GPU-only texture helpers for compute passes.
 *
 * Split from `computePassUtils.ts` so the pure dispatch / FFT-pack / stride
 * helpers in that file can be exercised by Vitest without dragging in the
 * `device.createTexture` / `device.queue.writeTexture` calls below — those
 * require a real `GPUDevice` and are verified by Playwright e2e tests
 * (rendering.spec.ts, physics-validation.spec.ts).
 *
 * @module rendering/webgpu/passes/computePassTextures
 */

import { DENSITY_GRID_SIZE } from '@/constants/densityGrid'

/**
 * Create a 3D density grid texture for volume visualization.
 * @param device - WebGPU device
 * @param label - Texture label prefix
 * @param extraUsage - Additional GPUTextureUsage flags (e.g. COPY_DST for FreeScalar)
 * @returns GPUTexture with rgba16float format, sized DENSITY_GRID_SIZE^3
 */
export function createDensityTexture(
  device: GPUDevice,
  label: string,
  extraUsage: GPUTextureUsageFlags = 0,
  gridSize: number = DENSITY_GRID_SIZE
): GPUTexture {
  return device.createTexture({
    label: `${label}-density-grid`,
    size: [gridSize, gridSize, gridSize],
    format: 'rgba16float',
    dimension: '3d',
    usage:
      GPUTextureUsage.STORAGE_BINDING |
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.COPY_SRC |
      extraUsage,
  })
}

/**
 * FSF requires TWO 3D textures: the main density grid (written to by the
 * write-grid pass, consumed by the raymarcher) and a secondary "analysis"
 * grid used for k-space display + Hamiltonian decomposition. Returns the
 * pair plus their 3D views in a single call so the compute pass can
 * assign them atomically.
 */
export function createFsfDensityAndAnalysisTextures(
  device: GPUDevice,
  gridSize: number = DENSITY_GRID_SIZE
): {
  densityTexture: GPUTexture
  densityTextureView: GPUTextureView
  analysisTexture: GPUTexture
  analysisTextureView: GPUTextureView
} {
  const densityTexture = createDensityTexture(
    device,
    'free-scalar',
    GPUTextureUsage.COPY_DST,
    gridSize
  )
  const densityTextureView = densityTexture.createView({
    label: 'free-scalar-density-view',
    dimension: '3d',
  })
  const analysisTexture = device.createTexture({
    label: 'free-scalar-analysis-grid',
    size: {
      width: gridSize,
      height: gridSize,
      depthOrArrayLayers: gridSize,
    },
    format: 'rgba16float',
    dimension: '3d',
    usage:
      GPUTextureUsage.STORAGE_BINDING |
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.COPY_SRC |
      GPUTextureUsage.COPY_DST,
  })
  const analysisTextureView = analysisTexture.createView({
    label: 'free-scalar-analysis-view',
    dimension: '3d',
  })
  return { densityTexture, densityTextureView, analysisTexture, analysisTextureView }
}

/**
 * Module-level cache for the FSF texture zero-fill buffer.
 *
 * Keyed on the full byte length rather than `DENSITY_GRID_SIZE` so a future
 * resize (or a test that mounts different grid sizes in one process) still
 * reuses the buffer when possible without silently serving a wrong-sized
 * allocation. The buffer is only ever read by `writeTexture`, so freezing a
 * single zeros instance across mode switches is safe — no caller mutates it.
 *
 * Typed as `Uint8Array<ArrayBuffer>` (not the default `ArrayBufferLike`)
 * so the WebGPU `writeTexture` overload that requires a non-shared
 * `ArrayBufferView<ArrayBuffer>` accepts the reuse without a cast.
 */
let cachedTextureZeros: Uint8Array<ArrayBuffer> | null = null

/**
 * Zero-fill the FSF density + analysis 3D textures. Invoked on the
 * position-space → k-space analysis-mode transition to avoid displaying
 * stale position-space data while the k-space readback is still in
 * flight (the FFT worker takes several frames to publish its first
 * result, during which the raymarcher would otherwise show whatever
 * the write-grid pass last wrote).
 *
 * Reuses a module-level zero-fill scratch buffer across calls. Mode
 * transitions happen on user-facing frames and allocating ~2 MB per
 * transition (the 64^3 × 8 bytes default) produced measurable GC churn
 * in the flamegraph during rapid toggling of the analysis mode.
 *
 * @param device - GPU device
 * @param densityTexture - 3D density grid to clear
 * @param analysisTexture - 3D analysis grid to clear
 */
export function clearFsfDensityAndAnalysisTextures(
  device: GPUDevice,
  densityTexture: GPUTexture,
  analysisTexture: GPUTexture,
  gridSize: number = DENSITY_GRID_SIZE
): void {
  const bytesPerTexel = 8
  const bytesPerRow = gridSize * bytesPerTexel
  const rowsPerImage = gridSize
  const byteLength = bytesPerRow * rowsPerImage * gridSize
  if (cachedTextureZeros === null || cachedTextureZeros.byteLength !== byteLength) {
    cachedTextureZeros = new Uint8Array(new ArrayBuffer(byteLength))
  }
  const zeros = cachedTextureZeros
  const texSize = {
    width: gridSize,
    height: gridSize,
    depthOrArrayLayers: gridSize,
  }
  device.queue.writeTexture(
    { texture: densityTexture },
    zeros,
    { bytesPerRow, rowsPerImage },
    texSize
  )
  device.queue.writeTexture(
    { texture: analysisTexture },
    zeros,
    { bytesPerRow, rowsPerImage },
    texSize
  )
}
