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

  for (let z = 0; z < N; z++) {
    // z maps to φ₂
    const tz = (z + 0.5) / N
    const i2f = tz * (Nphi - 1)
    const i2 = Math.round(i2f)
    for (let y = 0; y < N; y++) {
      // y maps to φ₁
      const ty = (y + 0.5) / N
      const i1f = ty * (Nphi - 1)
      const i1 = Math.round(i1f)
      for (let x = 0; x < N; x++) {
        // x maps to a
        const tx = (x + 0.5) / N
        const iaF = tx * (Na - 1)
        const ia = Math.round(iaF)
        const pixelIdx = (z * N + y) * N + x
        if (ia < 0 || ia >= Na || i1 < 0 || i1 >= Nphi || i2 < 0 || i2 >= Nphi) {
          // Uint16Array is zero-initialized — skip writes for out-of-grid
          continue
        }
        const cellIdx = ia * slab + i1 * Nphi + i2
        const re = output.chi[2 * cellIdx] ?? 0
        const im = output.chi[2 * cellIdx + 1] ?? 0
        const rho = re * re + im * im
        const rhoNorm = clamp01(rho / maxRho)
        const logRho = Math.log(rho + 1e-10)
        const phase = re === 0 && im === 0 ? 0 : Math.atan2(im, re)
        const overlayVal = overlay ? (overlay.intensity[cellIdx] ?? 0) / maxStreamline : 0
        packRGBA16F(density, pixelIdx, rhoNorm, logRho, phase, clamp01(overlayVal))
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
