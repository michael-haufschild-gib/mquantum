/**
 * Wheeler–DeWitt solver performance benchmark.
 *
 * The solver runs synchronously on the main thread every time a
 * Wheeler–DeWitt physics field (boundary condition, inflaton mass,
 * cosmological constant, grid dims, `a_{min,max}`, `phiExtent`) changes.
 * The target budget is ≤ 20 ms at the default grid so interactive
 * parameter sweeps stay at 60 fps.
 *
 * Run: pnpm exec vitest bench src/tests/lib/physics/wheelerDeWitt/solver.bench.ts
 *
 * Adjust the `bench.options` if / when algorithmic changes shift the
 * baseline; regressions will show as `.bench.ts` runs that exceed the
 * prior mean by a margin visible in the `vitest bench` output.
 *
 * @module tests/lib/physics/wheelerDeWitt/solver.bench
 */

import { bench, describe } from 'vitest'

import {
  applyWdwPulseAlpha,
  applyWdwPulseAlphaRows,
  packWdwDensityGrid,
  WDW_EUCLIDEAN_RENDER_HEADROOM,
} from '@/lib/physics/wheelerDeWitt/densityGrid'
import {
  solveWheelerDeWitt,
  type WheelerDeWittSolverInput,
} from '@/lib/physics/wheelerDeWitt/solver'
import { wdwOperatorResidual } from '@/lib/physics/wheelerDeWitt/solverDiagnostics'
import {
  buildPulseOverlay,
  buildStaticOverlay,
  DEFAULT_STREAMLINE_INPUT,
  integrateWkbTrajectories,
} from '@/lib/physics/wheelerDeWitt/wkbStreamlines'

/** Default Wheeler–DeWitt config — mirrors `DEFAULT_WHEELER_DEWITT_CONFIG`. */
const DEFAULT_INPUT: WheelerDeWittSolverInput = {
  boundaryCondition: 'noBoundary',
  inflatonMass: 0.3,
  cosmologicalConstant: 0.0,
  aMin: 0.1,
  aMax: 1.5,
  gridNa: 128,
  gridNphi: 32,
  phiExtent: 2.0,
}

const LOW_GRID_INPUT: WheelerDeWittSolverInput = { ...DEFAULT_INPUT, gridNa: 64, gridNphi: 16 }
const HIGH_GRID_INPUT: WheelerDeWittSolverInput = { ...DEFAULT_INPUT, gridNa: 192, gridNphi: 32 }

describe('Wheeler–DeWitt solver — default grid (Na=128, Nphi=32)', () => {
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
    'Default grid (Na=128, Nphi=32)',
    () => {
      solveWheelerDeWitt(DEFAULT_INPUT)
    },
    { time: 500, warmupIterations: 3 }
  )

  bench(
    'High grid (Na=192, Nphi=32)',
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
