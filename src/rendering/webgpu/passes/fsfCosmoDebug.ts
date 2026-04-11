/**
 * Free Scalar Field — cosmology debug ring buffer.
 *
 * Dev-only instrumentation split out of `FreeScalarFieldComputePass.ts`.
 * Playwright measurement specs poll the shared global buffer via
 * `page.evaluate(() => globalThis.__fsfCosmoDebug)` to observe the
 * integrator without the async diagnostics-readback latency masking
 * short-lived transients (e.g. the NaN flash captured in
 * `scripts/playwright-output/fsf-desitter-autoscale-flash.json`).
 *
 * Normal runs pay essentially nothing: the compute pass early-outs on
 * the `enabled` flag which the spec sets right before kicking off the
 * trace. See `docs/adr/010-fsf-cosmology-late-time-integrator.md`.
 */

import type { FreeScalarConfig } from '@/lib/geometry/extended/types'
import type { CosmologyCoefs } from '@/lib/physics/cosmology/background'
import { useDiagnosticsStore } from '@/stores/diagnosticsStore'

/**
 * Single cosmology snapshot captured by the debug ring buffer. Wire-compatible
 * with the playwright measurement spec — keep the shape flat and plain-f32
 * friendly so `page.evaluate` can read it without a deserialization layer.
 */
export interface FsfCosmoDebugSample {
  /** Frame ordinal since the last reset (monotonic, advances once per executeField). */
  frame: number
  /** `performance.now()` timestamp at the capture, ms since navigation. */
  t: number
  /** Sim conformal time `η` at the end of the frame's leapfrog loop. */
  simEta: number
  /** Scale factor `a(η)` reconstructed from aPotential and the latticeDim. */
  a: number
  /** Three cosmology coefs written to the uniform at the end of the frame. */
  aKinetic: number
  aPotential: number
  aFull: number
  /** Adaptive sub-step count chosen at the start of the frame (1 = no sub-stepping). */
  nSub: number
  /** Physical mass-term contribution `m²·a²` used for the CFL calculation. */
  mSqAsq: number
  /**
   * Max frame energy read from the diagnostics store at the capture point.
   * `NaN` if no diagnostics snapshot has landed yet (async readback pipeline).
   */
  diagTotalEnergy: number
  diagMaxPhi: number
  diagMaxPi: number
}

/**
 * Global ring buffer exposed on `window` when cosmology is active. The
 * playwright measurement spec polls this via `page.evaluate` to observe
 * the integrator without the async diagnostics readback latency masking
 * short-lived transients.
 *
 * Capacity is capped so long runs don't accumulate unbounded memory; the
 * buffer wraps around after `FSF_COSMO_DEBUG_CAPACITY` samples and exposes
 * `head` so the consumer can reconstruct the temporal order.
 */
export interface FsfCosmoDebugBuffer {
  samples: FsfCosmoDebugSample[]
  capacity: number
  head: number // index of next write — the oldest sample is at (head) mod capacity
  enabled: boolean
}

const FSF_COSMO_DEBUG_CAPACITY = 2048

/**
 * Lazily-initialized shared debug buffer. Single instance per page — we
 * currently have only one FSF compute pass per app. The `enabled` flag is
 * toggled by the playwright spec before kicking off the measurement
 * (`window.__fsfCosmoDebug.enabled = true`) so normal runs pay nothing.
 */
export function getOrCreateFsfCosmoDebugBuffer(): FsfCosmoDebugBuffer | null {
  if (typeof globalThis === 'undefined') return null
  const g = globalThis as unknown as { __fsfCosmoDebug?: FsfCosmoDebugBuffer }
  if (!g.__fsfCosmoDebug) {
    g.__fsfCosmoDebug = {
      samples: [],
      capacity: FSF_COSMO_DEBUG_CAPACITY,
      head: 0,
      enabled: false,
    }
  }
  return g.__fsfCosmoDebug
}

/**
 * Push one cosmology debug snapshot into the ring buffer if it's enabled.
 * Samples the live diagnostics store so the trace carries both the
 * current cosmology coefs (pinned to the frame's `simEta`) and the
 * most recent async readback of field statistics (`maxPhi`, `maxPi`,
 * `totalEnergy`). Early-out cost is a single property read.
 */
export function captureFsfCosmoDebugSample(
  config: FreeScalarConfig,
  coefs: CosmologyCoefs,
  simEta: number,
  lastDebugNSub: number,
  frameIndex: number
): void {
  const buf = getOrCreateFsfCosmoDebugBuffer()
  if (!buf || !buf.enabled) return

  // Reconstruct `a` from the cosmology coefs so the trace has a single
  // source of truth that matches what the shader saw. aPotential = a^(n−2)
  // so a = aPotential^(1/(n−2)); for latticeDim=1 (n=2) aPotential ≡ 1
  // and we fall back to the raw power-law evaluation.
  const n = config.latticeDim + 1
  let a = 1
  if (n > 2 && coefs.aPotential > 0) {
    a = Math.pow(coefs.aPotential, 1 / (n - 2))
  }
  const mSqAsq = config.mass * config.mass * a * a

  // Sample the diagnostics store at the capture instant. The store holds
  // the most recent async readback, which may lag the current frame by
  // `diagnosticsInterval` frames. We mark it with the frame index so the
  // consumer can cross-reference.
  const diagState = useDiagnosticsStore.getState().fsf
  const sample: FsfCosmoDebugSample = {
    frame: frameIndex,
    t: typeof performance !== 'undefined' ? performance.now() : 0,
    simEta,
    a,
    aKinetic: coefs.aKinetic,
    aPotential: coefs.aPotential,
    aFull: coefs.aFull,
    nSub: lastDebugNSub,
    mSqAsq,
    diagTotalEnergy: diagState.totalEnergy,
    diagMaxPhi: diagState.maxPhi,
    diagMaxPi: diagState.maxPi,
  }

  if (buf.samples.length < buf.capacity) {
    buf.samples.push(sample)
    buf.head = buf.samples.length
  } else {
    buf.samples[buf.head % buf.capacity] = sample
    buf.head += 1
  }
}
