/**
 * Density distribution analysis for uncertainty boundary extraction.
 *
 * Decodes Float16 density textures, builds sorted density distributions,
 * and computes confidence-mass thresholds for quantum uncertainty boundaries.
 *
 * @module rendering/webgpu/passes/DensityDistributionAnalysis
 */

import { useDiagnosticsStore } from '@/stores/diagnosticsStore'

// PERF: Precomputed 2^(exponent-15) lookup table for Float16 decoding.
// Exponents 0..30 (31 is Inf/NaN handled separately). Avoids Math.pow per voxel.
const F16_EXP_TABLE = new Float32Array(31)
for (let e = 0; e < 31; e++) {
  F16_EXP_TABLE[e] = 2 ** (e - 15)
}
const F16_SUBNORM_SCALE = 2 ** -14 / 1024 // for subnormals: 2^-14 * fraction/1024

const CONFIDENCE_MASS_MIN = 0.5
const CONFIDENCE_MASS_MAX = 0.99
const DEFAULT_CONFIDENCE_MASS = 0.68
const DEFAULT_LOG_RHO_THRESHOLD = -2.0
const RHO_EPSILON = 1e-12

/**
 * Decode a Float16 (IEEE 754 half-precision) value to Float32.
 * Uses precomputed exponent lookup table for performance.
 *
 * @param value - Raw uint16 representing a float16
 * @returns Decoded float32 value
 */
function decodeFloat16(value: number): number {
  const sign = (value & 0x8000) !== 0 ? -1 : 1
  const exponent = (value & 0x7c00) >> 10
  const fraction = value & 0x03ff

  if (exponent === 0) {
    return fraction === 0 ? 0 : sign * F16_SUBNORM_SCALE * fraction
  }
  if (exponent === 0x1f) {
    return fraction === 0 ? sign * Number.POSITIVE_INFINITY : Number.NaN
  }
  return sign * F16_EXP_TABLE[exponent]! * (1 + fraction / 1024)
}

/**
 * Analyzes density volume data to extract confidence-mass uncertainty thresholds.
 *
 * Maintains a sorted density distribution and cumulative mass array,
 * enabling fast threshold recomputation when confidence mass changes
 * without re-reading the GPU texture.
 */
export class DensityDistributionAnalyzer {
  private sortedRhoValues: Float32Array | null = null
  private prefixMass: Float64Array | null = null
  private totalMass = 0
  private logRhoThreshold = DEFAULT_LOG_RHO_THRESHOLD
  private confidenceMass = DEFAULT_CONFIDENCE_MASS
  // PERF: Reusable scratch buffer for density distribution (avoids 1MB allocation per readback)
  private distributionScratch: Float32Array | null = null

  getLogRhoThreshold(): number {
    return this.logRhoThreshold
  }

  /**
   * Set confidence mass and recompute threshold from cached distribution.
   * Clamped to [0.5, 0.99].
   *
   * @param confidenceMass - Desired confidence mass fraction
   */
  setConfidenceMass(confidenceMass: number): void {
    const clamped = Math.max(CONFIDENCE_MASS_MIN, Math.min(CONFIDENCE_MASS_MAX, confidenceMass))
    if (Math.abs(clamped - this.confidenceMass) < 1e-6) return
    this.confidenceMass = clamped
    this.recomputeThreshold()
  }

  /**
   * Build sorted density distribution from readback texture data.
   * Pushes diagnostics to the density diagnostics store for e2e testing.
   *
   * @param halfView - Raw Uint16 data from mapped GPU readback buffer
   * @param gridSize - Grid resolution per axis
   * @param readbackBytesPerRow - Aligned row stride in bytes
   * @param readbackBytesPerTexel - Bytes per texel (2 for r16float, 8 for rgba16float)
   * @param readbackTexelStrideHalfs - Uint16 stride per texel (1 or 4)
   * @param worldBound - Current world-space bound for diagnostics
   */
  buildDistribution(
    halfView: Uint16Array,
    gridSize: number,
    readbackBytesPerRow: number,
    readbackBytesPerTexel: number,
    readbackTexelStrideHalfs: number,
    worldBound: number
  ): void {
    const maxValues = gridSize * gridSize * gridSize
    if (!this.distributionScratch || this.distributionScratch.length < maxValues) {
      this.distributionScratch = new Float32Array(maxValues)
    }
    const values = this.distributionScratch
    const texelsPerRow = readbackBytesPerRow / readbackBytesPerTexel
    let count = 0

    for (let z = 0; z < gridSize; z++) {
      const zOffsetTexels = z * gridSize * texelsPerRow
      for (let y = 0; y < gridSize; y++) {
        const rowOffsetTexels = zOffsetTexels + y * texelsPerRow
        for (let x = 0; x < gridSize; x++) {
          const texelOffsetHalfs = (rowOffsetTexels + x) * readbackTexelStrideHalfs
          const rho = decodeFloat16(halfView[texelOffsetHalfs] ?? 0)
          if (rho > RHO_EPSILON && Number.isFinite(rho)) {
            values[count++] = rho
          }
        }
      }
    }

    if (count === 0) {
      this.sortedRhoValues = null
      this.prefixMass = null
      this.totalMass = 0
      this.logRhoThreshold = DEFAULT_LOG_RHO_THRESHOLD
      useDiagnosticsStore.getState().pushDensitySnapshot({
        maxDensity: 0,
        totalDensityMass: 0,
        activeVoxelCount: 0,
        centerDensity: 0,
        gridSize,
        worldBound,
      })
      return
    }

    this.sortedRhoValues = values.slice(0, count).sort((a, b) => b - a)
    this.prefixMass = new Float64Array(count)

    let cumulativeMass = 0
    for (let i = 0; i < count; i++) {
      cumulativeMass += this.sortedRhoValues[i] ?? 0
      this.prefixMass[i] = cumulativeMass
    }
    this.totalMass = cumulativeMass
    this.recomputeThreshold()

    // Push density diagnostics for GPU correctness oracle (e2e tests)
    const half = Math.floor(gridSize / 2)
    const centerZ = half * gridSize * texelsPerRow
    const centerY = half * texelsPerRow
    const centerOffset = (centerZ + centerY + half) * readbackTexelStrideHalfs
    const centerDensity = decodeFloat16(halfView[centerOffset] ?? 0)

    const store = useDiagnosticsStore.getState()
    store.pushDensitySnapshot({
      maxDensity: this.sortedRhoValues[0] ?? 0,
      totalDensityMass: cumulativeMass,
      activeVoxelCount: count,
      centerDensity,
      gridSize,
      worldBound,
    })

    // Extract center-plane 1D slices along each axis for wavefunction export.
    // sliceX: vary x, fix y=center, z=center → |ψ(x, y₀, z₀)|²
    // sliceY: vary y, fix x=center, z=center → |ψ(x₀, y, z₀)|²
    // sliceZ: vary z, fix x=center, y=center → |ψ(x₀, y₀, z)|²
    const sliceX = new Float32Array(gridSize)
    const sliceY = new Float32Array(gridSize)
    const sliceZ = new Float32Array(gridSize)

    for (let i = 0; i < gridSize; i++) {
      // sliceX: (x=i, y=half, z=half)
      const xOffset =
        (half * gridSize * texelsPerRow + half * texelsPerRow + i) * readbackTexelStrideHalfs
      sliceX[i] = decodeFloat16(halfView[xOffset] ?? 0)

      // sliceY: (x=half, y=i, z=half)
      const yOffset =
        (half * gridSize * texelsPerRow + i * texelsPerRow + half) * readbackTexelStrideHalfs
      sliceY[i] = decodeFloat16(halfView[yOffset] ?? 0)

      // sliceZ: (x=half, y=half, z=i)
      const zOffset =
        (i * gridSize * texelsPerRow + half * texelsPerRow + half) * readbackTexelStrideHalfs
      sliceZ[i] = decodeFloat16(halfView[zOffset] ?? 0)
    }

    store.pushDensitySlices({
      sliceX,
      sliceY,
      sliceZ,
      sliceGridSize: gridSize,
      sliceWorldBound: worldBound,
    })
  }

  /**
   * Recompute uncertainty log-rho threshold from cached sorted density distribution
   * using binary search on the cumulative mass array.
   */
  private recomputeThreshold(): void {
    if (!this.sortedRhoValues || !this.prefixMass || this.totalMass <= RHO_EPSILON) {
      this.logRhoThreshold = DEFAULT_LOG_RHO_THRESHOLD
      return
    }

    const targetMass = this.totalMass * this.confidenceMass
    let lo = 0
    let hi = this.prefixMass.length - 1

    while (lo < hi) {
      const mid = Math.floor((lo + hi) * 0.5)
      if ((this.prefixMass[mid] ?? Number.POSITIVE_INFINITY) >= targetMass) {
        hi = mid
      } else {
        lo = mid + 1
      }
    }

    const rhoAtTarget = Math.max(this.sortedRhoValues[lo] ?? RHO_EPSILON, RHO_EPSILON)
    this.logRhoThreshold = Math.log(rhoAtTarget)
  }

  /** Release all cached distribution data. */
  reset(): void {
    this.sortedRhoValues = null
    this.prefixMass = null
    this.totalMass = 0
    this.logRhoThreshold = DEFAULT_LOG_RHO_THRESHOLD
    this.distributionScratch = null
  }
}
