/**
 * Evans-function landscape for the Hilbert–Pólya spectral mode.
 *
 * The Riemann operator R̂ = −D̂ − iμ(T̂) (μ(t) = t·tanh(t/2) − 1) has, in the
 * log-Mellin representation, the shooting determinant
 *   Ẽ_θ(z) = ∫ env_θ(u) e^{izu} du,   env_θ(u) = e^{(u+iθ)/2} ω(e^{u+iθ}),
 * with ω(t) = t·e^t/(1+e^t)² (the Fermi–Dirac-derivative weight) and the
 * contour rotated by θ < π/2 (poles of ω(e^w) sit at arg t = π/2). Zeros of
 * Ẽ_θ on the real z-axis are the Riemann ordinates γ_n; the (1−2^{1−s})
 * prefactor contributes a comb at z = 2πk/log2 − i/2. The unrotated contour
 * hides zeros beyond z ≈ 23 beneath double-precision cancellation noise (the
 * archimedean e^{−πz/2} envelope) — the "Matsubara veil" that the volume's
 * third axis sweeps away.
 *
 * Each (θ, y = Im z) line is evaluated with ONE zero-padded radix-2 FFT on a
 * u-grid commensurate with the FFT bins (trapezoid sums of analytic decaying
 * integrands are spectrally accurate). Dips of |Ẽ| are detected on the fine
 * x-grid and splatted as Gaussian filaments into a coarse volume LUT.
 *
 * @module lib/physics/hilbertPolya/evans
 */

/** Contour rotation: fixed at the production value used by the lab scripts. */
export const HP_THETA_MAX = Math.PI / 2 - 0.15

/** u-grid for the Mellin quadrature (see module docs for decay margins). */
const U_MIN = -34
const U_MAX = 7
const DU = 0.006
const NFFT = 16384

/** Lowest rendered Re z — below γ₁ but above the s=1 pole's influence. */
export const HP_Z_MIN = 5

/** Volume LUT resolution (x = Re z, y = Im z, k = θ slices). */
export const HP_VOL_NX = 160
export const HP_VOL_NY = 48
export const HP_VOL_NTHETA = 40

/** In-place complex FFT, sign +1 (e^{+2πi mn/N}); re/im of length n (pow 2). */
export function fftComplex(re: Float64Array, im: Float64Array, sign: 1 | -1): void {
  const n = re.length
  // Bit-reversal permutation.
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      const tr = re[i]!
      re[i] = re[j]!
      re[j] = tr
      const ti = im[i]!
      im[i] = im[j]!
      im[j] = ti
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (sign * 2 * Math.PI) / len
    const wRe = Math.cos(ang)
    const wIm = Math.sin(ang)
    for (let i = 0; i < n; i += len) {
      let cwRe = 1
      let cwIm = 0
      for (let j = 0; j < len / 2; j++) {
        const aRe = re[i + j]!
        const aIm = im[i + j]!
        const bRe = re[i + j + len / 2]! * cwRe - im[i + j + len / 2]! * cwIm
        const bIm = re[i + j + len / 2]! * cwIm + im[i + j + len / 2]! * cwRe
        re[i + j] = aRe + bRe
        im[i + j] = aIm + bIm
        re[i + j + len / 2] = aRe - bRe
        im[i + j + len / 2] = aIm - bIm
        const nRe = cwRe * wRe - cwIm * wIm
        cwIm = cwRe * wIm + cwIm * wRe
        cwRe = nRe
      }
    }
  }
}

/** Complex envelope env_θ(u) = e^{(u+iθ)/2} ω(e^{u+iθ}) at one grid point. */
function envelopeAt(u: number, theta: number): { re: number; im: number } {
  const eu = Math.exp(u)
  const tRe = eu * Math.cos(theta)
  const tIm = eu * Math.sin(theta)
  if (tRe > 700) return { re: 0, im: 0 } // e^{-t} underflow guard
  const expT = Math.exp(tRe)
  const etRe = expT * Math.cos(tIm)
  const etIm = expT * Math.sin(tIm)
  const dRe = 1 + etRe
  const dIm = etIm
  const d2Re = dRe * dRe - dIm * dIm
  const d2Im = 2 * dRe * dIm
  const teRe = tRe * etRe - tIm * etIm
  const teIm = tRe * etIm + tIm * etRe
  const den = d2Re * d2Re + d2Im * d2Im
  if (den === 0 || !Number.isFinite(den)) return { re: 0, im: 0 }
  const wRe = (teRe * d2Re + teIm * d2Im) / den
  const wIm = (teIm * d2Re - teRe * d2Im) / den
  const half = Math.exp(u / 2)
  const hRe = half * Math.cos(theta / 2)
  const hIm = half * Math.sin(theta / 2)
  return { re: hRe * wRe - hIm * wIm, im: hRe * wIm + hIm * wRe }
}

/** One evaluated (θ, y) line of the landscape on the fine FFT x-grid. */
export interface EvansLine {
  /** Fine-grid x spacing 2π/(NFFT·DU). */
  dx: number
  /** |Ẽ| on fine bins (index m ↔ x = m·dx). */
  absE: Float64Array
  /** arg Ẽ on fine bins. */
  argE: Float64Array
  /** Deterministic f64 noise floor: 1e-16 · Σ|env·e^{yu}|Δu. */
  noiseFloor: number
}

/**
 * Evaluate Ẽ_θ(x + iy) for all fine-grid x ∈ [0, xMax] with one FFT.
 *
 * @param theta - contour rotation angle, 0 ≤ θ ≤ HP_THETA_MAX
 * @param y - Im z of the line
 * @param xMax - largest Re z needed (bins above are discarded)
 */
export function evaluateEvansLine(theta: number, y: number, xMax: number): EvansLine {
  const re = new Float64Array(NFFT)
  const im = new Float64Array(NFFT)
  const nU = Math.floor((U_MAX - U_MIN) / DU) + 1
  let sumAbs = 0
  for (let n = 0; n < nU; n++) {
    const u = U_MIN + n * DU
    const env = envelopeAt(u, theta)
    const amp = Math.exp(-y * u)
    const w = (n === 0 || n === nU - 1 ? 0.5 : 1) * DU
    const vRe = env.re * amp * w
    const vIm = env.im * amp * w
    re[n] = vRe
    im[n] = vIm
    sumAbs += Math.hypot(vRe, vIm)
  }
  fftComplex(re, im, 1)
  const dx = (2 * Math.PI) / (NFFT * DU)
  const mMax = Math.min(NFFT - 1, Math.ceil(xMax / dx))
  const absE = new Float64Array(mMax + 1)
  const argE = new Float64Array(mMax + 1)
  for (let m = 0; m <= mMax; m++) {
    // Restore the u-offset phase e^{i m dx U_MIN}.
    const ph = m * dx * U_MIN
    const c = Math.cos(ph)
    const s = Math.sin(ph)
    const r = re[m]! * c - im[m]! * s
    const i2 = re[m]! * s + im[m]! * c
    absE[m] = Math.hypot(r, i2)
    argE[m] = Math.atan2(i2, r)
  }
  return { dx, absE, argE, noiseFloor: 1e-16 * sumAbs }
}

/** A detected spectral dip (candidate zero) on one line. */
export interface EvansDip {
  /** Refined Re z position. */
  x: number
  /** Dip depth ratio vMin/reference (smaller = deeper). */
  depthRatio: number
}

/**
 * Detect dips of |Ẽ| on a fine line within [xLo, xHi]. A dip is a local
 * minimum at least (1 − minRelDepth)·reference below the neighborhood level
 * (reference = mean of |Ẽ| at ±0.6). Positions refined by parabolic fit on
 * log|Ẽ|. Dips below the line's noise floor are reported with depthRatio
 * computed against the floor (the veil's speckle dips are real minima of the
 * computed data — honesty of the instrument).
 */
export function detectDips(
  line: EvansLine,
  xLo: number,
  xHi: number,
  maxDepthRatio = 0.6
): EvansDip[] {
  const { dx, absE } = line
  const mLo = Math.max(1, Math.ceil(xLo / dx))
  const mHi = Math.min(absE.length - 2, Math.floor(xHi / dx))
  const off = Math.max(1, Math.round(0.6 / dx))
  const out: EvansDip[] = []
  for (let m = mLo; m <= mHi; m++) {
    const v = absE[m]!
    if (v >= absE[m - 1]! || v > absE[m + 1]!) continue
    const refL = absE[Math.max(0, m - off)]!
    const refR = absE[Math.min(absE.length - 1, m + off)]!
    const ref = 0.5 * (refL + refR)
    if (ref <= 0) continue
    const depthRatio = v / ref
    if (depthRatio > maxDepthRatio) continue
    // Parabolic refinement on log|Ẽ| (zeros are simple → log is V-shaped;
    // parabola on the three points still localizes the vertex well).
    const l0 = Math.log(absE[m - 1]! + 1e-300)
    const l1 = Math.log(v + 1e-300)
    const l2 = Math.log(absE[m + 1]! + 1e-300)
    const denom = l0 - 2 * l1 + l2
    const frac = denom > 1e-12 ? Math.max(-0.5, Math.min(0.5, (0.5 * (l0 - l2)) / denom)) : 0
    out.push({ x: (m + frac) * dx, depthRatio })
  }
  return out
}

/** Parameters of the rendered landscape volume. */
export interface HilbertPolyaVolumeParams {
  /** Upper Re z bound (lower bound is HP_Z_MIN). */
  zMax: number
  /** Half-extent of the Im z axis. */
  yExtent: number
}

/** Distance-field clamp: voxels farther than this from any dip carry none. */
export const HP_DIST_CLAMP = 3

/**
 * Compute one θ-slice of the volume LUT.
 *
 * Layout per voxel (vec4f): x = strength of the nearest dip [0,1], y = veil
 * mask [0,1] (1 = below the f64 noise floor — spectrum unmeasurable there),
 * z = distance to the nearest dip in Re z units (clamped to HP_DIST_CLAMP),
 * w = arg Ẽ (phase hue carrier). The filament profile itself is applied in
 * the SHADER as exp(−½(dist/width)²) with width a plain uniform — so the
 * filament-width slider responds instantly, stays sub-voxel sharp, and never
 * triggers a worker recompute.
 *
 * @param k - θ-slice index in [0, HP_VOL_NTHETA)
 * @returns Float32Array of HP_VOL_NX·HP_VOL_NY·4 values
 */
export function computeVolumeSlice(k: number, params: HilbertPolyaVolumeParams): Float32Array {
  const { zMax, yExtent } = params
  const theta = (k / (HP_VOL_NTHETA - 1)) * HP_THETA_MAX
  const data = new Float32Array(HP_VOL_NX * HP_VOL_NY * 4)
  const xSpan = zMax - HP_Z_MIN
  for (let j = 0; j < HP_VOL_NY; j++) {
    const y = -yExtent + (j / (HP_VOL_NY - 1)) * 2 * yExtent
    const line = evaluateEvansLine(theta, y, zMax + 2)
    const dips = detectDips(line, HP_Z_MIN, zMax)
    for (let i = 0; i < HP_VOL_NX; i++) {
      const x = HP_Z_MIN + (i / (HP_VOL_NX - 1)) * xSpan
      // Nearest dip: distance + its strength (deep dips = true zeros at full
      // strength; shallow shadow minima fade out smoothly).
      let dist = HP_DIST_CLAMP
      let strength = 0
      for (const dip of dips) {
        const d = Math.abs(x - dip.x)
        if (d < dist) {
          dist = d
          strength = Math.max(0, 1 - dip.depthRatio / 0.6)
        }
      }
      const m = Math.min(line.absE.length - 1, Math.round(x / line.dx))
      const a = line.absE[m]!
      // Veil mask: smooth indicator of |Ẽ| sitting at the cancellation floor.
      const veil =
        line.noiseFloor > 0 ? Math.max(0, Math.min(1, 1.5 - 0.5 * (a / (10 * line.noiseFloor)))) : 0
      const idx = (j * HP_VOL_NX + i) * 4
      data[idx] = strength
      data[idx + 1] = veil
      data[idx + 2] = dist
      data[idx + 3] = line.argE[m]!
    }
  }
  return data
}

/** Total volume LUT byte size (all θ-slices, vec4f voxels). */
export const HP_VOLUME_BYTES = HP_VOL_NX * HP_VOL_NY * HP_VOL_NTHETA * 4 * 4
