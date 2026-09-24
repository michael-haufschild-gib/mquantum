/**
 * TDSE State Save/Load — GPU Readback & Injection
 *
 * Extracted from TDSEComputePass to keep file sizes under the lint limit.
 * Contains the save readback (via generic stateSave), slice capture, and
 * loaded-state injection logic.
 *
 * @module rendering/webgpu/passes/TDSEStateSaveLoad
 */

import { logger } from '@/lib/logger'
import { computeStrides } from '@/lib/math/ndArray'
import {
  useWavefunctionSliceStore,
  type WavefunctionSliceSourceMode,
} from '@/stores/diagnostics/wavefunctionSliceStore'
import { useExtendedObjectStore } from '@/stores/scene/extendedObjectStore'

import type { WebGPURenderContext } from '../../core/types'
import { interleaveStateInjection, requestStateSave as genericStateSave } from '../stateSave'

/** Mutable state shared between the save function and the TDSE pass. */
export interface SaveLoadState {
  /** Merged ψ buffer (array<vec2f>, totalSites * 8 bytes). */
  psiBuffer: GPUBuffer | null
  totalSites: number
  saveMappingInFlight: boolean
  pendingInjection: {
    re: Float32Array
    im: Float32Array
    isMeasurementCollapse?: boolean
    targetNorm?: number
  } | null
}

/**
 * Initiate async save of the current wavefunction state.
 * Copies the merged ψ buffer to staging within the current command encoder
 * via the generic stateSave 'interleaved' layout (the merged ψ memory
 * layout is exactly [Re,Im,Re,Im,...] f32, matching the existing
 * interleaved consumer used by quantum walk), then maps async after GPU
 * submit.
 */
export function requestStateSave(ctx: WebGPURenderContext, state: SaveLoadState): boolean {
  if (!state.psiBuffer || state.saveMappingInFlight) return false
  // Merged ψ stride: 8 bytes/site (vec2f = 2 × f32 interleaved).
  const byteSize = state.totalSites * 8

  state.saveMappingInFlight = true
  genericStateSave(ctx, {
    source: {
      layout: 'interleaved',
      buffer: state.psiBuffer,
      byteSize,
      elementCount: state.totalSites,
    },
    totalSites: state.totalSites,
    label: 'tdse',
    getMetadata: async () => {
      const schroedinger = useExtendedObjectStore.getState().schroedinger
      const quantumMode = schroedinger.quantumMode
      const tdseConfig = quantumMode === 'becDynamics' ? schroedinger.bec : schroedinger.tdse
      return {
        quantumMode,
        config: {
          quantumMode,
          tdse: schroedinger.tdse,
          bec: schroedinger.bec,
          dirac: schroedinger.dirac,
          freeScalar: schroedinger.freeScalar,
        } as Record<string, unknown>,
        gridSize: tdseConfig.gridSize?.slice(0, tdseConfig.latticeDim ?? 3) ?? [64],
        componentCount: 1,
      }
    },
    onFinished: () => {
      state.saveMappingInFlight = false
    },
  })
  return true
}

/**
 * Initiate async capture of a 1D wavefunction slice |ψ(x)|².
 * Copies psi buffers to staging, maps, extracts a center-plane 1D cross-section,
 * and delivers the result to the wavefunctionSliceStore.
 *
 * @param ctx - Render context (device + encoder)
 * @param state - Shared save/load state with buffer references
 * @param axis - Axis to slice along ('x', 'y', or 'z')
 * @param gridSize - Per-axis lattice sizes (exactly `latticeDim` entries)
 * @param worldBound - Lattice half-extent N·dx/2 of the slice axis (the
 *                     export maps sample i to (i − N/2 + ½)·dx from it)
 * @param sourceMode - Quantum mode that scheduled this capture
 */
export function requestSliceCapture(
  ctx: WebGPURenderContext,
  state: SaveLoadState,
  axis: 'x' | 'y' | 'z',
  gridSize: number[],
  worldBound: number,
  sourceMode: WavefunctionSliceSourceMode = null
): boolean {
  // Returns false when a previous save/slice readback is still in flight
  // (sharing `saveMappingInFlight`) so the caller can leave the request
  // flag set and retry next frame instead of silently dropping the user's
  // capture request.
  if (!state.psiBuffer || state.saveMappingInFlight) return false
  const { device, encoder } = ctx
  // Merged ψ stride: 8 bytes/site (vec2f, interleaved [Re,Im,...]).
  const byteSize = state.totalSites * 8

  const staging = device.createBuffer({
    label: 'slice-staging',
    size: byteSize,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  })

  encoder.copyBufferToBuffer(state.psiBuffer, 0, staging, 0, byteSize)
  state.saveMappingInFlight = true

  const totalSites = state.totalSites

  device.queue
    .onSubmittedWorkDone()
    .then(async () => {
      if (staging.mapState !== 'unmapped') {
        staging.destroy()
        state.saveMappingInFlight = false
        return
      }
      await staging.mapAsync(GPUMapMode.READ)

      const interleaved = new Float32Array(staging.getMappedRange())
      const axisIdx = { x: 0, y: 1, z: 2 }[axis]
      const sliceData = extractCenteredDensitySlice(interleaved, gridSize, axisIdx, totalSites)
      const sliceSize = sliceData.length

      staging.unmap()
      staging.destroy()

      useWavefunctionSliceStore.getState().fulfillCapture({
        sliceData,
        axis,
        sourceMode,
        gridSize: sliceSize,
        worldBound,
      })

      state.saveMappingInFlight = false
    })
    .catch(() => {
      staging.destroy()
      state.saveMappingInFlight = false
    })
  return true
}

/**
 * Extract |ψ|² along lattice axis `axisIdx` through the centre site of every
 * other axis, from the merged interleaved ψ buffer ([Re, Im, …] per site).
 * Indexes with the TDSE row-major layout over ALL lattice axes (last axis
 * fastest, stride_d = Π_{k>d} N_k). The former hand-rolled
 * `ix·ny·nz + iy·nz + iz` was exact only for D ≤ 3: on a 4D+ lattice it
 * pinned the real axis 0 at site 0 (the lattice edge) and shifted every
 * other axis by one.
 *
 * @param interleaved - Mapped ψ buffer, length ≥ 2·totalSites
 * @param gridSize - Per-axis lattice sizes (exactly `latticeDim` entries)
 * @param axisIdx - Slice axis; an axis beyond the lattice yields one sample
 * @param totalSites - Site count guarding reads past the buffer
 * @returns Density samples along the axis
 */
export function extractCenteredDensitySlice(
  interleaved: Float32Array,
  gridSize: readonly number[],
  axisIdx: number,
  totalSites: number
): Float32Array {
  const strides = computeStrides(gridSize)
  let base = 0
  for (let d = 0; d < gridSize.length; d++) {
    if (d !== axisIdx) base += Math.floor((gridSize[d] ?? 1) / 2) * strides[d]!
  }
  const onLattice = axisIdx < gridSize.length
  const sliceSize = onLattice ? (gridSize[axisIdx] ?? 1) : 1
  const stride = onLattice ? strides[axisIdx]! : 0
  const sliceData = new Float32Array(sliceSize)
  for (let i = 0; i < sliceSize; i++) {
    const flatIdx = base + i * stride
    if (flatIdx >= totalSites) continue
    const r = interleaved[2 * flatIdx]!
    const j = interleaved[2 * flatIdx + 1]!
    const density = r * r + j * j
    sliceData[i] = Number.isFinite(density) && density >= 0 ? density : 0
  }
  return sliceData
}

/**
 * Inject loaded wavefunction data into GPU psi buffers.
 * Skips the normal init shader dispatch.
 *
 * @returns true if injection was performed
 */
export function injectLoadedWavefunction(
  device: GPUDevice,
  state: SaveLoadState,
  totalSites: number
): boolean {
  if (!state.pendingInjection || !state.psiBuffer) return false

  let interleaved: Float32Array<ArrayBuffer>
  try {
    interleaved = interleaveStateInjection('TDSE', state.pendingInjection, totalSites)
  } catch (err) {
    state.pendingInjection = null
    throw err
  }
  const elementCount = totalSites
  device.queue.writeBuffer(state.psiBuffer, 0, interleaved)
  state.pendingInjection = null
  logger.log(`[TDSE] Injected loaded wavefunction (${elementCount} sites)`)
  return true
}
