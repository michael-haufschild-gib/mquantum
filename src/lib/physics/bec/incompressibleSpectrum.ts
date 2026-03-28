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

/**
 * In-place radix-2 Cooley-Tukey FFT on interleaved [re, im] Float64Array.
 *
 * @param data - Interleaved [re0, im0, re1, im1, ...] of length 2*N
 * @param N - Transform length (must be power of 2)
 * @param inverse - If true, compute inverse FFT (with 1/N normalization)
 */
function fft1DInPlace(data: Float64Array, N: number, inverse: boolean): void {
  // Bit-reversal permutation
  let j = 0
  for (let i = 0; i < N; i++) {
    if (i < j) {
      const tRe = data[2 * i]!
      const tIm = data[2 * i + 1]!
      data[2 * i] = data[2 * j]!
      data[2 * i + 1] = data[2 * j + 1]!
      data[2 * j] = tRe
      data[2 * j + 1] = tIm
    }
    let m = N >> 1
    while (m >= 1 && j >= m) {
      j -= m
      m >>= 1
    }
    j += m
  }

  // Butterfly stages
  const sign = inverse ? 1.0 : -1.0
  for (let len = 2; len <= N; len <<= 1) {
    const halfLen = len >> 1
    const angle = (sign * 2 * Math.PI) / len
    const wRe = Math.cos(angle)
    const wIm = Math.sin(angle)
    for (let i = 0; i < N; i += len) {
      let curRe = 1.0
      let curIm = 0.0
      for (let k = 0; k < halfLen; k++) {
        const evenIdx = 2 * (i + k)
        const oddIdx = 2 * (i + k + halfLen)
        const tRe = curRe * data[oddIdx]! - curIm * data[oddIdx + 1]!
        const tIm = curRe * data[oddIdx + 1]! + curIm * data[oddIdx]!
        data[oddIdx] = data[evenIdx]! - tRe
        data[oddIdx + 1] = data[evenIdx + 1]! - tIm
        data[evenIdx] = data[evenIdx]! + tRe
        data[evenIdx + 1] = data[evenIdx + 1]! + tIm
        const nextRe = curRe * wRe - curIm * wIm
        curIm = curRe * wIm + curIm * wRe
        curRe = nextRe
      }
    }
  }

  // Inverse normalization
  if (inverse) {
    const invN = 1.0 / N
    for (let i = 0; i < 2 * N; i++) {
      data[i] = data[i]! * invN
    }
  }
}

/**
 * N-D separable FFT: applies 1D FFT along each axis.
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

  // For each axis, FFT all 1D "rows" along that axis
  for (let axis = 0; axis < dim; axis++) {
    const N = gridSize[axis]!
    if (N <= 1) continue

    // Compute stride for this axis and the number of rows
    let stride = 1
    for (let d = dim - 1; d > axis; d--) stride *= gridSize[d]!
    const numRows = totalSites / N

    const rowBuf = new Float64Array(2 * N)

    for (let row = 0; row < numRows; row++) {
      // Compute the base index for this row: decompose row index into
      // coordinates for all axes except 'axis', then compute linear offset.
      // Equivalently: the row index encodes the outer and inner loop indices.
      const outerIdx = Math.floor(row / stride)
      const innerIdx = row % stride
      const baseIdx = outerIdx * (N * stride) + innerIdx

      // Extract row into contiguous buffer
      for (let k = 0; k < N; k++) {
        const idx = baseIdx + k * stride
        rowBuf[2 * k] = re[idx]!
        rowBuf[2 * k + 1] = im[idx]!
      }

      // FFT the row
      fft1DInPlace(rowBuf, N, inverse)

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

  for (let idx = 0; idx < totalSites; idx++) {
    const re0 = psiRe[idx]!
    const im0 = psiIm[idx]!
    const amp = Math.sqrt(re0 * re0 + im0 * im0)
    const invAmp = amp > 1e-12 ? 1.0 / amp : 0.0

    // Decompose linear index to N-D coordinates
    let remaining = idx
    const coords = new Int32Array(dim)
    for (let d = dim - 1; d >= 0; d--) {
      coords[d] = remaining % gridSize[d]!
      remaining = Math.floor(remaining / gridSize[d]!)
    }

    for (let d = 0; d < dim; d++) {
      const N = gridSize[d]!
      if (N <= 1) continue
      const s = strides[d]!
      const c = coords[d]!
      const invDx = 0.5 / spacing[d]!

      // Central finite differences with periodic boundaries
      let dRe: number
      let dIm: number
      if (c === 0) {
        const fwd = idx + s
        const bwd = idx + s * (N - 1)
        dRe = (psiRe[fwd]! - psiRe[bwd]!) * invDx
        dIm = (psiIm[fwd]! - psiIm[bwd]!) * invDx
      } else if (c === N - 1) {
        const fwd = idx - s * (N - 1)
        const bwd = idx - s
        dRe = (psiRe[fwd]! - psiRe[bwd]!) * invDx
        dIm = (psiIm[fwd]! - psiIm[bwd]!) * invDx
      } else {
        dRe = (psiRe[idx + s]! - psiRe[idx - s]!) * invDx
        dIm = (psiIm[idx + s]! - psiIm[idx - s]!) * invDx
      }

      // j_d = (ℏ/m) × Im(ψ* ∂_d ψ) = (ℏ/m)(ψ_re ∂_d ψ_im − ψ_im ∂_d ψ_re)
      const jd = hbarOverM * (re0 * dIm - im0 * dRe)
      // u_d = j_d / |ψ| = √ρ × v_d (density-weighted velocity)
      uRe[d]![idx] = jd * invAmp
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

  // Process each k-point
  const coords = new Int32Array(dim)
  for (let idx = 0; idx < totalSites; idx++) {
    // Decompose to N-D k-space coordinates
    let remaining = idx
    for (let d = dim - 1; d >= 0; d--) {
      coords[d] = remaining % gridSize[d]!
      remaining = Math.floor(remaining / gridSize[d]!)
    }

    // Compute k-vector components (centered: indices > N/2 are negative frequencies)
    let kSq = 0
    const kVec = new Float64Array(dim)
    for (let d = 0; d < dim; d++) {
      const N = gridSize[d]!
      const halfN = N >> 1
      const kIdx = coords[d]! < halfN ? coords[d]! : coords[d]! - N
      kVec[d] = kGridScale[d]! * kIdx
      kSq += kVec[d]! * kVec[d]!
    }

    // Skip DC component (k=0 is purely compressible)
    if (kSq < 1e-20) continue

    const kMag = Math.sqrt(kSq)

    // Read FFT'd velocity components at this k-point
    // Compute k·û = Σ_d k_d û_d(k)
    let dotRe = 0
    let dotIm = 0
    for (let d = 0; d < dim; d++) {
      dotRe += kVec[d]! * uRe[d]![idx]!
      dotIm += kVec[d]! * uIm[d]![idx]!
    }

    // Helmholtz projection: û_incomp_d = û_d − k_d(k·û)/|k|²
    // Also compute |û_comp|² for total compressible energy
    const invKSq = 1.0 / kSq
    let incompSq = 0
    let compSq = 0
    for (let d = 0; d < dim; d++) {
      const compRe = kVec[d]! * dotRe * invKSq
      const compIm = kVec[d]! * dotIm * invKSq
      const incompRe = uRe[d]![idx]! - compRe
      const incompIm = uIm[d]![idx]! - compIm
      incompSq += incompRe * incompRe + incompIm * incompIm
      compSq += compRe * compRe + compIm * compIm
    }

    totalIncomp += incompSq
    totalComp += compSq

    // Logarithmic bin assignment
    const logK = Math.log(kMag)
    const fBin = ((logK - logKMin) / logRange) * numBins
    const bin = Math.min(Math.max(Math.floor(fBin), 0), numBins - 1)
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
