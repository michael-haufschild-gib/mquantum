/** CPU reference for the Dirac Clifford Bloom field-view scalar. */

/** Inputs needed to evaluate one local Clifford Bloom sample. */
export interface CliffordBloomSample {
  /** Upper representation-sector density. */
  upperDensity: number
  /** Lower representation-sector density. */
  lowerDensity: number
  /** Relative upper/lower phase in radians. */
  relativePhase: number
  /** Angular coordinate in the visible xy plane. */
  phiXY?: number
  /** Angular coordinate in the visible xz plane. */
  phiXZ?: number
  /** Visible-space radius used to drift petals radially. */
  radius?: number
  /** Simulation time. */
  simTime?: number
  /** Density visibility gate, clamped to [0, 1]. */
  densityGate?: number
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
 * Compute the bounded Clifford Bloom display scalar for one Dirac spinor sample.
 */
export function computeCliffordBloomScalar(sample: CliffordBloomSample): number {
  const upper = Math.max(0, finiteOr(sample.upperDensity, 0))
  const lower = Math.max(0, finiteOr(sample.lowerDensity, 0))
  const denom = upper + lower
  if (denom <= 1e-30) return 0

  const balance = (4 * upper * lower) / (denom * denom)
  if (balance <= 0) return 0

  const relativePhase = finiteOr(sample.relativePhase, 0)
  const phiXY = finiteOr(sample.phiXY, 0)
  const phiXZ = finiteOr(sample.phiXZ, 0)
  const radius = Math.max(0, finiteOr(sample.radius, 0))
  const simTime = finiteOr(sample.simTime, 0)
  const densityGate = clamp01(finiteOr(sample.densityGate, 1))
  const gain = Math.max(0, finiteOr(sample.gain, 3))
  if (densityGate <= 0 || gain <= 0) return 0

  const carrierPhase = 4 * phiXY + 2 * phiXZ + 3 * relativePhase + 0.3 * radius - 0.8 * simTime
  const carrier = 0.5 + 0.5 * Math.cos(carrierPhase)
  const radialShellPhase = 5.5 * radius + 2.0 * relativePhase - 1.1 * simTime
  const radialShell = 0.5 + 0.5 * Math.cos(radialShellPhase)
  const angularPetal = carrier * carrier * carrier
  const shellFocus = radialShell * radialShell
  const phaseTension = 0.35 + 0.65 * Math.abs(Math.sin(relativePhase))
  const bloom = balance * phaseTension * shellFocus * (0.04 + 0.96 * angularPetal)
  return clamp01((1 - Math.exp(-gain * 2.4 * bloom)) * densityGate)
}
