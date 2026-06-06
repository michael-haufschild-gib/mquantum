/**
 * CPU mirror for the Pauli Zeeman Anamorph scalar.
 *
 * The rendered observable is
 *
 *   |S x Bhat| * (1 - exp(-ell * |grad relativePhase|)) * densityNorm
 *
 * where relativePhase = arg(conj(psiUp) * psiDown). Phase differences use the
 * shortest signed arc so branch-cut jumps do not appear as false shear.
 *
 * @module lib/physics/pauli/zeemanAnamorph
 */

const ZERO_FIELD_EPSILON = 1e-20

interface ComplexSample {
  re: number
  im: number
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

/**
 * Wrap a raw phase difference to the principal signed arc.
 *
 * @param delta Raw phase difference in radians.
 * @returns Wrapped difference computed as atan2(sin(delta), cos(delta)).
 */
export function wrapPhaseDelta(delta: number): number {
  return Math.atan2(Math.sin(delta), Math.cos(delta))
}

/**
 * Compute arg(conj(up) * down) for a two-component Pauli spinor sample.
 *
 * @param up Spin-up complex amplitude.
 * @param down Spin-down complex amplitude.
 * @returns Relative phase in radians.
 */
export function relativePhaseFromSpinor(up: ComplexSample, down: ComplexSample): number {
  const re = up.re * down.re + up.im * down.im
  const im = up.re * down.im - up.im * down.re
  return Math.atan2(im, re)
}

/**
 * Compute the Euclidean magnitude of the central-difference relative-phase gradient.
 *
 * @param samples Per-axis phase samples `{ plus, minus, spacing }`.
 * @returns Magnitude of wrapped central phase gradient.
 */
export function relativePhaseGradientMagnitude(
  samples: { plus: number; minus: number; spacing: number }[]
): number {
  let sumSquares = 0
  for (const { plus, minus, spacing } of samples) {
    if (!Number.isFinite(spacing) || spacing <= 0) {
      throw new RangeError(
        `relativePhaseGradientMagnitude: spacing must be positive and finite, got ${spacing}`
      )
    }
    const derivative = wrapPhaseDelta(plus - minus) / (2 * spacing)
    sumSquares += derivative * derivative
  }
  return Math.sqrt(sumSquares)
}

/**
 * Compute the Pauli Zeeman Anamorph display scalar.
 *
 * @param args Spin, magnetic field, phase shear scale, and normalized density.
 * @returns Bounded-by-density scalar for normalized spin inputs.
 */
export function computeZeemanAnamorphScalar(args: {
  spin: readonly [number, number, number]
  field: readonly [number, number, number]
  phaseGradientMagnitude: number
  minSpacing: number
  densityNorm: number
}): number {
  const densityNorm = clamp01(args.densityNorm)
  if (densityNorm <= 0) return 0

  const [bx, by, bz] = args.field
  const fieldNorm = Math.hypot(bx, by, bz)
  if (!Number.isFinite(fieldNorm) || fieldNorm <= ZERO_FIELD_EPSILON) return 0

  const invFieldNorm = 1 / fieldNorm
  const bhatX = bx * invFieldNorm
  const bhatY = by * invFieldNorm
  const bhatZ = bz * invFieldNorm

  const [sx, sy, sz] = args.spin
  const crossX = sy * bhatZ - sz * bhatY
  const crossY = sz * bhatX - sx * bhatZ
  const crossZ = sx * bhatY - sy * bhatX
  const transverseSpin = Math.hypot(crossX, crossY, crossZ)
  if (!Number.isFinite(transverseSpin) || transverseSpin <= 0) return 0

  const ell = Number.isFinite(args.minSpacing) ? Math.max(0, args.minSpacing) : 0
  const phaseShear = Number.isFinite(args.phaseGradientMagnitude)
    ? Math.abs(args.phaseGradientMagnitude)
    : 0
  const shearNorm = 1 - Math.exp(-ell * phaseShear)

  return transverseSpin * shearNorm * densityNorm
}
