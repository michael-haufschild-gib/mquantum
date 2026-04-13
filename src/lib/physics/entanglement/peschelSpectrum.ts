/**
 * Entanglement spectrum analysis and fitting routines for the Peschel probe.
 *
 * Provides:
 * - Full entanglement-spectrum extraction (modular Hamiltonian levels,
 *   per-mode entropy, entanglement gap)
 * - Effective modular temperature fit (Bisognano-Wichmann)
 * - Central-charge extraction via CFT log-law regression
 *
 * @module lib/physics/entanglement/peschelSpectrum
 */

/**
 * Lower bound of the fit window as a fraction of the inferred full-lattice
 * size. Set below `0.1` so short-distance CFT modes dominate the slope
 * before the periodic-boundary chord correction and the finite-mass
 * saturation set in. Paired with {@link FIT_WINDOW_HI_FRAC}.
 */
const FIT_WINDOW_LO_FRAC = 0.05
/**
 * Upper bound of the fit window as a fraction of the inferred full-lattice
 * size. The Calabrese-Cardy periodic correction
 * `S ∝ log((N/π) sin(π L/N))` deviates noticeably from `log(L)` past
 * `L ≈ N/4`, so we cap the fit window there. This differs from the naive
 * `[0.1 N, 0.4 N]` midband — pushing `hi` above `N/4` biases the extracted
 * central charge downward by a significant fraction.
 */
const FIT_WINDOW_HI_FRAC = 0.25

/**
 * Linear regression fit of the central charge from the CFT entropy law
 * `S(L) ≈ (c / 3) log(L) + const` applied over the short-distance window.
 *
 * The window is inferred from the largest length in the input: assuming the
 * caller's sweep spans `[1, N/2]` we use `N = 2 · max(lengths)` and filter
 * to `L ∈ [⌈0.05 N⌉, ⌊0.25 N⌋]` before regressing `S` on `log(L)`. The
 * slope is multiplied by 3 to recover the effective central charge. The
 * window starts below the customary `0.1 N` boundary and ends below the
 * customary `0.4 N` boundary for two reasons:
 *
 * 1. The periodic chord length `(N/π) sin(π L / N)` starts curving away
 *    from `L` above `L ≈ N/4`, so including larger `L` biases the fit
 *    slope downward.
 * 2. At short `L` the CFT log law dominates over the lattice UV
 *    corrections, so starting at `0.05 N` picks up cleaner slope
 *    information than starting at `0.1 N` without introducing lattice
 *    discretization artefacts.
 *
 * At least **6 points** must survive the filter; otherwise `c` is
 * returned as `NaN`.
 *
 * @param lengths - Subsystem lengths from the sweep.
 * @param entropies - Matching entropies in nats.
 * @returns `{ c, intercept, rSquared, usedPoints }`. `c` is `NaN` when the
 *          fit window contains fewer than 6 points or the data is
 *          degenerate. `rSquared ∈ [0, 1]` is the coefficient of
 *          determination of the linear fit.
 */
export function fitCentralCharge(
  lengths: readonly number[],
  entropies: readonly number[]
): { c: number; intercept: number; rSquared: number; usedPoints: number } {
  if (lengths.length !== entropies.length || lengths.length === 0) {
    return { c: Number.NaN, intercept: Number.NaN, rSquared: Number.NaN, usedPoints: 0 }
  }
  let maxL = 0
  for (const L of lengths) if (L > maxL) maxL = L
  const nFull = 2 * maxL
  const lo = Math.max(1, Math.ceil(FIT_WINDOW_LO_FRAC * nFull))
  const hi = Math.floor(FIT_WINDOW_HI_FRAC * nFull)

  const xs: number[] = []
  const ys: number[] = []
  for (let i = 0; i < lengths.length; i++) {
    const L = lengths[i]!
    if (L < lo || L > hi) continue
    const S = entropies[i]!
    if (!Number.isFinite(S)) continue
    xs.push(Math.log(L))
    ys.push(S)
  }

  if (xs.length < 6) {
    return { c: Number.NaN, intercept: Number.NaN, rSquared: Number.NaN, usedPoints: xs.length }
  }

  // Ordinary least squares on (log L, S)
  const n = xs.length
  let meanX = 0
  let meanY = 0
  for (let i = 0; i < n; i++) {
    meanX += xs[i]!
    meanY += ys[i]!
  }
  meanX /= n
  meanY /= n

  let sxx = 0
  let sxy = 0
  let syy = 0
  for (let i = 0; i < n; i++) {
    const dx = xs[i]! - meanX
    const dy = ys[i]! - meanY
    sxx += dx * dx
    sxy += dx * dy
    syy += dy * dy
  }

  if (sxx <= 0) {
    return { c: Number.NaN, intercept: Number.NaN, rSquared: Number.NaN, usedPoints: n }
  }
  const slope = sxy / sxx
  const intercept = meanY - slope * meanX
  const rSquared = syy > 0 ? (sxy * sxy) / (sxx * syy) : 1

  return { c: 3 * slope, intercept, rSquared, usedPoints: n }
}

// ───────────────────────────────────────────────────────────────────────────
//  Entanglement spectrum and modular (Bisognano-Wichmann) Hamiltonian levels
// ───────────────────────────────────────────────────────────────────────────

/**
 * Full entanglement-spectrum readout extracted from the Peschel construction.
 *
 * A bosonic Gaussian state whose subsystem has symplectic eigenvalues `ν_k`
 * has a reduced density matrix of the thermal form
 *
 *   `ρ_A = Z⁻¹ · exp(−H_ent)` with  `H_ent = Σ_k ε_k · (b_k† b_k + ½)`
 *
 * where the single-mode excitation energies of the **entanglement (modular)
 * Hamiltonian** are given by
 *
 *   `ε_k = log((ν_k + ½) / (ν_k − ½))`       [Peschel 2003, eq. 12]
 *
 * and the per-mode entanglement entropy is
 *
 *   `s(ν_k) = (ν_k + ½) log(ν_k + ½) − (ν_k − ½) log(ν_k − ½)`.
 *
 * In the **Bisognano-Wichmann** / Rindler half-space limit the modular
 * Hamiltonian is exactly the boost generator, so for a half-space cut of a
 * Minkowski vacuum the low-lying `ε_k` are approximately equi-spaced with
 * gap `Δε = 2π / β_mod` — the Unruh-like modular temperature. Deviations
 * from equi-spacing signal finite-size effects, the lattice UV cutoff, or a
 * non-Rindler cut.
 *
 * Arrays are sorted with `nu` ascending — smallest symplectic eigenvalue
 * first (most strongly entangled mode, closest to maximally mixed ν = ½).
 *
 * @see https://doi.org/10.1088/1751-8113/42/50/504007 Casini & Huerta review
 */
export interface EntanglementSpectrum {
  /** Symplectic eigenvalues ν_k ≥ ½, sorted ascending. */
  nu: Float64Array
  /** Modular-Hamiltonian single-mode energies ε_k = log((ν+½)/(ν−½)), same order. */
  epsilon: Float64Array
  /** Per-mode entropy contributions s(ν_k) in nats, same order. */
  perModeEntropy: Float64Array
  /** Total entropy Σ_k s(ν_k) (matches `peschelEntropy(nu)`). */
  totalEntropy: number
  /** `ν_min − ½`. Vanishes iff the subsystem has a maximally-mixed mode. */
  entanglementGap: number
}

/**
 * Compute the full entanglement spectrum of a bosonic-Gaussian subsystem,
 * given its symplectic eigenvalues. Post-processing helper on the output of
 * {@link symplecticEigenvalues}.
 *
 * Conventions:
 * - The entanglement-Hamiltonian excitation energies are positive, diverging
 *   as ν → ½ (maximally mixed) and vanishing as ν → ∞ (decoupled mode).
 * - `perModeEntropy[k]` uses the same `h(ν)` formula as {@link peschelEntropy},
 *   so summing reproduces the scalar entropy to machine precision.
 *
 * @param symplectic - Symplectic eigenvalues `ν_k ≥ ½` (as returned by
 *                     {@link symplecticEigenvalues}). Input is **not** mutated.
 * @returns Sorted spectrum plus derived quantities.
 * @throws {Error} If any input is non-finite or below the physical
 *                 `½ − 1e-9` floor.
 */
export function computeEntanglementSpectrum(symplectic: Float64Array): EntanglementSpectrum {
  const n = symplectic.length
  const nu = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    const v = symplectic[i]!
    if (!Number.isFinite(v) || v < 0.5 - 1e-9) {
      throw new Error(
        `computeEntanglementSpectrum: ν_${i} = ${v} is not a physical symplectic eigenvalue (must be ≥ ½)`
      )
    }
    nu[i] = v < 0.5 ? 0.5 : v
  }
  // Ascending sort (smallest ν = most-entangled mode first).
  nu.sort()

  const epsilon = new Float64Array(n)
  const perModeEntropy = new Float64Array(n)
  let totalS = 0
  for (let i = 0; i < n; i++) {
    const v = nu[i]!
    const plus = v + 0.5
    const minus = v - 0.5
    const eps = minus > 1e-15 ? Math.log(plus / minus) : Number.POSITIVE_INFINITY
    epsilon[i] = eps
    const plusTerm = plus * Math.log(plus)
    const minusTerm = minus > 1e-15 ? minus * Math.log(minus) : 0
    const s = plusTerm - minusTerm
    perModeEntropy[i] = s
    totalS += s
  }

  const entanglementGap = nu[0]! - 0.5

  return { nu, epsilon, perModeEntropy, totalEntropy: totalS, entanglementGap }
}

/**
 * Fit an effective modular "temperature" to the entanglement Hamiltonian
 * spectrum by linear regression of the modular excitation energies `ε_k`
 * against the ascending mode index.
 *
 * Motivation: Bisognano-Wichmann states that for a half-space cut of a
 * free-field vacuum the modular Hamiltonian is exactly the boost generator,
 * whose excitations are equi-spaced with gap `Δε = 2π / β_mod` where
 * `β_mod` is the inverse of the Unruh-like modular temperature. Fitting a
 * line to the first few `ε_k` therefore estimates that temperature directly
 * from the simulator's lattice data. For a non-Rindler cut the spacing is
 * not equi-distant and `rSquared` will be poor.
 *
 * **Ordering convention**: the `EntanglementSpectrum.epsilon` array is
 * sorted so that `epsilon[0]` corresponds to the smallest `ν` (the most
 * strongly entangled mode, where `ε` is *largest*). The physically natural
 * label for the modular Hamiltonian tower starts at the smallest excitation
 * energy (decoupled mode, largest `ν`) and grows upward. We therefore walk
 * `epsilon` from the tail toward the head so the fit axis is `(k, ε_k)`
 * with both increasing.
 *
 * The fit uses up to `max(4, floor(N/3))` modes starting from the largest-ν
 * end. Modes with non-finite `ε` (ν exactly at ½) are skipped.
 *
 * @param spectrum - Spectrum object from {@link computeEntanglementSpectrum}.
 * @returns Fit result. `inverseTemperature = slope/(2π)`; `temperature =
 *          1/β_mod`. Returns `NaN` values when fewer than 4 usable modes are
 *          available, the slope is non-positive, or the fit is degenerate.
 */
export function fitEntanglementTemperature(spectrum: EntanglementSpectrum): {
  inverseTemperature: number
  temperature: number
  rSquared: number
  usedModes: number
} {
  const { epsilon } = spectrum
  const n = epsilon.length
  const keep = Math.max(4, Math.floor(n / 3))
  if (n < 4 || keep < 4) {
    return {
      inverseTemperature: Number.NaN,
      temperature: Number.NaN,
      rSquared: Number.NaN,
      usedModes: 0,
    }
  }

  // Walk the spectrum from the decoupled end (largest ν, smallest ε)
  // toward the entangled end (smallest ν, largest ε). Since the sorted
  // spectrum has `epsilon[0]` = largest ε (ν sorted ascending), we index
  // from the tail backwards — `srcIdx = n − 1 − i` — so both `xs` (mode
  // label) and `ys` (ε) grow together. In the Bisognano-Wichmann limit
  // the resulting slope is the modular gap `Δε = 2π · β_mod`.
  const xs: number[] = []
  const ys: number[] = []
  for (let i = 0; i < keep; i++) {
    const srcIdx = n - 1 - i
    if (srcIdx < 0) break
    const e = epsilon[srcIdx]!
    if (Number.isFinite(e)) {
      xs.push(i)
      ys.push(e)
    }
  }
  if (xs.length < 4) {
    return {
      inverseTemperature: Number.NaN,
      temperature: Number.NaN,
      rSquared: Number.NaN,
      usedModes: xs.length,
    }
  }

  const m = xs.length
  let meanX = 0
  let meanY = 0
  for (let i = 0; i < m; i++) {
    meanX += xs[i]!
    meanY += ys[i]!
  }
  meanX /= m
  meanY /= m
  let sxx = 0
  let sxy = 0
  let syy = 0
  for (let i = 0; i < m; i++) {
    const dx = xs[i]! - meanX
    const dy = ys[i]! - meanY
    sxx += dx * dx
    sxy += dx * dy
    syy += dy * dy
  }
  if (sxx <= 0) {
    return {
      inverseTemperature: Number.NaN,
      temperature: Number.NaN,
      rSquared: Number.NaN,
      usedModes: m,
    }
  }
  const slope = sxy / sxx
  const rSquared = syy > 0 ? (sxy * sxy) / (sxx * syy) : 1
  // For an equi-spaced modular spectrum, slope = Δε = 2π · β_mod, so
  // β_mod = slope / (2π). The modular "temperature" is 1/β_mod. Guard
  // against slope ≤ 0 which signals a non-Rindler (non-equi-spaced or
  // descending) spectrum where the fit does not correspond to a
  // Boltzmann factor.
  if (!(slope > 0)) {
    return {
      inverseTemperature: Number.NaN,
      temperature: Number.NaN,
      rSquared,
      usedModes: m,
    }
  }
  const inverseTemperature = slope / (2 * Math.PI)
  const temperature = 1 / inverseTemperature
  return { inverseTemperature, temperature, rSquared, usedModes: m }
}
