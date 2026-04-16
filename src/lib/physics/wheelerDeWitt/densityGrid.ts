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
 * Coordinate mapping (texel-to-physics, independent of world-space cube size):
 *   UVW.x ∈ [0, 1]  →  a ∈ [aMin, aMax]                 (scale-factor axis)
 *   UVW.y ∈ [0, 1]  →  φ₁ ∈ [−phiExtent, +phiExtent]     (inflaton 1)
 *   UVW.z ∈ [0, 1]  →  φ₂ ∈ [−phiExtent, +phiExtent]     (inflaton 2)
 *
 * Every density-grid texel receives a solver sample. This is a change from
 * the prior packer which mapped `a → (2tx − 1)·R` — placing a positive-only
 * scale factor inside a symmetric cube left the left half of the cube empty
 * and clipped phi values beyond R. The render cube is purely a framing box
 * for the raymarcher; physics coordinates can fill it freely.
 *
 * Sampling uses trilinear interpolation of the complex χ field
 * (re/im interpolated separately, then |χ|² and arg(χ) computed from the
 * interpolated amplitude). Nearest-neighbor lookup on a 32³ solver grid
 * produced ~2–3 density-texel quantisation bands; trilinear filtering
 * smooths the wave-packet ridges seen in minisuperspace figures.
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
  // cells are non-physical; treat them as zero when they appear in the
  // trilinear stencil so the Euclidean-clamp cube corners don't bleed into
  // interpolated neighbours.
  const CLAMP_SOFT = 0.9 * 1e8

  // Fractional solver-grid index per normalised texture coordinate.
  //   UVW.x ∈ [0, 1] → fractional ia ∈ [0, Na − 1]
  //   UVW.{y,z} ∈ [0, 1] → fractional iPhi ∈ [0, Nphi − 1]
  // Degenerate Na/Nphi == 1 would collapse the index to 0; the solver
  // requires Na, Nphi ≥ 3 so in practice these are safely positive.
  const iaScale = Na > 1 ? Na - 1 : 0
  const iPhiScale = Nphi > 1 ? Nphi - 1 : 0

  /**
   * Trilinear sample of the complex χ field. Cells clamped at the solver's
   * Euclidean overflow guard are treated as (0, 0) so they don't leak
   * non-physical amplitude into neighbours. Returns [re, im].
   */
  const sampleChi = (
    ia0: number,
    ia1: number,
    i10: number,
    i11: number,
    i20: number,
    i21: number,
    wa: number,
    w1: number,
    w2: number
  ): [number, number] => {
    // 8-corner fetch; each corner masked to (0, 0) if clamp-saturated.
    const fetchCorner = (ia: number, i1: number, i2: number): [number, number] => {
      const base = 2 * (ia * slab + i1 * Nphi + i2)
      const re = output.chi[base] ?? 0
      const im = output.chi[base + 1] ?? 0
      if (Math.abs(re) >= CLAMP_SOFT || Math.abs(im) >= CLAMP_SOFT) return [0, 0]
      return [re, im]
    }
    const [re000, im000] = fetchCorner(ia0, i10, i20)
    const [re100, im100] = fetchCorner(ia1, i10, i20)
    const [re010, im010] = fetchCorner(ia0, i11, i20)
    const [re110, im110] = fetchCorner(ia1, i11, i20)
    const [re001, im001] = fetchCorner(ia0, i10, i21)
    const [re101, im101] = fetchCorner(ia1, i10, i21)
    const [re011, im011] = fetchCorner(ia0, i11, i21)
    const [re111, im111] = fetchCorner(ia1, i11, i21)

    const re00 = re000 + (re100 - re000) * wa
    const re10 = re010 + (re110 - re010) * wa
    const re01 = re001 + (re101 - re001) * wa
    const re11 = re011 + (re111 - re011) * wa
    const re0 = re00 + (re10 - re00) * w1
    const re1 = re01 + (re11 - re01) * w1
    const re = re0 + (re1 - re0) * w2

    const im00 = im000 + (im100 - im000) * wa
    const im10 = im010 + (im110 - im010) * wa
    const im01 = im001 + (im101 - im001) * wa
    const im11 = im011 + (im111 - im011) * wa
    const im0 = im00 + (im10 - im00) * w1
    const im1 = im01 + (im11 - im01) * w1
    const im = im0 + (im1 - im0) * w2
    return [re, im]
  }

  /** Trilinear sample of the streamline overlay (scalar intensity). */
  const sampleOverlay = (
    ia0: number,
    ia1: number,
    i10: number,
    i11: number,
    i20: number,
    i21: number,
    wa: number,
    w1: number,
    w2: number
  ): number => {
    if (!overlay) return 0
    const intensity = overlay.intensity
    const fetch = (ia: number, i1: number, i2: number): number =>
      intensity[ia * slab + i1 * Nphi + i2] ?? 0
    const s000 = fetch(ia0, i10, i20)
    const s100 = fetch(ia1, i10, i20)
    const s010 = fetch(ia0, i11, i20)
    const s110 = fetch(ia1, i11, i20)
    const s001 = fetch(ia0, i10, i21)
    const s101 = fetch(ia1, i10, i21)
    const s011 = fetch(ia0, i11, i21)
    const s111 = fetch(ia1, i11, i21)
    const s00 = s000 + (s100 - s000) * wa
    const s10 = s010 + (s110 - s010) * wa
    const s01 = s001 + (s101 - s001) * wa
    const s11 = s011 + (s111 - s011) * wa
    const s0 = s00 + (s10 - s00) * w1
    const s1 = s01 + (s11 - s01) * w1
    return s0 + (s1 - s0) * w2
  }

  for (let z = 0; z < N; z++) {
    const tz = (z + 0.5) / N
    const fz = tz * iPhiScale
    const i20 = Math.min(Nphi - 1, Math.max(0, Math.floor(fz)))
    const i21 = Math.min(Nphi - 1, i20 + 1)
    const w2 = fz - i20
    for (let y = 0; y < N; y++) {
      const ty = (y + 0.5) / N
      const fy = ty * iPhiScale
      const i10 = Math.min(Nphi - 1, Math.max(0, Math.floor(fy)))
      const i11 = Math.min(Nphi - 1, i10 + 1)
      const w1 = fy - i10
      for (let x = 0; x < N; x++) {
        const tx = (x + 0.5) / N
        const fx = tx * iaScale
        const ia0 = Math.min(Na - 1, Math.max(0, Math.floor(fx)))
        const ia1 = Math.min(Na - 1, ia0 + 1)
        const wa = fx - ia0
        const pixelIdx = (z * N + y) * N + x

        const [re, im] = sampleChi(ia0, ia1, i10, i11, i20, i21, wa, w1, w2)
        const rho = re * re + im * im
        const rhoNorm = clamp01(rho / maxRho)
        const phase = re === 0 && im === 0 ? 0 : Math.atan2(im, re)

        const overlayRaw = sampleOverlay(ia0, ia1, i10, i11, i20, i21, wa, w1, w2)
        const overlayVal = overlay ? overlayRaw / maxStreamline : 0
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
