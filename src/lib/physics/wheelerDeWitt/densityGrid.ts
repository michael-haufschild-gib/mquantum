/**
 * Pack the Wheeler–DeWitt solver output into the project's 64³ rgba16float
 * density-grid texture layout used by the raymarcher.
 *
 * Channel packing (matching the raymarcher sampler expectations):
 *   R = |χ|² / max(|χ|²)   — normalized probability density
 *   G = log(|χ|² + ε)      — log-density for volumetric exposure
 *   B = arg(χ)             — phase (used by phase-density color algorithm)
 *   A = streamline overlay — WKB intensity from the classical-flow pass
 *
 * Coordinate mapping: the solver grid is (ia, iPhi1, iPhi2) but the density
 * grid lives in a cube [−R, +R]³ with R = boundingRadius = a_max. We place:
 *   X  in the render cube ↔ a coordinate, mapped linearly to [−R, R]
 *   Y  ↔ φ₁
 *   Z  ↔ φ₂
 * with (a, φ₁, φ₂) rescaled so the full solver grid fits the cube. Texels
 * outside the solver domain are left as zero (transparent background).
 */

import { DENSITY_GRID_SIZE } from '@/constants/densityGrid'
import { packRGBA16F } from '@/lib/physics/freeScalar/kSpaceOccupation'

import type { WheelerDeWittSolverOutput } from './solver'
import type { StreamlineOverlay } from './wkbStreamlines'

/** Packed density buffer + metadata consumed by the GPU upload path. */
export interface WdwDensityUpload {
  /** Packed Uint16Array of length 4·N³ (rgba16float bytes). */
  density: Uint16Array
  /** Texture size (always DENSITY_GRID_SIZE). */
  gridSize: number
  /** Bytes per row — N·8 for rgba16float. */
  bytesPerRow: number
  /** Rows per image — N. */
  rowsPerImage: number
}

function clamp01(v: number): number {
  if (v < 0) return 0
  if (v > 1) return 1
  return v
}

/**
 * Pack the solver output + streamline overlay into the density texture bytes.
 *
 * @param output - Dense solver output
 * @param overlay - Optional WKB streamline intensity (may be null)
 * @returns Upload-ready Uint16Array + texture layout
 */
export function packWdwDensityGrid(
  output: WheelerDeWittSolverOutput,
  overlay: StreamlineOverlay | null
): WdwDensityUpload {
  const N = DENSITY_GRID_SIZE
  const total = N * N * N
  const density = new Uint16Array(total * 4)

  const [Na, Nphi] = output.gridSize
  const slab = Nphi * Nphi
  const maxRho = Math.max(output.maxDensity, 1e-20)
  const maxStreamline = overlay ? Math.max(overlay.maxIntensity, 1e-20) : 1
  // Solver saturates |χ| at CLAMP in the Euclidean growing branch. Those
  // cells are non-physical and, if packed naively, bright-render the cube
  // corners regardless of the Lorentzian interior (which is the actual
  // physics). Gate them out at the packer — render as zero density.
  const CLAMP_SOFT = 0.9 * 1e8

  // The render cube is [-R, +R]³ with R = aMax. Reconstruct physical
  // (a, φ₁, φ₂) from texel normalized coords so texels outside the
  // solver domain (a ∈ [aMin, aMax], |φ₁|, |φ₂| ≤ phiExtent) stay zero
  // instead of getting projected onto the nearest solver sample.
  const { aMin, aMax, phiExtent } = output
  const aSpan = aMax - aMin
  const da = aSpan > 0 ? aSpan / (Na - 1) : 0
  const dphi = phiExtent > 0 ? (2 * phiExtent) / (Nphi - 1) : 0
  const R = aMax

  for (let z = 0; z < N; z++) {
    // z maps to φ₂ via cube coord physPhi2 = (2·tz - 1)·R
    const tz = (z + 0.5) / N
    const physPhi2 = (2 * tz - 1) * R
    const insideZ = Math.abs(physPhi2) <= phiExtent
    const i2 = insideZ && dphi > 0 ? Math.round((physPhi2 + phiExtent) / dphi) : -1
    for (let y = 0; y < N; y++) {
      const ty = (y + 0.5) / N
      const physPhi1 = (2 * ty - 1) * R
      const insideY = Math.abs(physPhi1) <= phiExtent
      const i1 = insideY && dphi > 0 ? Math.round((physPhi1 + phiExtent) / dphi) : -1
      for (let x = 0; x < N; x++) {
        const tx = (x + 0.5) / N
        const physA = (2 * tx - 1) * R
        const insideX = physA >= aMin && physA <= aMax
        const ia = insideX && da > 0 ? Math.round((physA - aMin) / da) : -1
        const pixelIdx = (z * N + y) * N + x
        if (ia < 0 || ia >= Na || i1 < 0 || i1 >= Nphi || i2 < 0 || i2 >= Nphi) {
          // Uint16Array is zero-initialized — skip writes for out-of-grid
          continue
        }
        const cellIdx = ia * slab + i1 * Nphi + i2
        const re = output.chi[2 * cellIdx] ?? 0
        const im = output.chi[2 * cellIdx + 1] ?? 0
        // Skip clamp-saturated cells: they carry no physical signal and would
        // otherwise dominate the rendered density with bright corner blobs.
        if (Math.abs(re) >= CLAMP_SOFT || Math.abs(im) >= CLAMP_SOFT) {
          // Leave this texel at zero (the Uint16Array is pre-initialized to 0).
          continue
        }
        const rho = re * re + im * im
        const rhoNorm = clamp01(rho / maxRho)
        const phase = re === 0 && im === 0 ? 0 : Math.atan2(im, re)
        const overlayVal = overlay ? (overlay.intensity[cellIdx] ?? 0) / maxStreamline : 0
        // Mix the streamline/worldline overlay into the rendered R/G channels
        // so it is actually visible. The raymarcher only reads R (rho) and G
        // (logRho); A is reserved for negative-encoded potential overlays in
        // TDSE. Clamp to 1 so the overlay can't blow out the scene — at peak
        // weight the overlay appears as a bright ridge co-located with the
        // WKB trajectory.
        const rhoWithOverlay = clamp01(rhoNorm + overlayVal)
        const rhoPhysicalBoosted = rhoWithOverlay * maxRho
        const logRho = Math.log(rhoPhysicalBoosted + 1e-10)
        packRGBA16F(density, pixelIdx, rhoWithOverlay, logRho, phase, clamp01(overlayVal))
      }
    }
  }

  return {
    density,
    gridSize: N,
    bytesPerRow: N * 8,
    rowsPerImage: N,
  }
}
