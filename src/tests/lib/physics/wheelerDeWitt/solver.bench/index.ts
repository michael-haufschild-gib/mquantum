/**
 * Wheeler–DeWitt solver performance benchmark.
 *
 * The solver runs synchronously on the main thread every time a
 * Wheeler–DeWitt physics field (boundary condition, inflaton mass,
 * cosmological constant, grid dims, `a_{min,max}`, `phiExtent`) changes.
 * The target budget is ≤ 20 ms at the default grid so interactive
 * parameter sweeps stay at 60 fps.
 *
 * Run: pnpm exec vitest bench --run src/tests/lib/physics/wheelerDeWitt/solver.bench
 *
 * Adjust the `bench.options` if / when algorithmic changes shift the
 * baseline; regressions will show as `.bench.ts` runs that exceed the
 * prior mean by a margin visible in the `vitest bench` output.
 *
 * @module tests/lib/physics/wheelerDeWitt/solver.bench
 */

import { bench, describe } from 'vitest'

import { DEFAULT_WHEELER_DEWITT_CONFIG as D } from '@/lib/geometry/extended/wheelerDeWitt'
import {
  applyWdwPulseAlpha,
  applyWdwPulseAlphaRows,
  packWdwDensityGrid,
  WDW_EUCLIDEAN_RENDER_HEADROOM,
} from '@/lib/physics/wheelerDeWitt/densityGrid'
import {
  solveWheelerDeWitt,
  type WheelerDeWittSolverInput3D,
} from '@/lib/physics/wheelerDeWitt/solver'
import { wdwOperatorResidual } from '@/lib/physics/wheelerDeWitt/solverDiagnostics'
import {
  buildPulseOverlay,
  buildStaticOverlay,
  DEFAULT_STREAMLINE_INPUT,
  integrateWkbTrajectories,
} from '@/lib/physics/wheelerDeWitt/wkbStreamlines'

/**
 * Store-default Wheeler–DeWitt input, derived from
 * `DEFAULT_WHEELER_DEWITT_CONFIG` so the "default grid" numbers cannot drift
 * from what users actually solve (the hand-copied literal had gone stale:
 * Nphi 32 / phiExtent 2 vs the shipped 40 / 3.5).
 */
const DEFAULT_INPUT: WheelerDeWittSolverInput3D = {
  boundaryCondition: D.boundaryCondition,
  inflatonMass: D.inflatonMass,
  cosmologicalConstant: D.cosmologicalConstant,
  aMin: D.aMin,
  aMax: D.aMax,
  gridNa: D.gridNa,
  gridNphi: D.gridNphi,
  phiExtent: D.phiExtent,
}
const DEFAULT_GRID_LABEL = `Na=${D.gridNa}, Nphi=${D.gridNphi}`

const LOW_GRID_INPUT: WheelerDeWittSolverInput3D = { ...DEFAULT_INPUT, gridNa: 64, gridNphi: 16 }
const HIGH_GRID_INPUT: WheelerDeWittSolverInput3D = { ...DEFAULT_INPUT, gridNa: 192 }

describe(`Wheeler–DeWitt solver — default grid (${DEFAULT_GRID_LABEL})`, () => {
  bench(
    'Hartle–Hawking BC',
    () => {
      solveWheelerDeWitt({ ...DEFAULT_INPUT, boundaryCondition: 'noBoundary' })
    },
    { time: 500, warmupIterations: 3 }
  )

  bench(
    'Vilenkin BC',
    () => {
      solveWheelerDeWitt({ ...DEFAULT_INPUT, boundaryCondition: 'tunneling' })
    },
    { time: 500, warmupIterations: 3 }
  )

  bench(
    'DeWitt BC',
    () => {
      solveWheelerDeWitt({ ...DEFAULT_INPUT, boundaryCondition: 'deWitt' })
    },
    { time: 500, warmupIterations: 3 }
  )
})

describe('Wheeler–DeWitt solver — grid-size scaling', () => {
  bench(
    'Low grid (Na=64, Nphi=16)',
    () => {
      solveWheelerDeWitt(LOW_GRID_INPUT)
    },
    { time: 500, warmupIterations: 3 }
  )

  bench(
    `Default grid (${DEFAULT_GRID_LABEL})`,
    () => {
      solveWheelerDeWitt(DEFAULT_INPUT)
    },
    { time: 500, warmupIterations: 3 }
  )

  bench(
    `High grid (Na=192, Nphi=${D.gridNphi})`,
    () => {
      solveWheelerDeWitt(HIGH_GRID_INPUT)
    },
    { time: 500, warmupIterations: 3 }
  )
})

describe('Wheeler–DeWitt downstream — trajectory + overlay', () => {
  const out = solveWheelerDeWitt(DEFAULT_INPUT)

  bench(
    'WKB trajectory integration (default config)',
    () => {
      integrateWkbTrajectories(out, DEFAULT_STREAMLINE_INPUT)
    },
    { time: 500, warmupIterations: 3 }
  )

  const trajectories = integrateWkbTrajectories(out, DEFAULT_STREAMLINE_INPUT)

  bench(
    'Static overlay splat (default config)',
    () => {
      buildStaticOverlay(trajectories, DEFAULT_STREAMLINE_INPUT.splatRadius, out.gridSize)
    },
    { time: 500, warmupIterations: 3 }
  )

  const densityGridSize = 96
  const pulseIntensityScratch = new Float32Array(
    out.gridSize[0] * out.gridSize[1] * out.gridSize[2]
  )
  const pulseActiveScratch: number[] = []
  const baselineDensity = new Uint16Array(4 * densityGridSize * densityGridSize * densityGridSize)
  const baselineAlpha = new Float32Array(densityGridSize * densityGridSize * densityGridSize)
  const workingDensity = new Uint16Array(4 * densityGridSize * densityGridSize * densityGridSize)
  const rowDensity = new Uint16Array(4 * densityGridSize * densityGridSize * densityGridSize)
  const pulseRowScratch = {}
  packWdwDensityGrid(out, null, undefined, densityGridSize, WDW_EUCLIDEAN_RENDER_HEADROOM, {
    density: baselineDensity,
    baselineAlpha,
  })
  rowDensity.set(baselineDensity)

  bench(
    'Worldline pulse splat (default config)',
    () => {
      buildPulseOverlay(
        trajectories,
        0.37,
        0.08,
        DEFAULT_STREAMLINE_INPUT.splatRadius,
        out.gridSize,
        pulseIntensityScratch,
        pulseActiveScratch
      )
    },
    { time: 500, warmupIterations: 3 }
  )

  const pulseActiveIndices: number[] = []
  const pulse = buildPulseOverlay(
    trajectories,
    0.37,
    0.08,
    DEFAULT_STREAMLINE_INPUT.splatRadius,
    out.gridSize,
    new Float32Array(out.gridSize[0] * out.gridSize[1] * out.gridSize[2]),
    pulseActiveIndices
  )

  bench(
    'Worldline alpha animation tick (96^3 density texture)',
    () => {
      applyWdwPulseAlpha(
        baselineDensity,
        baselineAlpha,
        pulse,
        out.gridSize,
        densityGridSize,
        workingDensity
      )
    },
    { time: 500, warmupIterations: 3 }
  )

  bench(
    'Worldline row-delta animation tick (96^3 density texture)',
    () => {
      applyWdwPulseAlphaRows(
        baselineDensity,
        baselineAlpha,
        pulse,
        out.gridSize,
        densityGridSize,
        rowDensity,
        pulseRowScratch
      )
    },
    { time: 500, warmupIterations: 3 }
  )

  bench(
    'Operator residual check (full grid, band-filtered)',
    () => {
      wdwOperatorResidual(out, DEFAULT_INPUT)
    },
    { time: 500, warmupIterations: 3 }
  )
})
