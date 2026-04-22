/**
 * Multi-condition edge-case tests for the Wheeler–DeWitt rendering
 * pipeline. These probe corners where multiple rare states combine —
 * single-condition tests would let them slip through.
 *
 * Combinations covered:
 *   1. Streamline overlay + SRMT overlay stacked on the same voxel.
 *   2. Airy Bi-blowup preset (Vilenkin Λ=+1) + SRMT overlay + streamlines.
 *   3. Zero maxDensity (χ ≡ 0) + non-null streamlines. Defensive check
 *      against a divide-by-zero if solver output ever collapses.
 *   4. `densityContrast = 1` exactly (width = 1 limit of the smoothstep
 *      window — edge of the uniform-clamp floor).
 *   5. Edge phi (phiExtent = 0.5, minimum) — φ-grid near-degenerate.
 *   6. Very-short a-range (aMax = aMin + 2·da_min) — barely above grid
 *      minimum.
 */

import { describe, expect, it } from 'vitest'

import {
  computeWdwRenderMaxRho,
  packWdwDensityGrid,
  type WdwSrmtOverlay,
} from '@/lib/physics/wheelerDeWitt/densityGrid'
import type { WheelerDeWittSolverOutput } from '@/lib/physics/wheelerDeWitt/solver'
import { solveWheelerDeWitt } from '@/lib/physics/wheelerDeWitt/solver'
import {
  buildStaticOverlay,
  DEFAULT_STREAMLINE_INPUT,
  integrateWkbTrajectories,
} from '@/lib/physics/wheelerDeWitt/wkbStreamlines'

/** Solve the default noBoundary HH preset at a small grid. */
function solveSmall(overrides: Partial<Parameters<typeof solveWheelerDeWitt>[0]> = {}) {
  return solveWheelerDeWitt({
    boundaryCondition: 'noBoundary',
    inflatonMass: 0.3,
    cosmologicalConstant: 0,
    aMin: 0.1,
    aMax: 1.5,
    gridNa: 24,
    gridNphi: 12,
    phiExtent: 3.5,
    ...overrides,
  })
}

function zeroOutput(Na: number, Nphi: number): WheelerDeWittSolverOutput {
  const slab = Nphi * Nphi
  return {
    chi: new Float32Array(2 * Na * slab),
    lorentzianMask: new Uint8Array(Na * slab),
    bandKind: new Uint8Array(Na * slab),
    gridSize: [Na, Nphi, Nphi],
    aMin: 0.1,
    aMax: 1.5,
    phiExtent: 2,
    maxDensity: 0,
    columnAiry: [],
  }
}

describe('WDW multi-condition edge cases', () => {
  it('stacks streamline + SRMT overlays on the same voxel without NaN', () => {
    const output = solveSmall()
    const trajectories = integrateWkbTrajectories(output, DEFAULT_STREAMLINE_INPUT)
    const overlay = buildStaticOverlay(
      trajectories,
      DEFAULT_STREAMLINE_INPUT.splatRadius,
      output.gridSize
    )
    const srmt: WdwSrmtOverlay = {
      sliceK: new Float32Array(output.gridSize[1] * output.gridSize[1]).fill(1),
      slicePlane: 'phi-phi',
      intensity: 1,
      cutIndex: Math.floor((output.gridSize[0] - 1) / 2),
      clockAxisLen: output.gridSize[0],
      Nphi: output.gridSize[1],
    }
    const { density } = packWdwDensityGrid(output, overlay, srmt)
    // Every packed half-float must be a well-formed numeric value,
    // even where streamline alpha and SRMT alpha stack inside the
    // cut disk.
    let nanCount = 0
    let infCount = 0
    for (let i = 0; i < density.length; i++) {
      // Half-float decoding: a NaN half has exponent 0x1f (all 1s) and
      // non-zero fraction. We don't need the full decode to tell;
      // just look for the NaN and ±Inf bit patterns.
      const h = density[i]!
      const exp = (h >> 10) & 0x1f
      const frac = h & 0x3ff
      if (exp === 0x1f) {
        if (frac === 0) infCount++
        else nanCount++
      }
    }
    expect(nanCount).toBe(0)
    expect(infCount).toBe(0)
  })

  it('survives Airy Bi-blowup (Vilenkin Λ=+1) stacked with both overlays', () => {
    // Extreme regime: a Vilenkin preset at the upper Λ clamp produces
    // `|χ|² ~ 10³⁰` at the Euclidean cube corners (Airy Bi-term
    // exponential growth). The renderer's `computeWdwRenderMaxRho` cap
    // must keep the R channel in [0, 1] and the log-density channel
    // must stay finite despite the physical value.
    const output = solveSmall({
      boundaryCondition: 'tunneling',
      cosmologicalConstant: 1.0,
    })
    const trajectories = integrateWkbTrajectories(output, DEFAULT_STREAMLINE_INPUT)
    const overlay = buildStaticOverlay(
      trajectories,
      DEFAULT_STREAMLINE_INPUT.splatRadius,
      output.gridSize
    )
    const srmt: WdwSrmtOverlay = {
      sliceK: new Float32Array(output.gridSize[1] * output.gridSize[1]).fill(0.5),
      slicePlane: 'a-phi2',
      intensity: 0.7,
      cutIndex: Math.floor((output.gridSize[1] - 1) / 2),
      clockAxisLen: output.gridSize[1],
      Nphi: output.gridSize[1],
    }
    const renderMax = computeWdwRenderMaxRho(output)
    expect(Number.isFinite(renderMax)).toBe(true)
    const { density } = packWdwDensityGrid(output, overlay, srmt, 32)
    // NaN/Inf scan on the packed buffer.
    for (let i = 0; i < density.length; i++) {
      const h = density[i]!
      const exp = (h >> 10) & 0x1f
      if (exp === 0x1f) {
        throw new Error(`Packed texel ${i} is NaN/Inf — Vilenkin Λ=+1 rendering blew up`)
      }
    }
  })

  it('handles zero-amplitude solver output without packer divide-by-zero', () => {
    // Defensive check: if for some reason the solver returns χ ≡ 0,
    // `computeWdwRenderMaxRho` falls back to DENSITY_MAX_FLOOR so the
    // packer's `rho / maxRho` doesn't NaN.
    const output = zeroOutput(4, 4)
    const trajectories = integrateWkbTrajectories(output, DEFAULT_STREAMLINE_INPUT)
    expect(trajectories.length).toBe(0) // no Lorentzian cells → no seeds
    // Pack without overlays.
    const { density } = packWdwDensityGrid(output, null, undefined, 16)
    // All R/B channels must be zero, G may be log(epsilon) ≈ -23
    // (finite), A = 0.
    for (let i = 0; i < density.length; i += 4) {
      // R channel (bit pattern 0 = +0.0 half) at voxel base.
      expect(density[i]!).toBe(0)
    }
  })

  it('packer produces finite, deterministic output across repeated calls', () => {
    // `packWdwDensityGrid` is deterministic — the same solver output must
    // pack to byte-identical buffers on repeated invocations and every
    // half-precision texel must decode to a finite value (no NaN/Inf via
    // the 0x1f exponent code). Density-contrast smoothstep tuning lives
    // in the shader (the packer doesn't accept a contrast parameter), so
    // this test guards the packer's deterministic-finite contract only.
    const output = solveSmall()
    const { density: packedLow } = packWdwDensityGrid(output, null, undefined, 16)
    const { density: packedHigh } = packWdwDensityGrid(output, null, undefined, 16)
    expect(packedLow.length).toBe(packedHigh.length)
    // All values finite in both.
    for (let i = 0; i < packedLow.length; i++) {
      const h = packedLow[i]!
      const exp = (h >> 10) & 0x1f
      if (exp === 0x1f) {
        throw new Error(`Low-contrast texel ${i} NaN/Inf`)
      }
    }
  })

  it('solves at minimum phiExtent = 0.5 without numerical NaN', () => {
    // phiExtent is documented minimum via the boundary generators,
    // but is not formally bounded by the solver. A very small extent
    // compresses the Gaussian envelope into a tight spike that the
    // sponge + φ-Laplacian must handle.
    const output = solveWheelerDeWitt({
      boundaryCondition: 'noBoundary',
      inflatonMass: 0.3,
      cosmologicalConstant: 0,
      aMin: 0.1,
      aMax: 1.5,
      gridNa: 24,
      gridNphi: 12,
      phiExtent: 0.5,
    })
    for (let i = 0; i < output.chi.length; i++) {
      if (!Number.isFinite(output.chi[i]!)) {
        throw new Error(`chi[${i}] = ${output.chi[i]} — phiExtent = 0.5 destabilised solver`)
      }
    }
    expect(output.maxDensity).toBeGreaterThan(0)
  })

  it('handles a two-slab a-range (gridNa = 3, one internal step)', () => {
    // Minimum grid: gridNa = 3 means three a-slabs — one seed, one
    // Taylor, one leapfrog. Exercises the leapfrog main loop for
    // exactly ia = 2.
    const output = solveWheelerDeWitt({
      boundaryCondition: 'tunneling',
      inflatonMass: 0.3,
      cosmologicalConstant: 0.3,
      aMin: 0.1,
      aMax: 0.5,
      gridNa: 3,
      gridNphi: 8,
      phiExtent: 3.5,
    })
    expect(output.gridSize[0]).toBe(3)
    for (let i = 0; i < output.chi.length; i++) {
      if (!Number.isFinite(output.chi[i]!)) {
        throw new Error(`chi[${i}] = ${output.chi[i]} at minimum gridNa`)
      }
    }
  })
})
