/**
 * The "Semiclassical Worldline" effect's render-hot-path optimisation
 * splits the density packer into
 *
 *   1. `packWdwDensityGrid(..., scratch)` — baseline pack without the
 *      travelling pulse (physics-dirty events only).
 *   2. `applyWdwPulseAlpha(baseline, baselineAlpha, pulseOverlay, ...)`
 *      — alpha-only rewrite that runs once per animating frame.
 *
 * This file locks the invariant that the two paths together produce
 * byte-for-byte the same RGBA16F texels as the legacy single-call pack
 * with the pulse overlay baked in. If this invariant breaks the
 * Wheeler–DeWitt worldline overlay will start to flicker, ghost, or
 * drift out of sync with the baseline R/G/B channels.
 *
 * Regression context: pre-split, the full pack ran once per playing
 * frame and iterated 96³ voxels through `sampleChiTrilinear`, `atan2`,
 * `log`, and 4× `float32ToFloat16` plus a fresh 7.5 MB allocation per
 * frame. The observed frame rate collapsed from 60 FPS to ~1 FPS.
 */

import { describe, expect, it } from 'vitest'

import {
  applyWdwPulseAlpha,
  applyWdwPulseAlphaRows,
  packWdwDensityGrid,
  resetWdwPulseAlphaRows,
} from '@/lib/physics/wheelerDeWitt/densityGrid'
import type { WheelerDeWittSolverOutput } from '@/lib/physics/wheelerDeWitt/solver'
import {
  buildPulseOverlay,
  integrateWkbTrajectories,
} from '@/lib/physics/wheelerDeWitt/wkbStreamlines'

/**
 * Build a non-trivial solver output with both Lorentzian and Euclidean
 * regions so WKB trajectories integrate, the streamline overlay has
 * non-zero cells, and the pulse actually hits both the baseline's A
 * channel and the animation-tick path.
 */
function makeOutput(Na: number, Nphi: number): WheelerDeWittSolverOutput {
  const slab = Nphi * Nphi
  const chi = new Float32Array(2 * Na * slab)
  const mask = new Uint8Array(Na * slab).fill(1)
  // Synthetic χ = exp(i·k·a) cos(π·φ₁/extent) — smooth, non-zero, with
  // a non-trivial phase so trajectories integrate.
  for (let ia = 0; ia < Na; ia++) {
    const a = 0.1 + (1.5 - 0.1) * (ia / Math.max(1, Na - 1))
    for (let i1 = 0; i1 < Nphi; i1++) {
      const phi = -2 + 4 * (i1 / Math.max(1, Nphi - 1))
      for (let i2 = 0; i2 < Nphi; i2++) {
        const idx = ia * slab + i1 * Nphi + i2
        const amp = Math.cos((Math.PI * phi) / 2) + 0.5
        chi[2 * idx] = amp * Math.cos(6 * a)
        chi[2 * idx + 1] = amp * Math.sin(6 * a)
      }
    }
  }
  return {
    chi,
    lorentzianMask: mask,
    bandKind: new Uint8Array(Na * slab),
    gridSize: [Na, Nphi, Nphi],
    aMin: 0.1,
    aMax: 1.5,
    phiExtent: 2,
    maxDensity: 1,
    columnAiry: [],
  }
}

function makeBaselineDensity(targetGridSize: number): {
  baselineDensity: Uint16Array
  baselineAlpha: Float32Array
} {
  const voxelCount = targetGridSize ** 3
  const baselineDensity = new Uint16Array(4 * voxelCount)
  for (let i = 0; i < baselineDensity.length; i++) {
    baselineDensity[i] = (i * 37 + 11) & 0xffff
  }
  const baselineAlpha = new Float32Array(voxelCount).fill(0.05)
  return { baselineDensity, baselineAlpha }
}

function solverIndex(
  ia: number,
  iPhi1: number,
  iPhi2: number,
  solverGridSize: [number, number, number]
): number {
  const [, Nphi] = solverGridSize
  return ia * Nphi * Nphi + iPhi1 * Nphi + iPhi2
}

function makeSparsePulse(
  activeIndex: number,
  solverGridSize: [number, number, number]
): { intensity: Float32Array; maxIntensity: number; activeIndices: number[] } {
  const [Na, Nphi] = solverGridSize
  const intensity = new Float32Array(Na * Nphi * Nphi)
  intensity[activeIndex] = 1
  return { intensity, maxIntensity: 1, activeIndices: [activeIndex] }
}

describe('Wheeler-DeWitt worldline pulse — fast path byte-equivalence', () => {
  const Na = 16
  const Nphi = 8
  const N = 24 // small density grid keeps the test under 1 ms
  const output = makeOutput(Na, Nphi)
  const trajectories = integrateWkbTrajectories(output, {
    density: 4,
    maxSteps: 24,
    splatRadius: 0.8,
  })

  it('produces at least one trajectory for the synthetic output', () => {
    expect(trajectories.length).toBeGreaterThan(0)
  })

  it('legacy single-call pack equals baseline + animation-tick for the pulse overlay', () => {
    const pulse = buildPulseOverlay(trajectories, 0.37, 0.12, 0.8, [Na, Nphi, Nphi])

    // Legacy path: single call bakes the pulse directly into A.
    const legacy = packWdwDensityGrid(output, pulse, undefined, N, 100)

    // New path: baseline pack (no pulse) fills R/G/B + zero A, then
    // `applyWdwPulseAlpha` overwrites A per voxel.
    const baselineDensity = new Uint16Array(4 * N * N * N)
    const baselineAlpha = new Float32Array(N * N * N)
    packWdwDensityGrid(output, null, undefined, N, 100, {
      density: baselineDensity,
      baselineAlpha,
    })
    const workingBuffer = new Uint16Array(4 * N * N * N)
    applyWdwPulseAlpha(baselineDensity, baselineAlpha, pulse, [Na, Nphi, Nphi], N, workingBuffer)

    expect(workingBuffer).toEqual(legacy.density)
  })

  it('row-delta updater matches the dense animation-tick path', () => {
    const activeIndices: number[] = []
    const pulse = buildPulseOverlay(
      trajectories,
      0.37,
      0.12,
      0.8,
      [Na, Nphi, Nphi],
      undefined,
      activeIndices
    )

    const baselineDensity = new Uint16Array(4 * N * N * N)
    const baselineAlpha = new Float32Array(N * N * N)
    packWdwDensityGrid(output, null, undefined, N, 100, {
      density: baselineDensity,
      baselineAlpha,
    })
    const denseBuffer = new Uint16Array(4 * N * N * N)
    const rowBuffer = new Uint16Array(baselineDensity)
    applyWdwPulseAlpha(baselineDensity, baselineAlpha, pulse, [Na, Nphi, Nphi], N, denseBuffer)
    const dirtyRows = applyWdwPulseAlphaRows(
      baselineDensity,
      baselineAlpha,
      pulse,
      [Na, Nphi, Nphi],
      N,
      rowBuffer,
      {}
    )

    expect(dirtyRows.length).toBeGreaterThan(0)
    expect(rowBuffer).toEqual(denseBuffer)
  })

  it('row-delta updater restores rows from the previous sparse pulse before applying a moved pulse', () => {
    const solverGridSize: [number, number, number] = [8, 8, 8]
    const targetGridSize = 8
    const { baselineDensity, baselineAlpha } = makeBaselineDensity(targetGridSize)
    const firstPulse = makeSparsePulse(solverIndex(1, 1, 1, solverGridSize), solverGridSize)
    const movedPulse = makeSparsePulse(solverIndex(6, 6, 6, solverGridSize), solverGridSize)
    const scratch = {}
    const rowBuffer = new Uint16Array(baselineDensity)

    const firstDirtyRows = [
      ...applyWdwPulseAlphaRows(
        baselineDensity,
        baselineAlpha,
        firstPulse,
        solverGridSize,
        targetGridSize,
        rowBuffer,
        scratch
      ),
    ]
    expect(firstDirtyRows.length).toBeGreaterThan(0)

    const denseMovedPulse = new Uint16Array(baselineDensity.length)
    applyWdwPulseAlpha(
      baselineDensity,
      baselineAlpha,
      movedPulse,
      solverGridSize,
      targetGridSize,
      denseMovedPulse
    )
    const movedDirtyRows = [
      ...applyWdwPulseAlphaRows(
        baselineDensity,
        baselineAlpha,
        movedPulse,
        solverGridSize,
        targetGridSize,
        rowBuffer,
        scratch
      ),
    ]

    expect(movedDirtyRows).toEqual(expect.arrayContaining(firstDirtyRows))
    expect(new Set(movedDirtyRows).size).toBe(movedDirtyRows.length)
    expect(movedDirtyRows.length).toBeGreaterThan(firstDirtyRows.length)
    expect(rowBuffer).toEqual(denseMovedPulse)
  })

  it('resetWdwPulseAlphaRows clears stale row tracking after a full baseline upload', () => {
    const solverGridSize: [number, number, number] = [8, 8, 8]
    const targetGridSize = 8
    const { baselineDensity, baselineAlpha } = makeBaselineDensity(targetGridSize)
    const pulse = makeSparsePulse(solverIndex(1, 1, 1, solverGridSize), solverGridSize)
    const scratch = {}
    const rowBuffer = new Uint16Array(baselineDensity)

    const dirtyRows = [
      ...applyWdwPulseAlphaRows(
        baselineDensity,
        baselineAlpha,
        pulse,
        solverGridSize,
        targetGridSize,
        rowBuffer,
        scratch
      ),
    ]
    expect(dirtyRows.length).toBeGreaterThan(0)

    resetWdwPulseAlphaRows(scratch)
    rowBuffer.set(baselineDensity)
    const postResetDirtyRows = [
      ...applyWdwPulseAlphaRows(
        baselineDensity,
        baselineAlpha,
        null,
        solverGridSize,
        targetGridSize,
        rowBuffer,
        scratch
      ),
    ]

    expect(postResetDirtyRows).toEqual([])
    expect(rowBuffer).toEqual(baselineDensity)
  })

  it('animation-tick with null pulse equals the baseline byte-for-byte', () => {
    const baselineDensity = new Uint16Array(4 * N * N * N)
    const baselineAlpha = new Float32Array(N * N * N)
    packWdwDensityGrid(output, null, undefined, N, 100, {
      density: baselineDensity,
      baselineAlpha,
    })
    const workingBuffer = new Uint16Array(4 * N * N * N)
    applyWdwPulseAlpha(baselineDensity, baselineAlpha, null, [Na, Nphi, Nphi], N, workingBuffer)
    expect(workingBuffer).toEqual(baselineDensity)
  })

  it('animation-tick reuses the caller-supplied destination buffer (no fresh allocation)', () => {
    const baselineDensity = new Uint16Array(4 * N * N * N)
    const baselineAlpha = new Float32Array(N * N * N)
    packWdwDensityGrid(output, null, undefined, N, 100, {
      density: baselineDensity,
      baselineAlpha,
    })
    const workingBuffer = new Uint16Array(4 * N * N * N)
    const before = workingBuffer.buffer
    const pulse = buildPulseOverlay(trajectories, 0.1, 0.12, 0.8, [Na, Nphi, Nphi])
    applyWdwPulseAlpha(baselineDensity, baselineAlpha, pulse, [Na, Nphi, Nphi], N, workingBuffer)
    expect(workingBuffer.buffer).toBe(before)
  })

  it('buildPulseOverlay with scratch buffer produces same splat as fresh allocation', () => {
    const scratch = new Float32Array(Na * Nphi * Nphi)
    scratch.fill(999) // Prime with a poison value to prove zeroing works.
    const withScratch = buildPulseOverlay(trajectories, 0.5, 0.12, 0.8, [Na, Nphi, Nphi], scratch)
    const freshPulse = buildPulseOverlay(trajectories, 0.5, 0.12, 0.8, [Na, Nphi, Nphi])
    expect(withScratch.intensity).toEqual(freshPulse.intensity)
    expect(withScratch.intensity).toBe(scratch)
  })
})
