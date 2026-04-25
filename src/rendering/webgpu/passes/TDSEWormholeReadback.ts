/**
 * TDSE — Wormhole Coherence Readback.
 *
 * Piggybacks on the existing diagnostic cadence to ship ψ back to the CPU
 * once per readback interval when
 * `config.wormholeCoupling.wormholeCoherenceHudEnabled === true`.
 *
 * Design notes:
 * - One staging buffer per readback (sized `totalSites · 8` bytes) is
 *   allocated per lattice rebuild, then re-used across frames. The merged
 *   ψ buffer's vec2f memory layout is `[re0, im0, re1, im1, ...]` — the
 *   exact format `computeWormholeCoherence` already expects, so no CPU
 *   interleave is needed (the previous split-buffer version had to
 *   manually combine two Float32Arrays into one each tick).
 * - Only a single readback may be in flight at a time. If the previous
 *   mapAsync hasn't resolved, the current tick is skipped.
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
  /** Persistent staging for the merged ψ buffer (MAP_READ | COPY_DST, 8 bytes/site). */
  staging: GPUBuffer | null
  /** Total sites the current staging buffer was sized for. */
  stagingTotalSites: number
  /** A mapAsync is in flight — skip new requests until it resolves. */
  mappingInFlight: boolean
  /** Monotonic generation counter — bumped on reset, drops stale results. */
  generation: number
}

/** Create a zeroed readback state container. */
export function createWormholeReadbackState(): WormholeReadbackState {
  return {
    staging: null,
    stagingTotalSites: 0,
    mappingInFlight: false,
    generation: 0,
  }
}

/**
 * Ensure the staging buffer exists and matches the current lattice size.
 * Called from {@link requestWormholeReadback} on-demand.
 */
function ensureStagingBuffer(
  device: GPUDevice,
  state: WormholeReadbackState,
  totalSites: number
): void {
  if (state.stagingTotalSites === totalSites && state.staging) return
  state.staging?.destroy()
  // 8 bytes per site (vec2f). Floor to 8 so empty lattices don't violate
  // the WebGPU minimum-buffer-size rule.
  const bytes = Math.max(8, totalSites * 8)
  state.staging = device.createBuffer({
    label: 'tdse-wormhole-readback',
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
 * @param psiBuffer - Source merged ψ buffer (array<vec2f>).
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
  psiBuffer: GPUBuffer | null,
  totalSites: number,
  gridSize: readonly number[],
  axis: 0 | 1 | 2,
  g: number,
  simTime: number
): void {
  if (!enabled) return
  if (!psiBuffer || totalSites === 0) return
  if (state.mappingInFlight) return
  ensureStagingBuffer(device, state, totalSites)
  if (!state.staging) return

  const bytes = totalSites * 8
  encoder.copyBufferToBuffer(psiBuffer, 0, state.staging, 0, bytes)
  state.mappingInFlight = true
  const gen = state.generation

  // Capture references up front — `state.staging` can be reassigned by a
  // lattice rebuild between now and the mapAsync resolving.
  const staging = state.staging
  const capturedGridSize = gridSize.slice()

  device.queue
    .onSubmittedWorkDone()
    .then(async () => {
      if (gen !== state.generation) {
        state.mappingInFlight = false
        return
      }
      if (staging.mapState !== 'unmapped') {
        state.mappingInFlight = false
        return
      }
      await staging.mapAsync(GPUMapMode.READ)
      if (gen !== state.generation) {
        staging.unmap()
        state.mappingInFlight = false
        return
      }
      // The merged ψ memory layout is exactly the [re0,im0,re1,im1,...]
      // format `computeWormholeCoherence` consumes — no CPU interleave needed.
      const interleaved = new Float32Array(staging.getMappedRange())
      let coherence: number
      try {
        const view = interleaved.subarray(0, 2 * totalSites)
        coherence = computeWormholeCoherence(view, capturedGridSize, axis)
      } catch (err) {
        logger.warn('[TDSE] Wormhole coherence CPU reduction failed:', err)
        staging.unmap()
        state.mappingInFlight = false
        return
      }
      staging.unmap()
      useWormholeCoherenceStore.getState().pushSample(simTime, coherence, axis, g)
      state.mappingInFlight = false
    })
    .catch((err) => {
      logger.warn('[TDSE] Wormhole readback failed:', err)
      state.mappingInFlight = false
    })
}

/**
 * Drop the staging buffer and bump the generation counter so any in-flight
 * mapAsync callbacks terminate without touching the stale buffer.
 */
export function resetWormholeReadback(state: WormholeReadbackState): void {
  state.staging?.destroy()
  state.staging = null
  state.stagingTotalSites = 0
  state.mappingInFlight = false
  state.generation = (state.generation + 1) >>> 0
}
