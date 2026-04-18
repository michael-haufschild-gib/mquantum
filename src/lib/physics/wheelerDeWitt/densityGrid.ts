/**
 * Pack the Wheeler–DeWitt solver output into the project's 96³ rgba16float
 * density-grid texture layout used by the raymarcher.
 *
 * Channel packing (matching the raymarcher sampler expectations):
 *   R = |χ|² / max(|χ|²)                  — normalized probability density
 *   G = log(|χ|² + ε)                     — log-density for volumetric exposure
 *   B = arg(χ)                            — phase (used by phase-density color algorithm)
 *   A = max(streamline overlay,            — combined "overlay" channel: the streamline
 *           SRMT sliceK overlay)            WKB intensity is preserved, and when SRMT is
 *                                          enabled the modular spectrum heatmap broadcasts
 *                                          along the clock axis at the cut plane, blending
 *                                          via a per-voxel `max()` so both overlays remain
 *                                          visible at the boundaries they individually
 *                                          populate (they rarely overlap in voxel space).
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

/**
 * Optional SRMT (Superspace-Relational Modular Time) overlay input.
 *
 * `sliceK` is the diagnostic output of {@link computeSrmtDiagnostic}; it
 * has exactly `Nphi²` entries regardless of clock choice (Phase-1
 * zero-padding convention — the HJ spectrum for φ-clocks is naturally
 * `Na·Nphi` long but the Phase-1 `buildSliceK` helper projects it into
 * `Nphi²` for a consistent render-time payload shape).
 *
 * The overlay is broadcast only along the CLOCK axis at the cut plane —
 * voxels farther than ~1 density-texel from `cutIndex / (clockAxisLen - 1)`
 * see zero SRMT contribution. The remaining 2D slice axes index `sliceK`
 * via `[i1 * Nphi + i2]` where `(i1, i2)` are derived from the
 * density-texel coordinates perpendicular to the clock.
 */
export interface WdwSrmtOverlay {
  /** `sliceK` from {@link SrmtResult}. Length must equal `Nphi * Nphi`. */
  sliceK: Float32Array
  /** Slice plane orientation matching the clock selection. */
  slicePlane: 'phi-phi' | 'a-phi2' | 'a-phi1'
  /** Heatmap brightness multiplier ∈ [0, 1]. */
  intensity: number
  /** Integer cut index along the clock axis used when generating `sliceK`. */
  cutIndex: number
  /** Size of the clock axis in the solver grid (`Na` for clock='a', `Nphi` otherwise). */
  clockAxisLen: number
  /** `Nphi` — second-dimension size of `sliceK` (so `sliceK[i1*Nphi + i2]`). */
  Nphi: number
}

function clamp01(v: number): number {
  if (v < 0) return 0
  if (v > 1) return 1
  return v
}

/**
 * Pack the solver output + streamline overlay + optional SRMT overlay into
 * the density texture bytes.
 *
 * @param output - Dense solver output
 * @param overlay - Optional WKB streamline intensity (may be null)
 * @param srmtOverlay - Optional SRMT sliceK overlay (may be undefined). When
 *                      supplied, the modular spectrum is projected into the
 *                      A channel at the cut plane only — density voxels
 *                      outside the cut disk are unaffected. Blends via
 *                      `max(streamline, srmt)` against the streamline
 *                      overlay so the two can coexist without destroying
 *                      either one.
 * @returns Upload-ready Uint16Array + texture layout
 */
export function packWdwDensityGrid(
  output: WheelerDeWittSolverOutput,
  overlay: StreamlineOverlay | null,
  srmtOverlay?: WdwSrmtOverlay
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

  // Scalar inline sampling — closures + tuple allocations across 96³ voxels
  // became measurable GC pressure during interactive repacks. Hot path below
  // indexes `chi` and `overlay.intensity` directly.
  const chi = output.chi
  const overlayIntensity = overlay?.intensity ?? null

  // SRMT overlay precompute: log-normalize sliceK once so the inner loop
  // does a single table lookup per voxel. `normSliceK[i] ∈ [0, 1]` is a
  // log-rescaled version of the modular-Hamiltonian entry, then the final
  // alpha contribution is `normSliceK[i] * intensity`.
  //
  // Clock → density-axis mapping:
  //   slicePlane 'phi-phi' (clock='a')  : cut along density-x (a axis); sliceK
  //                                        indexed by (phi1-from-y, phi2-from-z).
  //   slicePlane 'a-phi2'  (clock='phi1'): cut along density-y; sliceK indexed
  //                                        by (a-from-x compressed to Nphi,
  //                                            phi2-from-z).
  //   slicePlane 'a-phi1'  (clock='phi2'): cut along density-z; sliceK indexed
  //                                        by (a-from-x compressed to Nphi,
  //                                            phi1-from-y).
  // The "a-compressed" projection is a Phase-1 artifact of `buildSliceK`
  // zero-padding to `Nphi²`; Phase-6 will lift this to the full `Na·Nphi`
  // payload once the Rust/WASM port arrives.
  let srmtNorm: Float32Array | null = null
  let srmtCutDensity = 0
  let srmtCutHalfWidth = 0
  let srmtPlane: 'phi-phi' | 'a-phi2' | 'a-phi1' = 'phi-phi'
  let srmtIntensity = 0
  let srmtNphi = Nphi
  if (srmtOverlay && srmtOverlay.sliceK.length >= srmtOverlay.Nphi * srmtOverlay.Nphi) {
    const K = srmtOverlay.sliceK
    let maxLog = 0
    for (let i = 0; i < K.length; i++) {
      const v = K[i]!
      if (Number.isFinite(v) && v > 0) {
        const lv = Math.log1p(v)
        if (lv > maxLog) maxLog = lv
      }
    }
    srmtNorm = new Float32Array(K.length)
    if (maxLog > 0) {
      const inv = 1 / maxLog
      for (let i = 0; i < K.length; i++) {
        const v = K[i]!
        if (Number.isFinite(v) && v > 0) {
          srmtNorm[i] = Math.log1p(v) * inv
        }
      }
    }
    // Map the solver-grid cut index to a normalised [0,1] density coord.
    const clockLen = Math.max(2, srmtOverlay.clockAxisLen)
    const cutN = Math.max(0, Math.min(clockLen - 1, srmtOverlay.cutIndex))
    srmtCutDensity = cutN / (clockLen - 1)
    // ± 1.5 density-texel half-width: thick enough to survive trilinear
    // blur in the shader, thin enough to read as a disk rather than a slab.
    srmtCutHalfWidth = 1.5 / N
    srmtPlane = srmtOverlay.slicePlane
    srmtIntensity = Math.max(0, Math.min(1, srmtOverlay.intensity))
    srmtNphi = Math.max(1, srmtOverlay.Nphi)
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

        // χ — 8-corner complex fetch with clamp-saturation masked to (0, 0).
        const b000 = 2 * (ia0 * slab + i10 * Nphi + i20)
        let re000 = chi[b000] ?? 0
        let im000 = chi[b000 + 1] ?? 0
        if (Math.abs(re000) >= CLAMP_SOFT || Math.abs(im000) >= CLAMP_SOFT) {
          re000 = 0
          im000 = 0
        }
        const b100 = 2 * (ia1 * slab + i10 * Nphi + i20)
        let re100 = chi[b100] ?? 0
        let im100 = chi[b100 + 1] ?? 0
        if (Math.abs(re100) >= CLAMP_SOFT || Math.abs(im100) >= CLAMP_SOFT) {
          re100 = 0
          im100 = 0
        }
        const b010 = 2 * (ia0 * slab + i11 * Nphi + i20)
        let re010 = chi[b010] ?? 0
        let im010 = chi[b010 + 1] ?? 0
        if (Math.abs(re010) >= CLAMP_SOFT || Math.abs(im010) >= CLAMP_SOFT) {
          re010 = 0
          im010 = 0
        }
        const b110 = 2 * (ia1 * slab + i11 * Nphi + i20)
        let re110 = chi[b110] ?? 0
        let im110 = chi[b110 + 1] ?? 0
        if (Math.abs(re110) >= CLAMP_SOFT || Math.abs(im110) >= CLAMP_SOFT) {
          re110 = 0
          im110 = 0
        }
        const b001 = 2 * (ia0 * slab + i10 * Nphi + i21)
        let re001 = chi[b001] ?? 0
        let im001 = chi[b001 + 1] ?? 0
        if (Math.abs(re001) >= CLAMP_SOFT || Math.abs(im001) >= CLAMP_SOFT) {
          re001 = 0
          im001 = 0
        }
        const b101 = 2 * (ia1 * slab + i10 * Nphi + i21)
        let re101 = chi[b101] ?? 0
        let im101 = chi[b101 + 1] ?? 0
        if (Math.abs(re101) >= CLAMP_SOFT || Math.abs(im101) >= CLAMP_SOFT) {
          re101 = 0
          im101 = 0
        }
        const b011 = 2 * (ia0 * slab + i11 * Nphi + i21)
        let re011 = chi[b011] ?? 0
        let im011 = chi[b011 + 1] ?? 0
        if (Math.abs(re011) >= CLAMP_SOFT || Math.abs(im011) >= CLAMP_SOFT) {
          re011 = 0
          im011 = 0
        }
        const b111 = 2 * (ia1 * slab + i11 * Nphi + i21)
        let re111 = chi[b111] ?? 0
        let im111 = chi[b111 + 1] ?? 0
        if (Math.abs(re111) >= CLAMP_SOFT || Math.abs(im111) >= CLAMP_SOFT) {
          re111 = 0
          im111 = 0
        }

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

        const rho = re * re + im * im
        const rhoNorm = clamp01(rho / maxRho)
        const phase = re === 0 && im === 0 ? 0 : Math.atan2(im, re)

        let overlayRaw = 0
        if (overlayIntensity) {
          const s000 = overlayIntensity[ia0 * slab + i10 * Nphi + i20] ?? 0
          const s100 = overlayIntensity[ia1 * slab + i10 * Nphi + i20] ?? 0
          const s010 = overlayIntensity[ia0 * slab + i11 * Nphi + i20] ?? 0
          const s110 = overlayIntensity[ia1 * slab + i11 * Nphi + i20] ?? 0
          const s001 = overlayIntensity[ia0 * slab + i10 * Nphi + i21] ?? 0
          const s101 = overlayIntensity[ia1 * slab + i10 * Nphi + i21] ?? 0
          const s011 = overlayIntensity[ia0 * slab + i11 * Nphi + i21] ?? 0
          const s111 = overlayIntensity[ia1 * slab + i11 * Nphi + i21] ?? 0
          const s00 = s000 + (s100 - s000) * wa
          const s10 = s010 + (s110 - s010) * wa
          const s01 = s001 + (s101 - s001) * wa
          const s11 = s011 + (s111 - s011) * wa
          const s0 = s00 + (s10 - s00) * w1
          const s1 = s01 + (s11 - s01) * w1
          overlayRaw = s0 + (s1 - s0) * w2
        }
        // SRMT sliceK: broadcast along the clock axis at the cut plane only.
        // Computed BEFORE we fold overlays into the visible R/G channels so
        // the SRMT disk co-adds with streamlines. The raymarcher reads R
        // (rho) and G (logRho); the alpha channel carries a redundant copy
        // for downstream consumers but does NOT drive visibility, so every
        // overlay that needs to be visible must be mixed into rho.
        let srmtAlpha = 0
        if (srmtNorm !== null) {
          const txN = (x + 0.5) / N
          const tyN = (y + 0.5) / N
          const tzN = (z + 0.5) / N
          let clockCoord = txN
          let u1 = tyN
          let u2 = tzN
          if (srmtPlane === 'a-phi2') {
            clockCoord = tyN
            u1 = txN
            u2 = tzN
          } else if (srmtPlane === 'a-phi1') {
            clockCoord = tzN
            u1 = txN
            u2 = tyN
          }
          if (Math.abs(clockCoord - srmtCutDensity) <= srmtCutHalfWidth) {
            const i1 = Math.min(srmtNphi - 1, Math.max(0, Math.round(u1 * (srmtNphi - 1))))
            const i2 = Math.min(srmtNphi - 1, Math.max(0, Math.round(u2 * (srmtNphi - 1))))
            const v = srmtNorm[i1 * srmtNphi + i2] ?? 0
            srmtAlpha = clamp01(v * srmtIntensity)
          }
        }

        const overlayVal = overlay ? overlayRaw / maxStreamline : 0
        // Mix BOTH the streamline/worldline overlay AND the SRMT disk into
        // the rendered R/G channels so they are actually visible. The
        // raymarcher only reads R (rho) and G (logRho); A is reserved for
        // negative-encoded potential overlays in TDSE. Clamp to 1 so the
        // overlays can't blow out the scene — streamlines appear as bright
        // ridges along WKB trajectories; SRMT appears as a bright 2D disk
        // at the cut plane. They rarely overlap spatially, so the sum
        // saturates cleanly when they don't.
        const rhoWithOverlay = clamp01(rhoNorm + overlayVal + srmtAlpha)
        const rhoPhysicalBoosted = rhoWithOverlay * maxRho
        const logRho = Math.log(rhoPhysicalBoosted + 1e-10)

        const streamlineAlpha = clamp01(overlayVal)
        const alpha = streamlineAlpha > srmtAlpha ? streamlineAlpha : srmtAlpha
        packRGBA16F(density, pixelIdx, rhoWithOverlay, logRho, phase, alpha)
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
