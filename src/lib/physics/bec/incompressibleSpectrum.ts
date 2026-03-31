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
 *      E_incomp(k_n) = ½m Σ_{|k'| ∈ shell(n)} Σ_d |û_incomp_d(k')|²
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

// ─── Twiddle Factor Cache ────────────────────────────────────────────────────

/**
 * Cached twiddle factors for FFT butterfly stages.
 * Key: `${N}_${inverse}` → Float64Array of interleaved [re,im] pairs per stage.
 * Eliminates repeated cos/sin computation across fftND rows sharing the same N.
 */
const twiddleCache = new Map<string, Float64Array[]>()

/**
 * Get or compute twiddle factors for all butterfly stages of size N.
 *
 * @param N - Transform length (power of 2)
 * @param inverse - Forward or inverse transform
 * @returns Array of Float64Arrays, one per stage (len=2,4,8,...,N)
 */
function getTwiddleFactors(N: number, inverse: boolean): Float64Array[] {
  const key = `${N}_${inverse ? 1 : 0}`
  let cached = twiddleCache.get(key)
  if (cached) return cached

  const sign = inverse ? 1.0 : -1.0
  cached = []
  for (let len = 2; len <= N; len <<= 1) {
    const halfLen = len >> 1
    const factors = new Float64Array(halfLen * 2)
    const angle = (sign * 2 * Math.PI) / len
    // Pre-compute all twiddle factors for this stage
    for (let k = 0; k < halfLen; k++) {
      const theta = angle * k
      factors[2 * k] = Math.cos(theta)
      factors[2 * k + 1] = Math.sin(theta)
    }
    cached.push(factors)
  }
  twiddleCache.set(key, cached)
  return cached
}

// Pre-computed constants for N=8 FFT (used in 7D BEC with gridSize=8)
const SQRT2_INV = 1.0 / Math.sqrt(2.0)

/**
 * Fully unrolled radix-2 FFT for N=8 on interleaved [re, im] data.
 * Eliminates bit-reversal, loop overhead, and twiddle lookups.
 * ~30% faster than generic fft1DInPlace for this size.
 */
function fft8InPlace(data: Float64Array, inverse: boolean): void {
  const sign = inverse ? 1.0 : -1.0

  // Bit-reversal for N=8: [0,4,2,6,1,5,3,7]
  // Swap pairs: (1,4), (3,6)
  let t: number
  t = data[2]!
  data[2] = data[8]!
  data[8] = t
  t = data[3]!
  data[3] = data[9]!
  data[9] = t
  t = data[6]!
  data[6] = data[12]!
  data[12] = t
  t = data[7]!
  data[7] = data[13]!
  data[13] = t

  // Stage 1: len=2, halfLen=1, w = 1+0i for k=0
  for (let i = 0; i < 8; i += 2) {
    const ei = 2 * i
    const oi = ei + 2
    const eRe = data[ei]!
    const eIm = data[ei + 1]!
    const oRe = data[oi]!
    const oIm = data[oi + 1]!
    data[ei] = eRe + oRe
    data[ei + 1] = eIm + oIm
    data[oi] = eRe - oRe
    data[oi + 1] = eIm - oIm
  }

  // Stage 2: len=4, halfLen=2
  // k=0: w = 1+0i, k=1: w = cos(π/2) + i·sign·sin(π/2) = 0 + i·sign
  for (let i = 0; i < 8; i += 4) {
    const b = 2 * i
    // k=0: twiddle = 1
    const e0Re = data[b]!
    const e0Im = data[b + 1]!
    const o0Re = data[b + 4]!
    const o0Im = data[b + 5]!
    data[b] = e0Re + o0Re
    data[b + 1] = e0Im + o0Im
    data[b + 4] = e0Re - o0Re
    data[b + 5] = e0Im - o0Im

    // k=1: twiddle = i·sign → (re+i·im)·(i·sign) = -sign·im + i·sign·re
    const e1Re = data[b + 2]!
    const e1Im = data[b + 3]!
    const o1Re = data[b + 6]!
    const o1Im = data[b + 7]!
    const tRe = -sign * o1Im
    const tIm = sign * o1Re
    data[b + 2] = e1Re + tRe
    data[b + 3] = e1Im + tIm
    data[b + 6] = e1Re - tRe
    data[b + 7] = e1Im - tIm
  }

  // Stage 3: len=8, halfLen=4
  // k=0: w=1, k=1: w=cos(π/4)+i·sign·sin(π/4), k=2: w=0+i·sign, k=3: w=cos(3π/4)+i·sign·sin(3π/4)
  const w1r = SQRT2_INV
  const w1i = sign * SQRT2_INV
  const w3r = -SQRT2_INV
  const w3i = sign * SQRT2_INV

  // k=0: w=1
  {
    const eRe = data[0]!
    const eIm = data[1]!
    const oRe = data[8]!
    const oIm = data[9]!
    data[0] = eRe + oRe
    data[1] = eIm + oIm
    data[8] = eRe - oRe
    data[9] = eIm - oIm
  }
  // k=1: w = w1r + i·w1i
  {
    const eRe = data[2]!
    const eIm = data[3]!
    const oRe = data[10]!
    const oIm = data[11]!
    const tRe = w1r * oRe - w1i * oIm
    const tIm = w1r * oIm + w1i * oRe
    data[2] = eRe + tRe
    data[3] = eIm + tIm
    data[10] = eRe - tRe
    data[11] = eIm - tIm
  }
  // k=2: w = 0 + i·sign
  {
    const eRe = data[4]!
    const eIm = data[5]!
    const oRe = data[12]!
    const oIm = data[13]!
    const tRe = -sign * oIm
    const tIm = sign * oRe
    data[4] = eRe + tRe
    data[5] = eIm + tIm
    data[12] = eRe - tRe
    data[13] = eIm - tIm
  }
  // k=3: w = w3r + i·w3i
  {
    const eRe = data[6]!
    const eIm = data[7]!
    const oRe = data[14]!
    const oIm = data[15]!
    const tRe = w3r * oRe - w3i * oIm
    const tIm = w3r * oIm + w3i * oRe
    data[6] = eRe + tRe
    data[7] = eIm + tIm
    data[14] = eRe - tRe
    data[15] = eIm - tIm
  }

  if (inverse) {
    const inv = 0.125 // 1/8
    for (let i = 0; i < 16; i++) data[i] = data[i]! * inv
  }
}

/**
 * In-place radix-2 Cooley-Tukey FFT on interleaved [re, im] Float64Array.
 * Uses pre-computed twiddle factors to avoid per-butterfly cos/sin.
 *
 * @param data - Interleaved [re0, im0, re1, im1, ...] of length 2*N
 * @param N - Transform length (must be power of 2)
 * @param inverse - If true, compute inverse FFT (with 1/N normalization)
 * @param twiddles - Pre-computed twiddle factors from getTwiddleFactors()
 */
function fft1DInPlace(
  data: Float64Array,
  N: number,
  inverse: boolean,
  twiddles: Float64Array[]
): void {
  // Bit-reversal permutation
  let j = 0
  for (let i = 0; i < N; i++) {
    if (i < j) {
      const ii = 2 * i
      const jj = 2 * j
      const tRe = data[ii]!
      const tIm = data[ii + 1]!
      data[ii] = data[jj]!
      data[ii + 1] = data[jj + 1]!
      data[jj] = tRe
      data[jj + 1] = tIm
    }
    let m = N >> 1
    while (m >= 1 && j >= m) {
      j -= m
      m >>= 1
    }
    j += m
  }

  // Butterfly stages with pre-computed twiddle factors
  let stageIdx = 0
  for (let len = 2; len <= N; len <<= 1) {
    const halfLen = len >> 1
    const factors = twiddles[stageIdx]!
    for (let i = 0; i < N; i += len) {
      for (let k = 0; k < halfLen; k++) {
        const wRe = factors[2 * k]!
        const wIm = factors[2 * k + 1]!
        const evenIdx = 2 * (i + k)
        const oddIdx = 2 * (i + k + halfLen)
        const oRe = data[oddIdx]!
        const oIm = data[oddIdx + 1]!
        const tRe = wRe * oRe - wIm * oIm
        const tIm = wRe * oIm + wIm * oRe
        const eRe = data[evenIdx]!
        const eIm = data[evenIdx + 1]!
        data[oddIdx] = eRe - tRe
        data[oddIdx + 1] = eIm - tIm
        data[evenIdx] = eRe + tRe
        data[evenIdx + 1] = eIm + tIm
      }
    }
    stageIdx++
  }

  // Inverse normalization
  if (inverse) {
    const invN = 1.0 / N
    const len = 2 * N
    for (let i = 0; i < len; i++) {
      data[i] = data[i]! * invN
    }
  }
}

/**
 * N-D separable FFT: applies 1D FFT along each axis.
 * Pre-allocates row buffer and twiddle factors to avoid per-row allocations.
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
  const dim = gridSize.length
  let totalSites = 1
  for (let d = 0; d < dim; d++) totalSites *= gridSize[d]!

  // Find max grid size across all axes for shared row buffer
  let maxN = 0
  for (let d = 0; d < dim; d++) {
    if (gridSize[d]! > maxN) maxN = gridSize[d]!
  }
  // Single shared row buffer (allocated once, reused across all axes/rows)
  const rowBuf = new Float64Array(2 * maxN)

  // For each axis, FFT all 1D "rows" along that axis
  for (let axis = 0; axis < dim; axis++) {
    const N = gridSize[axis]!
    if (N <= 1) continue

    // Pre-compute twiddle factors for this axis size (cached across calls)
    const twiddles = getTwiddleFactors(N, inverse)

    // Compute stride for this axis and the number of rows
    let stride = 1
    for (let d = dim - 1; d > axis; d--) stride *= gridSize[d]!
    const numRows = totalSites / N

    // Select FFT function: use unrolled N=8 path when applicable
    const useFFT8 = N === 8

    for (let row = 0; row < numRows; row++) {
      const outerIdx = (row / stride) | 0 // Integer division (faster than Math.floor for positive)
      const innerIdx = row % stride
      const baseIdx = outerIdx * (N * stride) + innerIdx

      // Extract row into contiguous buffer
      for (let k = 0; k < N; k++) {
        const idx = baseIdx + k * stride
        rowBuf[2 * k] = re[idx]!
        rowBuf[2 * k + 1] = im[idx]!
      }

      // FFT the row
      if (useFFT8) {
        fft8InPlace(rowBuf, inverse)
      } else {
        fft1DInPlace(rowBuf, N, inverse, twiddles)
      }

      // Write back
      for (let k = 0; k < N; k++) {
        const idx = baseIdx + k * stride
        re[idx] = rowBuf[2 * k]!
        im[idx] = rowBuf[2 * k + 1]!
      }
    }
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
  let totalSites = 1
  for (let d = 0; d < dim; d++) totalSites *= gridSize[d]!

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

  // Determine k range for logarithmic binning
  // k_min = min nonzero |k|, k_max = Nyquist
  let kMinSq = Infinity
  let kMaxSq = 0
  for (let d = 0; d < dim; d++) {
    const dk = kGridScale[d]!
    kMinSq = Math.min(kMinSq, dk * dk)
    const kNyquist = Math.PI / spacing[d]!
    kMaxSq = Math.max(kMaxSq, kNyquist * kNyquist * dim)
  }
  const kMin = Math.sqrt(kMinSq)
  const kMax = Math.sqrt(kMaxSq)

  // Logarithmic bin edges
  const logKMin = Math.log(kMin)
  const logKMax = Math.log(kMax)
  const logRange = logKMax - logKMin

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
    const bin = Math.min(((logK - logKMin) * binInvLogRange) | 0, numBins - 1)
    spectrum[bin] = spectrum[bin]! + incompSq
  }

  // Scale by ½m and convert to Float32
  const halfM = 0.5 * mass
  const spectrumF32 = new Float32Array(numBins)
  for (let b = 0; b < numBins; b++) {
    spectrumF32[b] = halfM * spectrum[b]!
  }

  return {
    spectrum: spectrumF32,
    kValues,
    totalIncompressible: halfM * totalIncomp,
    totalCompressible: halfM * totalComp,
  }
}
