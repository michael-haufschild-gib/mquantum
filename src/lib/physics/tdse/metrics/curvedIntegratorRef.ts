/**
 * Classical RK4 integrator for the curved-space TDSE.
 *
 * Advances ψ under Ĥ(t) = T_LB(t) + V, where T_LB is the staggered Laplace–Beltrami
 * operator from `curvedKineticRef.ts`. V is a static, real-valued on-site
 * potential. Uses classical (non-symplectic) RK4 for mathematical transparency;
 * symplectic / split-step integrators are deferred.
 *
 * Time handling. `CurvedIntegratorParams.time` is the simulation time at the
 * START of one RK4 step (defaults to 0). Classical RK4 evaluates the RHS at
 * four stage times — `t`, `t + dt/2`, `t + dt/2`, `t + dt` — matching the
 * standard scheme for non-autonomous ODEs. Each stage forwards its `stageTime`
 * into `applyCurvedKineticRef` via `CurvedKineticParams.time`, which flows
 * down to every `sampleMetric` call. For static metrics this threading is
 * a no-op (the evaluator ignores `time`), so legacy behaviour is preserved
 * bit-for-bit when `params.time` is absent and the metric kind is static.
 *
 * State shape. `CurvedIntegratorState` is deliberately minimal: only `psiRe`
 * and `psiIm`. Simulation time is passed via `params`, never cached on state,
 * so the state object is time-agnostic and trivially cloneable.
 *
 * @module lib/physics/tdse/metrics/curvedIntegratorRef
 */

import { applyCurvedKineticRef, type CurvedKineticParams } from './curvedKineticRef'
import type { MetricConfig } from './types'

/**
 * Mutable wavefunction state — real and imaginary parts on a row-major lattice.
 *
 * Time-agnostic by design: simulation time is carried in
 * {@link CurvedIntegratorParams.time} and the finalTime returned by
 * {@link advanceRK4}, never on state.
 */
export interface CurvedIntegratorState {
  psiRe: Float32Array
  psiIm: Float32Array
}

/**
 * Parameters for one RK4 step of the curved-space TDSE.
 */
export interface CurvedIntegratorParams {
  /** Grid size per axis. */
  gridSize: readonly number[]
  /** Lattice spacing per axis in world units. */
  spacing: readonly number[]
  /** Particle mass. */
  mass: number
  /** Reduced Planck constant. */
  hbar: number
  /** Spatial dimensionality of the lattice (1–3 supported). */
  latticeDim: number
  /** Background metric. */
  metric: MetricConfig
  /** Optional static on-site potential of length totalSites. Absent ⇒ V = 0. */
  potential?: Float32Array
  /** Time-step for the RK4 update. */
  dt: number
  /**
   * Simulation time at the START of this RK4 step (default 0). The four
   * RK4 stages evaluate Ĥ at `time`, `time + dt/2`, `time + dt/2`, `time + dt`.
   * For static metrics this is a no-op.
   */
  time?: number
}

/**
 * Compute ∂_t ψ = (−i/ℏ) · Ĥ(stageTime) ψ on real + imaginary arrays.
 *
 * For real Ĥ, Ĥ ψ = Ĥ ψ_re + i Ĥ ψ_im. Then:
 *   ∂_t ψ_re = (1/ℏ) · Ĥ ψ_im
 *   ∂_t ψ_im = −(1/ℏ) · Ĥ ψ_re
 *
 * @param inRe - Real part of ψ fed into Ĥ.
 * @param inIm - Imaginary part of ψ fed into Ĥ.
 * @param params - Integrator parameters (provides grid, metric, hbar, V).
 * @param stageTime - Simulation time at which to evaluate Ĥ for this stage.
 */
/**
 * Scratch arrays reused across the four RK4 stages of a single `stepRK4`
 * call. All arrays are `Float32Array(n)` where `n = psiRe.length`.
 */
interface RhsScratch {
  /** Kinetic-operator output scratch (reused across `applyCurvedKineticRef` calls). */
  kinRe: Float32Array
  kinIm: Float32Array
  /** `rhs` output (∂_t ψ components) written in-place per stage. */
  dRe: Float32Array
  dIm: Float32Array
}

function rhsInto(
  inRe: Float32Array,
  inIm: Float32Array,
  params: CurvedIntegratorParams,
  stageTime: number,
  scratch: RhsScratch
): void {
  const kinParams: CurvedKineticParams = {
    psiRe: inRe,
    psiIm: inIm,
    gridSize: params.gridSize,
    spacing: params.spacing,
    mass: params.mass,
    hbar: params.hbar,
    latticeDim: params.latticeDim,
    metric: params.metric,
    time: stageTime,
  }
  applyCurvedKineticRef(kinParams, { re: scratch.kinRe, im: scratch.kinIm })
  const n = inRe.length
  if (params.potential !== undefined && params.potential.length !== n) {
    throw new Error(
      `rhs: potential length ${params.potential.length} does not match state length ${n}`
    )
  }
  const hRe = scratch.kinRe
  const hIm = scratch.kinIm
  if (params.potential !== undefined) {
    const V = params.potential
    for (let i = 0; i < n; i++) {
      const vi = V[i] as number
      hRe[i] = (hRe[i] as number) + vi * (inRe[i] as number)
      hIm[i] = (hIm[i] as number) + vi * (inIm[i] as number)
    }
  }
  const invHbar = 1 / params.hbar
  const dRe = scratch.dRe
  const dIm = scratch.dIm
  for (let i = 0; i < n; i++) {
    dRe[i] = invHbar * (hIm[i] as number)
    dIm[i] = -invHbar * (hRe[i] as number)
  }
}

/**
 * Advance ψ by one classical RK4 step under Ĥ(t) = T_LB(t) + V.
 *
 * Mutates `state.psiRe` and `state.psiIm` in place. The four RK4 stages
 * evaluate Ĥ at stage times `t, t+dt/2, t+dt/2, t+dt` where `t = params.time
 * ?? 0`. For static metrics this reduces to the previous autonomous behaviour.
 *
 * @param state - Wavefunction state (overwritten in place).
 * @param params - Integrator parameters including dt, metric, and optional time.
 */
/**
 * Pre-allocated per-step scratch. Held on the stack for a single
 * `stepRK4` call; {@link advanceRK4} reuses a single allocation for the
 * whole integration sweep.
 */
interface StepScratch {
  /** Stage-output accumulators (k1..k4) written in place by `rhsInto`. */
  k1Re: Float32Array
  k1Im: Float32Array
  k2Re: Float32Array
  k2Im: Float32Array
  k3Re: Float32Array
  k3Im: Float32Array
  k4Re: Float32Array
  k4Im: Float32Array
  /** Midpoint ψ scratch for stages 2/3/4. */
  tmpRe: Float32Array
  tmpIm: Float32Array
  /** Kinetic-operator output scratch for every `applyCurvedKineticRef` call. */
  kinRe: Float32Array
  kinIm: Float32Array
}

function allocStepScratch(n: number): StepScratch {
  return {
    k1Re: new Float32Array(n),
    k1Im: new Float32Array(n),
    k2Re: new Float32Array(n),
    k2Im: new Float32Array(n),
    k3Re: new Float32Array(n),
    k3Im: new Float32Array(n),
    k4Re: new Float32Array(n),
    k4Im: new Float32Array(n),
    tmpRe: new Float32Array(n),
    tmpIm: new Float32Array(n),
    kinRe: new Float32Array(n),
    kinIm: new Float32Array(n),
  }
}

function stepRK4With(
  state: CurvedIntegratorState,
  params: CurvedIntegratorParams,
  s: StepScratch
): void {
  const n = state.psiRe.length
  const dt = params.dt
  const t0 = params.time ?? 0
  const tMid = t0 + 0.5 * dt
  const tEnd = t0 + dt

  // Stage 1 — k1 = rhs(ψ, t0)
  rhsInto(state.psiRe, state.psiIm, params, t0, {
    kinRe: s.kinRe,
    kinIm: s.kinIm,
    dRe: s.k1Re,
    dIm: s.k1Im,
  })

  // Stage 2 — tmp = ψ + dt/2 · k1; k2 = rhs(tmp, tMid)
  for (let i = 0; i < n; i++) {
    s.tmpRe[i] = (state.psiRe[i] as number) + 0.5 * dt * (s.k1Re[i] as number)
    s.tmpIm[i] = (state.psiIm[i] as number) + 0.5 * dt * (s.k1Im[i] as number)
  }
  rhsInto(s.tmpRe, s.tmpIm, params, tMid, {
    kinRe: s.kinRe,
    kinIm: s.kinIm,
    dRe: s.k2Re,
    dIm: s.k2Im,
  })

  // Stage 3 — tmp = ψ + dt/2 · k2; k3 = rhs(tmp, tMid)
  for (let i = 0; i < n; i++) {
    s.tmpRe[i] = (state.psiRe[i] as number) + 0.5 * dt * (s.k2Re[i] as number)
    s.tmpIm[i] = (state.psiIm[i] as number) + 0.5 * dt * (s.k2Im[i] as number)
  }
  rhsInto(s.tmpRe, s.tmpIm, params, tMid, {
    kinRe: s.kinRe,
    kinIm: s.kinIm,
    dRe: s.k3Re,
    dIm: s.k3Im,
  })

  // Stage 4 — tmp = ψ + dt · k3; k4 = rhs(tmp, tEnd)
  for (let i = 0; i < n; i++) {
    s.tmpRe[i] = (state.psiRe[i] as number) + dt * (s.k3Re[i] as number)
    s.tmpIm[i] = (state.psiIm[i] as number) + dt * (s.k3Im[i] as number)
  }
  rhsInto(s.tmpRe, s.tmpIm, params, tEnd, {
    kinRe: s.kinRe,
    kinIm: s.kinIm,
    dRe: s.k4Re,
    dIm: s.k4Im,
  })

  // Commit ψ ← ψ + dt/6 · (k1 + 2·k2 + 2·k3 + k4).
  const oneSixthDt = dt / 6
  for (let i = 0; i < n; i++) {
    state.psiRe[i] =
      (state.psiRe[i] as number) +
      oneSixthDt *
        ((s.k1Re[i] as number) +
          2 * (s.k2Re[i] as number) +
          2 * (s.k3Re[i] as number) +
          (s.k4Re[i] as number))
    state.psiIm[i] =
      (state.psiIm[i] as number) +
      oneSixthDt *
        ((s.k1Im[i] as number) +
          2 * (s.k2Im[i] as number) +
          2 * (s.k3Im[i] as number) +
          (s.k4Im[i] as number))
  }
}

/**
 * Single RK4 timestep that allocates per-call scratch. Prefer
 * {@link stepRK4With} with a pooled scratch buffer in hot loops.
 */
export function stepRK4(state: CurvedIntegratorState, params: CurvedIntegratorParams): void {
  stepRK4With(state, params, allocStepScratch(state.psiRe.length))
}

/**
 * Run `steps` RK4 steps while advancing simulation time by `dt` per completed
 * step. Starts at `params.time ?? 0`. Returns the final time so callers can
 * chain: the returned `finalTime` may be fed back into a subsequent
 * `advanceRK4` call as `params.time` to resume evolution.
 *
 * The input `params` object is NOT mutated — each inner step sees a shallow
 * clone with the current stage-start time.
 *
 * @param state - Wavefunction state (overwritten in place).
 * @param params - Integrator parameters; `params.time` is the starting time.
 * @param steps - Number of RK4 steps to run (must be ≥ 0).
 * @returns `{ finalTime }` — `params.time ?? 0 + steps * params.dt`.
 */
export function advanceRK4(
  state: CurvedIntegratorState,
  params: CurvedIntegratorParams,
  steps: number
): { finalTime: number } {
  if (!Number.isInteger(steps) || steps < 0) {
    throw new Error(`advanceRK4: steps must be a non-negative integer (got ${steps})`)
  }
  let t = params.time ?? 0
  const dt = params.dt
  const stepParams: CurvedIntegratorParams = { ...params, time: t }
  // Allocate all 12 scratch typed arrays (~12 × 4·n bytes) once and reuse
  // across every RK4 step. The previous implementation allocated ~16 fresh
  // Float32Array(n) per step (4 stages × { kin.re, kin.im, d.re, d.im }
  // plus the per-step `tmpRe`/`tmpIm`), which dominated runtime on long
  // integration sweeps.
  const scratch = steps > 0 ? allocStepScratch(state.psiRe.length) : null
  for (let s = 0; s < steps; s++) {
    stepParams.time = t
    stepRK4With(state, stepParams, scratch!)
    t += dt
  }
  return { finalTime: t }
}
