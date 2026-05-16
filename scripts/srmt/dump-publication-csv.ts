/* eslint-disable no-console -- CLI script. */
/**
 * Dumps a v2.2-compliant publication CSV at the recommended
 * 192×48 publication grid to `artifacts/srmt-publication-grid-192x48.csv`.
 *
 * Invocation:
 *   pnpm dlx vite-node --options.transformMode.ssr='/.*\/' \
 *     scripts/srmt/dump-publication-csv.ts
 *
 * @module scripts/srmt/dump-publication-csv
 */

import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { sweepPointsToCsv } from '../../src/components/sections/Analysis/srmtSweepHelpers'
import { DEFAULT_WHEELER_DEWITT_CONFIG } from '../../src/lib/geometry/extended/wheelerDeWitt'
import { SRMT_DIAGNOSTIC_VERSION } from '../../src/lib/physics/srmt'
import { runCutSweep } from '../../src/lib/physics/srmt/sweepDriver'
import { buildSrmtSweepManifest } from '../../src/lib/physics/srmt/sweepManifest'
import type { SrmtSweepConfig } from '../../src/lib/physics/srmt/sweepTypes'
import {
  solveWheelerDeWitt,
  type WheelerDeWittSolverInput,
  WDW_SOLVER_VERSION,
} from '../../src/lib/physics/wheelerDeWitt/solver'

const wdw: WheelerDeWittSolverInput = {
  boundaryCondition: 'noBoundary',
  inflatonMass: 0.3,
  cosmologicalConstant: 0.1,
  aMin: 0.1,
  aMax: 1.5,
  gridNa: 192,
  gridNphi: 48,
  phiExtent: 2.0,
}

const cfg: SrmtSweepConfig = {
  kind: 'cut',
  points: 9,
  clocks: ['a', 'phi1', 'phi2'],
  rankCap: 24,
  cutNormalized: 0.5,
  phiRef: 0.75,
  sweepMin: 0.1,
  sweepMax: 0.9,
}

const startedAt = Date.now()
const points = runCutSweep({
  solverOutput: solveWheelerDeWitt(wdw),
  config: cfg,
  physics: {
    inflatonMass: wdw.inflatonMass,
    cosmologicalConstant: wdw.cosmologicalConstant,
  },
})

const manifest = buildSrmtSweepManifest({
  wdwConfig: {
    ...DEFAULT_WHEELER_DEWITT_CONFIG,
    boundaryCondition: wdw.boundaryCondition,
    inflatonMass: wdw.inflatonMass,
    cosmologicalConstant: wdw.cosmologicalConstant,
    aMin: wdw.aMin,
    aMax: wdw.aMax,
    gridNa: wdw.gridNa,
    gridNphi: wdw.gridNphi,
    phiExtent: wdw.phiExtent,
  },
  srmtConfig: cfg,
  gitSha: 'live-investigation-20260514-v2.2',
  wdwSolverVersion: WDW_SOLVER_VERSION,
  srmtDiagnosticVersion: SRMT_DIAGNOSTIC_VERSION,
  generatedAt: '2026-05-14T00:00:00.000Z',
})

const csv = sweepPointsToCsv(points, 'cut', [], manifest)
const here = dirname(fileURLToPath(import.meta.url))
const outDir = resolve(here, '../../artifacts')
mkdirSync(outDir, { recursive: true })
const outPath = resolve(outDir, 'srmt-publication-grid-192x48.csv')
writeFileSync(outPath, csv, 'utf-8')

const elapsedSec = (Date.now() - startedAt) / 1000
console.log(`\n  [OK] wrote v2.2-compliant publication CSV (192×48) to ${outPath}`)
console.log(`  [OK] ${points.length} sweep points across ${csv.split('\n').length} CSV lines`)
console.log(`  [OK] wall-clock: ${elapsedSec.toFixed(1)}s\n`)
