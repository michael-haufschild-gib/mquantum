/** CPU reference for the Free Scalar Cauchy Loom field-view scalar. */

/** Inputs needed to evaluate one local Cauchy Loom sample. */
export interface CauchyLoomSample {
  /** Spatial gradient of scalar amplitude φ. */
  gradPhi: readonly number[]
  /** Spatial gradient of canonical momentum π. */
  gradPi: readonly number[]
  /** Local positive energy density used for normalization. */
  localEnergy?: number
  /** Angular coordinate in the visible xy plane. */
  phiXY?: number
  /** Angular coordinate in the visible xz plane. */
  phiXZ?: number
  /** Visible-space radius used for shell focus. */
  radius?: number
  /** Simulation time. */
  simTime?: number
  /** Visibility gate, clamped to [0, 1]. */
  energyGate?: number
  /** Exponential display gain. */
  gain?: number
}

function finiteOr(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(1, value))
}

/**
 * Compute the bounded display scalar for the local canonical two-form
 * |dφ∧dπ| over spatial Cauchy cells.
 */
export function computeCauchyLoomScalar(sample: CauchyLoomSample): number {
  const dims = Math.min(sample.gradPhi.length, sample.gradPi.length)
  if (dims < 2) return 0

  let loom2 = 0
  for (let i = 0; i + 1 < dims; i++) {
    const phiI = finiteOr(sample.gradPhi[i], 0)
    const piI = finiteOr(sample.gradPi[i], 0)
    for (let j = i + 1; j < dims; j++) {
      const area = phiI * finiteOr(sample.gradPi[j], 0) - finiteOr(sample.gradPhi[j], 0) * piI
      loom2 += area * area
    }
  }
  if (loom2 <= 0) return 0

  const rawLoom = Math.sqrt(loom2)
  const energy = Math.max(Math.abs(finiteOr(sample.localEnergy, 1)), 1e-9)
  const normalized = rawLoom / energy
  const energyGate = clamp01(finiteOr(sample.energyGate, 1))
  const gain = Math.max(0, finiteOr(sample.gain, 2.8))
  if (energyGate <= 0 || gain <= 0) return 0

  const phiXY = finiteOr(sample.phiXY, 0)
  const phiXZ = finiteOr(sample.phiXZ, 0)
  const radius = Math.max(0, finiteOr(sample.radius, 0))
  const simTime = finiteOr(sample.simTime, 0)
  const angular = 0.5 + 0.5 * Math.cos(3 * phiXY + 2 * phiXZ + 0.35 * radius - 0.7 * simTime)
  const shell = 0.5 + 0.5 * Math.cos(4.6 * radius - 0.9 * simTime)
  const cross = 0.5 + 0.5 * Math.cos(5 * phiXY - 3 * phiXZ + 0.65 * radius - 0.55 * simTime)
  const loomTone = normalized / (1 + normalized)
  const filamentMask = Math.max(
    Math.pow(angular, 6) * Math.pow(shell, 5),
    0.55 * Math.pow(cross, 10) * Math.pow(shell, 2)
  )
  const spatialGate = 1 - clamp01((radius - 2.3) / 1.5)
  return clamp01(Math.pow(loomTone, 0.78) * filamentMask * spatialGate * energyGate * gain * 0.45)
}
