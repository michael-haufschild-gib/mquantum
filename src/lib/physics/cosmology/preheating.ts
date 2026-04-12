/**
 * Parametric-Resonance Preheating Driver (Mathieu Equation)
 *
 * CPU-side helpers for the Free Scalar Field's post-inflation preheating mode.
 * A small time-periodic modulation of the effective Klein-Gordon mass
 *
 *     m²_eff(η) = m₀² · (1 + A · sin(Ω · (η − η_ref)))
 *
 * turns each lattice mode's equation of motion into the Mathieu equation
 *
 *     δφ̈_k + (k² + m₀²·(1 + A · sin Ωη)) · δφ_k = 0.
 *
 * In the narrow-resonance limit the first Floquet instability tongue sits at
 * Ω ≈ 2·ω_k with growth exponent  μ_k ≈ A · m₀² / (4·ω_k) — the canonical
 * post-inflation preheating mechanism that dumps inflaton energy into matter
 * fields. The GPU integrator multiplies the mass-term coefficient by
 * `massSquaredScale(η)` on every leapfrog substep; this module computes that
 * same scalar CPU-side so tests (and the compute pass's time tracking) can
 * share a single source of truth for the drive.
 *
 * Contract with the WGSL shader in `freeScalarUpdatePi.wgsl.ts`:
 *
 *   `massCoef = params.mass * params.mass * params.aFull * params.massSquaredScale`
 *
 * Under cosmology Minkowski (aFull = 1) and preheating off
 * (`massSquaredScale = 1`) this collapses to the bare Klein-Gordon term,
 * bit-identically.
 *
 * @module lib/physics/cosmology/preheating
 */

import type { PreheatingConfig } from '@/lib/geometry/extended/freeScalar'

/**
 * Evaluate `massSquaredScale(η)` for the current preheating configuration.
 *
 * Returns `1` when the drive is disabled — a multiplicative no-op that
 * preserves every downstream result in the pre-preheating pipeline.
 *
 * When enabled, returns `1 + A · sin(Ω · (η − η_ref))`, the time-dependent
 * factor that modulates the mass term. `η_ref` is captured on reset so the
 * drive starts at phase `sin(0) = 0`, i.e. the initial state is sampled at
 * the unperturbed mass and the modulation grows smoothly from zero.
 *
 * @param eta - Current conformal time (for Minkowski the pass uses a
 *              separate running counter; for cosmology it uses `simEta`)
 * @param config - Preheating sub-config
 * @param refEta - Reference time captured at the most recent reset
 * @returns `1` when disabled, else `1 + A·sin(Ω·(η−η_ref))`
 */
export function computeMassSquaredScale(
  eta: number,
  config: PreheatingConfig,
  refEta: number
): number {
  if (!config.enabled) return 1
  return 1 + config.amplitude * Math.sin(config.frequency * (eta - refEta))
}

/**
 * Input parameters for the CPU Mathieu-equation integrator.
 *
 * The integrator advances one mode at wavevector `k` of the canonical
 * δφ field through a second-order Störmer-Verlet (staggered leapfrog)
 * whose substep ordering mirrors the WGSL shader's per-substep path and
 * the `FreeScalarFieldComputePass.initializeField` half-step kickstart:
 *
 *   0. `pi -= (dt/2) · ω²(0) · phi`  (kickstart: stagger pi by half-step)
 *   1. `phi += dt · pi`              (drift)
 *   2. `t   += dt`                   (advance clock)
 *   3. `omegaSq = k² + m² · scale(t)`(evaluate coefs at new time)
 *   4. `pi  -= dt · omegaSq · phi`   (kick at new position)
 *
 * The half-step kickstart puts `pi` on the canonical leapfrog half-offset
 * grid before the first drift, matching exactly what
 * `FreeScalarFieldComputePass.initializeField` does with the `updatePi`
 * pipeline dispatched at `dt/2`. Without it the scheme collapses to
 * first-order symplectic Euler — still valid physics but no longer
 * numerically equivalent to the GPU integrator being validated.
 *
 * Under preheating-off and cosmology-off this reduces identically to the
 * bare Klein-Gordon staggered leapfrog the shipped shader implements, so
 * the test-anchored growth rates are a valid surrogate for on-GPU
 * behaviour.
 */
export interface MathieuIntegratorParams {
  /** Klein-Gordon mass `m₀`. */
  mass: number
  /** Linear wavenumber magnitude `|k|` of the mode (use 0 for the zero mode). */
  k: number
  /** Leapfrog step size. */
  dt: number
  /** Number of integration steps. */
  nSteps: number
  /** Preheating sub-config — when `enabled = false`, reduces to bare KG. */
  preheating: PreheatingConfig
  /** Reference time used by the preheating drive. Defaults to 0. */
  refEta?: number
  /** Initial `δφ`. Defaults to 1. */
  phi0?: number
  /** Initial conjugate momentum `π_δφ`. Defaults to 0. */
  pi0?: number
}

/** Trajectory arrays returned by {@link integrateMathieu1D}. */
export interface MathieuTrajectory {
  /** Discrete sample times `t_n = n · dt` (length `nSteps + 1`). */
  time: Float64Array
  /** `δφ(t_n)`. */
  phi: Float64Array
  /** `π_δφ(t_n)`. */
  pi: Float64Array
}

/**
 * CPU Mathieu-equation integrator. Advances a single Fourier mode of the
 * canonical δφ field through `nSteps` staggered-leapfrog substeps,
 * returning the full trajectory so tests can measure growth rates,
 * stability, and the Mathieu resonance tongues.
 *
 * The integrator is a second-order Störmer-Verlet matched to the compute
 * shader's `FreeScalarFieldComputePass.initializeField` → per-substep
 * drift/kick path: first a `dt/2` kick at `t = 0` (the GPU's kickstart
 * dispatch), then repeated `phi += dt·pi ; t += dt ; pi -= dt·ω²(t)·phi`.
 * The half-step kickstart is what puts `pi` onto the canonical leapfrog
 * half-offset grid — without it the scheme is only first-order accurate
 * and does not match the GPU step-for-step, which is the whole point of
 * having a CPU mirror in the first place.
 *
 * The stored `pi[]` array is NOT the half-offset grid value; it is
 * synchronised back to the integer-time grid at every sample by adding
 * back a half-step kick. Tests that read `pi[i]` therefore see the
 * canonical-momentum value at `t_i = i·dt`, not at `t_i + dt/2`, so the
 * energy envelope `½(π² + ω²φ²)` is well-defined for growth-rate
 * regression.
 *
 * @param params - Mathieu integrator parameters
 * @returns Time, δφ and π_δφ arrays of length `nSteps + 1`
 */
export function integrateMathieu1D(params: MathieuIntegratorParams): MathieuTrajectory {
  const { mass, k, dt, nSteps, preheating } = params
  const refEta = params.refEta ?? 0
  const phi0 = params.phi0 ?? 1
  const pi0 = params.pi0 ?? 0

  const time = new Float64Array(nSteps + 1)
  const phi = new Float64Array(nSteps + 1)
  const pi = new Float64Array(nSteps + 1)

  let t = 0
  let p = phi0
  const kSq = k * k
  const mSq = mass * mass

  time[0] = 0
  phi[0] = p
  pi[0] = pi0

  // Leapfrog kickstart — mirror of `FreeScalarFieldComputePass.initializeField`
  // which dispatches the `updatePi` pipeline at `dt/2` right after the
  // initial field sample. The GPU field starts at conformal time η = refEta,
  // where `sin(Ω·(refEta − refEta)) = sin(0) = 0`, so the initial state is
  // sampled at the unperturbed mass. We pass `refEta` (not 0) as the current
  // time to match the GPU's phase reference. `q` leaves this block on the
  // half-offset grid.
  const scaleStart = computeMassSquaredScale(refEta, preheating, refEta)
  const omegaSqStart = kSq + mSq * scaleStart
  let q = pi0 - 0.5 * dt * omegaSqStart * p

  for (let n = 0; n < nSteps; n++) {
    // Drift: δφ advances from `t_n` to `t_{n+1}` using the half-offset π.
    p = p + dt * q
    // Advance the local clock by one substep so the mass-term kick below
    // evaluates at the new elapsed time — mirrors the shader's per-substep
    // `this.advanceSimEta(subDt)` before the pi dispatch.
    t = t + dt
    // Kick: physical dispersion ω² = k² + m²·massSquaredScale(η) times δφ,
    // subtracted from π. The drive evaluates at `refEta + t` so the phase
    // starts at 0 and advances as `Ω·t`, matching the GPU integrator where
    // η starts at refEta. Scale reduces to 1 when the drive is disabled so
    // the bare Klein-Gordon leapfrog is recovered bit-identically.
    const scale = computeMassSquaredScale(refEta + t, preheating, refEta)
    const omegaSq = kSq + mSq * scale
    q = q - dt * omegaSq * p

    time[n + 1] = t
    phi[n + 1] = p
    // Synchronise the stored π back to the integer-time grid `t_{n+1}`
    // by subtracting the half-step kick that put `q` on the half-offset
    // grid. The running `q` is left on the half-offset grid so the next
    // drift uses the correct leapfrog value — only the reported sample
    // is rewound.
    pi[n + 1] = q + 0.5 * dt * omegaSq * p
  }

  return { time, phi, pi }
}

/**
 * Extract the exponential growth rate from a parametric-resonance trajectory
 * by linear regression of `log(E)` against time, where
 * `E(t) = ½(π²(t) + ω₀²·δφ²(t))` is the instantaneous harmonic energy of
 * the mode. Under first-tongue amplification `E ~ E₀ · exp(2μ·t)`, so the
 * regressed slope divided by two recovers `μ`.
 *
 * Regression is performed over the **second half** of the trajectory so
 * initial-transient effects (phase mis-match with the drive envelope,
 * adiabatic startup from `sin(0) = 0`) don't bias the fit.
 *
 * @param trajectory - Output of {@link integrateMathieu1D}
 * @param omega - Reference angular frequency `ω₀ = √(k² + m²)`
 * @returns Measured growth rate `μ` (slope of log-energy / 2)
 */
export function measureGrowthRateFromEnergyEnvelope(
  trajectory: MathieuTrajectory,
  omega: number
): number {
  const { time, phi, pi } = trajectory
  const n = time.length
  if (n < 4) return 0
  const start = Math.floor(n / 2)
  const omegaSq = omega * omega

  let sumT = 0
  let sumLogE = 0
  let sumTLogE = 0
  let sumTT = 0
  let count = 0
  for (let i = start; i < n; i++) {
    const phiI = phi[i]!
    const piI = pi[i]!
    const e = 0.5 * (piI * piI + omegaSq * phiI * phiI)
    // log(0) would crash the regression; a positive-definite energy is
    // mathematically guaranteed, but pathological float underflow near
    // quiescent resonance null-points can still hit this branch.
    if (!(e > 0)) continue
    const logE = Math.log(e)
    const t = time[i]!
    sumT += t
    sumLogE += logE
    sumTLogE += t * logE
    sumTT += t * t
    count++
  }

  if (count < 2) return 0
  const meanT = sumT / count
  const meanLogE = sumLogE / count
  const covariance = sumTLogE - count * meanT * meanLogE
  const varianceT = sumTT - count * meanT * meanT
  if (!(varianceT > 0)) return 0
  const slope = covariance / varianceT
  // E ~ exp(2·μ·t) ⇒ μ = slope / 2.
  return slope / 2
}

/**
 * Maximum absolute value of `δφ` over the full trajectory. Used by
 * off-resonance stability tests where no sliding window is needed — the
 * amplitude stays bounded and a single global max is diagnostic enough.
 *
 * @param trajectory - Output of {@link integrateMathieu1D}
 * @returns `max_t |δφ(t)|`
 */
export function maxAbsPhi(trajectory: MathieuTrajectory): number {
  const { phi } = trajectory
  let m = 0
  for (let i = 0; i < phi.length; i++) {
    const v = Math.abs(phi[i]!)
    if (v > m) m = v
  }
  return m
}
