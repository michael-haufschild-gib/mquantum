/**
 * Single source of truth for the "effective squared mass"
 * `m_eff²(η) = m²·a²(η)` that the canonical δφ integrator, the k-space
 * adiabatic-vacuum thermometer, the UI dispersion diagram, and the
 * Peschel entanglement probe all need.
 *
 * Every caller used to reinvent this reduction — six distinct copies,
 * three of which swallowed `computeCosmologyAt` errors silently and one
 * of which used the dedup'd logger path. The helpers here centralize:
 *
 * 1. `computeFsfCosmologyCoefs(config, η)` — canonical δφ integrator
 *    triplet `(aKinetic, aPotential, aFull)` with deduplicated invalid-
 *    parameter warnings. Hot path: the per-frame leapfrog loop invokes
 *    this up to `stepsPerFrame` times per render frame under cosmology.
 *
 * 2. `computeFsfVacuumDispersion(config, η)` — {@link VacuumDispersion}
 *    tag used to select between the Klein-Gordon `max(mass, M_FLOOR)`
 *    path and the adiabatic-vacuum `ω² = k² + m²·a²(η)` path. Falls
 *    through to `'kgFloor'` on invalid cosmology params so every
 *    pipeline stage has a single, consistent fallback.
 *
 * 3. `computeFsfCosmologySnapshot(config, η)` — full per-frame snapshot
 *    `{a, hubble, aKinetic, aPotential, aFull}` for UI readouts, or
 *    `undefined` when cosmology is disabled / params are invalid. The
 *    UI-side panels (`CosmologyReadout`, `KGDispersionDiagram`,
 *    `FSFEntanglementProbe`, `FSFEntanglementProbe.cosmoTrajectory`)
 *    all consume this instead of rolling their own `computeCosmologyAt`
 *    wrappers.
 *
 * Invariants enforced:
 * - Minkowski / cosmology-disabled paths return identity values
 *   bit-identically — the pre-cosmology code path is a strict subset.
 * - Invalid preset + thrown `computeCosmologyAt` errors are caught
 *   exactly once at this layer; callers never need their own
 *   try/catch.
 * - Invalid-parameter warnings deduplicate on `(preset, spacetimeDim,
 *   error.message)` so the dev console does not flood at 60fps.
 *
 * @module lib/physics/freeScalar/vacuumDispersion
 */

import type { FreeScalarConfig } from '@/lib/geometry/extended/types'
import { logger } from '@/lib/logger'
import type { CosmologyCoefs, CosmologySnapshot } from '@/lib/physics/cosmology/background'
import { computeCosmologyAt, computeCosmologyCoefs } from '@/lib/physics/cosmology/background'
import type { VacuumDispersion } from '@/lib/physics/freeScalar/vacuumSpectrum'

/**
 * Identity coefficients `(1, 1, 1)` returned under Minkowski and fallback
 * paths. Using a shared constant keeps reference equality stable across
 * the hot-path callers so downstream memos cache correctly.
 */
export const FSF_IDENTITY_COSMO_COEFS: CosmologyCoefs = {
  aKinetic: 1,
  aPotential: 1,
  aFull: 1,
  aPotentialRatio1: 1,
  aPotentialRatio2: 1,
}

/**
 * Per-key dedup set for cosmology fallback warnings. The leapfrog substep
 * loop would otherwise spam the dev console at 60fps × stepsPerFrame if
 * the cosmology config ever entered an invalid state. Production strips
 * `logger.warn` entirely, so this only affects dev ergonomics.
 *
 * Cleared by {@link __resetFsfCosmologyWarnDedupForTests} so unit tests
 * stay isolated.
 */
const fsfCosmologyWarnedKeys = new Set<string>()

/**
 * Test-only helper to reset the warn-once dedup state. Production code
 * never imports this; vitest does.
 */
export function __resetFsfCosmologyWarnDedupForTests(): void {
  fsfCosmologyWarnedKeys.clear()
}

/**
 * Log a deduplicated warning for an invalid-cosmology fallback and
 * return the caller's identity value. Internal helper; all public
 * entry points route through it so the dedup key scheme is uniform.
 *
 * @param config - FSF config under evaluation
 * @param eta - Conformal time that caused the failure
 * @param error - The caught error
 * @param site - Short name of the caller for the log prefix
 */
function logCosmologyFallback(
  config: FreeScalarConfig,
  eta: number,
  error: unknown,
  site: string
): void {
  const message = error instanceof Error ? error.message : String(error)
  const key = `${site}|${config.cosmology.preset}|${config.latticeDim + 1}|${message}`
  if (fsfCosmologyWarnedKeys.has(key)) return
  fsfCosmologyWarnedKeys.add(key)
  logger.warn(
    `[${site}] cosmology parameters invalid ` +
      `(preset=${config.cosmology.preset}, η=${eta}); falling back to Minkowski. ` +
      `This message is logged once per unique error: ${message}`
  )
}

/**
 * Project the FSF config's cosmology sub-config into the generic
 * {@link CosmologyPresetParams} shape expected by `cosmology/background.ts`.
 * Internal helper so call sites do not reassemble this object piecemeal.
 */
function asCosmologyParams(config: FreeScalarConfig): {
  preset: FreeScalarConfig['cosmology']['preset']
  spacetimeDim: number
  steepness: number
  hubble: number
  kasnerExponents: FreeScalarConfig['cosmology']['kasnerExponents']
  lqcRhoCritical: number | undefined
  lqcEquationOfState: number | undefined
  lqcInitialRhoRatio: number | undefined
} {
  return {
    preset: config.cosmology.preset,
    spacetimeDim: config.latticeDim + 1,
    steepness: config.cosmology.steepness,
    hubble: config.cosmology.hubble,
    kasnerExponents: config.cosmology.kasnerExponents,
    lqcRhoCritical: config.cosmology.lqcRhoCritical,
    lqcEquationOfState: config.cosmology.lqcEquationOfState,
    lqcInitialRhoRatio: config.cosmology.lqcInitialRhoRatio,
  }
}

/**
 * Resolve the three cosmology coefficients `(aKinetic, aPotential, aFull)`
 * for the current frame. These drive the canonical δφ integrator:
 *
 *     drift: dδφ/dη = aKinetic · π
 *     kick:  dπ/dη  = aPotential · ∇²δφ − m²·aFull · δφ − aFull · V'(δφ)
 *
 * Minkowski or cosmology-disabled configs collapse to identity coefs, so a
 * single call site covers both branches without a conditional in the
 * caller. Invalid cosmology params (the UI is responsible for preventing
 * this) fall back to identity AND log a *deduplicated* warning — each
 * unique `(site, preset, spacetimeDim, error.message)` tuple logs at most
 * once per session.
 *
 * @param config - Free scalar field configuration
 * @param simEta - Current conformal time (must be finite and non-zero under
 *                 cosmology)
 * @returns `{ aKinetic, aPotential, aFull }`
 */
export function computeFsfCosmologyCoefs(config: FreeScalarConfig, simEta: number): CosmologyCoefs {
  const cosmo = config.cosmology
  if (!cosmo.enabled || cosmo.preset === 'minkowski') return FSF_IDENTITY_COSMO_COEFS
  try {
    return computeCosmologyCoefs(simEta, asCosmologyParams(config))
  } catch (e) {
    logCosmologyFallback(config, simEta, e, 'computeFsfCosmologyCoefs')
    return FSF_IDENTITY_COSMO_COEFS
  }
}

/**
 * Resolve the full cosmology snapshot (including `a(η)` and `ℋ(η)`) used
 * by UI analysis panels. Unlike {@link computeFsfCosmologyCoefs} this
 * returns `undefined` under Minkowski / disabled / invalid-params rather
 * than identity — the UI uses the null signal to hide the cosmology
 * readout entirely instead of showing flat-space sentinels.
 *
 * The dedup-warning channel is shared with the hot-path helper so the
 * same bad preset does not log twice (once from the pass, once from the
 * UI).
 *
 * @param config - Free scalar field configuration
 * @param eta - Conformal time at which to evaluate (typically `η₀`)
 * @returns Full cosmology snapshot, or `undefined` if unavailable
 */
export function computeFsfCosmologySnapshot(
  config: FreeScalarConfig,
  eta: number
): CosmologySnapshot | undefined {
  const cosmo = config.cosmology
  if (!cosmo.enabled || cosmo.preset === 'minkowski') return undefined
  if (!Number.isFinite(eta) || eta === 0) return undefined
  try {
    return computeCosmologyAt(eta, asCosmologyParams(config))
  } catch (e) {
    logCosmologyFallback(config, eta, e, 'computeFsfCosmologySnapshot')
    return undefined
  }
}

/**
 * Resolve the vacuum-reference dispersion tag used by the k-space
 * occupation thermometer, the auto-scale estimators, and the adiabatic
 * vacuum sampler.
 *
 * - Minkowski / cosmology-disabled: `'kgFloor'` — the Klein-Gordon path
 *   with `max(mass, M_FLOOR)` regularization, bit-identical to the
 *   pre-cosmology pipeline.
 * - Cosmology enabled with valid params: `m²·a²(η)` as a finite number,
 *   driving the Mukhanov-Sasaki branch of the vacuum sampler with
 *   `ω_k² = k_lat² + m²·a²(η)`.
 * - Cosmology enabled with invalid params: `'kgFloor'` (identity
 *   fallback) AND a deduplicated dev-mode log message.
 *
 * @param config - Free scalar field configuration
 * @param eta - Conformal time at which to measure the vacuum (typically
 *              `η₀` for the initial adiabatic vacuum, or `simEta` for the
 *              instantaneous vacuum reference in a running simulation)
 * @returns {@link VacuumDispersion} tag suitable for every freeScalar
 *          pipeline stage
 */
export function computeFsfVacuumDispersion(
  config: FreeScalarConfig,
  eta: number
): VacuumDispersion {
  const snap = computeFsfCosmologySnapshot(config, eta)
  if (snap === undefined) return 'kgFloor'
  return config.mass * config.mass * snap.a * snap.a
}
