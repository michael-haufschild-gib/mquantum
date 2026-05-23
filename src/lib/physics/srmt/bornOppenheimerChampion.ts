/**
 * Born-Oppenheimer time-emergence cross-diagnostic.
 *
 * ## Physics
 *
 * In Born-Oppenheimer reduction of quantum cosmology, one assumes a
 * factorisation `χ(c, rest) ≈ e^{iS(c)} · ψ(rest; c)` with `c` the
 * "slow" clock variable, `S(c)` a heavy WKB phase, and `ψ(rest; c)`
 * a slowly c-varying conditional state on the remaining
 * coordinates. When the factorisation is good — small
 * non-adiabaticity — `c` is a viable BO time.
 *
 * Quantitatively, the BO-adiabaticity of a clock candidate is
 * measured by how slowly the **conditional-state phase
 * fluctuation** drifts along `c`. After fixing the heavy-WKB
 * phase via `S(c) = arg(χ(c, rest=ref))` at a reference
 * cross-section, the residual conditional state
 *
 *   `ψ(rest; c) = e^{-iS(c)} · χ(c, rest) / ||·||`
 *
 * should be slowly c-varying for a good BO time. We measure that
 * variation as the support-weighted mean step-to-step *infidelity*
 * `1 - |⟨ψ(c_t)|ψ(c_{t+1})⟩|²`, with adjacent-pair weight
 * `sqrt(P(c_t)P(c_{t+1}))`. Zero-probability clock slices do not define
 * conditional states and do not vote.
 *
 * Smaller infidelity = more adiabatic = better BO clock.
 *
 * ## Difference from Page-Wootters
 *
 * Page-Wootters treats a useful clock as one whose supported
 * conditional states become distinguishable, so smaller autocorrelation
 * is better. Born-Oppenheimer asks the opposite adiabatic question:
 * after the heavy WKB phase gauge is fixed, does the residual light
 * state vary slowly with the proposed clock? Smaller residual
 * infidelity is better. This makes BO a distinct cross-diagnostic even
 * though both operate on conditional states.
 *
 * ## Independence from other diagnostics
 *
 * BO uses `χ` directly and a reference cross-section, with no
 * Schmidt decomposition, HJ operator, or affine fit. Compared
 * with rigid-q, WKB-rate, Page-Wootters, and cut-stability, the
 * BO score is a fifth independent diagnostic.
 *
 * @module lib/physics/srmt/bornOppenheimerChampion
 */

import type { SrmtClock } from './types'

/** Per-clock BO non-adiabaticity. Smaller = more BO-adiabatic. */
export interface BornOppenheimerRecord {
  a: number
  phi1: number
  phi2: number
}

function shapeStrides(shape: [number, number, number]): [number, number, number] {
  return [shape[1] * shape[2], shape[2], 1]
}

function axisLenAt(shape: [number, number, number], axis: 0 | 1 | 2): number {
  return shape[axis]
}

interface ConditionalSlice {
  values: Float64Array
  norm: number
}

/**
 * Extract a normalised residual conditional state at clock-axis
 * index `t` along axis `axis`, dividing out the heavy WKB phase
 * inferred from the reference cell `(rest = (0, 0, 0))`.
 *
 * Returns interleaved (re, im) values of length `2 · sliceSize`.
 */
function residualConditionalSlice(
  chi: Float32Array,
  shape: [number, number, number],
  axis: 0 | 1 | 2,
  t: number
): ConditionalSlice {
  const [N0, N1, N2] = shape
  const strides = shapeStrides(shape)
  const axisStride = strides[axis]!
  const sliceSize = (N0 * N1 * N2) / [N0, N1, N2][axis]!
  const out = new Float64Array(2 * sliceSize)

  // Reference index along the clock axis at the slice origin (the
  // first non-clock cell). For axis=0 (clock a), that's (i1=0, i2=0)
  // at i0=t. The reference phase is the χ-arg at that single cell.
  let refRe: number
  let refIm: number
  if (axis === 0) {
    const refIdx = 2 * (t * N1 * N2)
    refRe = chi[refIdx]!
    refIm = chi[refIdx + 1]!
  } else if (axis === 1) {
    const refIdx = 2 * (t * N2)
    refRe = chi[refIdx]!
    refIm = chi[refIdx + 1]!
  } else {
    const refIdx = 2 * t
    refRe = chi[refIdx]!
    refIm = chi[refIdx + 1]!
  }
  const refMag2 = refRe * refRe + refIm * refIm
  // If the reference cell is zero, BO factorisation is ill-defined
  // — fall back to unnormalised (identity) division. The output
  // will be the raw slice, which is fine for the autocorrelation
  // step downstream.
  const refMag = refMag2 > 0 ? Math.sqrt(refMag2) : 1
  const refUnitRe = refMag2 > 0 ? refRe / refMag : 1
  const refUnitIm = refMag2 > 0 ? refIm / refMag : 0

  // Walk the slice and divide out the heavy phase. For a unit
  // complex number e^{iθ_ref}, the conjugate is e^{-iθ_ref}, and
  // multiplying χ by e^{-iθ_ref} rotates the heavy phase to zero
  // at the reference cell.
  let w = 0
  if (axis === 0) {
    const base = t * N1 * N2
    for (let i1 = 0; i1 < N1; i1++) {
      for (let i2 = 0; i2 < N2; i2++) {
        const src = 2 * (base + i1 * N2 + i2)
        const cre = chi[src]!
        const cim = chi[src + 1]!
        // (cre + i·cim) * (refUnitRe - i·refUnitIm)
        out[2 * w] = cre * refUnitRe + cim * refUnitIm
        out[2 * w + 1] = cim * refUnitRe - cre * refUnitIm
        w++
      }
    }
  } else if (axis === 1) {
    for (let i0 = 0; i0 < N0; i0++) {
      for (let i2 = 0; i2 < N2; i2++) {
        const src = 2 * (i0 * N1 * N2 + t * N2 + i2)
        const cre = chi[src]!
        const cim = chi[src + 1]!
        out[2 * w] = cre * refUnitRe + cim * refUnitIm
        out[2 * w + 1] = cim * refUnitRe - cre * refUnitIm
        w++
      }
    }
  } else {
    for (let i0 = 0; i0 < N0; i0++) {
      for (let i1 = 0; i1 < N1; i1++) {
        const src = 2 * (i0 * N1 * N2 + i1 * N2 + t)
        const cre = chi[src]!
        const cim = chi[src + 1]!
        out[2 * w] = cre * refUnitRe + cim * refUnitIm
        out[2 * w + 1] = cim * refUnitRe - cre * refUnitIm
        w++
      }
    }
  }
  void axisStride

  // L²-normalise.
  let norm = 0
  for (let i = 0; i < sliceSize; i++) {
    const re = out[2 * i]!
    const im = out[2 * i + 1]!
    norm += re * re + im * im
  }
  if (norm > 0) {
    const inv = 1 / Math.sqrt(norm)
    for (let i = 0; i < 2 * sliceSize; i++) out[i] = out[i]! * inv
  }
  return { values: out, norm }
}

function overlapSquared(a: Float64Array, b: Float64Array): number {
  let re = 0
  let im = 0
  const n = a.length / 2
  for (let i = 0; i < n; i++) {
    const ar = a[2 * i]!
    const ai = a[2 * i + 1]!
    const br = b[2 * i]!
    const bi = b[2 * i + 1]!
    re += ar * br + ai * bi
    im += ar * bi - ai * br
  }
  return re * re + im * im
}

/**
 * Compute the BO non-adiabaticity score for each candidate clock.
 *
 * @param chi - Interleaved complex amplitudes, length `2·Na·Nphi²`.
 * @param shape - `[Na, Nphi, Nphi]`.
 * @returns Per-clock support-weighted step-to-step infidelity of the
 *          residual conditional state after dividing out the heavy WKB
 *          phase. Returns `NaN` for axes with no adjacent supported
 *          clock slices. Smaller = more BO-adiabatic = better BO clock.
 */
export function computeBornOppenheimerRates(
  chi: Float32Array,
  shape: [number, number, number]
): BornOppenheimerRecord {
  const meanInfidelity = (axis: 0 | 1 | 2): number => {
    const axisLen = axisLenAt(shape, axis)
    if (axisLen < 2) return Number.NaN
    let sum = 0
    let weightSum = 0
    let prev = residualConditionalSlice(chi, shape, axis, 0)
    for (let t = 1; t < axisLen; t++) {
      const next = residualConditionalSlice(chi, shape, axis, t)
      const pairWeight = Math.sqrt(prev.norm * next.norm)
      const o = overlapSquared(prev.values, next.values)
      const infid = 1 - Math.min(1, o)
      if (Number.isFinite(infid) && Number.isFinite(pairWeight) && pairWeight > 0) {
        sum += pairWeight * infid
        weightSum += pairWeight
      }
      prev = next
    }
    return weightSum > 0 ? sum / weightSum : Number.NaN
  }
  return {
    a: meanInfidelity(0),
    phi1: meanInfidelity(1),
    phi2: meanInfidelity(2),
  }
}

/**
 * Pick the BO champion clock — the clock with the SMALLEST mean
 * step-to-step infidelity (most adiabatic residual evolution).
 *
 * @param rates - Output of {@link computeBornOppenheimerRates}.
 * @param tieTolerance - Relative tolerance for a champion. Default 0.02.
 */
export function findBornOppenheimerChampion(
  rates: BornOppenheimerRecord,
  tieTolerance = 0.02
): SrmtClock | null {
  const entries: { clock: SrmtClock; rate: number }[] = [
    { clock: 'a', rate: rates.a },
    { clock: 'phi1', rate: rates.phi1 },
    { clock: 'phi2', rate: rates.phi2 },
  ]
  if (!entries.every((e) => Number.isFinite(e.rate))) return null
  // Sort ascending (smallest = most adiabatic = best).
  entries.sort((x, y) => x.rate - y.rate)
  const [best, second] = entries
  if (!best || !second) return null
  const scale = Math.max(second.rate, Number.EPSILON)
  if ((second.rate - best.rate) / scale < tieTolerance) return null
  return best.clock
}
