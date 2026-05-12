/**
 * Incompressible Kinetic Energy Spectrum via Helmholtz Decomposition
 *
 * Computes E_incomp(k) for BEC superfluid turbulence analysis.
 *
 * Algorithm (Nore et al. 1997, Bradley et al. 2012):
 *   1. Compute density-weighted velocity u_d(x) = √ρ · v_d = j_d / |ψ|
 *      where j_d = (ℏ/m) Im(ψ* ∂_d ψ) is the probability current
 *   2. FFT each component: û_d(k)
 *   3. Helmholtz projection in k-space:
 *      û_incomp_d(k) = û_d(k) − k_d · (Σ_j k_j û_j(k)) / |k|²
 *      This removes the compressible (longitudinal/irrotational) part.
 *   4. Shell binning (logarithmic):
 *      E_incomp(k_n) = ½m (dV/N) Σ_{|k'| ∈ shell(n)} Σ_d |û_incomp_d(k')|²
 *      because the shared FFT is unnormalized: Σ_k |û_k|² = N Σ_x |u_x|².
 *
 * The result reveals the Kolmogorov cascade k^{-5/3} in quantum turbulence.
 *
 * @module lib/physics/bec/incompressibleSpectrum
 */

/** Number of bins in the incompressible kinetic energy spectrum. */
export const NUM_SPECTRUM_BINS = 32

/** Result of the incompressible spectrum computation. */
export interface IncompressibleSpectrumResult {
  /** Energy per bin E_incomp(k_n) */
  spectrum: Float32Array
  /** Bin-center k values (logarithmically spaced) */
  kValues: Float32Array
  /** Total incompressible kinetic energy (integral of spectrum) */
  totalIncompressible: number
  /** Total compressible kinetic energy */
  totalCompressible: number
}

// ─── FFT ──────────────────────────────────────────────────────────────────────
// Delegates to the shared FFT module (which uses WASM when available).
// The shared module uses interleaved complex format [re0, im0, re1, im1, ...],
// so this wrapper interleaves split re/im arrays, calls the shared FFT,
// and de-interleaves back.

import {
  fft as sharedFft,
  fftNd as sharedFftNd,
  ifft as sharedIfft,
  ifftNd as sharedIfftNd,
} from '@/lib/math/fft'
import { computeIncompressibleSpectrumWasm } from '@/lib/wasm'

/**
 * N-D separable FFT on split real/imaginary arrays.
 *
 * Delegates to the shared FFT module (which uses WASM when available).
 * Interleaves the split arrays, transforms, then de-interleaves the result.
 *
 * @param re - Real part, length = totalSites (modified in place)
 * @param im - Imaginary part, length = totalSites (modified in place)
 * @param gridSize - Per-dimension sizes (all must be powers of 2)
 * @param inverse - If true, compute inverse FFT
 */
export function fftND(
  re: Float64Array,
  im: Float64Array,
  gridSize: number[],
  inverse: boolean
): void {
  let totalSites = 1
  for (let d = 0; d < gridSize.length; d++) totalSites *= gridSize[d]!

  // Interleave into a single buffer
  const interleaved = new Float64Array(totalSites * 2)
  for (let i = 0; i < totalSites; i++) {
    interleaved[i * 2] = re[i]!
    interleaved[i * 2 + 1] = im[i]!
  }

  // Use shared FFT (which tries WASM first, then falls back to TS)
  if (inverse) {
    if (gridSize.length === 1) {
      sharedIfft(interleaved, totalSites)
    } else {
      sharedIfftNd(interleaved, gridSize)
    }
  } else {
    if (gridSize.length === 1) {
      sharedFft(interleaved, totalSites)
    } else {
      sharedFftNd(interleaved, gridSize)
    }
  }

  // De-interleave back to split arrays
  for (let i = 0; i < totalSites; i++) {
    re[i] = interleaved[i * 2]!
    im[i] = interleaved[i * 2 + 1]!
  }
}

// ─── Spectrum Computation ─────────────────────────────────────────────────────

/**
 * Compute the incompressible kinetic energy spectrum E_incomp(k).
 *
 * @param psiRe - Wavefunction real part on the lattice (Float32Array, C-order)
 * @param psiIm - Wavefunction imaginary part on the lattice
 * @param gridSize - Grid points per dimension (all power of 2)
 * @param spacing - Lattice spacing per dimension
 * @param hbar - Reduced Planck constant
 * @param mass - Particle mass
 * @param numBins - Number of spectrum bins (default 32)
 * @returns Incompressible spectrum result
 */
export function computeIncompressibleSpectrum(
  psiRe: Float32Array,
  psiIm: Float32Array,
  gridSize: number[],
  spacing: number[],
  hbar: number,
  mass: number,
  numBins = NUM_SPECTRUM_BINS
): IncompressibleSpectrumResult {
  const dim = gridSize.length
  const binCount = Number.isInteger(numBins) && numBins > 0 ? numBins : 0
  const zeroResult = (): IncompressibleSpectrumResult => ({
    spectrum: new Float32Array(binCount),
    kValues: new Float32Array(binCount),
    totalIncompressible: 0,
    totalCompressible: 0,
  })

  if (
    binCount === 0 ||
    !Number.isFinite(hbar) ||
    hbar <= 0 ||
    !Number.isFinite(mass) ||
    mass <= 0
  ) {
    return zeroResult()
  }

  // PERF: WASM fast-path. Rust `compute_incompressible_spectrum_wasm`
  // (src/wasm/mdimension_core/src/bec_spectrum.rs) covers the full residual
  // pipeline (density-weighted velocity + 3× FFT via fft_nd + Helmholtz
  // projection + log-spaced shell binning) in a single JS→WASM boundary
  // crossing. Three green Rust unit tests cover stationary/plane-wave/vortex.
  // Gracefully falls through to the TypeScript path on any of: WASM not yet
  // initialized in this worker/thread, a non-default bin count, or a runtime
  // failure producing an empty-length packed result. The opt-out is
  // `globalThis.__BEC_SPECTRUM_WASM_DISABLED__ = true` for A/B benchmarking.
  const wasmDisabled =
    (globalThis as { __BEC_SPECTRUM_WASM_DISABLED__?: boolean }).__BEC_SPECTRUM_WASM_DISABLED__ ===
    true
  if (!wasmDisabled && numBins === NUM_SPECTRUM_BINS) {
    const packed = computeIncompressibleSpectrumWasm(
      psiRe,
      psiIm,
      new Uint32Array(gridSize),
      new Float64Array(spacing),
      hbar,
      mass
    )
    if (packed && packed.length === 2 * NUM_SPECTRUM_BINS + 2) {
      const spectrumF32 = new Float32Array(NUM_SPECTRUM_BINS)
      const kValues = new Float32Array(NUM_SPECTRUM_BINS)
      for (let b = 0; b < NUM_SPECTRUM_BINS; b++) {
        spectrumF32[b] = packed[b]!
        kValues[b] = packed[NUM_SPECTRUM_BINS + b]!
      }
      return {
        spectrum: spectrumF32,
        kValues,
        totalIncompressible: packed[2 * NUM_SPECTRUM_BINS]!,
        totalCompressible: packed[2 * NUM_SPECTRUM_BINS + 1]!,
      }
    } else if (packed) {
      // WASM returned a result with unexpected length (likely input validation
      // rejection producing an empty vec). Do NOT fall through to the TS path
      // which lacks the same validation — return a zeroed result instead.
      return {
        spectrum: new Float32Array(NUM_SPECTRUM_BINS),
        kValues: new Float32Array(NUM_SPECTRUM_BINS),
        totalIncompressible: 0,
        totalCompressible: 0,
      }
    }
    // packed is null/undefined → WASM not initialized, fall through to TS path
  }

  // TS fallback validation (mirrors the WASM input rejection above).
  // Without these guards, invalid grid/spacing would produce NaN/Infinity
  // energies and spectrum values via the Parseval scaling at the end.
  if (dim === 0 || spacing.length !== dim) return zeroResult()
  for (let d = 0; d < dim; d++) {
    const n = gridSize[d]!
    const dx = spacing[d]!
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 2 || (n & (n - 1)) !== 0) {
      return zeroResult()
    }
    if (!Number.isFinite(dx) || dx <= 0) return zeroResult()
  }

  let totalSites = 1
  for (let d = 0; d < dim; d++) totalSites *= gridSize[d]!
  if (!Number.isFinite(totalSites) || totalSites <= 0) return zeroResult()
  if (psiRe.length !== totalSites || psiIm.length !== totalSites) return zeroResult()

  const hbarOverM = hbar / Math.max(mass, 1e-10)

  // Compute strides (C-order: last axis fastest)
  const strides = new Int32Array(dim)
  strides[dim - 1] = 1
  for (let d = dim - 2; d >= 0; d--) strides[d] = strides[d + 1]! * gridSize[d + 1]!

  // ── Step 1: Compute density-weighted velocity u_d = j_d / |ψ| ──
  // Store all D components as Float64Array arrays for FFT precision
  const uRe: Float64Array[] = []
  const uIm: Float64Array[] = []
  for (let d = 0; d < dim; d++) {
    uRe.push(new Float64Array(totalSites))
    uIm.push(new Float64Array(totalSites)) // zero (velocity is real-valued)
  }

  // Pre-compute inverse spacing (avoid division in inner loop)
  const invDx = new Float64Array(dim)
  for (let d = 0; d < dim; d++) invDx[d] = 0.5 / spacing[d]!

  // Pre-compute inverse amplitudes: one sqrt per site instead of per-site-per-dim
  const invAmps = new Float64Array(totalSites)
  for (let idx = 0; idx < totalSites; idx++) {
    const re0 = psiRe[idx]!
    const im0 = psiIm[idx]!
    const amp = Math.sqrt(re0 * re0 + im0 * im0)
    invAmps[idx] = amp > 1e-12 ? 1.0 / amp : 0.0
  }

  // Process each dimension independently.
  // For each dimension d, compute the finite-difference velocity u_d[idx] for all sites.
  // The coordinate along axis d determines which boundary case applies.
  // By iterating in stride order, we extract the coordinate without full decomposition.
  for (let d = 0; d < dim; d++) {
    const N = gridSize[d]!
    if (N <= 1) continue
    const s = strides[d]!
    const invDxD = invDx[d]!
    const uReD = uRe[d]!

    // The coordinate along axis d for a given linear index idx is:
    //   c = (idx / s) % N
    // where s = strides[d].
    // We iterate over all sites using a simple index loop with modular coord extraction.
    for (let idx = 0; idx < totalSites; idx++) {
      const c = ((idx / s) | 0) % N
      const re0 = psiRe[idx]!
      const im0 = psiIm[idx]!

      // Central finite differences with periodic boundaries
      let dRe: number
      let dIm: number
      if (c === 0) {
        const fwd = idx + s
        const bwd = idx + s * (N - 1)
        dRe = (psiRe[fwd]! - psiRe[bwd]!) * invDxD
        dIm = (psiIm[fwd]! - psiIm[bwd]!) * invDxD
      } else if (c === N - 1) {
        const fwd = idx - s * (N - 1)
        const bwd = idx - s
        dRe = (psiRe[fwd]! - psiRe[bwd]!) * invDxD
        dIm = (psiIm[fwd]! - psiIm[bwd]!) * invDxD
      } else {
        dRe = (psiRe[idx + s]! - psiRe[idx - s]!) * invDxD
        dIm = (psiIm[idx + s]! - psiIm[idx - s]!) * invDxD
      }

      const jd = hbarOverM * (re0 * dIm - im0 * dRe)
      uReD[idx] = jd * invAmps[idx]!
    }
  }

  // ── Step 2: FFT each velocity component ──
  for (let d = 0; d < dim; d++) {
    fftND(uRe[d]!, uIm[d]!, gridSize, false)
  }

  // ── Step 3: Helmholtz projection + Step 4: Shell binning (combined) ──
  // k-space grid scale: dk_d = 2π/(N_d × a_d)
  const kGridScale = new Float64Array(dim)
  for (let d = 0; d < dim; d++) {
    kGridScale[d] = (2 * Math.PI) / (gridSize[d]! * spacing[d]!)
  }

  // Determine k range for logarithmic binning:
  // k_min = min nonzero |k|, k_max = Euclidean Nyquist corner.
  let kMinSq = Infinity
  let kMaxSq = 0
  for (let d = 0; d < dim; d++) {
    const dk = kGridScale[d]!
    kMinSq = Math.min(kMinSq, dk * dk)
    const kNyquist = Math.PI / spacing[d]!
    kMaxSq += kNyquist * kNyquist
  }
  const kMin = Math.sqrt(kMinSq)
  const kMax = Math.sqrt(kMaxSq)

  // Logarithmic bin edges
  const logKMin = Math.log(kMin)
  const logKMax = Math.log(kMax)
  const logRange = logKMax - logKMin
  if (!Number.isFinite(logRange) || logRange <= 0) return zeroResult()

  const spectrum = new Float64Array(numBins)
  const kValues = new Float32Array(numBins)
  let totalIncomp = 0
  let totalComp = 0

  // Compute bin centers (log-spaced)
  for (let b = 0; b < numBins; b++) {
    kValues[b] = Math.exp(logKMin + ((b + 0.5) * logRange) / numBins)
  }

  // Pre-compute half-grid sizes for frequency centering
  const halfN = new Int32Array(dim)
  for (let d = 0; d < dim; d++) halfN[d] = gridSize[d]! >> 1

  // Hoisted buffers for k-space loop
  const kVec = new Float64Array(dim)
  const coords = new Int32Array(dim)
  const binInvLogRange = numBins / logRange

  // Process each k-point
  for (let idx = 0; idx < totalSites; idx++) {
    // Decompose to N-D k-space coordinates (reusing hoisted buffer)
    let remaining = idx
    for (let d = dim - 1; d >= 0; d--) {
      const g = gridSize[d]!
      coords[d] = remaining % g
      remaining = (remaining / g) | 0
    }

    // Compute k-vector components (centered: indices > N/2 are negative frequencies)
    let kSq = 0
    for (let d = 0; d < dim; d++) {
      const c = coords[d]!
      const kIdx = c < halfN[d]! ? c : c - gridSize[d]!
      const kd = kGridScale[d]! * kIdx
      kVec[d] = kd
      kSq += kd * kd
    }

    // Skip DC component (k=0 is purely compressible)
    if (kSq < 1e-20) continue

    // Compute k·û = Σ_d k_d û_d(k)
    let dotRe = 0
    let dotIm = 0
    for (let d = 0; d < dim; d++) {
      const kd = kVec[d]!
      dotRe += kd * uRe[d]![idx]!
      dotIm += kd * uIm[d]![idx]!
    }

    // Helmholtz projection: û_incomp_d = û_d − k_d(k·û)/|k|²
    const invKSq = 1.0 / kSq
    const projRe = dotRe * invKSq
    const projIm = dotIm * invKSq
    let incompSq = 0
    let compSq = 0
    for (let d = 0; d < dim; d++) {
      const kd = kVec[d]!
      const cRe = kd * projRe
      const cIm = kd * projIm
      const iRe = uRe[d]![idx]! - cRe
      const iIm = uIm[d]![idx]! - cIm
      incompSq += iRe * iRe + iIm * iIm
      compSq += cRe * cRe + cIm * cIm
    }

    totalIncomp += incompSq
    totalComp += compSq

    // Logarithmic bin assignment
    const kMag = Math.sqrt(kSq)
    const logK = Math.log(kMag)
    const bin = Math.min(Math.max(((logK - logKMin) * binInvLogRange) | 0, 0), numBins - 1)
    spectrum[bin] = spectrum[bin]! + incompSq
  }

  let voxelVolume = 1
  for (let d = 0; d < dim; d++) voxelVolume *= spacing[d]!
  if (!Number.isFinite(voxelVolume) || voxelVolume <= 0) return zeroResult()
  const energyScale = 0.5 * mass * (voxelVolume / totalSites)
  if (!Number.isFinite(energyScale)) return zeroResult()

  // Scale by physical Parseval factor and convert to Float32.
  const spectrumF32 = new Float32Array(numBins)
  for (let b = 0; b < numBins; b++) {
    spectrumF32[b] = energyScale * spectrum[b]!
  }

  return {
    spectrum: spectrumF32,
    kValues,
    totalIncompressible: energyScale * totalIncomp,
    totalCompressible: energyScale * totalComp,
  }
}
