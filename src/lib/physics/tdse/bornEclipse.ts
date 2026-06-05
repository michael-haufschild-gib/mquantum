/**
 * CPU reference for the TDSE Born Eclipse field view.
 *
 * The shader mirror lights wavefront regions where probability current exits
 * into the local density shadow: j points opposite grad(rho), both flow and
 * density slope are strong, and phase bands lock the result into coherent
 * ribbons instead of a flat mask.
 *
 * @module lib/physics/tdse/bornEclipse
 */

/** Local TDSE hydrodynamic data needed to evaluate the Born Eclipse scalar. */
export interface BornEclipseInput {
  current: readonly number[]
  densityGradient: readonly number[]
  density: number
  maxDensity: number
  averageSpacing: number
  phase?: number
  orientation?: number
  simTime?: number
  densityGate?: number
}

const EPS = 1e-20

function finiteOr(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(1, value))
}

function magnitudeSq(values: readonly number[]): number {
  let sum = 0
  for (const value of values) {
    if (!Number.isFinite(value)) continue
    sum += value * value
  }
  return sum
}

function dotFinite(a: readonly number[], b: readonly number[]): number {
  const n = Math.min(a.length, b.length)
  let sum = 0
  for (let i = 0; i < n; i++) {
    const av = a[i]!
    const bv = b[i]!
    if (!Number.isFinite(av) || !Number.isFinite(bv)) continue
    sum += av * bv
  }
  return sum
}

/**
 * Compute Born Eclipse display scalar in [0, 1].
 *
 * @param input - Local hydrodynamic data mirrored by the TDSE write-grid shader.
 * @returns Bounded display scalar; zero for malformed, empty, or non-opposing flow.
 */
export function computeBornEclipseScalar(input: BornEclipseInput): number {
  const density = finiteOr(input.density, 0)
  const maxDensity = Math.max(finiteOr(input.maxDensity, 0), EPS)
  if (density <= EPS) return 0

  const currentMagSq = magnitudeSq(input.current)
  const gradientMagSq = magnitudeSq(input.densityGradient)
  if (currentMagSq <= EPS || gradientMagSq <= EPS) return 0

  const currentMag = Math.sqrt(currentMagSq)
  const gradientMag = Math.sqrt(gradientMagSq)
  const opposition = clamp01(
    -dotFinite(input.current, input.densityGradient) / (currentMag * gradientMag + EPS)
  )
  if (opposition <= 0) return 0

  const averageSpacing = Math.max(finiteOr(input.averageSpacing, 1), EPS)
  const flowGate = 1 - Math.exp(-currentMag / maxDensity)
  const gradientGate = 1 - Math.exp((-8 * averageSpacing * gradientMag) / maxDensity)
  const phase = finiteOr(input.phase, 0)
  const orientation = finiteOr(input.orientation, 0)
  const simTime = finiteOr(input.simTime, 0)
  const phaseBand = 0.55 + 0.45 * Math.cos(phase + 2 * orientation - 0.7 * simTime)
  const densityGate = clamp01(input.densityGate ?? Math.min(1, density / (0.02 * maxDensity)))

  return clamp01(opposition * flowGate * gradientGate * (0.65 + 0.35 * phaseBand) * densityGate)
}
