const CHORDAL_SIEVE_EPSILON = 1e-6
const TWO_PI_OVER_THREE = (2 * Math.PI) / 3

export type ChordalSievePoint = {
  x: number
  y: number
  z: number
}

/**
 * Builds a normalized AdS boundary anchor from angular quantum number m.
 *
 * @param m Angular quantum number phase.
 * @param offset Optional angular offset from m.
 * @param zBias Optional embedding-space z bias before normalization.
 * @returns Unit-length boundary anchor.
 */
export function boundaryAnchorForAds(
  m: number,
  offset: number = 0,
  zBias: number = 0.35
): ChordalSievePoint {
  const theta = finiteOr(m, 0) + finiteOr(offset, 0)
  const point = {
    x: Math.cos(theta),
    y: Math.sin(theta),
    z: finiteOr(zBias, 0),
  }

  return normalizePoint(point)
}

/**
 * Evaluates the Poincare-ball Busemann clock for a bulk point and boundary anchor.
 *
 * @param point Bulk point in the unit ball.
 * @param anchor Normalized boundary anchor.
 * @returns Logarithmic horosphere clock value, or zero outside the valid domain.
 */
export function busemannClock(point: ChordalSievePoint, anchor: ChordalSievePoint): number {
  if (!isFinitePoint(point) || !isFinitePoint(anchor)) return 0

  const radiusSquared = squaredNorm(point)
  if (radiusSquared >= 1) return 0

  const dx = point.x - anchor.x
  const dy = point.y - anchor.y
  const dz = point.z - anchor.z
  const distanceSquared = dx * dx + dy * dy + dz * dz
  const numerator = Math.max(1 - radiusSquared, Number.MIN_VALUE)
  const denominator = distanceSquared + CHORDAL_SIEVE_EPSILON
  const clock = Math.log(numerator / denominator)

  return Number.isFinite(clock) ? clock : 0
}

/**
 * Computes the Round 8 AdS Chordal Sieve scalar used by the renderer.
 *
 * @param args Bulk point, density, and quantum controls.
 * @returns Bounded scalar density in [0, 1].
 */
export function computeAdsChordalSieveScalar(args: {
  point: ChordalSievePoint
  densityNorm: number
  n: number
  l: number
  m: number
  frequency: number
  twist: number
}): number {
  const { point } = args
  if (!isFinitePoint(point)) return 0

  const radiusSquared = squaredNorm(point)
  if (radiusSquared >= 1) return 0

  const rhoNorm = clamp01(finiteOr(args.densityNorm, 0))
  if (rhoNorm <= 0) return 0

  const m = finiteOr(args.m, 0)
  const anchorA = boundaryAnchorForAds(m)
  const anchorB = boundaryAnchorForAds(m, TWO_PI_OVER_THREE, -0.25)
  const clockA = busemannClock(point, anchorA)
  const clockB = busemannClock(point, anchorB)
  const clockDiff = clockA - clockB
  const clockSum = clockA + clockB

  const radius = Math.sqrt(radiusSquared)
  const phi = Math.atan2(point.y, point.x)
  const rho = 2 * Math.atan(radius)
  const k = Math.max(finiteOr(args.frequency, 0), 0)
  const twist = finiteOr(args.twist, 0)
  const l = finiteOr(args.l, 0)
  const n = finiteOr(args.n, 0)
  const phase = k * clockDiff + twist * clockSum + l * phi + n * rho

  const oscillation = Math.abs(Math.sin(phase))
  const lattice = (0.35 + 0.65 * oscillation) ** 2
  const separation = 1 - Math.exp(-Math.abs(clockDiff))
  const scalar = rhoNorm * lattice * separation

  return clamp01(Number.isFinite(scalar) ? scalar : 0)
}

function normalizePoint(point: ChordalSievePoint): ChordalSievePoint {
  const length = Math.hypot(point.x, point.y, point.z)
  if (!Number.isFinite(length) || length <= 0) {
    return { x: 1, y: 0, z: 0 }
  }

  return {
    x: point.x / length,
    y: point.y / length,
    z: point.z / length,
  }
}

function squaredNorm(point: ChordalSievePoint): number {
  return point.x * point.x + point.y * point.y + point.z * point.z
}

function isFinitePoint(point: ChordalSievePoint): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z)
}

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback
}

function clamp01(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0
  if (value >= 1) return 1
  return value
}
