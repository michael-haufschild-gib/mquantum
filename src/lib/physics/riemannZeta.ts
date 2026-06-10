/**
 * Riemann Zeta quantum mode — physics core ("Arithmetic Horizon").
 *
 * This module is the **single source of truth** for the `riemannZeta` render
 * mode. The GPU never re-derives the spectral sums: the strategy calls
 * {@link generateRiemannLut} on the CPU and uploads the result as a read-only
 * radial look-up table, so the shader only does table lookups + an angular
 * factor + a horizon redshift. Keeping the heavy Σ-over-zeros math here (rather
 * than in WGSL) is both the performance story (≥45 fps) and the testability
 * story (the "JS twin" *is* the data the shader draws).
 *
 * ## The physics
 * The non-trivial zeros of ζ(s) = ½ + i·t_n are conjectured (Hilbert–Pólya) to
 * be the spectrum of a self-adjoint operator. Riemann's *explicit formula* is,
 * structurally, a Gutzwiller trace formula: building a field from the zeros
 * reconstructs the von Mangoldt prime-power comb. Working in the logarithmic
 * radial coordinate u = ln r (the natural coordinate of the Berry–Keating
 * dilation Hamiltonian H = xp — the near-horizon Hamiltonian of a black hole),
 *
 *   raw(u) = −2 · e^{u/2} · Σ_n w_n cos(t_n u)
 *          = Σ_n Λ(n) δ(u − ln n)  −  (smooth background)
 *
 * i.e. removing the smooth trend leaves Gaussian bumps of weight Λ(n) = log p
 * at u = k·log p — the primes, reconstructed purely from the zeros. The dual
 * construction (primon / Riemann gas) places the same bumps directly from the
 * primes with thermal weights p^{−k(β−1)}; its partition function is the
 * Riemann zeta function Z(β) = Σ n^{−β} = ζ(β), which diverges at β = 1 — the
 * **Hagedorn temperature**.
 *
 * @module lib/physics/riemannZeta
 */

/**
 * Imaginary parts t_n of the first 100 non-trivial zeros of ζ(s) on the
 * critical line (published values; Odlyzko / LMFDB). The prime-localisation
 * reconstruction is robust to errors ≲1e-3, and the unit test
 * `riemannZeta.test.ts` empirically re-validates the table by asserting the
 * reconstructed density peaks at log 2, log 3, log 5, log 7.
 */
export const RIEMANN_ZEROS: readonly number[] = [
  14.134725, 21.02204, 25.010858, 30.424876, 32.935062, 37.586178, 40.918719, 43.327073, 48.005151,
  49.773832, 52.970321, 56.446248, 59.347044, 60.831779, 65.112544, 67.079811, 69.546402, 72.067158,
  75.704691, 77.14484, 79.337375, 82.910381, 84.735493, 87.425275, 88.809111, 92.491899, 94.651344,
  95.870634, 98.831194, 101.317851, 103.725539, 105.446623, 107.168611, 111.029536, 111.874659,
  114.320221, 116.22668, 118.790783, 121.370125, 122.946829, 124.256819, 127.516684, 129.578704,
  131.087689, 133.497737, 134.75651, 138.116042, 139.736209, 141.123707, 143.111846, 146.000983,
  147.422765, 150.05352, 150.925257, 153.024694, 156.112909, 157.597591, 158.849988, 161.188964,
  163.03071, 165.537069, 167.18444, 169.094515, 169.911976, 173.411537, 174.754191, 176.441434,
  178.377407, 179.916484, 182.207078, 184.874468, 185.598784, 187.228922, 189.416159, 192.026656,
  193.079726, 195.265397, 196.876482, 198.015309, 201.264751, 202.493594, 204.189672, 205.394697,
  207.906259, 209.576509, 211.690862, 213.347919, 214.547044, 216.169539, 219.067596, 220.714919,
  221.430705, 224.007, 224.983325, 227.421444, 229.337413, 231.250189, 231.987235, 233.693404,
  236.52423,
]

/** Maximum number of zeros the LUT generator will use. */
export const RIEMANN_MAX_ZEROS = RIEMANN_ZEROS.length

/** One prime-power landmark p^k with its log position (the "shell" radius). */
export interface PrimePower {
  /** Prime base p. */
  p: number
  /** Power k ≥ 1. */
  k: number
  /** ln p. */
  logP: number
  /** u = k·ln p — the radial shell position in log-coordinates. */
  logPos: number
}

/**
 * Build the sorted list of prime powers p^k ≤ maxValue (k ≥ 1). These are the
 * "periodic orbits" of the Riemann dynamical system — the radii where the
 * reconstructed density localises.
 *
 * @param maxValue - Upper bound on p^k.
 * @returns Prime powers sorted by ascending log position.
 */
export function primePowersUpTo(maxValue: number): PrimePower[] {
  // Sieve primes up to maxValue.
  const limit = Math.max(2, Math.floor(maxValue))
  const sieve = new Uint8Array(limit + 1)
  const primes: number[] = []
  for (let n = 2; n <= limit; n++) {
    if (!sieve[n]) {
      primes.push(n)
      for (let m = n * n; m <= limit; m += n) sieve[m] = 1
    }
  }
  const out: PrimePower[] = []
  for (const p of primes) {
    const logP = Math.log(p)
    let value = p
    let k = 1
    while (value <= maxValue) {
      out.push({ p, k, logP, logPos: k * logP })
      value *= p
      k++
    }
  }
  out.sort((a, b) => a.logPos - b.logPos)
  return out
}

/** Source basis for the radial field. */
export type RiemannSource = 'zeros' | 'primes'

/** Parameters controlling the radial LUT generation. */
export interface RiemannRadialParams {
  /** Which dual construction to render. */
  source: RiemannSource
  /** Number of zeros Nz used in the spectral synthesis (8…RIEMANN_MAX_ZEROS). */
  numZeros: number
  /** Primon-gas inverse temperature β > 1; → 1⁺ is the Hagedorn point. */
  beta: number
  /** Lower log-radius bound (u = ln r). */
  uMin: number
  /** Upper log-radius bound. */
  uMax: number
  /** Number of LUT samples. */
  lutSize: number
  /** Maximum p^k shell radius to populate (≈ exp(uMax)). */
  maxRadius: number
  /** Gaussian smear width σ (in u) for the prime bumps / spectral taper. */
  sigmaU: number
  /** High-pass window (in u) used to remove the smooth background (zeros source). */
  lowpassWindow: number
  /** Phase carrier γ giving the colour phase a slow radial winding (both
   * sources — a colormap choice, distinct hue per shell). */
  carrier: number
}

/**
 * World-space scale: shells sit at r = RIEMANN_WORLD_SCALE · p^k, so the
 * largest displayed shell (p^k = 13) lands at r ≈ 3.9 — the same framing as
 * the other analytic modes (the relative prime-radius ratios, which carry the
 * visual proof, are unchanged). The packer folds this into the uniform u-range
 * (uMin + ln s, uMax + ln s); the LUT itself stays in pure ln(p^k) coordinates.
 */
export const RIEMANN_WORLD_SCALE = 0.3

/** Default radial parameters (also the reference scale for normalisation). */
export const RIEMANN_DEFAULT_RADIAL: RiemannRadialParams = {
  source: 'zeros',
  numZeros: 80,
  beta: 1.4,
  // uMin sits above u = 0: at u = 0 every cos(t_n·0) adds coherently, putting
  // a giant non-arithmetic spike (plus side-lobes) at r = 1 that would
  // dominate the normalisation. The first prime shell is at u = ln 2 ≈ 0.69.
  uMin: Math.log(1.35),
  uMax: Math.log(13),
  lutSize: 1024,
  maxRadius: 16,
  sigmaU: 0.05,
  lowpassWindow: 0.35,
  carrier: 5,
}

/** Spectral taper w_n = exp(−(n/Nz)²·0.9): band-limits the sum. The exponent
 * trades shell sharpness against Gibbs ringing; 0.9 keeps the full Nz=80
 * bandwidth mostly alive (narrow shells) and the background cut in
 * generateRiemannLut absorbs the residual ringing. */
function zeroTaper(n: number, numZeros: number): number {
  const x = n / numZeros
  return Math.exp(-x * x * 0.9)
}

/**
 * Compute the raw explicit-formula reconstruction
 * raw(u) = −2 Σ w_n cos(t_n u) on the LUT grid.
 *
 * This is the canonical equal-height form: the explicit formula gives bumps of
 * weight Λ(n)·n^{−1/2} at u = ln n, and Λ(n)/√n is nearly flat across the
 * prime powers (log2/√2 ≈ 0.49 … log13/√13 ≈ 0.71). Multiplying by e^{u/2}
 * would recover the raw von Mangoldt weights Λ(n) — but then the outer shells
 * dominate the normalised density ~9× over the inner ones and the inner
 * primes vanish from the render.
 *
 * @returns Array of length `lutSize`.
 */
function spectralReconstruction(p: RiemannRadialParams): Float64Array {
  const { lutSize, uMin, uMax } = p
  const nz = Math.max(1, Math.min(p.numZeros, RIEMANN_MAX_ZEROS))
  const du = (uMax - uMin) / (lutSize - 1)
  const raw = new Float64Array(lutSize)
  const weights = new Float64Array(nz)
  for (let n = 0; n < nz; n++) weights[n] = zeroTaper(n + 1, nz)
  for (let i = 0; i < lutSize; i++) {
    const u = uMin + i * du
    let cosSum = 0
    for (let n = 0; n < nz; n++) {
      cosSum += weights[n]! * Math.cos(RIEMANN_ZEROS[n]! * u)
    }
    raw[i] = -2 * cosSum
  }
  return raw
}

/** Centered moving average over a window of `windowU` (in u). */
function lowpass(signal: Float64Array, windowU: number, du: number): Float64Array {
  const half = Math.max(1, Math.round(windowU / du / 2))
  const n = signal.length
  // Prefix sums for O(n) windowed mean.
  const prefix = new Float64Array(n + 1)
  for (let i = 0; i < n; i++) prefix[i + 1] = prefix[i]! + signal[i]!
  const out = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    const lo = Math.max(0, i - half)
    const hi = Math.min(n - 1, i + half)
    out[i] = (prefix[hi + 1]! - prefix[lo]!) / (hi - lo + 1)
  }
  return out
}

/**
 * The (β-dependent) weight of the prime power n = p^k in the primon gas:
 * Λ(n)·n^{−1/2}·n^{−(β−1)} = (log p)·p^{−k(β−1/2)}. The n^{−1/2} is the
 * critical-line factor (Re s = ½) that makes the heights match the zeros-side
 * reconstruction exactly as β → 1 (the duality the Source toggle demonstrates);
 * the n^{−(β−1)} thermal factor damps the outer shells as the gas cools.
 */
function primeWeight(pp: PrimePower, beta: number): number {
  return pp.logP * Math.pow(pp.p, -pp.k * (beta - 0.5))
}

/**
 * Generate the radial look-up table the shader samples. Layout: a Float32Array
 * of `lutSize * 4`, each stride = `[rho, dRhoDu, psiRe, psiIm]`, where `rho` is
 * the (normalised, ≥0) probability density and `psi` is the complex field used
 * for phase colouring. Density is normalised so the reference configuration's
 * peak ≈ 1; the shader applies glow × Hagedorn gain on top.
 *
 * @param params - Radial parameters.
 * @returns Interleaved Float32Array of length `params.lutSize * 4`.
 */
export function generateRiemannLut(params: RiemannRadialParams): Float32Array {
  const p = { ...params }
  p.numZeros = Math.max(1, Math.min(p.numZeros, RIEMANN_MAX_ZEROS))
  const { lutSize, uMin, uMax } = p
  const du = (uMax - uMin) / (lutSize - 1)
  const rho = new Float64Array(lutSize)
  const psiRe = new Float64Array(lutSize)
  const psiIm = new Float64Array(lutSize)

  if (p.source === 'zeros') {
    const raw = spectralReconstruction(p)
    const bg = lowpass(raw, p.lowpassWindow, du)
    for (let i = 0; i < lutSize; i++) {
      rho[i] = Math.max(0, raw[i]! - bg[i]!)
    }
    // Colour phase: a slow radial carrier, NOT arg S(u). The genuine spectral
    // phase rotates at the mean zero ordinate (~50 rad per unit u) — far below
    // the march sampling rate, so it renders as hue noise that averages to
    // white. The density stays the honest zeros reconstruction; the phase
    // channel is a colormap choice (distinct hue per shell).
    for (let i = 0; i < lutSize; i++) {
      const u = uMin + i * du
      psiRe[i] = rho[i]! * Math.cos(p.carrier * u)
      psiIm[i] = rho[i]! * Math.sin(p.carrier * u)
    }
  } else {
    // Primon / Riemann gas: place Gaussian bumps directly from the prime powers.
    const pps = primePowersUpTo(p.maxRadius)
    const sigma = p.sigmaU
    const inv2s2 = 1 / (2 * sigma * sigma)
    const cutoff = 4 * sigma
    for (const pp of pps) {
      const w = primeWeight(pp, p.beta)
      const center = pp.logPos
      // Only touch grid points within ±4σ of the bump.
      const iLo = Math.max(0, Math.floor((center - cutoff - uMin) / du))
      const iHi = Math.min(lutSize - 1, Math.ceil((center + cutoff - uMin) / du))
      for (let i = iLo; i <= iHi; i++) {
        const u = uMin + i * du
        const d = u - center
        rho[i] = rho[i]! + w * Math.exp(-d * d * inv2s2)
      }
    }
    for (let i = 0; i < lutSize; i++) {
      const u = uMin + i * du
      psiRe[i] = rho[i]! * Math.cos(p.carrier * u)
      psiIm[i] = rho[i]! * Math.sin(p.carrier * u)
    }
  }

  // Normalise density to unit peak so glow/Hagedorn gain control brightness.
  let maxRho = 0
  for (let i = 0; i < lutSize; i++) if (rho[i]! > maxRho) maxRho = rho[i]!
  const invMax = maxRho > 1e-12 ? 1 / maxRho : 1
  let maxPsi = 0
  for (let i = 0; i < lutSize; i++) {
    const m = Math.hypot(psiRe[i]!, psiIm[i]!)
    if (m > maxPsi) maxPsi = m
  }
  const invPsi = maxPsi > 1e-12 ? 1 / maxPsi : 1

  // Background cut + sharpening: the finite-Nz reconstruction leaves low-level
  // ringing between the prime shells which, integrated over a full chord
  // through the volume, would render as opaque fog. A soft floor cut followed
  // by a gamma sharpen keeps every argmax position (monotone transform) while
  // sending the inter-shell background to exactly zero — crisp shells.
  const BG_CUT = 0.2
  const invCut = 1 / (1 - BG_CUT)
  const out = new Float32Array(lutSize * 4)
  for (let i = 0; i < lutSize; i++) {
    const rhoN = Math.max(0, rho[i]! * invMax - BG_CUT) * invCut
    out[i * 4 + 0] = Math.pow(rhoN, 2.0)
    out[i * 4 + 2] = psiRe[i]! * invPsi
    out[i * 4 + 3] = psiIm[i]! * invPsi
  }
  // Derivative dRho/du via central differences on the normalised density.
  for (let i = 0; i < lutSize; i++) {
    const lo = Math.max(0, i - 1)
    const hi = Math.min(lutSize - 1, i + 1)
    out[i * 4 + 1] = (out[hi * 4]! - out[lo * 4]!) / ((hi - lo) * du)
  }
  return out
}

/**
 * Sample the (normalised) radial density from a generated LUT at log-radius `u`
 * with linear interpolation — the CPU twin of the shader's lookup, used by
 * tests. Outside the LUT u-range the density is exactly zero (the shader skips
 * those samples entirely; edge-clamping would smear the boundary samples over
 * the whole inner core / outer margin as uniform fog).
 *
 * @param lut - LUT from {@link generateRiemannLut}.
 * @param params - The params used to build `lut` (for the u-range).
 * @param u - Query log-radius.
 * @returns Interpolated density (0 outside the LUT range).
 */
export function sampleRiemannDensity(
  lut: Float32Array,
  params: RiemannRadialParams,
  u: number
): number {
  const { lutSize, uMin, uMax } = params
  if (u < uMin || u > uMax) return 0
  const du = (uMax - uMin) / (lutSize - 1)
  const f = (u - uMin) / du
  const i = Math.floor(f)
  const t = f - i
  return lut[i * 4]! * (1 - t) + lut[(i + 1) * 4]! * t
}

/**
 * Truncated primon-gas partition function Z(β) = Σ_{n=2}^{terms} n^{−β}
 * (a partial sum of ζ(β) − 1). Monotonically decreasing in β and divergent as
 * β → 1⁺ (the Hagedorn temperature).
 *
 * @param beta - Inverse temperature β.
 * @param terms - Number of terms (default 8192).
 * @returns Z(β).
 */
export function truncatedZeta(beta: number, terms = 8192): number {
  let z = 0
  for (let n = 2; n <= terms + 1; n++) z += Math.pow(n, -beta)
  return z
}

// Memo for hagedornPartitionGain: the uniform packer calls it on every dirty
// frame (animation time is a dirty input), and each evaluation sums thousands
// of n^-beta terms. beta only changes on user input, so a one-slot memo
// eliminates the per-frame cost entirely.
let hagedornMemoKey = NaN
let hagedornMemoValue = 1
const hagedornRefMemo = new Map<number, number>()

/**
 * Hagedorn emission gain: log(1 + Z(β)) relative to the reference β. Grows
 * without bound as β → 1⁺ (ignition / "arithmetic Big Bang"), drops below 1 for
 * cold (large-β) gases. Memoized on (β, β_ref) — safe to call per frame.
 *
 * @param beta - Inverse temperature β.
 * @param betaRef - Reference β (default 1.4).
 * @returns Dimensionless emission gain, clamped to [0.1, 12].
 */
export function hagedornPartitionGain(beta: number, betaRef = 1.4): number {
  const key = beta * 65536 + betaRef
  if (key === hagedornMemoKey) return hagedornMemoValue
  let ref = hagedornRefMemo.get(betaRef)
  if (ref === undefined) {
    ref = Math.log(1 + truncatedZeta(betaRef))
    hagedornRefMemo.set(betaRef, ref)
  }
  const gain = Math.log(1 + truncatedZeta(beta)) / (ref > 1e-9 ? ref : 1)
  const clamped = Math.min(12, Math.max(0.1, gain))
  hagedornMemoKey = key
  hagedornMemoValue = clamped
  return clamped
}

/**
 * Smooth Riemann–von Mangoldt counting function N̄(t) = (t/2π)(ln(t/2π) − 1) + 7/8,
 * the average number of zeros with ordinate < t. Used to *unfold* the spectrum
 * so the mean spacing is 1.
 *
 * @param t - Ordinate.
 * @returns Mean cumulative count.
 */
export function smoothZeroCount(t: number): number {
  const x = t / (2 * Math.PI)
  return x * (Math.log(x) - 1) + 7 / 8
}

/**
 * Unfold the zero ordinates and return consecutive normalised spacings
 * s_n = N̄(t_{n+1}) − N̄(t_n). By construction these have mean ≈ 1.
 *
 * @param zeros - Zero ordinates (defaults to {@link RIEMANN_ZEROS}).
 * @returns Array of normalised spacings.
 */
export function unfoldedZeroSpacings(zeros: readonly number[] = RIEMANN_ZEROS): number[] {
  const unfolded = zeros.map(smoothZeroCount)
  const spacings: number[] = []
  for (let i = 1; i < unfolded.length; i++) spacings.push(unfolded[i]! - unfolded[i - 1]!)
  return spacings
}

/**
 * GUE nearest-neighbour spacing distribution (Wigner surmise for β=2):
 * p(s) = (32/π²) s² exp(−4s²/π). The Montgomery–Odlyzko law states the unfolded
 * Riemann zeros follow this — the signature of a quantum-chaotic Hamiltonian
 * with broken time-reversal symmetry.
 *
 * @param s - Normalised spacing.
 * @returns Probability density.
 */
export function gueWignerSurmise(s: number): number {
  return (32 / (Math.PI * Math.PI)) * s * s * Math.exp((-4 * s * s) / Math.PI)
}

/**
 * Poisson (uncorrelated) spacing distribution p(s) = exp(−s) — the null
 * hypothesis the zeros are *not* like (a level-repelling quantum spectrum).
 *
 * @param s - Normalised spacing.
 * @returns Probability density.
 */
export function poissonSpacing(s: number): number {
  return Math.exp(-s)
}

/** A spacing histogram with bin centres and empirical densities. */
export interface SpacingHistogram {
  /** Bin centres. */
  centers: number[]
  /** Normalised empirical density per bin (integrates to 1). */
  density: number[]
  /** Bin width. */
  binWidth: number
}

/**
 * Histogram normalised-spacing samples into a density (integrates to 1).
 *
 * @param spacings - Normalised spacings.
 * @param binWidth - Histogram bin width (default 0.25).
 * @param maxS - Upper edge (default 4).
 * @returns Histogram with bin centres and densities.
 */
export function spacingHistogram(spacings: number[], binWidth = 0.25, maxS = 4): SpacingHistogram {
  const nBins = Math.ceil(maxS / binWidth)
  const counts = new Array<number>(nBins).fill(0)
  let total = 0
  for (const s of spacings) {
    if (s < 0 || s >= maxS) continue
    const bin = Math.floor(s / binWidth)
    counts[bin] = counts[bin]! + 1
    total++
  }
  const centers: number[] = []
  const density: number[] = []
  for (let i = 0; i < nBins; i++) {
    centers.push((i + 0.5) * binWidth)
    density.push(total > 0 ? counts[i]! / (total * binWidth) : 0)
  }
  return { centers, density, binWidth }
}

/**
 * Sum of squared residuals between an empirical spacing histogram and a model
 * distribution — used to show GUE fits the zeros better than Poisson.
 *
 * @param hist - Empirical histogram.
 * @param model - Model density function.
 * @returns Σ (empirical − model)² over bin centres.
 */
export function spacingFitError(hist: SpacingHistogram, model: (s: number) => number): number {
  let err = 0
  for (let i = 0; i < hist.centers.length; i++) {
    const d = hist.density[i]! - model(hist.centers[i]!)
    err += d * d
  }
  return err
}

/**
 * Berry–Keating dilation-horizon redshift factor √f, where
 * f = 1 − (r_h/r)^{d−2} (Schwarzschild–Tangherlini), used to dim emission as a
 * ray approaches the horizon. Returns 0 inside the horizon.
 *
 * @param r - Radius.
 * @param rHorizon - Horizon radius r_h.
 * @param dimension - Spatial dimension d.
 * @returns Redshift factor in [0, 1].
 */
export function horizonRedshift(r: number, rHorizon: number, dimension: number): number {
  if (rHorizon <= 0) return 1
  if (r <= rHorizon) return 0
  const exponent = Math.max(1, dimension - 2)
  const f = 1 - Math.pow(rHorizon / r, exponent)
  return Math.sqrt(Math.max(0, f))
}

/** Bounding-radius input (only the fields that affect the spatial extent). */
export interface RiemannBoundingInput {
  /** Maximum p^k shell radius to display. */
  maxRadius?: number
}

/**
 * Physics-based bounding radius for the cube geometry: the largest displayed
 * shell radius exp(uMax)·RIEMANN_WORLD_SCALE plus a small margin, capped for
 * performance (≥45 fps). Dimension-independent (the field is radial in the
 * extra dimensions). With the default u-range this is ≈ 4.1 — the same
 * framing as the other analytic modes.
 *
 * @param config - Bounding input (`maxRadius` overrides the largest shell, in
 *   pre-scale p^k units).
 * @param _dimension - Spatial dimension (unused; field is radial in extra dims).
 * @returns Bounding radius in model-space units.
 */
export function riemannZetaBoundingRadius(
  config: RiemannBoundingInput | undefined,
  _dimension: number
): number {
  const maxShell = config?.maxRadius ?? Math.exp(RIEMANN_DEFAULT_RADIAL.uMax)
  return Math.min(14, maxShell * RIEMANN_WORLD_SCALE * 1.05)
}
