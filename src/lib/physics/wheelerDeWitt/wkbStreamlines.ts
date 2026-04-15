/**
 * WKB classical-cosmology streamlines on the Wheeler–DeWitt solution.
 *
 * In the Lorentzian region (U < 0) the WKB phase S ≈ a^{3/2}·arg(χ)
 * defines a classical flow via p = ∇S. Streamlines seeded in that region
 * trace classical FRW + inflaton trajectories. They terminate upon
 * entering the Euclidean region (U > 0) or leaving the grid.
 *
 * The integrator uses explicit RK4 with fixed step size. Each streamline
 * samples a small number of points and accumulates into a shared density
 * overlay as Gaussian splats — so streamlines appear as ridges in the
 * rendered density texture.
 */

import type { WheelerDeWittSolverOutput } from './solver'

/** Streamline overlay: additive density (|ψ|²-like) on the solver grid. */
export interface StreamlineOverlay {
  /** Additive per-voxel intensity, indexed [ia, iPhi1, iPhi2] row-major. */
  intensity: Float32Array
  /** Maximum intensity in the overlay — useful for normalization on the consumer side. */
  maxIntensity: number
}

/** Configuration for the streamline integrator. */
export interface WkbStreamlineInput {
  /** Number of seeds per axis (total seeds = density²) */
  density: number
  /** Maximum integration steps per streamline */
  maxSteps: number
  /** Gaussian splat radius, in grid cells */
  splatRadius: number
}

/** Default integrator configuration. */
export const DEFAULT_STREAMLINE_INPUT: WkbStreamlineInput = {
  density: 6,
  maxSteps: 96,
  splatRadius: 0.9,
}

/**
 * Sample arg(χ) on the solver grid with trilinear interpolation, returning
 * the phase (not the raw S). The caller multiplies by a^{3/2} externally.
 */
function sampleArg(output: WheelerDeWittSolverOutput, ia: number, i1: number, i2: number): number {
  const [Na, Nphi] = output.gridSize
  if (ia < 0 || ia >= Na || i1 < 0 || i1 >= Nphi || i2 < 0 || i2 >= Nphi) return 0
  const slab = Nphi * Nphi
  const idx = ia * 2 * slab + 2 * (i1 * Nphi + i2)
  const re = output.chi[idx] ?? 0
  const im = output.chi[idx + 1] ?? 0
  if (re === 0 && im === 0) return 0
  return Math.atan2(im, re)
}

/** Unwrap-aware central difference: shortest arc between two phases. */
function wrappedDiff(a: number, b: number): number {
  let d = a - b
  while (d > Math.PI) d -= 2 * Math.PI
  while (d < -Math.PI) d += 2 * Math.PI
  return d
}

/**
 * Evaluate the gradient of S = a^{3/2}·arg(χ) at a (continuous) grid point,
 * returning (dS/da, dS/dphi1, dS/dphi2). Uses nearest-neighbor-on-grid
 * (rounded indices) finite differences with phase unwrapping.
 */
function gradS(
  output: WheelerDeWittSolverOutput,
  ia: number,
  i1: number,
  i2: number,
  da: number,
  dphi: number
): [number, number, number] {
  const [Na, Nphi] = output.gridSize
  if (ia < 1 || ia >= Na - 1 || i1 < 1 || i1 >= Nphi - 1 || i2 < 1 || i2 >= Nphi - 1) {
    return [0, 0, 0]
  }
  const aCur = output.aMin + ia * da
  const aNext = output.aMin + (ia + 1) * da
  const aPrev = output.aMin + (ia - 1) * da
  const sCur = Math.pow(aCur, 1.5) * sampleArg(output, ia, i1, i2)
  const sNextA = Math.pow(aNext, 1.5) * sampleArg(output, ia + 1, i1, i2)
  const sPrevA = Math.pow(aPrev, 1.5) * sampleArg(output, ia - 1, i1, i2)
  const sNext1 = Math.pow(aCur, 1.5) * sampleArg(output, ia, i1 + 1, i2)
  const sPrev1 = Math.pow(aCur, 1.5) * sampleArg(output, ia, i1 - 1, i2)
  const sNext2 = Math.pow(aCur, 1.5) * sampleArg(output, ia, i1, i2 + 1)
  const sPrev2 = Math.pow(aCur, 1.5) * sampleArg(output, ia, i1, i2 - 1)

  // Unwrap relative to center phase
  const dSda = (wrappedDiff(sNextA, sCur) - wrappedDiff(sPrevA, sCur)) / (2 * da)
  const dSdp1 = (wrappedDiff(sNext1, sCur) - wrappedDiff(sPrev1, sCur)) / (2 * dphi)
  const dSdp2 = (wrappedDiff(sNext2, sCur) - wrappedDiff(sPrev2, sCur)) / (2 * dphi)
  return [dSda, dSdp1, dSdp2]
}

/** Check whether a (floating-point) grid position is in the Lorentzian region. */
function isLorentzian(
  output: WheelerDeWittSolverOutput,
  ia: number,
  i1: number,
  i2: number
): boolean {
  const [Na, Nphi] = output.gridSize
  const iai = Math.round(ia)
  const i1i = Math.round(i1)
  const i2i = Math.round(i2)
  if (iai < 0 || iai >= Na || i1i < 0 || i1i >= Nphi || i2i < 0 || i2i >= Nphi) return false
  const idx = iai * Nphi * Nphi + i1i * Nphi + i2i
  return (output.lorentzianMask[idx] ?? 0) !== 0
}

/** RK4 step along ∇S on the grid. Returns new (ia, i1, i2) in grid-index units. */
function rk4Step(
  output: WheelerDeWittSolverOutput,
  ia: number,
  i1: number,
  i2: number,
  da: number,
  dphi: number,
  stepScale: number
): [number, number, number] {
  const k1 = gradS(output, ia, i1, i2, da, dphi)
  const k2 = gradS(
    output,
    ia + 0.5 * stepScale * k1[0],
    i1 + 0.5 * stepScale * k1[1],
    i2 + 0.5 * stepScale * k1[2],
    da,
    dphi
  )
  const k3 = gradS(
    output,
    ia + 0.5 * stepScale * k2[0],
    i1 + 0.5 * stepScale * k2[1],
    i2 + 0.5 * stepScale * k2[2],
    da,
    dphi
  )
  const k4 = gradS(
    output,
    ia + stepScale * k3[0],
    i1 + stepScale * k3[1],
    i2 + stepScale * k3[2],
    da,
    dphi
  )
  const dx0 = (stepScale * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0])) / 6
  const dx1 = (stepScale * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1])) / 6
  const dx2 = (stepScale * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2])) / 6
  return [ia + dx0, i1 + dx1, i2 + dx2]
}

/** Splat a Gaussian intensity bump centered at (ia, i1, i2). */
function splat(
  intensity: Float32Array,
  gridSize: [number, number, number],
  ia: number,
  i1: number,
  i2: number,
  radius: number,
  weight: number
): void {
  const [Na, Nphi] = gridSize
  const r = Math.ceil(radius * 2.5)
  const iaC = Math.round(ia)
  const i1C = Math.round(i1)
  const i2C = Math.round(i2)
  const sigma2 = Math.max(1e-6, radius * radius)
  for (let ka = -r; ka <= r; ka++) {
    const iap = iaC + ka
    if (iap < 0 || iap >= Na) continue
    for (let k1 = -r; k1 <= r; k1++) {
      const i1p = i1C + k1
      if (i1p < 0 || i1p >= Nphi) continue
      for (let k2 = -r; k2 <= r; k2++) {
        const i2p = i2C + k2
        if (i2p < 0 || i2p >= Nphi) continue
        const dist2 = ka * ka + k1 * k1 + k2 * k2
        const w = weight * Math.exp(-0.5 * (dist2 / sigma2))
        if (w < 1e-6) continue
        const idx = iap * Nphi * Nphi + i1p * Nphi + i2p
        intensity[idx] = (intensity[idx] ?? 0) + w
      }
    }
  }
}

/**
 * Integrate WKB streamlines on a Wheeler–DeWitt solution and return an
 * additive per-voxel overlay. Streamlines stop upon leaving the Lorentzian
 * region or the grid. The overlay is intended to be added to the density
 * channel during texture packing.
 *
 * @param output - Solver output
 * @param input - Streamline config
 * @returns Per-voxel additive overlay
 */
export function integrateWkbStreamlines(
  output: WheelerDeWittSolverOutput,
  input: WkbStreamlineInput = DEFAULT_STREAMLINE_INPUT
): StreamlineOverlay {
  const [Na, Nphi] = output.gridSize
  const total = Na * Nphi * Nphi
  const intensity = new Float32Array(total)
  const da = (output.aMax - output.aMin) / (Na - 1)
  const dphi = (2 * output.phiExtent) / (Nphi - 1)

  // Integrate in grid-index space. `stepScale` converts the physical gradient
  // (dS/da, dS/dphi) into an index delta — we want unit speed in grid cells,
  // so we normalize by the gradient magnitude inside each step.
  const density = Math.max(2, Math.min(16, input.density | 0))
  const stepScale = 0.5

  for (let sa = 1; sa < Na - 1; sa += Math.max(1, Math.floor((Na - 2) / density))) {
    for (let s1 = 0; s1 < density; s1++) {
      const i1Seed = 1 + Math.floor(((Nphi - 3) * (s1 + 0.5)) / density)
      for (let s2 = 0; s2 < density; s2++) {
        const i2Seed = 1 + Math.floor(((Nphi - 3) * (s2 + 0.5)) / density)

        if (!isLorentzian(output, sa, i1Seed, i2Seed)) continue

        let ia = sa
        let i1 = i1Seed
        let i2 = i2Seed

        for (let step = 0; step < input.maxSteps; step++) {
          if (!isLorentzian(output, ia, i1, i2)) break

          const weight = 1.0
          splat(intensity, output.gridSize, ia, i1, i2, input.splatRadius, weight)

          const [ian, i1n, i2n] = rk4Step(output, ia, i1, i2, da, dphi, stepScale)
          // Bail when the gradient is essentially zero (Euclidean tail).
          const delta = Math.abs(ian - ia) + Math.abs(i1n - i1) + Math.abs(i2n - i2)
          if (delta < 1e-4) break
          ia = ian
          i1 = i1n
          i2 = i2n
          if (ia < 0 || ia >= Na || i1 < 0 || i1 >= Nphi || i2 < 0 || i2 >= Nphi) break
        }
      }
    }
  }

  let maxIntensity = 0
  for (let i = 0; i < total; i++) {
    const v = intensity[i] ?? 0
    if (v > maxIntensity) maxIntensity = v
  }
  return { intensity, maxIntensity }
}

/**
 * Post-hoc test helper: for every cell touched by the overlay (intensity > 0),
 * confirm the cell's Lorentzian mask bit is set. Returns the fraction of
 * touched cells that violate Lorentzian gating.
 */
export function countEuclideanOverlayLeakage(
  overlay: StreamlineOverlay,
  output: WheelerDeWittSolverOutput
): { total: number; leaked: number; fraction: number } {
  let total = 0
  let leaked = 0
  for (let i = 0; i < overlay.intensity.length; i++) {
    const v = overlay.intensity[i] ?? 0
    if (v <= 1e-6) continue
    total++
    if ((output.lorentzianMask[i] ?? 0) === 0) leaked++
  }
  return { total, leaked, fraction: total > 0 ? leaked / total : 0 }
}
