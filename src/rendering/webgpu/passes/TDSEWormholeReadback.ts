/**
 * TDSE — Wormhole Coherence Readback.
 *
 * Piggybacks on the existing diagnostic cadence to ship ψ back to the CPU
 * once per readback interval when
 * `config.wormholeCoupling.wormholeCoherenceHudEnabled === true`.
 *
 * Design notes:
 * - Staging buffers are allocated once per lattice rebuild (sized by
 *   `totalSites · 4` bytes each), then re-used across frames. This
 *   mirrors the `DiagReadbackState` lifetime so we don't churn the GPU
 *   allocator at diagnostic frequency.
 * - Only a single readback may be in flight at a time. If the previous
 *   mapAsync hasn't resolved, the current tick is skipped. Under normal
 *   cadence (~12 frames apart), this is effectively never hit; keeping
 *   the gate avoids unmap() churn if the render loop pauses.
 * - All GPU work is gated behind `enabled` in {@link requestWormholeReadback}
 *   so the hot path has zero cost with the HUD off.
 *
 * @module rendering/webgpu/passes/TDSEWormholeReadback
 */

import { logger } from '@/lib/logger'
import { computeWormholeCoherence } from '@/lib/physics/tdse/wormholeCoupling'
import { useWormholeCoherenceStore } from '@/stores/wormholeCoherenceStore'

/** Mutable per-pass readback state for the wormhole HUD. */
export interface WormholeReadbackState {
  /** Persistent staging for ψ_re (MAP_READ | COPY_DST). */
  stagingRe: GPUBuffer | null
  /** Persistent staging for ψ_im. */
  stagingIm: GPUBuffer | null
  /** Total sites the current staging buffers were sized for. */
  stagingTotalSites: number
  /** A mapAsync is in flight — skip new requests until it resolves. */
  mappingInFlight: boolean
  /** Monotonic generation counter — bumped on reset, drops stale results. */
  generation: number
}

/** Create a zeroed readback state container. */
export function createWormholeReadbackState(): WormholeReadbackState {
  return {
    stagingRe: null,
    stagingIm: null,
    stagingTotalSites: 0,
    mappingInFlight: false,
    generation: 0,
  }
}

/**
 * Ensure staging buffers exist and match the current lattice size. Called
 * from {@link requestWormholeReadback} on-demand.
 */
function ensureStagingBuffers(
  device: GPUDevice,
  state: WormholeReadbackState,
  totalSites: number
): void {
  if (state.stagingTotalSites === totalSites && state.stagingRe && state.stagingIm) return
  state.stagingRe?.destroy()
  state.stagingIm?.destroy()
  const bytes = Math.max(4, totalSites * 4)
  state.stagingRe = device.createBuffer({
    label: 'tdse-wormhole-readback-re',
    size: bytes,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  })
  state.stagingIm = device.createBuffer({
    label: 'tdse-wormhole-readback-im',
    size: bytes,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  })
  state.stagingTotalSites = totalSites
  state.mappingInFlight = false
}

/**
 * Record copy-to-staging commands and schedule an async mapAsync that
 * computes `I(L:R)` on the CPU and pushes into the store. No-op when
 * the feature is disabled or a previous readback is still pending.
 *
 * @param device - WebGPU device.
 * @param encoder - Current frame command encoder.
 * @param state - Persistent readback state.
 * @param enabled - `wormholeCoherenceHudEnabled` gate.
 * @param psiRe - Source ψ_re storage buffer.
 * @param psiIm - Source ψ_im storage buffer.
 * @param totalSites - Current lattice size (must be > 0).
 * @param gridSize - Per-axis lattice sizes (used by the CPU reduction).
 * @param axis - Mirror axis index.
 * @param g - Coupling `g` at sample time (written into the HUD store badge).
 * @param simTime - Current simulation time.
 */
export function requestWormholeReadback(
  device: GPUDevice,
  encoder: GPUCommandEncoder,
  state: WormholeReadbackState,
  enabled: boolean,
  psiRe: GPUBuffer | null,
  psiIm: GPUBuffer | null,
  totalSites: number,
  gridSize: readonly number[],
  axis: 0 | 1 | 2,
  g: number,
  simTime: number
): void {
  if (!enabled) return
  if (!psiRe || !psiIm || totalSites === 0) return
  if (state.mappingInFlight) return
  ensureStagingBuffers(device, state, totalSites)
  if (!state.stagingRe || !state.stagingIm) return

  const bytes = totalSites * 4
  encoder.copyBufferToBuffer(psiRe, 0, state.stagingRe, 0, bytes)
  encoder.copyBufferToBuffer(psiIm, 0, state.stagingIm, 0, bytes)
  state.mappingInFlight = true
  const gen = state.generation

  // Capture references up front — `state.stagingRe` can be reassigned by a
  // lattice rebuild between now and the mapAsync resolving.
  const stagingRe = state.stagingRe
  const stagingIm = state.stagingIm
  const capturedGridSize = gridSize.slice()

  device.queue
    .onSubmittedWorkDone()
    .then(async () => {
      // A lattice rebuild may have orphaned these buffers (generation was
      // bumped by {@link resetWormholeReadback}); skip instead of crashing.
      if (gen !== state.generation) {
        state.mappingInFlight = false
        return
      }
      if (stagingRe.mapState !== 'unmapped' || stagingIm.mapState !== 'unmapped') {
        state.mappingInFlight = false
        return
      }
      await Promise.all([stagingRe.mapAsync(GPUMapMode.READ), stagingIm.mapAsync(GPUMapMode.READ)])
      if (gen !== state.generation) {
        stagingRe.unmap()
        stagingIm.unmap()
        state.mappingInFlight = false
        return
      }
      const reView = new Float32Array(stagingRe.getMappedRange())
      const imView = new Float32Array(stagingIm.getMappedRange())
      const interleaved = new Float32Array(2 * totalSites)
      for (let i = 0; i < totalSites; i++) {
        interleaved[2 * i] = reView[i]!
        interleaved[2 * i + 1] = imView[i]!
      }
      stagingRe.unmap()
      stagingIm.unmap()
      let coherence: number
      try {
        coherence = computeWormholeCoherence(interleaved, capturedGridSize, axis)
      } catch (err) {
        logger.warn('[TDSE] Wormhole coherence CPU reduction failed:', err)
        state.mappingInFlight = false
        return
      }
      useWormholeCoherenceStore.getState().pushSample(simTime, coherence, axis, g)
      state.mappingInFlight = false
    })
    .catch((err) => {
      logger.warn('[TDSE] Wormhole readback failed:', err)
      state.mappingInFlight = false
    })
}

/**
 * Drop staging buffers and bump the generation counter so any in-flight
 * mapAsync callbacks terminate without touching the stale buffers.
 */
export function resetWormholeReadback(state: WormholeReadbackState): void {
  state.stagingRe?.destroy()
  state.stagingIm?.destroy()
  state.stagingRe = null
  state.stagingIm = null
  state.stagingTotalSites = 0
  state.mappingInFlight = false
  state.generation = (state.generation + 1) >>> 0
}
