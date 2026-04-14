/**
 * Analog Hawking radiation — sonic horizon helpers for the BEC mode.
 *
 * Reference: Unruh (1981) "Experimental Black-Hole Evaporation?";
 * Barceló, Liberati, Visser, "Analogue Gravity" (Living Rev. Relativity 2011).
 *
 * A BEC with non-uniform superfluid flow v_s(x) = (ℏ/m) ∇arg(ψ) carries
 * phonon excitations on an emergent acoustic metric. Where |v_s| crosses
 * the local sound speed c_s = √(g̃ n / m) a sonic horizon forms. The
 * surface gravity at the horizon is κ = ½ |∂⟂(c_s² − v_s²)| / c_s and the
 * analog Hawking temperature (in natural units ℏ=k_B=1) is T_H = κ / 2π.
 *
 * The waterfall profile used here is periodized along the FFT box length
 * L_box so that the initial ψ is C¹ at the wrap x = ±L_box/2 — otherwise
 * the tanh phase gradient leaves a derivative discontinuity that the FFT
 * Strang split interprets as a shock and the GP nonlinearity amplifies
 * into aliased noise. Concretely:
 *
 *   T      = tanh(L_box / (2·L_h))                       (edge value)
 *   φ(x)   = (m·v_max / ℏ) · [ L_h · ln(cosh(x/L_h)) − T · x² / L_box ]
 *   v_s(x) = v_max · tanh(x/L_h) − v_max · (2x / L_box) · T
 *   n(x)   = n₀ · (1 − Δn · sech²(x/L_h))
 *
 * By construction v_s(±L_box/2) = 0 exactly and φ is even in x, so
 * ψ(+L_box/2) = ψ(−L_box/2). κ no longer has a clean closed form under
 * the parabolic detrend, so `analyticSurfaceGravity` evaluates κ from a
 * symmetric finite difference of (c_s² − v_s²) at the numerical horizon
 * root.
 *
 * @module lib/physics/bec/sonicHorizon
 */

/** Waterfall profile parameters shared by CPU helpers and GPU init. */
export interface WaterfallParams {
  /** Asymptotic flow speed on the supersonic side (|v_s| → v_max as x₀ → ∞). */
  vMax: number
  /** Horizon width scale L_h. Smaller L_h → steeper gradient → larger κ. */
  lh: number
  /** Background density n₀ (positive). */
  n0: number
  /** Fractional density dip at the horizon, in [0, 1). */
  deltaN: number
  /** Contact interaction strength g̃ in the Gross-Pitaevskii equation. */
  g: number
  /** Particle mass m (positive). */
  mass: number
  /**
   * Periodic box length along the flow axis: L_box = gridSize[0]·spacing[0].
   * Required by the detrended (C¹-at-wrap) phase / velocity formulas —
   * v_s(±L_box/2) = 0 by construction. Pass the physical box length used
   * by the GPU simulator so CPU analytics and GPU init stay consistent.
   */
  lBox: number
}

/** Sample of local acoustic quantities at a 1D coordinate x₀. */
export interface SonicSample {
  /** Local density n(x₀). */
  n: number
  /** Local superfluid flow magnitude |v_s(x₀)| (along axis 0). */
  vs: number
  /** Local sound speed c_s(x₀) = √(g̃ n / m). */
  cs: number
  /** Local Mach number M(x₀) = |v_s| / c_s. */
  mach: number
}

/** Asymptotic upstream sound speed c_s0 = √(g̃ n₀ / m) — horizon reference scale. */
export function asymptoticSoundSpeed(p: WaterfallParams): number {
  return Math.sqrt((Math.max(p.g, 0) * Math.max(p.n0, 0)) / Math.max(p.mass, 1e-12))
}

/**
 * Edge tanh value T = tanh(L_box / (2·L_h)) used by the parabolic counter-drift.
 * Exposed so the GPU init branch and unit tests agree on a single formula.
 *
 * @param p - waterfall parameters (only `lh` and `lBox` are consulted).
 * @returns T ∈ [0, 1).
 */
export function waterfallEdgeTanh(p: Pick<WaterfallParams, 'lh' | 'lBox'>): number {
  const lh = Math.max(Math.abs(p.lh), 1e-6)
  const lBox = Math.max(Math.abs(p.lBox), 1e-6)
  return Math.tanh(lBox / (2 * lh))
}

/**
 * Evaluate the analytic (detrended) waterfall profile at a coordinate x₀.
 *
 * The velocity is v_s(x) = v_max·tanh(x/L_h) − v_max·(2x/L_box)·T, which
 * vanishes at x = ±L_box/2 so the initial condition is C¹ across the
 * periodic wrap of the FFT box.
 *
 * @param x0 - coordinate along flow axis (axis 0).
 * @param p - waterfall parameters.
 * @returns local density, superfluid speed, sound speed, Mach number.
 */
export function waterfallSample(x0: number, p: WaterfallParams): SonicSample {
  const lh = Math.max(Math.abs(p.lh), 1e-6)
  const lBox = Math.max(Math.abs(p.lBox), 1e-6)
  const T = Math.tanh(lBox / (2 * lh))
  const u = x0 / lh
  const sech = 1 / Math.cosh(u)
  const n = Math.max(p.n0 * (1 - p.deltaN * sech * sech), 1e-12)
  const vsSigned = p.vMax * Math.tanh(u) - p.vMax * ((2 * x0) / lBox) * T
  const vs = Math.abs(vsSigned)
  const cs = Math.sqrt((Math.max(p.g, 0) * n) / Math.max(p.mass, 1e-12))
  const mach = vs / Math.max(cs, 1e-12)
  return { n, vs, cs, mach }
}

/**
 * Phase profile φ(x₀) whose gradient yields the detrended velocity
 * v_s(x) = v_max·tanh(x/L_h) − v_max·(2x/L_box)·T.
 *
 *   φ(x) = (m v_max / ℏ) · [ L_h · ln(cosh(x/L_h)) − T · x² / L_box ]
 *
 * Both terms are even in x so φ(+L_box/2) = φ(−L_box/2) and ψ is continuous
 * at the periodic wrap. The parabolic counter-drift ensures ∂_xφ vanishes
 * at ±L_box/2, giving a C¹ initial ψ.
 *
 * @param x0 - coordinate along flow axis.
 * @param p - waterfall parameters.
 * @param hbar - reduced Planck constant (default 1).
 * @returns phase value in radians (unwrapped).
 */
export function waterfallPhase(x0: number, p: WaterfallParams, hbar = 1): number {
  const lh = Math.max(Math.abs(p.lh), 1e-6)
  const lBox = Math.max(Math.abs(p.lBox), 1e-6)
  const T = Math.tanh(lBox / (2 * lh))
  const coef = (p.mass * p.vMax) / Math.max(hbar, 1e-12)
  // ln(cosh(u)) is numerically stable as |u| − ln(2) + ln(1 + e^{−2|u|})
  const u = x0 / lh
  const au = Math.abs(u)
  const logCosh = au + Math.log1p(Math.exp(-2 * au)) - Math.log(2)
  return coef * (lh * logCosh - (T * (x0 * x0)) / lBox)
}

/**
 * Locate the first (black-hole) horizon x₀ > 0 where M(x₀) = 1 on the
 * detrended profile. Returns NaN if no crossing is found on (0, L_box/2).
 *
 * The scan walks positive x in `samples` steps from a small positive
 * start (to avoid the trivial x=0 fixed point) to L_box/2. On the first
 * sign change of M − 1 the root is refined by bisection for ~1e-9 tolerance.
 *
 * @param p - waterfall parameters (`lBox` sets the scan window).
 * @param samples - number of coarse samples (≥ 64).
 * @returns approximate horizon coordinate in (0, L_box/2) or NaN.
 */
export function findHorizonX0(p: WaterfallParams, samples = 256): number {
  const lBox = Math.max(Math.abs(p.lBox), 1e-6)
  const xMax = lBox * 0.5
  const n = Math.max(64, Math.floor(samples))
  const xStart = 1e-6 * xMax
  let prevX = xStart
  let prevM = waterfallSample(prevX, p).mach - 1
  for (let i = 1; i <= n; i++) {
    const x = xStart + ((xMax - xStart) * i) / n
    const m = waterfallSample(x, p).mach - 1
    if (m === 0) return x
    if (prevM < 0 !== m < 0 && prevM !== m) {
      // Bisection refinement in [prevX, x]
      let lo = prevX
      let hi = x
      let mLo = prevM
      // mHi not needed — sign alternates by bracket
      for (let k = 0; k < 48; k++) {
        const mid = 0.5 * (lo + hi)
        const mMid = waterfallSample(mid, p).mach - 1
        if (mMid === 0 || hi - lo < 1e-10 * lBox) return mid
        if (mLo < 0 === mMid < 0) {
          lo = mid
          mLo = mMid
        } else {
          hi = mid
        }
      }
      return 0.5 * (lo + hi)
    }
    prevX = x
    prevM = m
  }
  return Number.NaN
}

/**
 * Predicate: does a sonic horizon exist for the given waterfall profile?
 *
 * Necessary AND sufficient test — under the parabolic detrend a large
 * L_h/L_box ratio can suppress the horizon even when |v_max| > c_s0,
 * so the old `|v_max| > c_s0` screen is no longer sufficient.
 * Implemented as "try to locate the horizon and return isFinite(result)".
 *
 * @param p - waterfall parameters.
 * @returns `true` iff `findHorizonX0(p)` returns a finite value.
 */
export function hasHorizon(p: WaterfallParams): boolean {
  if (!Number.isFinite(p.vMax) || !Number.isFinite(p.lh) || !Number.isFinite(p.lBox)) return false
  if (p.lh <= 0 || p.lBox <= 0) return false
  const cs0 = asymptoticSoundSpeed(p)
  if (!Number.isFinite(cs0) || cs0 <= 0) return false
  return Number.isFinite(findHorizonX0(p))
}

/**
 * Surface gravity κ at the sonic horizon for the detrended waterfall profile.
 *
 * Under the parabolic counter-drift v_s = v_max·tanh(x/L_h) − v_max·(2x/L_box)·T
 * the old closed form κ = (v_max² − c_s0²)/(v_max·L_h) is no longer exact,
 * so this helper evaluates κ = ½·|∂(c_s² − v_s²)/∂x| / c_s from a symmetric
 * finite difference at the numerically-located horizon root. The step size
 * is set to a small fraction of L_h, small enough to resolve the local slope
 * but large enough to avoid f32 cancellation if this is ever mirrored GPU-side.
 *
 * @param p - waterfall parameters.
 * @returns surface gravity κ (non-negative). Zero when no horizon exists.
 */
export function analyticSurfaceGravity(p: WaterfallParams): number {
  const xh = findHorizonX0(p)
  if (!Number.isFinite(xh)) return 0
  const lh = Math.max(Math.abs(p.lh), 1e-6)
  const step = 1e-3 * lh
  return finiteDifferenceSurfaceGravity(xh, p, step)
}

/**
 * Analytic Hawking temperature T_H = κ / (2π) in natural units (ℏ = k_B = 1).
 *
 * @param p - waterfall parameters.
 * @returns Hawking temperature.
 */
export function analyticHawkingTemperature(p: WaterfallParams): number {
  return analyticSurfaceGravity(p) / (2 * Math.PI)
}

/**
 * Finite-difference surface gravity at a sample point on a 1D profile.
 * κ_fd = ½ |d(c_s² − v_s²)/dx| / c_s evaluated at x.
 *
 * @param x0 - probe coordinate.
 * @param p - waterfall parameters.
 * @param h - finite-difference step (positive).
 * @returns surface gravity estimate.
 */
export function finiteDifferenceSurfaceGravity(x0: number, p: WaterfallParams, h = 1e-3): number {
  const step = Math.max(Math.abs(h), 1e-6)
  const here = waterfallSample(x0, p)
  const fwd = waterfallSample(x0 + step, p)
  const bwd = waterfallSample(x0 - step, p)
  const fFwd = fwd.cs * fwd.cs - fwd.vs * fwd.vs
  const fBwd = bwd.cs * bwd.cs - bwd.vs * bwd.vs
  const deriv = Math.abs(fFwd - fBwd) / (2 * step)
  return (0.5 * deriv) / Math.max(here.cs, 1e-12)
}

/**
 * Deterministic integer hash — splitmix32. Same inputs always produce the same
 * u32 output. Used to seed the horizon-localized phonon noise so that
 * (seed, stepIndex, siteIndex) → identical δφ across runs.
 *
 * @param x - 32-bit integer input.
 * @returns 32-bit mixed integer.
 */
export function splitmix32(x: number): number {
  let z = (x | 0) >>> 0
  z = (z + 0x9e3779b9) >>> 0
  z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0
  z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0
  z = (z ^ (z >>> 16)) >>> 0
  return z
}

/**
 * Deterministic noise sample η in (−1, 1) from three integer inputs.
 *
 * @param siteIndex - linear lattice site index.
 * @param seed - user-chosen integer seed.
 * @param stepIndex - simulation step counter.
 * @returns scalar noise value in (−1, 1).
 */
export function hawkingNoise(siteIndex: number, seed: number, stepIndex: number): number {
  const a = splitmix32(siteIndex ^ 0x9e3779b1)
  const b = splitmix32(a ^ splitmix32(seed | 0))
  const c = splitmix32(b ^ splitmix32((stepIndex | 0) + 0x632be59b))
  // Map to (−1, 1) with 24-bit precision
  return (c & 0xffffff) / 0x7fffff - 1
}

/**
 * Horizon-localized Gaussian weight w(x) = exp(−((M(x)−1)/σ)²).
 *
 * @param mach - local Mach number.
 * @param sigma - Gaussian half-width (default 0.25).
 * @returns weight in [0, 1].
 */
export function horizonWeight(mach: number, sigma = 0.25): number {
  const s = Math.max(Math.abs(sigma), 1e-6)
  const z = (mach - 1) / s
  return Math.exp(-z * z)
}

/**
 * Summary physics readout for the BEC diagnostics HUD.
 *
 * @param p - waterfall parameters.
 * @returns horizon coordinate, κ, T_H, and c_s0 (all analytic, natural units).
 */
export interface HawkingReadout {
  horizonX0: number
  csAsymptotic: number
  kappa: number
  hawkingTemperature: number
}

/** Analytic summary of the analog black hole diagnostics. */
export function hawkingReadout(p: WaterfallParams): HawkingReadout {
  return {
    horizonX0: findHorizonX0(p),
    csAsymptotic: asymptoticSoundSpeed(p),
    kappa: analyticSurfaceGravity(p),
    hawkingTemperature: analyticHawkingTemperature(p),
  }
}
