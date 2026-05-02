/**
 * Web Worker for the Peschel entanglement-entropy probe.
 *
 * Offloads the main-thread-blocking Jacobi eigensolver sweep from the UI
 * so the React analysis panel stays responsive while the user scrubs the
 * FSF grid / mass / cosmology parameters. The per-call compute scales as
 * `O((N/2)⁴)` at worst (for the full length sweep), which at N = 256
 * saturates the main thread for several seconds if run inline.
 *
 * Message protocol:
 *
 *     Main → Worker: PeschelWorkerRequest
 *     Worker → Main: PeschelWorkerResponse
 *
 * Each request carries an `epoch` counter the caller increments on reset.
 * The worker tags its response with the same epoch so out-of-order or
 * stale responses are discarded cleanly — the request pipeline does not
 * serialize (the UI may send a new request before the old one returns).
 *
 * Only primitive-array message payloads are supported (no `Float64Array`
 * transfer across the worker boundary, since the UI side consumes plain
 * numeric arrays for SVG rendering anyway).
 *
 * @module lib/physics/entanglement/peschelWorker
 */

import { logger } from '@/lib/logger'
import type { CosmologyPresetParams } from '@/lib/physics/cosmology/presets'
import {
  computeCosmologicalEntropyTrajectory,
  type CosmologicalEntropyTrajectory,
} from '@/lib/physics/entanglement/peschelCosmology'
import {
  buildLatticeSliceCorrelators,
  computeEntanglementSpectrum,
  computeEntropySpectrum,
  extractSubsystem,
  fitCentralCharge,
  fitEntanglementTemperature,
  type LatticeCorrelators,
  symplecticEigenvalues,
} from '@/lib/physics/entanglement/peschelEntropy'

/**
 * Inbound message to the Peschel entanglement worker.
 *
 * The request captures everything the worker needs to build correlators,
 * scan `S(L_A)`, pick the modular spectrum at the currently-selected
 * subsystem length, and optionally sweep a cosmological η-trajectory.
 *
 * The lattice geometry is N-D: the probe slices along axis 0 and sums
 * over the remaining (latticeDim − 1) transverse axes when building the
 * slice correlator. For a genuine 1D run pass length-1 arrays and
 * `latticeDim = 1`.
 */
export interface PeschelWorkerRequest {
  type: 'compute'
  /** Epoch counter used to discard stale responses. */
  epoch: number
  /** Grid sizes per lattice dimension. First entry is the probed axis. */
  gridSize: number[]
  /** Lattice spacings per dimension. */
  spacing: number[]
  /** Active spatial dimensions of the lattice. */
  latticeDim: number
  /** Effective squared mass `m_eff² ≥ 0` to feed the correlator builder. */
  massSq: number
  /** Subsystem length `L_A` for the modular-spectrum readout. */
  subsystemLength: number
  /**
   * Optional cosmology trajectory request. When present, the worker also
   * builds `S(L_A, η)` over the supplied η sweep via
   * {@link computeCosmologicalEntropyTrajectory}. When absent, the
   * response's `trajectory` field is `null`.
   */
  cosmology?: {
    /** Physical mass `m` (unsquared) used by the trajectory builder. */
    mass: number
    /** Preset parameters (validated upstream). */
    params: CosmologyPresetParams
    /** η values to sweep. */
    etaSweep: number[]
  }
}

/**
 * Outbound result from the Peschel entanglement worker. All arrays are
 * plain `number[]` so the consumer can use them directly in React renders
 * without needing a TypedArray detour.
 */
export interface PeschelWorkerResponse {
  type: 'result'
  /** Echo of the request epoch — used by the consumer to drop stale jobs. */
  epoch: number
  /**
   * Echo of the request's `subsystemLength`. The sweep entropies/fit are
   * independent of this, but the `modular` and `trajectory` payloads are
   * **single-cut** values that only describe this specific L_A. Consumers
   * must label those outputs with the echoed length (or suppress them
   * while a newer request is in-flight) instead of assuming the current
   * UI selection matches the returned spectrum.
   */
  subsystemLength: number
  /** Subsystem lengths actually scanned by the entropy sweep. */
  lengths: number[]
  /** `S(L_A)` in nats, matching `lengths`. */
  entropies: number[]
  /** Central-charge fit over the short-distance log window. */
  fit: { c: number; intercept: number; rSquared: number; usedPoints: number }
  /** `half = N / 2` — for the UI to mark axis bounds without recomputing. */
  half: number
  /** Effective squared mass the correlators were built with. */
  massSq: number
  /** Modular-spectrum readout at the current `subsystemLength`, or null. */
  modular: {
    nu: number[]
    epsilon: number[]
    perModeEntropy: number[]
    totalEntropy: number
    entanglementGap: number
    temperatureFit: {
      inverseTemperature: number
      temperature: number
      rSquared: number
      usedModes: number
    }
  } | null
  /** Cosmological `S(L_A, η)` trajectory, or null if not requested. */
  trajectory: CosmologicalEntropyTrajectory | null
}

/**
 * Cache for the expensive length-sweep outputs.
 *
 * `buildLatticeSliceCorrelators` + `computeEntropySpectrum` +
 * `fitCentralCharge` together dominate the per-call cost (`O((N/2)⁴)` at
 * the top end). None of those outputs depend on `subsystemLength` — only
 * the modular-spectrum readout and the cosmology trajectory do. When the
 * user scrubs the L_A slider we therefore want to **reuse** the cached
 * correlators and sweep results instead of rebuilding them on every
 * keystroke.
 *
 * Keying: we hash the tuple `(gridSize, spacing, latticeDim, massSq)`.
 * `massSq` comes from the already-deterministic dispersion helper so
 * float equality is stable across identical inputs. Any change to the
 * lattice geometry or the effective mass invalidates the cache and we
 * rebuild.
 *
 * Scope: module-level singleton. The worker only services one consumer
 * (the FSF analysis panel), so a single-entry LRU is sufficient. Tests
 * that need a clean slate should dispatch a distinctive first request or
 * call {@link resetPeschelCacheForTests}.
 */
interface SweepCacheEntry {
  key: string
  correlators: LatticeCorrelators
  lengths: number[]
  entropies: number[]
  fit: { c: number; intercept: number; rSquared: number; usedPoints: number }
  half: number
  massSq: number
}
let sweepCache: SweepCacheEntry | null = null

/**
 * Build a stable cache key for the length-sweep cache. `JSON.stringify`
 * handles the primitive-array tuple deterministically.
 */
function sweepCacheKey(
  gridSize: readonly number[],
  spacing: readonly number[],
  latticeDim: number,
  massSq: number
): string {
  return JSON.stringify([gridSize, spacing, latticeDim, massSq])
}

/**
 * Reset the sweep cache. Exposed for unit tests that want to verify the
 * rebuild path runs exactly once across a sequence of requests.
 */
export function resetPeschelCacheForTests(): void {
  sweepCache = null
}

/**
 * Pure Peschel compute entry point. Lives outside the worker `onmessage`
 * handler so unit tests can drive it directly without spinning a Worker
 * instance (Vitest's happy-dom environment does not provide real Workers).
 *
 * @param req - Request payload
 * @returns Response payload with the full sweep + modular readout
 */
export function runPeschelCompute(req: PeschelWorkerRequest): PeschelWorkerResponse {
  const { gridSize, spacing, latticeDim, massSq, subsystemLength, cosmology } = req
  const N0 = gridSize[0] ?? 0
  const half = Math.floor(N0 / 2)

  // Length-sweep cache lookup. The sweep outputs are independent of
  // `subsystemLength`, so an L_A-only change is a cache hit that skips
  // the `O((N/2)⁴)` Jacobi sweep entirely.
  const cacheKey = sweepCacheKey(gridSize, spacing, latticeDim, massSq)
  let correlators: LatticeCorrelators
  let outLengths: number[]
  let entropies: number[]
  let fit: SweepCacheEntry['fit']
  if (sweepCache && sweepCache.key === cacheKey) {
    correlators = sweepCache.correlators
    outLengths = sweepCache.lengths
    entropies = sweepCache.entropies
    fit = sweepCache.fit
  } else {
    const lengths: number[] = []
    for (let L = 1; L <= half; L++) lengths.push(L)

    correlators = buildLatticeSliceCorrelators({
      gridSize,
      spacing,
      latticeDim,
      massSq,
    })
    const sweep = computeEntropySpectrum(correlators, N0, lengths, 0)
    outLengths = sweep.lengths
    entropies = sweep.entropies
    fit = fitCentralCharge(outLengths, entropies)

    sweepCache = {
      key: cacheKey,
      correlators,
      lengths: outLengths,
      entropies,
      fit,
      half,
      massSq,
    }
  }

  // Modular spectrum at the currently selected subsystem length. Reuses
  // the already-built correlators so the O(N²) Toeplitz fill is not
  // duplicated (the old main-thread probe ran it twice).
  let modular: PeschelWorkerResponse['modular'] = null
  if (subsystemLength >= 2 && subsystemLength <= half) {
    const XA = extractSubsystem(correlators.X, N0, 0, subsystemLength)
    const PA = extractSubsystem(correlators.P, N0, 0, subsystemLength)
    const nu = symplecticEigenvalues(XA, PA, subsystemLength)
    const spec = computeEntanglementSpectrum(nu)
    const tfit = fitEntanglementTemperature(spec)
    modular = {
      nu: Array.from(spec.nu),
      epsilon: Array.from(spec.epsilon),
      perModeEntropy: Array.from(spec.perModeEntropy),
      totalEntropy: spec.totalEntropy,
      entanglementGap: spec.entanglementGap,
      temperatureFit: {
        inverseTemperature: tfit.inverseTemperature,
        temperature: tfit.temperature,
        rSquared: tfit.rSquared,
        usedModes: tfit.usedModes,
      },
    }
  }

  // Optional cosmology trajectory. Skipped cleanly when the caller omits
  // the sub-payload (Minkowski / cosmology-disabled / invalid-preset
  // branches in the UI).
  let trajectory: CosmologicalEntropyTrajectory | null = null
  if (cosmology) {
    try {
      trajectory = computeCosmologicalEntropyTrajectory({
        gridSize,
        spacing,
        latticeDim,
        mass: cosmology.mass,
        subsystemLength,
        cosmology: cosmology.params,
        etaSweep: cosmology.etaSweep,
      })
    } catch (cause) {
      // Invalid subsystem length or lattice params — drop the
      // trajectory; the main panel result still stands. Log a dev-only
      // warning so a trajectory that comes back empty is diagnosable
      // by the developer without re-deriving the failure path. The
      // logger.warn is stripped in production builds.
      logger.warn('[peschelWorker] trajectory compute failed — returning trajectory=null', cause)
      trajectory = null
    }
  }

  return {
    type: 'result',
    epoch: req.epoch,
    subsystemLength,
    lengths: outLengths,
    entropies,
    fit,
    half,
    massSq,
    modular,
    trajectory,
  }
}

/**
 * Minimal local typing for the Worker global scope. We can't rely on
 * `DedicatedWorkerGlobalScope` because the main `tsconfig.json` does not
 * include the `"WebWorker"` lib. Defining what we need locally keeps the
 * pure-logic module compilable from both the main-thread and Worker
 * contexts without pulling in the full WebWorker DOM types.
 */
interface PeschelWorkerScope {
  postMessage(message: PeschelWorkerResponse): void
  onmessage: ((e: MessageEvent<PeschelWorkerRequest>) => void) | null
}

// The Worker thread only knows about `runPeschelCompute`. Vitest imports
// this module without a Worker context, so we guard the `onmessage`
// binding behind a `typeof self !== 'undefined'` + postMessage-shape
// check so the module stays side-effect free when imported from tests.
/* istanbul ignore next -- executed only in a real Worker runtime */
if (typeof self !== 'undefined' && typeof (self as unknown as Worker).postMessage === 'function') {
  const scope = self as unknown as PeschelWorkerScope
  scope.onmessage = (e: MessageEvent<PeschelWorkerRequest>) => {
    const req = e.data
    if (req.type !== 'compute') return
    const response = runPeschelCompute(req)
    scope.postMessage(response)
  }
}
