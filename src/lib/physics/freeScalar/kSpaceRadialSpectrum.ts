/**
 * k-Space Radial Shell Spectrum
 *
 * Bins k-space modes by |k| magnitude into radial shells, then maps
 * shell-averaged occupation numbers back to a 64^3 display grid where
 * each voxel is colored by its shell's mean n_k.
 */

import type { KSpaceVizConfig } from '@/lib/geometry/extended/types'
import type { KSpaceRawData } from '@/lib/physics/freeScalar/kSpaceOccupation'
import { OUTPUT_GRID_SIZE } from '@/lib/physics/freeScalar/kSpaceOccupation'
import type { KSpaceDisplayGrid } from '@/lib/physics/freeScalar/kSpaceDisplayTransforms'

// ============================================================================
// Radial Shell Data
// ============================================================================

/**
 * Radially binned k-space spectrum.
 * Each bin collects modes with similar |k| magnitude.
 */
export interface RadialShellData {
  /** Mean n_k per shell */
  shellMeanNk: Float64Array
  /** Center |k| value of each shell (normalized to [0,1]) */
  shellKCenter: Float64Array
  /** Center omega of each shell (normalized to [0,1]) */
  shellOmegaCenter: Float64Array
  /** Number of modes per shell */
  shellCounts: Uint32Array
  /** Maximum |k| across all modes */
  kMax: number
  /** Number of radial bins */
  binCount: number
}

/**
 * Bin k-space modes by |k| magnitude into radial shells.
 *
 * @param raw - Raw k-space data
 * @param binCount - Number of radial bins
 * @returns Radial shell data with per-bin averages
 */
export function computeRadialShells(raw: KSpaceRawData, binCount: number): RadialShellData {
  const bins = Math.max(1, Math.min(128, Math.round(binCount)))
  const kMax = Math.max(raw.kMagMax, 1e-10)
  const omegaMax = Math.max(raw.omegaMax, 1e-10)

  const shellSumNk = new Float64Array(bins)
  const shellSumK = new Float64Array(bins)
  const shellSumOmega = new Float64Array(bins)
  const shellCounts = new Uint32Array(bins)

  for (let i = 0; i < raw.totalSites; i++) {
    const n = Math.max(raw.nk[i]!, 0)
    const k = raw.kMag[i]!
    const bin = Math.min(bins - 1, Math.floor((k / kMax) * (bins - 1)))

    shellSumNk[bin]! += n
    shellSumK[bin]! += k
    shellSumOmega[bin]! += raw.omega[i]!
    shellCounts[bin]!++
  }

  const shellMeanNk = new Float64Array(bins)
  const shellKCenter = new Float64Array(bins)
  const shellOmegaCenter = new Float64Array(bins)

  for (let b = 0; b < bins; b++) {
    const cnt = shellCounts[b]!
    if (cnt > 0) {
      shellMeanNk[b] = shellSumNk[b]! / cnt
      shellKCenter[b] = shellSumK[b]! / cnt / kMax
      shellOmegaCenter[b] = shellSumOmega[b]! / cnt / omegaMax
    } else {
      shellKCenter[b] = (b + 0.5) / bins
      shellOmegaCenter[b] = 0
    }
  }

  return { shellMeanNk, shellKCenter, shellOmegaCenter, shellCounts, kMax, binCount: bins }
}

// ============================================================================
// Radial Display Grid
// ============================================================================

/**
 * Build a 64^3 display grid from radial shell data.
 *
 * For each output voxel, computes |k| from the voxel's position (with optional
 * FFT shift), finds the corresponding radial shell bin, and fills from the
 * shell's mean values.
 *
 * @param raw - Raw k-space data (for spacing/gridSize info)
 * @param config - Visualization config
 * @returns 64^3 display grid colored by radial shell
 */
export function buildRadialDisplayGrid(raw: KSpaceRawData, config: KSpaceVizConfig): KSpaceDisplayGrid {
  const G = OUTPUT_GRID_SIZE
  const outputTotal = G ** 3
  const nk = new Float64Array(outputTotal)
  const kNorm = new Float64Array(outputTotal)
  const omegaNorm = new Float64Array(outputTotal)
  const nkOmega = new Float64Array(outputTotal)

  const shells = computeRadialShells(raw, config.radialBinCount)
  const activeDims = raw.gridSize
  const shift = config.fftShiftEnabled

  const gridDims = [
    activeDims[0] ?? 1,
    activeDims[1] ?? 1,
    activeDims[2] ?? 1,
  ]

  let gridNkMax = 0

  for (let oz = 0; oz < G; oz++) {
    for (let oy = 0; oy < G; oy++) {
      for (let ox = 0; ox < G; ox++) {
        const outIdx = (oz * G + oy) * G + ox
        const outCoords = [ox, oy, oz]

        // Map output voxel to k-space coordinate
        let valid = true
        let kSq = 0

        for (let d = 0; d < 3; d++) {
          const N = gridDims[d]!
          if (N <= 1) {
            const center = Math.floor(G / 2)
            if (Math.abs(outCoords[d]! - center) > 0) valid = false
            continue
          }
          const offset = Math.floor((G - N) / 2)
          let kIdx = outCoords[d]! - offset
          if (kIdx < 0 || kIdx >= N) {
            valid = false
            break
          }
          if (shift) {
            kIdx = (kIdx + Math.floor(N / 2)) % N
          }
          // Compute |k| component from lattice momentum
          const a = raw.spacing[d] ?? 1.0
          const sinVal = Math.sin((Math.PI * kIdx) / N)
          const kLat = (2 * sinVal) / a
          kSq += kLat * kLat
        }

        if (!valid) continue

        const kMagVal = Math.sqrt(kSq)
        const bin = Math.min(shells.binCount - 1, Math.floor((kMagVal / shells.kMax) * (shells.binCount - 1)))

        const n = shells.shellMeanNk[bin]!
        nk[outIdx] = n
        kNorm[outIdx] = shells.shellKCenter[bin]!
        omegaNorm[outIdx] = shells.shellOmegaCenter[bin]!
        nkOmega[outIdx] = n * shells.shellOmegaCenter[bin]!

        if (n > gridNkMax) gridNkMax = n
      }
    }
  }

  return { nk, kNorm, omegaNorm, nkOmega, nkMax: gridNkMax }
}
