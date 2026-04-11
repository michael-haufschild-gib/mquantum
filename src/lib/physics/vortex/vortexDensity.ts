/**
 * Quantum Vortex Density
 *
 * CPU mirror of the WGSL per-voxel topological-charge computation used by the
 * Schroedinger volume renderer's colour algorithm 28 (vortexDensity).
 *
 * A vortex is a topological defect of a complex wavefunction psi(x) = R·exp(i·theta)
 * where the phase winds by an integer multiple of 2*pi around a closed loop in the
 * complex plane. The winding number is
 *
 *     n = (1 / (2*pi)) * ∮ ∇theta · dl
 *
 * On a discrete grid the line integral of ∇theta around a unit plaquette becomes
 * a sum of four wrapped phase differences
 *
 *     W = wrap(theta_10 - theta_00) + wrap(theta_11 - theta_10)
 *       + wrap(theta_01 - theta_11) + wrap(theta_00 - theta_01)
 *
 * where `wrap(dtheta) = dtheta - 2*pi * round(dtheta / (2*pi))`. For a smooth
 * phase field every W is ≈ 0. At a vortex core the loop integral quantizes to a
 * multiple of 2*pi and |W|/(2*pi) returns the magnitude of the topological
 * charge carried by that plaquette.
 *
 * The CPU routine exists to unit-test the topological invariants on synthetic
 * phase fields (plane waves, isolated vortices, vortex-antivortex pairs) and to
 * mirror the shader's plaquette algorithm exactly. Use the 2D helper because
 * the topological content of the vortex field is captured plane by plane.
 *
 * @module lib/physics/vortex/vortexDensity
 */

/** 2*pi — base period of the phase wrap. */
export const TAU = 2 * Math.PI

/**
 * Wrap a raw phase difference into the principal branch (-pi, pi] using the
 * classic shortest-arc formula. This is identical to the WGSL helper of the
 * same name.
 *
 * Note: at exact odd multiples of pi (dtheta = ±3*pi, ±5*pi, ...) the result is
 * bit-exact but sign-dependent on the platform `round()` convention. Tests
 * that probe those exact values must check |wrapPhase(x)| ≈ pi rather than the
 * signed result, because JS `Math.round` (half-away-from-zero) and WGSL
 * `round` (half-to-even) disagree.
 *
 * @param dTheta Raw phase difference in radians.
 * @returns Wrapped difference in (-pi, pi] (or [-pi, pi) at exact boundaries).
 */
export function wrapPhase(dTheta: number): number {
  return dTheta - TAU * Math.round(dTheta / TAU)
}

/**
 * Compute the topological vortex-charge density over a 2D phase field using
 * the plaquette winding stencil.
 *
 * For each interior plaquette indexed by its bottom-left corner
 * `(i, j) ∈ [0, W-2) × [0, H-2)`, compute the absolute value of the four
 * wrapped edge differences summed around a unit-cell loop and store it at
 * `out[i + (W-1)*j]`.
 *
 * The output has length `(W-1)*(H-1)`. Grids smaller than 2 in either
 * dimension return an empty array (no interior plaquettes).
 *
 * @param phaseField Row-major 2D phase field of length `width * height`.
 * @param width Grid width in samples (≥ 2 to produce output).
 * @param height Grid height in samples (≥ 2 to produce output).
 * @returns `|W|` per plaquette, row-major with stride `(width - 1)`.
 */
export function computeVortexDensityCpu2D(
  phaseField: Float32Array,
  width: number,
  height: number
): Float32Array {
  if (width < 2 || height < 2) {
    return new Float32Array(0)
  }
  if (phaseField.length !== width * height) {
    throw new Error(
      `computeVortexDensityCpu2D: phaseField length ${phaseField.length} !== ${width * height}`
    )
  }
  const plaqW = width - 1
  const plaqH = height - 1
  const out = new Float32Array(plaqW * plaqH)
  for (let j = 0; j < plaqH; j++) {
    for (let i = 0; i < plaqW; i++) {
      const p00 = phaseField[i + width * j]!
      const p10 = phaseField[i + 1 + width * j]!
      const p11 = phaseField[i + 1 + width * (j + 1)]!
      const p01 = phaseField[i + width * (j + 1)]!
      const d0 = wrapPhase(p10 - p00)
      const d1 = wrapPhase(p11 - p10)
      const d2 = wrapPhase(p01 - p11)
      const d3 = wrapPhase(p00 - p01)
      const w = d0 + d1 + d2 + d3
      out[i + plaqW * j] = Math.abs(w)
    }
  }
  return out
}

/**
 * Sum the per-plaquette winding magnitudes and normalize by 2*pi to return the
 * total topological charge enclosed in the sampled region.
 *
 * For an isolated vortex of charge n this returns |n|. For multiple defects of
 * any sign this returns the sum of their magnitudes (abs-first semantics).
 *
 * @param vortexField `|W|` per plaquette as returned by `computeVortexDensityCpu2D`.
 * @returns Sum of `|W| / (2*pi)` across all plaquettes.
 */
export function totalVortexCharge(vortexField: Float32Array): number {
  let sum = 0
  for (let k = 0; k < vortexField.length; k++) {
    sum += vortexField[k]!
  }
  return sum / TAU
}
