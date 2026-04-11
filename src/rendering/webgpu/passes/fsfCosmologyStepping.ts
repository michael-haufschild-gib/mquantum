/**
 * Free Scalar Field — cosmology stepping helpers (pure module).
 *
 * Split out of `FreeScalarFieldComputePass.ts` so the CFL preview, adiabatic
 * sub-stepping, and ETA-floor clamp math lives in one place and can be unit
 * tested without spinning up a GPU device. The compute pass imports every
 * symbol from here; there is no logic duplication between modules.
 *
 * See `docs/adr/010-fsf-cosmology-late-time-integrator.md` for the physics
 * rationale behind the constants and the four independent safeguards.
 */

import type { FreeScalarConfig } from '@/lib/geometry/extended/types'
import { logger } from '@/lib/logger'
import type { CosmologyCoefs } from '@/lib/physics/cosmology/background'
import { computeMassSquaredScale } from '@/lib/physics/cosmology/preheating'

import {
  FSF_COSMO_COEFS_BYTE_OFFSET,
  FSF_COSMO_COEFS_BYTE_SIZE,
} from './FreeScalarFieldComputePassUniforms'

/**
 * Numerical floor on `|η|` during cosmological evolution. The canonical δφ
 * integrator is CFL-stable on its own — `ω² = k² + m²·a²` is bounded at
 * finite `a` — but the discontinuous clamp of `simEta` to this floor
 * drives a non-adiabatic jump in the cosmology coefficients `(A, B, C)`
 * over a single outer leapfrog step. Near the floor, `a(η) ∝ 1/|η|` in
 * de Sitter so a step from `η = −0.005` to `η = 0` (clamped to `−floor`)
 * multiplies `a` by `1/(H·floor)/200 ≈ 5×` *per step*. The leapfrog
 * pumps mode energy violently during that non-adiabatic transition and
 * `π` overshoots to `≫ 10⁶×` its previous value before any sub-step can
 * absorb the change — eventually overflowing float32 and producing NaN.
 *
 * Pick the floor at `|η| = 0.01` — deep enough in the late-time regime
 * that every lattice mode is well super-horizon (`k_min·|η| = 2π/(N·Δ)·η
 * ≪ 1` for the 64³/Δ=0.1 defaults), so the physics is already frozen
 * and further evolution toward `η → 0⁻` would add nothing, while the
 * coefficient jump at the clamp stays modest enough for the adaptive
 * CFL sub-stepper to handle without pumping the mode oscillators into
 * overflow. From `η₀ = −10` this still gives 1000× scale-factor growth
 * — plenty of dynamic range for the visualization.
 *
 * See `scripts/playwright-output/fsf-desitter-autoscale-flash.json` for
 * the captured trace that drove the floor increase.
 */
export const COSMOLOGY_ETA_FLOOR = 1e-2

/**
 * Leapfrog CFL safety ceiling for the adaptive sub-stepping loop. The
 * physical dispersion at the current `η` is `ω² = k_max² + m²·a²`; a full
 * `dt·ω` exceeding this threshold triggers sub-stepping of the pi/phi
 * updates. The theoretical leapfrog limit is `dt·ω < 2`, where the
 * amplification factors sit exactly on the complex unit circle — *marginally*
 * stable, not strictly stable. At that edge, float32 roundoff and the
 * discontinuous jump in the cosmology coefficients when `simEta` is
 * clamped to the ETA floor push individual cells into the overflow regime
 * before the transient dies out, eventually producing NaN via the
 * Laplacian stencil (see `scripts/playwright-output/fsf-desitter-
 * autoscale-flash.json` for the captured trace that led here).
 *
 * We pick `1.0`, giving the sub-stepper a factor-of-2 margin on `dt·ω`
 * and `h²ω² ≤ 1` so the leapfrog eigenvalues sit well inside the stable
 * disk. The extra sub-steps are ~2× more work only at the deepest
 * late-time regime; everywhere else `ω·dt ≪ 1` already and nothing
 * changes.
 */
export const COSMOLOGY_CFL_SAFETY = 1.0

/**
 * Hard cap on the number of cosmology sub-steps per outer leapfrog step.
 * Beyond this the user has driven the simulation so deep toward the
 * singularity (massive de Sitter at tiny |η|, Kasner/ekpyrotic near the
 * Big Bang) that further sub-stepping would stall the renderer. When
 * hit, we clamp and emit a deduplicated warning — honest "the integrator
 * can't keep up" rather than a silent numerical blow-up.
 */
export const COSMOLOGY_MAX_SUBSTEPS = 32

/**
 * Adiabatic sub-stepping ceiling. The leapfrog is CFL-stable as long as
 * `dt·ω < CFL_SAFETY`, but CFL alone does not guarantee that the slowly-
 * varying cosmological background stays *adiabatic* relative to the mode
 * oscillator — i.e. that the relative change in the zero-mode frequency
 * `ω₀ ≈ m·a` per sub-step satisfies `|Δω/ω| ≪ 1`. If it doesn't, the
 * leapfrog pumps the mode oscillator out of its instantaneous ground
 * state and the canonical amplitudes overshoot by orders of magnitude
 * (captured as the 92× energy jump at the floor crossing in
 * `scripts/playwright-output/fsf-desitter-autoscale-flash.json`).
 *
 * We require per sub-step `|Δω₀/ω_avg| < 0.1` — i.e. the scale factor
 * changes by no more than ~10% of its mean over one sub-step. Combined
 * with the CFL ceiling via `nSub = max(nSub_cfl, nSub_adiab)`, this
 * keeps the numerical integrator tracking the analytical mode functions
 * without excitations. Under Minkowski `a(η) ≡ 1` and the adiabatic
 * check returns 1, so nothing changes for the flat-background path.
 */
export const COSMOLOGY_ADIABATIC_SAFETY = 0.1

/**
 * Pure, non-mutating projection of `simEta` after advancing by `dt`. Mirrors
 * the clamp/floor logic of `FreeScalarFieldComputePass.advanceSimEta`:
 * every proposal whose absolute value falls below `COSMOLOGY_ETA_FLOOR` —
 * including the `proposed === 0` and sign-flip cases — is snapped to
 * `±COSMOLOGY_ETA_FLOOR` with the original sign preserved.
 *
 * Exists so the CFL preview in the leapfrog loop can see the end-of-step
 * `simEta` *without* mutating the state. In de Sitter, `a(η) ∝ 1/|η|` grows
 * monotonically toward the singularity, so a CFL check evaluated only at
 * the start of the outer step misses the discontinuous jump to the floor
 * and the pi update at the end of the step runs above the leapfrog
 * stability limit. Projecting forward and computing CFL at both endpoints
 * fixes that; see `executeField` for the call site.
 *
 * The runtime instance method `advanceSimEta` delegates to this helper so
 * the clamp math lives in exactly one place.
 *
 * @param currentEta - Current conformal time (must be non-zero for cosmology)
 * @param dt - Leapfrog time step (positive)
 * @returns The projected `simEta` with the floor/sign clamp applied
 */
export function projectSimEta(currentEta: number, dt: number): number {
  const originalSign = currentEta < 0 ? -1 : 1
  // Move toward η = 0: opposite direction from the current branch's sign.
  const proposed = currentEta - originalSign * dt
  // Single check: floor OR sign flip (Math.sign(0) === 0 ≠ originalSign,
  // so the explicit `proposed === 0` clause is already covered).
  const crossedSingularity = Math.sign(proposed) !== originalSign
  if (crossedSingularity || Math.abs(proposed) < COSMOLOGY_ETA_FLOOR) {
    return originalSign * COSMOLOGY_ETA_FLOOR
  }
  return proposed
}

/**
 * Adiabatic-safety substep count for a single outer leapfrog step.
 *
 * Returns the minimum `nSub` such that the relative change in the
 * zero-mode frequency `ω₀ ≈ m·a` over a single sub-step stays below
 * `COSMOLOGY_ADIABATIC_SAFETY`. With `a² = aFull / aPotential` from
 * the cosmology coefficient ratio (by construction, aFull = a^n and
 * aPotential = a^(n-2), so their ratio is `a²` for any spatial
 * dimension), we compute `a_start` and `a_end` directly and use the
 * scalar fractional change `|a_end − a_start| / a_avg` — for
 * mass-dominated modes `ω₀ ∝ a`, so the fractional change in `ω₀`
 * equals the fractional change in `a`. For sub-horizon modes
 * `ω_k ≈ k_lat` doesn't depend on `a` at all, so this over-estimates
 * the adiabatic pressure — that's conservative (safer), never unsafe.
 *
 * Under Minkowski or the identity fallback, `a_start = a_end = 1` and
 * this returns 1 — no substepping pressure — so the flat-background
 * path is bit-identical to the previous behaviour.
 *
 * @param coefsStart - Cosmology coefficients at the start of the outer step
 * @param coefsEnd - Cosmology coefficients at the projected end of the outer step
 * @returns Integer sub-step count in `[1, COSMOLOGY_MAX_SUBSTEPS]`
 */
export function computeAdiabaticSubsteps(
  coefsStart: { aFull: number; aPotential: number },
  coefsEnd: { aFull: number; aPotential: number }
): number {
  const aSqStart = coefsStart.aPotential > 0 ? coefsStart.aFull / coefsStart.aPotential : 1
  const aSqEnd = coefsEnd.aPotential > 0 ? coefsEnd.aFull / coefsEnd.aPotential : 1
  const aStart = Math.sqrt(Math.max(aSqStart, 0))
  const aEnd = Math.sqrt(Math.max(aSqEnd, 0))
  const aAvg = 0.5 * (aStart + aEnd)
  if (!(aAvg > 0)) return 1
  const relativeChange = Math.abs(aEnd - aStart) / aAvg
  if (!(relativeChange > COSMOLOGY_ADIABATIC_SAFETY)) return 1
  const ideal = Math.ceil(relativeChange / COSMOLOGY_ADIABATIC_SAFETY)
  return ideal <= COSMOLOGY_MAX_SUBSTEPS ? ideal : COSMOLOGY_MAX_SUBSTEPS
}

/**
 * Adaptive CFL sub-step count for the canonical δφ leapfrog. The
 * physical dispersion `ω² = k_max² + m²·a²` is bounded as long as `a`
 * is bounded, but massive modes in de Sitter (or any late-time limit
 * where `a → ∞`) drive `m·a·dt` above the leapfrog stability ceiling.
 * When that happens we subdivide the outer step and take several
 * smaller leapfrog sub-steps with frozen coefs, preserving second-order
 * accuracy within the sub-step window.
 *
 * Uses the maximum over active dimensions of `k_max_d = π/spacing[d]`
 * (Nyquist) as the effective cutoff — close enough to the discrete
 * Laplacian spectrum that the safety factor absorbs the difference.
 *
 * When the ideal sub-step count exceeds `COSMOLOGY_MAX_SUBSTEPS`, the
 * caller-supplied `capWarnedKeys` set is used to dedupe the overflow
 * warning by `(preset, latticeDim, mass, dt)` so the user only hears
 * it once per configuration. Pass a fresh set if warnings aren't desired.
 *
 * @param config - Free scalar field configuration
 * @param aFull - a^n at the current η (source of the time-varying mass term)
 * @param aPotential - a^(n−2) at the current η
 * @param capWarnedKeys - Set used for dedupe of the sub-step cap warning
 * @returns Integer sub-step count in `[1, COSMOLOGY_MAX_SUBSTEPS]`
 */
export function computeFsfCflSubsteps(
  config: FreeScalarConfig,
  aFull: number,
  aPotential: number,
  capWarnedKeys: Set<string>
): number {
  // Physical dispersion uses m²·a² = m²·(aFull/aPotential).
  const aSq = aPotential > 0 ? aFull / aPotential : 1
  const massSq = config.mass * config.mass * aSq

  let kMaxSq = 0
  for (let d = 0; d < config.latticeDim; d++) {
    const spacing = config.spacing[d]!
    if (!(spacing > 0) || config.gridSize[d]! <= 1) continue
    // Nyquist: k_max_d = π/a_d, contributing (π/a)² per dimension to k².
    const kmax = Math.PI / spacing
    kMaxSq += kmax * kmax
  }

  const omega = Math.sqrt(Math.max(kMaxSq + massSq, 0))
  const cflRatio = config.dt * omega
  if (!(cflRatio > COSMOLOGY_CFL_SAFETY)) return 1

  const ideal = Math.ceil(cflRatio / COSMOLOGY_CFL_SAFETY)
  if (ideal <= COSMOLOGY_MAX_SUBSTEPS) return ideal

  // Cap reached: emit a dedupe-by-preset warning so the user learns
  // once that the integrator is saturated.
  const cosmo = config.cosmology
  const key = `${cosmo.preset}|d=${config.latticeDim}|m=${config.mass}|dt=${config.dt}`
  if (!capWarnedKeys.has(key)) {
    capWarnedKeys.add(key)
    logger.warn(
      `[FSF-COMPUTE] cosmology sub-step cap reached (preset=${cosmo.preset}, ` +
        `ω·dt=${cflRatio.toFixed(3)}, ideal=${ideal}, cap=${COSMOLOGY_MAX_SUBSTEPS}). ` +
        `Evolution continues but with reduced stability — increase stepsPerFrame, ` +
        `reduce dt, or step back from the singularity.`
    )
  }
  return COSMOLOGY_MAX_SUBSTEPS
}

/**
 * Per-substep coefficient bundle produced by {@link resolveFsfSubstepCoefs}.
 *
 * The compute pass streams this bundle into the GPU uniform buffer via
 * {@link writeFsfCosmologyCoefsSlot} every drift→kick pair whenever either
 * cosmology or preheating is active, so the pi-update shader reads fresh
 * values for the time-dependent FLRW coefficients and the parametric
 * resonance drive.
 */
export interface FsfSubstepCoefs {
  /** FLRW kinetic coefficient `a^(−(n−2))` — 1 under Minkowski. */
  aKinetic: number
  /** FLRW potential coefficient `a^(n−2)` — 1 under Minkowski. */
  aPotential: number
  /** FLRW volume-form coefficient `a^n` — 1 under Minkowski. */
  aFull: number
  /** Preheating drive scalar `1 + A·sin(Ω·(t−ref))` — 1 when disabled. */
  massSquaredScale: number
}

/**
 * Runtime state exposed by the compute pass to {@link resolveFsfSubstepCoefs}.
 * Encapsulates just enough of the pass-instance fields to keep the helper
 * pure (no GPU dependency) while still letting it advance both the
 * cosmological clock and the Minkowski-path preheating counter in a single
 * call.
 */
export interface FsfSubstepClock {
  /** Advance `simEta` by one substep and return the clamped new value. */
  advanceSimEta: (subDt: number) => number
  /** Current Minkowski-path preheating time (mutated in place when needed). */
  preheatingTime: number
  /** Reference time captured at the most recent reset. */
  preheatingReferenceEta: number
}

/**
 * Compute the per-substep coefficient bundle to upload to the GPU uniform
 * buffer during one drift→kick leapfrog substep.
 *
 * Advances the relevant clock (`simEta` when cosmology is on, a separate
 * Minkowski counter otherwise) and returns both the updated coefficients
 * and the new `preheatingTime` so the caller can assign it back to the
 * pass instance. Keeps all cosmology+preheating composition logic in one
 * place so the compute pass stays focused on GPU dispatch bookkeeping.
 *
 * @param config - Free scalar field configuration
 * @param subDt - Size of this leapfrog substep
 * @param cosmologyActive - Whether cosmology is enabled
 * @param preheatingActive - Whether the preheating drive is enabled
 * @param clock - Pass runtime state (simEta advance + preheating clock)
 * @param evaluateCosmologyCoefs - Closure resolving `(aKinetic, aPotential,
 *                                 aFull)` at a given `η` — kept as a
 *                                 parameter so this helper stays free of
 *                                 the `computeFsfCosmologyCoefs` dependency.
 * @returns `{ coefs, preheatingTime }` — upload these and assign the
 *          returned counter back onto the pass instance.
 */
export function resolveFsfSubstepCoefs(
  config: FreeScalarConfig,
  subDt: number,
  cosmologyActive: boolean,
  preheatingActive: boolean,
  clock: FsfSubstepClock,
  evaluateCosmologyCoefs: (eta: number) => CosmologyCoefs
): { coefs: FsfSubstepCoefs; preheatingTime: number } {
  let aKinetic = 1
  let aPotential = 1
  let aFull = 1
  let preheatingClock: number
  let nextPreheatingTime = clock.preheatingTime

  if (cosmologyActive) {
    const newEta = clock.advanceSimEta(subDt)
    const coefs = evaluateCosmologyCoefs(newEta)
    aKinetic = coefs.aKinetic
    aPotential = coefs.aPotential
    aFull = coefs.aFull
    // Cosmology + preheating composition: the drive reads the
    // cosmological clock directly, so `preheatingReferenceEta` was
    // captured as the reset `simEta` and the drive fires at phase 0 from
    // the instant the lattice was initialised.
    preheatingClock = newEta
  } else {
    // Minkowski + preheating: advance the separate counter so
    // `sin(Ω·(t−ref))` produces the Mathieu equation of motion tied to
    // real physical time, not conformal time.
    nextPreheatingTime = clock.preheatingTime + subDt
    preheatingClock = nextPreheatingTime
  }

  const massSquaredScale = preheatingActive
    ? computeMassSquaredScale(preheatingClock, config.preheating, clock.preheatingReferenceEta)
    : 1

  return {
    coefs: { aKinetic, aPotential, aFull, massSquaredScale },
    preheatingTime: nextPreheatingTime,
  }
}

/**
 * Overwrite the contiguous 16-byte per-substep coefficient slot
 * `(aKinetic, aPotential, aFull, massSquaredScale)` in the uniform buffer,
 * avoiding the full 528-byte re-upload that `writeFsfUniforms` performs.
 * Called from the leapfrog substep loop whenever cosmology or preheating
 * is active so every drift + kick pair consumes fresh coefficients
 * evaluated at the current conformal time.
 *
 * The fourth slot (`massSquaredScale`) carries the post-inflation
 * preheating drive `1 + A·sin(Ω·(η−η_ref))`. Passing `1.0` makes this a
 * pure cosmology write — the pi-update's `massCoef = m²·aFull·scale`
 * factorization reduces to the bare canonical mass term, preserving
 * bit-identical behaviour for callers that don't need the drive.
 *
 * Allocates nothing per call — the values are staged through the
 * caller-owned `scratch` buffer (a 4-f32 Float32Array).
 *
 * @param device - GPU device
 * @param uniformBuffer - FSF uniform buffer
 * @param scratch - 4-element Float32Array scratch, reused across substeps
 * @param aKinetic - FLRW kinetic coefficient `a^(−(n−2))`
 * @param aPotential - FLRW potential coefficient `a^(n−2)`
 * @param aFull - FLRW volume-form coefficient `a^n`
 * @param massSquaredScale - Preheating drive scalar (1.0 when disabled)
 */
export function writeFsfCosmologyCoefsSlot(
  device: GPUDevice,
  uniformBuffer: GPUBuffer,
  scratch: Float32Array,
  aKinetic: number,
  aPotential: number,
  aFull: number,
  massSquaredScale: number
): void {
  scratch[0] = aKinetic
  scratch[1] = aPotential
  scratch[2] = aFull
  scratch[3] = massSquaredScale
  device.queue.writeBuffer(
    uniformBuffer,
    FSF_COSMO_COEFS_BYTE_OFFSET,
    scratch.buffer,
    scratch.byteOffset,
    FSF_COSMO_COEFS_BYTE_SIZE
  )
}
