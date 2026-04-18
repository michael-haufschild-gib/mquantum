/**
 * WKB phase extraction from a complex Wheeler–DeWitt amplitude.
 *
 * ## Physics
 *
 * The reduced WdW wavefunction `χ(a, φ)` factorises (in the
 * semiclassical regime) as `R · exp(i S / ℏ)` with slowly-varying
 * amplitude `R` and rapidly-oscillating phase `S`. The physical
 * Hamilton-Jacobi action is
 *
 *   `S(a, φ) = ℏ · arg(χ)`
 *
 * with `ℏ = 1` in the simulator's natural units. The `a^{3/2}` Jacobi
 * factor in the substitution `χ = a^{3/2} · Ψ` is real and positive, so
 * `arg(χ) = arg(Ψ)` unconditionally — the physical phase does not
 * acquire an `a^{3/2}` rescaling.
 *
 * (A rescaled visualisation phase `S_vis = a^{3/2} · arg(χ)` is used in
 * `wheelerDeWitt/wkbStreamlines.ts` to push streamlines out of the
 * near-`a_min` bunching region; that is a rendering choice, not the
 * physical `S`. Distinguish the two carefully.)
 *
 * ## Extraction
 *
 * Naïve `atan2(Im, Re)` yields a phase confined to `(−π, π]`, while the
 * true `S` rolls through many multiples of `2π` along the clock axis.
 * We unwrap along the chosen clock axis (branch-correct via
 * `atan2(sin(Δ), cos(Δ))`) before optionally smoothing with a 1D
 * Gaussian kernel to suppress high-frequency numerical noise. The kernel
 * is truncated at `±3σ` and renormalised at the edges so the filter
 * does not bias the boundary.
 *
 * @module lib/physics/srmt/wkbPhase
 */

import type { SrmtClock } from './types'

/** Default Gaussian smoothing width in grid cells. Zero disables the filter. */
const DEFAULT_SIGMA_CELLS = 1.0

/**
 * Canonical signed angular difference in `(−π, π]`. Implemented via
 * `atan2(sin(Δ), cos(Δ))`. This is the standard numerically-stable way
 * of wrapping an arbitrary real `Δ` into a principal branch without
 * branch-choice artefacts.
 *
 * @param delta - Raw angular increment.
 * @returns Equivalent angle in `(−π, π]`.
 */
function wrapToPi(delta: number): number {
  return Math.atan2(Math.sin(delta), Math.cos(delta))
}

/**
 * Unwrap an angular sequence in place — at each step `k` we add the
 * principal-branch increment to the unwrapped accumulator so the output
 * is free of the `2π` branch jumps that `atan2` would otherwise introduce.
 *
 * @param phases - Input/output array of angles; mutated.
 */
function unwrap1D(phases: Float64Array): void {
  if (phases.length < 2) return
  let prevRaw = phases[0]!
  let acc = prevRaw
  for (let i = 1; i < phases.length; i++) {
    const raw = phases[i]!
    const delta = wrapToPi(raw - prevRaw)
    acc += delta
    prevRaw = raw
    phases[i] = acc
  }
}

/**
 * Build a 1D truncated Gaussian convolution kernel of width `σ` cells.
 *
 * @param sigma - Standard deviation in cells.
 * @returns `{ kernel, halfWidth }` with kernel length `2·halfWidth + 1`
 *          centred on index `halfWidth`.
 */
function buildGaussianKernel(sigma: number): { kernel: Float64Array; halfWidth: number } {
  if (sigma <= 0) return { kernel: new Float64Array([1]), halfWidth: 0 }
  const halfWidth = Math.max(1, Math.ceil(3 * sigma))
  const k = new Float64Array(2 * halfWidth + 1)
  const invTwoSigmaSq = 1 / (2 * sigma * sigma)
  let sum = 0
  for (let i = -halfWidth; i <= halfWidth; i++) {
    const w = Math.exp(-i * i * invTwoSigmaSq)
    k[i + halfWidth] = w
    sum += w
  }
  for (let i = 0; i < k.length; i++) k[i] = k[i]! / sum
  return { kernel: k, halfWidth }
}

/**
 * Apply a 1D Gaussian smoothing along one axis of a flat 3-tensor of
 * shape `(N0, N1, N2)` stored row-major `[i0, i1, i2]`. `axis` is the
 * dimension to smooth. Edge cells renormalise the kernel over the
 * truncated support so the filter does not darken the boundary.
 *
 * @param src - Input buffer of length `N0 · N1 · N2`.
 * @param shape - `[N0, N1, N2]`.
 * @param axis - Axis to smooth (0, 1, or 2).
 * @param sigma - Kernel width in cells.
 * @returns Fresh buffer of the same shape with the smoothing applied.
 */
function gaussianSmoothAlong(
  src: Float64Array,
  shape: [number, number, number],
  axis: 0 | 1 | 2,
  sigma: number
): Float64Array {
  if (sigma <= 0) return new Float64Array(src)
  const [N0, N1, N2] = shape
  const out = new Float64Array(src.length)
  const { kernel, halfWidth } = buildGaussianKernel(sigma)

  const strides: [number, number, number] = [N1 * N2, N2, 1]
  const axisStride = strides[axis]!
  const axisLen = [N0, N1, N2][axis]!

  const totalOrtho = (N0 * N1 * N2) / axisLen

  // Walk all (orthogonal) positions; for each, scan the axis.
  for (let flat = 0; flat < totalOrtho; flat++) {
    // Decode 2D index in the two non-axis dimensions.
    let base = 0
    {
      let rem = flat
      for (let d = 0; d < 3; d++) {
        if (d === axis) continue
        const dim = [N0, N1, N2][d]!
        const coord = rem % dim
        rem = Math.floor(rem / dim)
        base += coord * strides[d]!
      }
    }
    for (let k = 0; k < axisLen; k++) {
      let acc = 0
      let wSum = 0
      for (let dk = -halfWidth; dk <= halfWidth; dk++) {
        const kk = k + dk
        if (kk < 0 || kk >= axisLen) continue
        const w = kernel[dk + halfWidth]!
        acc += w * src[base + kk * axisStride]!
        wSum += w
      }
      out[base + k * axisStride] = wSum > 0 ? acc / wSum : 0
    }
  }
  return out
}

/**
 * Extract the physical WKB phase `S(a, φ) = ℏ · arg(χ)` with unwrapping
 * along the specified clock axis and optional 1D Gaussian smoothing.
 * Uses `ℏ = 1` in the simulator's natural units.
 *
 * The output is an unwrapped, optionally-smoothed phase field of the
 * same 3D grid as the input. `aMin` and `aMax` are accepted for API
 * parity with the pre-refactor signature but are not consulted by the
 * extraction — the WKB phase itself has no explicit `a`-axis scaling
 * (see module docstring for why an earlier `a^{3/2}` factor was
 * physically incorrect).
 *
 * @param chi - Interleaved complex amplitudes, length `2 · Na · Nphi²`.
 * @param shape - `[Na, Nphi, Nphi]`.
 * @param aMin - Lower bound of the `a` grid in physical units.
 *   Retained for signature compatibility; also used by boundary checks.
 * @param aMax - Upper bound; must exceed `aMin`.
 * @param clock - Axis along which to unwrap (`'a'`, `'phi1'`, or `'phi2'`).
 * @param sigmaCells - Gaussian smoothing width in clock-axis cells.
 *   Defaults to `1.0`. Set to `0` to disable.
 * @returns Phase field `S` as a `Float64Array` of length `Na · Nphi²`.
 */
export function extractWkbPhase(
  chi: Float32Array,
  shape: [number, number, number],
  aMin: number,
  aMax: number,
  clock: SrmtClock,
  sigmaCells: number = DEFAULT_SIGMA_CELLS
): Float64Array {
  const [Na, Nphi1, Nphi2] = shape
  if (chi.length !== 2 * Na * Nphi1 * Nphi2) {
    throw new Error(`extractWkbPhase: chi length ${chi.length} != 2·Na·Nphi²`)
  }
  if (!(Na >= 2 && Nphi1 >= 1 && Nphi2 >= 1)) {
    throw new Error('extractWkbPhase: invalid grid shape')
  }
  if (!(aMax > aMin)) {
    throw new Error('extractWkbPhase: aMax must exceed aMin')
  }

  const raw = new Float64Array(Na * Nphi1 * Nphi2)
  for (let ia = 0; ia < Na; ia++) {
    for (let i1 = 0; i1 < Nphi1; i1++) {
      for (let i2 = 0; i2 < Nphi2; i2++) {
        const src = 2 * (ia * Nphi1 * Nphi2 + i1 * Nphi2 + i2)
        const re = chi[src]!
        const im = chi[src + 1]!
        const dst = ia * Nphi1 * Nphi2 + i1 * Nphi2 + i2
        raw[dst] = Math.atan2(im, re)
      }
    }
  }

  // Axis indexing convention: axis 0 = a, axis 1 = φ₁, axis 2 = φ₂.
  let axisIdx: 0 | 1 | 2
  switch (clock) {
    case 'a':
      axisIdx = 0
      break
    case 'phi1':
      axisIdx = 1
      break
    case 'phi2':
      axisIdx = 2
      break
    default:
      throw new Error(`extractWkbPhase: unsupported clock "${String(clock)}"`)
  }
  const stride0 = Nphi1 * Nphi2
  const stride1 = Nphi2
  const stride2 = 1
  const strides = [stride0, stride1, stride2]
  const axisStride = strides[axisIdx]!
  const axisLen = [Na, Nphi1, Nphi2][axisIdx]!

  // Unwrap along the clock axis at every (orthogonal) location. Hoist the
  // strip scratch buffer outside the loop — axisLen is constant, and
  // totalOrtho can reach ~1000 for typical WdW grids.
  const totalOrtho = (Na * Nphi1 * Nphi2) / axisLen
  const strip = new Float64Array(axisLen)
  for (let flat = 0; flat < totalOrtho; flat++) {
    let base = 0
    {
      let rem = flat
      for (let d = 0; d < 3; d++) {
        if (d === axisIdx) continue
        const dim = [Na, Nphi1, Nphi2][d]!
        const coord = rem % dim
        rem = Math.floor(rem / dim)
        base += coord * strides[d]!
      }
    }
    for (let k = 0; k < axisLen; k++) strip[k] = raw[base + k * axisStride]!
    unwrap1D(strip)
    for (let k = 0; k < axisLen; k++) raw[base + k * axisStride] = strip[k]!
  }

  // Smooth along the clock axis (if sigma > 0). No additional rescaling:
  // S = ℏ · arg(χ) with ℏ = 1 is already the physical WKB phase.
  return gaussianSmoothAlong(raw, [Na, Nphi1, Nphi2], axisIdx, sigmaCells)
}
