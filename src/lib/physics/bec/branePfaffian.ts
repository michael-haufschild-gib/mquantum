/**
 * CPU reference for the BEC Pfaffian brane-intersection display scalar.
 *
 * The renderer reads local plaquette phase winding as an antisymmetric 2-form
 * W_ij. In 4D+ the Pfaffian component over i<j<k<l is
 * W_ij W_kl - W_ik W_jl + W_il W_jk. A single winding plane has zero scalar;
 * two complementary winding planes light the intersection.
 */

/** Display-normalization controls for the Pfaffian brane scalar. */
export interface BranePfaffianOptions {
  /** Density/visibility gate from the renderer, clamped to [0, 1]. */
  densityGate?: number
  /** Exponential display gain. Default matches WGSL. */
  gain?: number
  /** Logical lattice dimension. Defaults to winding.length. */
  latticeDim?: number
}

function finiteOr(value: number | undefined, fallback: number): number {
  return value === undefined || !Number.isFinite(value) ? fallback : value
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(1, value))
}

function windingAt(winding: readonly (readonly number[])[], i: number, j: number): number {
  if (i === j) return 0
  const direct = winding[i]?.[j]
  if (typeof direct === 'number' && Number.isFinite(direct)) return direct
  const reverse = winding[j]?.[i]
  return typeof reverse === 'number' && Number.isFinite(reverse) ? -reverse : 0
}

/**
 * Compute the renderer's bounded Pfaffian brane scalar from phase-winding 2-form samples.
 */
export function computeBranePfaffianScalar(
  winding: readonly (readonly number[])[],
  options: BranePfaffianOptions = {}
): number {
  const dimRaw = finiteOr(options.latticeDim, winding.length)
  const dim = Math.max(0, Math.min(12, Math.floor(dimRaw)))
  if (dim < 4) return 0

  const gain = Math.max(0, finiteOr(options.gain, 6))
  const densityGate = clamp01(finiteOr(options.densityGate, 1))
  if (gain <= 0 || densityGate <= 0) return 0

  let pfaffianAbs = 0
  for (let i = 0; i + 3 < dim; i++) {
    for (let j = i + 1; j + 2 < dim; j++) {
      for (let k = j + 1; k + 1 < dim; k++) {
        for (let l = k + 1; l < dim; l++) {
          const p =
            windingAt(winding, i, j) * windingAt(winding, k, l) -
            windingAt(winding, i, k) * windingAt(winding, j, l) +
            windingAt(winding, i, l) * windingAt(winding, j, k)
          pfaffianAbs += Math.abs(p)
        }
      }
    }
  }

  return clamp01((1 - Math.exp(-gain * pfaffianAbs)) * densityGate)
}
