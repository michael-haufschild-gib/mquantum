/**
 * TDSE Heller Readback
 *
 * Sidecar GPU readback that captures the wavefunction at decimated
 * frame intervals, computes the autocorrelation C(t) = ⟨ψ(0)|ψ(t)⟩
 * against a cached t=0 snapshot, and pushes the result into a
 * Heller ring buffer for FFT-based spectroscopy.
 *
 * Concurrency / lifecycle:
 *  - At most one readback is in flight at a time (`readbackInFlight`).
 *  - Two reusable MAP_READ staging buffers (one for ψ.re, one for ψ.im)
 *    are allocated lazily on the first successful schedule and reused
 *    across every subsequent capture. Reallocation only occurs when
 *    `totalSites` changes (field rebuild). This replaces the per-schedule
 *    `createBuffer`/`destroy` cycle that previously churned ~8 MB/frame
 *    at 128³ lattices.
 *  - A generation counter is bumped by `resetHellerCapture`, allowing
 *    stale async handlers to bail out cleanly if the pass was reset
 *    or re-initialised while a readback was pending.
 *  - Observation times are stored as offsets from the first captured
 *    sim time, so `buffer.times[0] === 0` by construction.
 *  - Pushes with `simTime <= lastTime` are skipped (paused simulation
 *    protection), keeping `dt > 0` for the downstream FFT.
 *
 * @module rendering/webgpu/passes/TDSEHellerReadback
 */

import type { TdseConfig } from '@/lib/geometry/extended/types'
import {
  createHellerBuffer,
  type HellerRingBuffer,
  pushAutocorrelationSample,
  resetHellerBuffer,
} from '@/lib/physics/tdse/heller'
import { useHellerSpectrometerStore } from '@/stores/hellerSpectrometerStore'

/**
 * Mutable state container shared between the TDSE compute pass and this
 * Heller readback module.
 */
export interface HellerReadbackState {
  /** Capture toggle, synchronised from the store each frame. */
  enabled: boolean
  /** Frames between samples, synchronised from the store each frame. */
  sampleInterval: number
  /** Counts ticks since the last successful capture schedule. */
  frameCounter: number
  /** Cached ψ(0) real components (length `totalSites`). */
  psi0Re: Float32Array | null
  /** Cached ψ(0) imaginary components (length `totalSites`). */
  psi0Im: Float32Array | null
  /** True while a readback is awaiting mapAsync resolution. */
  readbackInFlight: boolean
  /** Ring buffer of (C(t), t) samples. */
  buffer: HellerRingBuffer
  /** Base sim time captured on the first sample; added to as an offset. */
  baseSimTime: number | null
  /** Monotonic generation counter; bumped on reset to invalidate pending readbacks. */
  generation: number
  /** psi real GPU buffer (borrowed, not owned). */
  psiReBuffer: GPUBuffer | null
  /** psi imaginary GPU buffer (borrowed, not owned). */
  psiImBuffer: GPUBuffer | null
  /** Number of lattice sites in the borrowed psi buffers. */
  totalSites: number
  /**
   * Reusable MAP_READ staging buffer for ψ.re. Persistently allocated so
   * the per-sample hot path does not churn `createBuffer` / `destroy`
   * every capture. `null` until the first schedule or after
   * {@link disposeHellerStagingBuffers}.
   */
  stagingRe: GPUBuffer | null
  /** Reusable MAP_READ staging buffer for ψ.im. */
  stagingIm: GPUBuffer | null
  /**
   * Size in bytes of the allocated staging buffers. Used to detect
   * whether a field rebuild changed `totalSites` and we therefore need
   * to reallocate.
   */
  stagingBytes: number
  /**
   * Fingerprint of the Hamiltonian-affecting config fields from the most
   * recently processed frame. Used to detect mid-capture potential
   * changes that would mix two eigenbases into one autocorrelation
   * trace — see {@link computeStaticHFingerprint} for the exact field
   * set. `null` before the first frame.
   */
  staticHFingerprint: string | null
}

/**
 * Create a fresh Heller readback state with default 1024-sample buffer.
 *
 * @returns Initial state
 */
export function createHellerReadbackState(): HellerReadbackState {
  return {
    enabled: false,
    sampleInterval: 2,
    frameCounter: 0,
    psi0Re: null,
    psi0Im: null,
    readbackInFlight: false,
    buffer: createHellerBuffer(),
    baseSimTime: null,
    generation: 0,
    psiReBuffer: null,
    psiImBuffer: null,
    totalSites: 0,
    stagingRe: null,
    stagingIm: null,
    stagingBytes: 0,
    staticHFingerprint: null,
  }
}

/**
 * Serialise the subset of {@link TdseConfig} that defines the stationary
 * Hamiltonian into a compact string. A change to any of these fields
 * invalidates any in-progress Heller capture because the cached ψ(0)
 * snapshot is an eigenstate mixture of the *old* Hamiltonian, and any
 * subsequent samples evolve under the *new* Hamiltonian — the resulting
 * C(t) would be a nonsense superposition of two eigenbases and its FFT
 * peaks would have no physical meaning.
 *
 * Drive fields (`drive*`) are intentionally excluded because a driven
 * Hamiltonian is already handled by the `hamiltonianTimeDependent`
 * suspension path. Simulation cadence fields (`dt`, `stepsPerFrame`,
 * `speed`) are excluded because the uniformity check in
 * `computeHellerSpectrum` rejects traces whose stored dt is non-uniform.
 *
 * @param config - The current TDSE config
 * @returns A deterministic string fingerprint
 */
function computeStaticHFingerprint(config: TdseConfig): string {
  // Hand-rolled list instead of `JSON.stringify(config)` so that we
  // (a) don't bust the fingerprint on cosmetic/visual fields and
  // (b) keep the cost independent of added unrelated fields.
  return [
    config.potentialType,
    config.mass,
    config.hbar,
    config.barrierHeight,
    config.barrierWidth,
    config.barrierCenter,
    config.wellDepth,
    config.wellWidth,
    config.harmonicOmega,
    config.harmonicOmegaInit ?? '',
    config.trapAnisotropy ? config.trapAnisotropy.join(',') : '',
    config.stepHeight,
    config.slitSeparation,
    config.slitWidth,
    config.wallThickness,
    config.wallHeight,
    config.latticeDepth,
    config.latticePeriod,
    config.doubleWellLambda,
    config.doubleWellSeparation,
    config.doubleWellAsymmetry,
    config.radialWellInner,
    config.radialWellOuter,
    config.radialWellDepth,
    config.radialWellTilt,
    config.anharmonicLambda,
    config.disorderStrength,
    config.disorderSeed,
    config.disorderDistribution,
    config.customPotentialExpression,
    config.absorberEnabled ? 1 : 0,
    config.absorberWidth,
    config.pmlTargetReflection,
    config.compactDims.map((b) => (b ? '1' : '0')).join(''),
    config.compactRadii.join(','),
  ].join('|')
}

/**
 * Release the persistent staging buffers. Intended for the compute-pass
 * dispose path when the lattice shape changes or the pass is being torn
 * down. The in-flight readback handler (if any) holds a local reference
 * to the old buffers, so calling this during a live readback races with
 * mapAsync — the caller must bump the `generation` counter first so the
 * stale handler bails out.
 *
 * @param state - Readback state; `stagingRe`, `stagingIm`, and
 *                `stagingBytes` are cleared.
 */
export function disposeHellerStagingBuffers(state: HellerReadbackState): void {
  state.stagingRe?.destroy()
  state.stagingIm?.destroy()
  state.stagingRe = null
  state.stagingIm = null
  state.stagingBytes = 0
}

/**
 * Ensure the state has a pair of MAP_READ staging buffers sized for the
 * current `totalSites`. If the pool is empty or the cached size differs,
 * destroy the old pair and allocate a new one. Safe to call every
 * schedule — the fast path is a pair of identity checks.
 *
 * @param device - WebGPU device
 * @param state - Readback state (mutated in place)
 * @param byteSize - `totalSites * 4` (Float32 lattice)
 */
function ensureStagingBuffers(
  device: GPUDevice,
  state: HellerReadbackState,
  byteSize: number
): void {
  if (state.stagingRe && state.stagingIm && state.stagingBytes === byteSize) return
  // Size mismatch (field rebuilt) or first-time init — recreate.
  state.stagingRe?.destroy()
  state.stagingIm?.destroy()
  state.stagingRe = device.createBuffer({
    label: 'heller-staging-re',
    size: byteSize,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  })
  state.stagingIm = device.createBuffer({
    label: 'heller-staging-im',
    size: byteSize,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  })
  state.stagingBytes = byteSize
}

/**
 * Schedule a single autocorrelation readback. A no-op if disabled,
 * missing psi buffers, already in flight, or below the decimation
 * threshold. The staging buffers are drawn from the persistent pool on
 * `state` — nothing is allocated on the hot path once the pool is warm.
 *
 * Scheduling invariants (critical for FFT correctness):
 *  - `frameCounter` ticks every frame while enabled, independent of the
 *    in-flight flag. If we froze the counter during back-pressure, slow
 *    readbacks would silently stretch the next sample gap and break the
 *    uniform-sampling assumption that `computeHellerSpectrum` relies on.
 *  - When the counter reaches `sampleInterval` but a prior readback is
 *    still in flight, this slot is DROPPED and the counter reset to 0.
 *    This keeps all surviving sample gaps as integer multiples of
 *    `sampleInterval` frames — if the frame dt is stable, that preserves
 *    a uniform time grid; if some slots are missed, the downstream
 *    uniformity check in `computeHellerSpectrum` rejects the trace.
 *
 * @param device - WebGPU device
 * @param encoder - Current command encoder
 * @param state - Mutable readback state (updated in place)
 * @param simTime - Current TDSE simulation time
 */
export function scheduleHellerReadback(
  device: GPUDevice,
  encoder: GPUCommandEncoder,
  state: HellerReadbackState,
  simTime: number
): void {
  if (!state.enabled || !state.psiReBuffer || !state.psiImBuffer || state.totalSites <= 0) return

  // Always tick — do NOT gate this behind `readbackInFlight`, or slow
  // GPU readbacks will stretch the next sample gap and create a shifted
  // ω axis in the spectrum.
  state.frameCounter++
  if (state.frameCounter < Math.max(1, state.sampleInterval)) return

  if (state.readbackInFlight) {
    // Back-pressure: skip this sample slot cleanly. Reset the counter
    // so the next attempt is a full `sampleInterval` frames away — this
    // forces dropped gaps to be exact integer multiples of the nominal
    // period rather than shorter "catch-up" gaps that would leak into
    // the FFT as a phase-wrapped peak.
    state.frameCounter = 0
    return
  }
  state.frameCounter = 0

  const byteSize = state.totalSites * 4
  ensureStagingBuffers(device, state, byteSize)
  // After ensureStagingBuffers the pool is guaranteed populated, but TS
  // needs the local aliases to be non-null for the closure below.
  const stagingRe = state.stagingRe
  const stagingIm = state.stagingIm
  if (!stagingRe || !stagingIm) return

  encoder.copyBufferToBuffer(state.psiReBuffer, 0, stagingRe, 0, byteSize)
  encoder.copyBufferToBuffer(state.psiImBuffer, 0, stagingIm, 0, byteSize)

  state.readbackInFlight = true
  const capturedGeneration = state.generation
  const capturedSimTime = simTime
  const capturedTotalSites = state.totalSites

  /**
   * Release the staging buffers back into the pool. They are NOT
   * destroyed — only unmapped — so the next schedule can reuse them
   * without paying for a WebGPU allocation.
   *
   * Identity guard against the replace-then-resolve race: if the pool
   * has swapped out the staging buffers while this readback was in
   * flight (via `ensureStagingBuffers` on a size change, or via
   * `disposeHellerStagingBuffers` on a pass dispose), the local
   * aliases point to freed / destroyed buffers and calling `unmap()`
   * on them is undefined. We only touch the buffers if they are still
   * the ones published on `state` — otherwise whoever swapped them out
   * already took care of unmapping / destruction, and we just clear
   * the in-flight flag.
   */
  const finish = (): void => {
    if (state.stagingRe === stagingRe && stagingRe.mapState !== 'unmapped') {
      stagingRe.unmap()
    }
    if (state.stagingIm === stagingIm && stagingIm.mapState !== 'unmapped') {
      stagingIm.unmap()
    }
    state.readbackInFlight = false
  }

  device.queue
    .onSubmittedWorkDone()
    .then(async () => {
      if (capturedGeneration !== state.generation) {
        finish()
        return
      }
      if (stagingRe.mapState !== 'unmapped' || stagingIm.mapState !== 'unmapped') {
        finish()
        return
      }
      await Promise.all([stagingRe.mapAsync(GPUMapMode.READ), stagingIm.mapAsync(GPUMapMode.READ)])
      if (capturedGeneration !== state.generation) {
        finish()
        return
      }

      const mappedRe = new Float32Array(stagingRe.getMappedRange())
      const mappedIm = new Float32Array(stagingIm.getMappedRange())

      if (state.psi0Re === null || state.psi0Im === null) {
        // First sample: cache ψ(0) deep copy and record the anchor.
        const psi0Re = new Float32Array(capturedTotalSites)
        const psi0Im = new Float32Array(capturedTotalSites)
        psi0Re.set(mappedRe.subarray(0, capturedTotalSites))
        psi0Im.set(mappedIm.subarray(0, capturedTotalSites))
        state.psi0Re = psi0Re
        state.psi0Im = psi0Im
        state.baseSimTime = capturedSimTime

        // C(0) = ⟨ψ₀|ψ₀⟩ = Σ |ψ₀|². Record it as the t=0 anchor.
        let c0 = 0
        for (let i = 0; i < capturedTotalSites; i++) {
          const r = psi0Re[i]!
          const m = psi0Im[i]!
          c0 += r * r + m * m
        }
        pushAutocorrelationSample(state.buffer, c0, 0, 0)
        useHellerSpectrometerStore.getState().setSampleCount(state.buffer.count)
      } else {
        // Guard against paused-simulation duplicates: require strictly
        // increasing sim time.
        const base = state.baseSimTime ?? 0
        const newT = capturedSimTime - base
        const buf = state.buffer
        const lastIdx = buf.count === 0 ? -1 : (buf.head - 1 + buf.capacity) % buf.capacity
        const lastT = lastIdx >= 0 ? buf.times[lastIdx]! : -Infinity
        if (newT > lastT) {
          const psi0Re = state.psi0Re
          const psi0Im = state.psi0Im
          let cRe = 0
          let cIm = 0
          const nSites = Math.min(capturedTotalSites, psi0Re.length)
          for (let i = 0; i < nSites; i++) {
            const ar = psi0Re[i]!
            const ai = psi0Im[i]!
            const br = mappedRe[i]!
            const bi = mappedIm[i]!
            // ⟨a|b⟩ = Σ conj(a) · b = Σ (ar - i·ai)(br + i·bi)
            cRe += ar * br + ai * bi
            cIm += ar * bi - ai * br
          }
          pushAutocorrelationSample(buf, cRe, cIm, newT)
          useHellerSpectrometerStore.getState().setSampleCount(buf.count)
        }
      }

      finish()
    })
    .catch(() => {
      finish()
    })
}

/**
 * Per-frame entry point used by `TDSEComputePass`. Handles the store
 * ↔ state synchronisation, the time-dependent Hamiltonian guard, the
 * UI reset token, and the actual schedule call in one place so the
 * compute pass body stays small.
 *
 * Time-dependent Hamiltonian guard: Heller's theorem assumes a
 * stationary H so that ψ(t) can be expanded in a fixed eigenbasis. A
 * driven potential (`potentialType === 'driven'` with `driveEnabled`)
 * modulates V(x,t) — the resulting autocorrelation is NOT a pure sum
 * of eigenfrequencies, so feeding it into the FFT would yield drive
 * sidebands that look like eigenvalues but aren't. We publish the
 * time-dependence flag on the store (UI uses it to disable controls
 * with an explanatory banner) and hold `state.enabled` to false for
 * the duration.
 *
 * @param device - WebGPU device
 * @param encoder - Current command encoder
 * @param state - Mutable readback state (updated in place)
 * @param config - Active TDSE config (used only to detect driven H(t))
 * @param simTime - Current TDSE simulation time
 * @param lastHandledResetToken - The reset token this pass consumed on
 *   the previous frame; any mismatch with the store's current
 *   `pendingResetToken` triggers a capture reset.
 * @returns Updated reset token for the pass to cache.
 */
export function applyHellerPerFrame(
  device: GPUDevice,
  encoder: GPUCommandEncoder,
  state: HellerReadbackState,
  config: TdseConfig,
  simTime: number,
  lastHandledResetToken: number
): number {
  const hellerStore = useHellerSpectrometerStore.getState()
  const hamiltonianIsTimeDependent =
    config.potentialType === 'driven' && config.driveEnabled === true
  if (hellerStore.hamiltonianTimeDependent !== hamiltonianIsTimeDependent) {
    hellerStore.setHamiltonianTimeDependent(hamiltonianIsTimeDependent)
  }
  let nextToken = lastHandledResetToken

  // Static-H fingerprint guard. A change to any Hamiltonian-defining
  // config field mid-capture would produce a nonsense C(t): the cached
  // ψ(0) snapshot is an eigenmixture of the OLD H, the next sample
  // evolves under the NEW H, and the FFT peaks mix two unrelated
  // eigenvalue ladders. Detect the change, reset, and notify the UI so
  // any displayed spectrum is cleared. We store the fingerprint on the
  // first frame without resetting (the pass just came up — there is
  // nothing to invalidate).
  //
  // Ordering: reset *before* assigning the new fingerprint.
  // `resetHellerCapture` clears `state.staticHFingerprint` as part of
  // its normal contract (so the next frame re-anchors against the then-
  // current config); if we assigned the new fingerprint first, the
  // reset call below would immediately null it out and the NEXT frame
  // would see the guard fire again against the same config we already
  // reset for, producing an endless reset loop whenever
  // `computeStaticHFingerprint` returns a value that differs from
  // `null`.
  const fingerprint = computeStaticHFingerprint(config)
  if (state.staticHFingerprint === null) {
    state.staticHFingerprint = fingerprint
  } else if (state.staticHFingerprint !== fingerprint) {
    // Only act when a capture is actually in progress — if ψ(0) has
    // never been captured (idle), there is nothing to invalidate and
    // resetting would needlessly bump the store version.
    if (state.psi0Re !== null || state.buffer.count > 0) {
      resetHellerCapture(state)
      hellerStore.bumpResetVersion()
    }
    state.staticHFingerprint = fingerprint
  }

  if (hellerStore.pendingResetToken !== lastHandledResetToken) {
    resetHellerCapture(state)
    nextToken = hellerStore.pendingResetToken
  }
  state.enabled = hellerStore.enabled && !hamiltonianIsTimeDependent
  state.sampleInterval = hellerStore.sampleInterval
  scheduleHellerReadback(device, encoder, state, simTime)
  return nextToken
}

/**
 * Clear the cached ψ(0) snapshot and ring buffer, and bump the
 * generation counter so any pending async handler bails out.
 *
 * @param state - Readback state to reset in place
 */
export function resetHellerCapture(state: HellerReadbackState): void {
  state.generation++
  state.psi0Re = null
  state.psi0Im = null
  state.baseSimTime = null
  state.frameCounter = 0
  resetHellerBuffer(state.buffer)
  // Clear the fingerprint too: the next `applyHellerPerFrame` will
  // re-anchor it against the current config. Leaving the old value in
  // place would either falsely mask a legitimate change (if the config
  // happens to match again) or, worse, cause a second redundant reset
  // on the very next frame via the potential-change path.
  state.staticHFingerprint = null
  // `readbackInFlight` is intentionally NOT reset here — the in-flight
  // handler owns the staging buffers and will clear the flag itself
  // after it detects the generation bump.
}
