/** CPU reference for the Dirac Hubble Lace aperture scalar. */

/** Inputs needed to evaluate one local Dirac Hubble Lace aperture sample. */
export interface HubbleLaceSample {
  /** Normalized local density used by the visibility gate. */
  rho: number
  /** Upper representation-sector density. */
  upperDensity: number
  /** Lower representation-sector density. */
  lowerDensity: number
  /** Visible probability-current expectation vector. */
  current: readonly [number, number, number]
  /** Visible spin expectation vector. */
  spin: readonly [number, number, number]
  /** Visible radius normalized by the render bounding radius. */
  radiusNorm?: number
  /** Visible xy azimuth. */
  azimuth?: number
  /** Dominant spinor phase in radians. */
  phase?: number
  /** Fourth-coordinate slice value normalized by the render bounding radius. */
  x4Norm?: number
  /** Active lattice dimension. */
  latticeDim?: number
  /** Simulation time. */
  simTime?: number
}

function finiteOr(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(1, value))
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge0 === edge1) return x < edge0 ? 0 : 1
  const t = clamp01((x - edge0) / (edge1 - edge0))
  return t * t * (3 - 2 * t)
}

function vectorMagnitude(v: readonly [number, number, number]): number {
  const x = finiteOr(v[0], 0)
  const y = finiteOr(v[1], 0)
  const z = finiteOr(v[2], 0)
  return Math.hypot(x, y, z)
}

/** Local density gate used by the renderer branch. */
export function computeHubbleLaceDensityGate(rho: number): number {
  return smoothstep(0, 0.025, Math.max(0, finiteOr(rho, 0)))
}

/** Upper/lower sector balance: 1 when sectors are equal, 0 when one is absent. */
export function computeHubbleLacePairBalance(upperDensity: number, lowerDensity: number): number {
  const upper = Math.max(0, finiteOr(upperDensity, 0))
  const lower = Math.max(0, finiteOr(lowerDensity, 0))
  const denom = upper + lower
  if (denom <= 1e-30) return 0
  return clamp01((4 * upper * lower) / (denom * denom))
}

/** Expanding deterministic Hubble-like shell in normalized visible radius. */
export function computeHubbleLaceRadialShell(radiusNorm: number, simTime = 0): number {
  const r = Math.max(0, finiteOr(radiusNorm, 0))
  const t = finiteOr(simTime, 0)
  const carrier = 0.5 + 0.5 * Math.cos(2 * Math.PI * (3.25 * r - 0.18 * t))
  return clamp01(Math.pow(carrier, 8))
}

/** 4D bulk gate. Identity in 3D; slice-phase aperture in 4D+. */
export function computeHubbleLaceBulk4DGate(
  x4Norm: number | undefined,
  phase: number | undefined,
  simTime: number | undefined,
  latticeDim: number | undefined
): number {
  const dim = Math.max(1, Math.floor(finiteOr(latticeDim, 3)))
  if (dim <= 3) return 1
  const x4 = finiteOr(x4Norm, 0)
  const p = finiteOr(phase, 0)
  const t = finiteOr(simTime, 0)
  const carrier =
    0.5 + 0.5 * Math.cos(2 * Math.PI * (0.72 * x4 + 0.15915494309189535 * p - 0.17 * t))
  return clamp01(0.2 + 0.8 * Math.pow(carrier, 1.5))
}

/** Deterministic phase/azimuth/radius carrier that creates braided lace contrast. */
export function computeHubbleLacePhaseCarrier(
  phase: number | undefined,
  azimuth: number | undefined,
  radiusNorm: number | undefined,
  simTime: number | undefined
): number {
  const p = finiteOr(phase, 0)
  const a = finiteOr(azimuth, 0)
  const r = Math.max(0, finiteOr(radiusNorm, 0))
  const t = finiteOr(simTime, 0)
  const carrier = 0.5 + 0.5 * Math.cos(p + 5 * a + 12 * r - 0.9 * t)
  return clamp01(0.08 + 0.92 * Math.pow(carrier, 4))
}

/**
 * Compute the bounded Dirac Hubble Lace scalar:
 * density gate × sector balance × spin-current helicity × shells × 4D gate × phase carrier.
 */
export function computeHubbleLaceScalar(sample: HubbleLaceSample): number {
  const densityGate = computeHubbleLaceDensityGate(sample.rho)
  if (densityGate <= 0) return 0

  const pairBalance = computeHubbleLacePairBalance(sample.upperDensity, sample.lowerDensity)
  if (pairBalance <= 0) return 0

  const currentMag = vectorMagnitude(sample.current)
  const spinMag = vectorMagnitude(sample.spin)
  if (currentMag <= 1e-20 || spinMag <= 1e-20) return 0

  const dot =
    finiteOr(sample.current[0], 0) * finiteOr(sample.spin[0], 0) +
    finiteOr(sample.current[1], 0) * finiteOr(sample.spin[1], 0) +
    finiteOr(sample.current[2], 0) * finiteOr(sample.spin[2], 0)
  const helicity = Math.pow(clamp01(Math.abs(dot) / (currentMag * spinMag)), 0.65)
  const radialShell = computeHubbleLaceRadialShell(sample.radiusNorm ?? 0, sample.simTime)
  const bulk4DGate = computeHubbleLaceBulk4DGate(
    sample.x4Norm,
    sample.phase,
    sample.simTime,
    sample.latticeDim
  )
  const phaseLace = computeHubbleLacePhaseCarrier(
    sample.phase,
    sample.azimuth,
    sample.radiusNorm,
    sample.simTime
  )

  return clamp01(densityGate * pairBalance * helicity * radialShell * bulk4DGate * phaseLace)
}
