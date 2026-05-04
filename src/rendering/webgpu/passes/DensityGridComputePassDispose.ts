/**
 * Density Grid Compute Pass — Dispose and Readback
 *
 * Handles GPU resource cleanup and density distribution readback for
 * the density grid compute pass. Extracted from DensityGridComputePass
 * to keep the main file under the 600-line max-lines limit.
 *
 * @module rendering/webgpu/passes/DensityGridComputePassDispose
 */

import type { DensityDistributionAnalyzer } from './DensityDistributionAnalysis'

/** Mutable state for GPU->CPU density readback. */
export interface DensityReadbackState {
  densityTexture: GPUTexture | null
  densityReadbackBuffer: GPUBuffer | null
  readbackBytesPerRow: number
  readbackBytesPerTexel: number
  readbackTexelStrideHalfs: number
  readbackInFlight: boolean
  readbackPendingSubmit: boolean
  shouldRefreshDistribution: boolean
  gridSize: number
  worldBound: number
  analyzer: DensityDistributionAnalyzer
}

/** GPU resources that must be destroyed on dispose. */
export interface DensityGridGpuFields {
  densityTexture: GPUTexture | null
  densityTextureView: GPUTextureView | null
  normalTexture: GPUTexture | null
  normalTextureView: GPUTextureView | null
  gradientPipeline: GPUComputePipeline | null
  gradientBindGroup: GPUBindGroup | null
  gridParamsBuffer: GPUBuffer | null
  schroedingerBuffer: GPUBuffer | null
  basisBuffer: GPUBuffer | null
  openQuantumBuffer: GPUBuffer | null
  hydrogenBasisBuffer: GPUBuffer | null
  computeBindGroup: GPUBindGroup | null
  computeBindGroupLayout: GPUBindGroupLayout | null
  densityReadbackBuffer: GPUBuffer | null
}

/**
 * Queue GPU->CPU readback of the density volume for threshold extraction.
 *
 * Copies the density texture to the readback buffer via the command encoder.
 * The actual CPU-side processing happens in {@link startPendingReadback}
 * after the command buffer is submitted.
 *
 * @param ctx - Render context with active encoder
 * @param state - Mutable readback state
 */
export function refreshDensityDistribution(
  ctx: { encoder: GPUCommandEncoder },
  state: DensityReadbackState
): void {
  if (
    !state.densityTexture ||
    !state.densityReadbackBuffer ||
    state.readbackInFlight ||
    state.readbackPendingSubmit ||
    !state.shouldRefreshDistribution
  ) {
    return
  }

  const readbackBuffer = state.densityReadbackBuffer

  ctx.encoder.copyTextureToBuffer(
    { texture: state.densityTexture },
    {
      buffer: readbackBuffer,
      bytesPerRow: state.readbackBytesPerRow,
      rowsPerImage: state.gridSize,
    },
    {
      width: state.gridSize,
      height: state.gridSize,
      depthOrArrayLayers: state.gridSize,
    }
  )

  state.readbackInFlight = true
  state.readbackPendingSubmit = true
  state.shouldRefreshDistribution = false
}

/**
 * Start CPU readback after queued copy work has been submitted.
 *
 * Maps the readback buffer, builds the density distribution from the
 * half-float data, and unmaps. Uses queueMicrotask to avoid holding
 * the buffer in "pending map" state during synchronous queue.submit().
 *
 * The microtask runs after the caller's synchronous `applyState` has already
 * copied flag values back to the pass, so its own mutations of `state` would
 * be orphaned in a snapshot. `applyState` is invoked again from the microtask
 * (in `.finally`) so `readbackInFlight = false` actually reaches the pass —
 * without it the readback flag is stuck at `true` forever after the first
 * frame and every subsequent `refreshDensityDistribution` is skipped, freezing
 * the confidence-mass threshold at frame-0 density values.
 *
 * @param state - Mutable readback state
 * @param device - GPU device (for stale-buffer detection)
 * @param applyState - Optional callback invoked after the microtask resolves
 *                     so flag mutations propagate back to the pass instance
 */
export function startPendingReadback(
  state: DensityReadbackState,
  device: GPUDevice | null,
  applyState?: (state: DensityReadbackState) => void
): void {
  if (!state.readbackPendingSubmit || !device || !state.densityReadbackBuffer) {
    return
  }

  const readbackBuffer = state.densityReadbackBuffer
  state.readbackPendingSubmit = false

  queueMicrotask(() =>
    readbackBuffer
      .mapAsync(GPUMapMode.READ)
      .then(() => {
        if (state.densityReadbackBuffer !== readbackBuffer) {
          // Stale buffer from a prior setup
          try {
            readbackBuffer.unmap()
          } catch {
            /* already destroyed */
          }
          return
        }
        const mapped = readbackBuffer.getMappedRange()
        const halfView = new Uint16Array(mapped)
        state.analyzer.buildDistribution(
          halfView,
          state.gridSize,
          state.readbackBytesPerRow,
          state.readbackBytesPerTexel,
          state.readbackTexelStrideHalfs,
          state.worldBound
        )
        readbackBuffer.unmap()
      })
      .catch(() => {
        state.shouldRefreshDistribution = true
      })
      .finally(() => {
        state.readbackInFlight = false
        applyState?.(state)
      })
  )
}

/**
 * Destroy all GPU resources owned by the density grid compute pass.
 *
 * @param fields - Mutable GPU resource fields to destroy and null
 * @param analyzer - Distribution analyzer to reset
 */
export function disposeDensityGridResources(
  fields: DensityGridGpuFields,
  analyzer: DensityDistributionAnalyzer
): void {
  fields.densityTexture?.destroy()
  fields.densityTexture = null
  fields.densityTextureView = null
  fields.normalTexture?.destroy()
  fields.normalTexture = null
  fields.normalTextureView = null
  fields.gradientPipeline = null
  fields.gradientBindGroup = null
  fields.gridParamsBuffer?.destroy()
  fields.gridParamsBuffer = null
  fields.schroedingerBuffer?.destroy()
  fields.schroedingerBuffer = null
  fields.basisBuffer?.destroy()
  fields.basisBuffer = null
  fields.openQuantumBuffer?.destroy()
  fields.openQuantumBuffer = null
  fields.hydrogenBasisBuffer?.destroy()
  fields.hydrogenBasisBuffer = null
  fields.computeBindGroup = null
  fields.computeBindGroupLayout = null
  if (fields.densityReadbackBuffer) {
    try {
      fields.densityReadbackBuffer.unmap()
    } catch {
      // ignore: buffer may already be unmapped/destroyed
    }
    fields.densityReadbackBuffer.destroy()
  }
  fields.densityReadbackBuffer = null

  analyzer.reset()
}
