/** Parameters controlling observer causal-diamond modular orbital warping. */
export interface HydrogenCausalDiamondParams {
  horizonRadius: number
  compressionK: number
  shellGain: number
  shellCenter: number
  shellWidth: number
  holonomyStrength: number
  holonomyMix: number
}

/** Full analytical result for a causal-diamond coordinate warp sample. */
export interface HydrogenCausalDiamondWarpResult {
  coords: number[]
  compactifiedRadius: number
  modularTime: number
  densityGain: number
}

const DEFAULT_EPS = 1e-4

/** Clamp compactified radius to the finite open causal-diamond interval. */
export function clampCompactifiedRadius(u: number, eps = DEFAULT_EPS): number {
  if (!Number.isFinite(u)) return 0
  return Math.max(0, Math.min(u, 1 - eps))
}

/** Convert compactified radius to modular clock time via atanh(u). */
export function modularClock(u: number, eps = DEFAULT_EPS): number {
  const clamped = clampCompactifiedRadius(u, eps)
  return 0.5 * Math.log((1 + clamped) / (1 - clamped))
}

/** Numerically stable sech^2(tau), clamped to the physical visibility interval. */
export function sechSquaredFromTau(tau: number): number {
  if (!Number.isFinite(tau)) return 0
  const q = Math.exp(-Math.min(8, Math.abs(tau)))
  const denom = 1 + q * q
  return Math.max(0, Math.min(1, (4 * q * q) / (denom * denom)))
}

/** Compute causal-diamond visibility gain from compactified radius and shell controls. */
export function causalDiamondHorizonGain(u: number, params: HydrogenCausalDiamondParams): number {
  const clamped = clampCompactifiedRadius(u)
  const tau = modularClock(clamped)
  const sech2 = sechSquaredFromTau(tau)
  const width = Math.max(params.shellWidth, 1e-4)
  const shellCoordinate = (clamped - params.shellCenter) / width
  const shell = Math.exp(-(shellCoordinate * shellCoordinate))
  const coreGain = 0.18 * sech2
  const modularShellGain = sech2 * Math.max(params.shellGain, 0) * shell
  return Math.max(0, Math.min(8, coreGain + modularShellGain))
}

/** Warp coordinates by modular compression and optional 4D holonomy. */
export function warpCausalDiamondSample(
  coords: readonly number[],
  params: HydrogenCausalDiamondParams
): HydrogenCausalDiamondWarpResult {
  const horizonRadius = Math.max(params.horizonRadius, 1e-6)
  const radius = Math.hypot(...coords)
  const u = clampCompactifiedRadius(radius / horizonRadius)
  const tau = modularClock(u)
  const compression = Math.exp(-Math.max(params.compressionK, 0) * tau)
  const warped = coords.map((coord) => coord * compression)

  if (warped.length >= 4) {
    const angle =
      tau * Math.max(params.holonomyStrength, 0) * Math.max(0, Math.min(1, params.holonomyMix))
    const c = Math.cos(angle)
    const s = Math.sin(angle)
    const x0 = warped[0] ?? 0
    const x1 = warped[1] ?? 0
    const x2 = warped[2] ?? 0
    const x3 = warped[3] ?? 0
    warped[0] = c * x0 - s * x3
    warped[3] = s * x0 + c * x3
    warped[1] = c * x1 + s * x2
    warped[2] = -s * x1 + c * x2
  }

  return {
    coords: warped,
    compactifiedRadius: u,
    modularTime: tau,
    densityGain: causalDiamondHorizonGain(u, params),
  }
}

/** Return only warped coordinates for tests and preset math checks. */
export function warpCausalDiamondCoordinate(
  coords: readonly number[],
  params: HydrogenCausalDiamondParams
): number[] {
  return warpCausalDiamondSample(coords, params).coords
}
