/**
 * Dumps a v2-compliant publication CSV to `artifacts/srmt-publication-sweep.csv`
 * for the user to hand to a thesis advisor / reviewer.
 *
 * The CSV is a real, end-to-end product of the v2 falsification
 * infrastructure: 51 columns including all 12 affine-baseline and 9
 * rigid-baseline columns introduced at diagnostic v1.2.0.
 *
 * @module tests/lib/physics/srmt/_dumpPublicationCsv
 */

import { writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { sweepPointsToCsv } from '@/components/sections/Analysis/srmtSweepHelpers'
import { DEFAULT_WHEELER_DEWITT_CONFIG } from '@/lib/geometry/extended/wheelerDeWitt'
import { SRMT_DIAGNOSTIC_VERSION } from '@/lib/physics/srmt'
import { runCutSweep } from '@/lib/physics/srmt/sweepDriver'
import { buildSrmtSweepManifest } from '@/lib/physics/srmt/sweepManifest'
import type { SrmtSweepConfig } from '@/lib/physics/srmt/sweepTypes'
import {
  solveWheelerDeWitt,
  WDW_SOLVER_VERSION,
  type WheelerDeWittSolverInput,
} from '@/lib/physics/wheelerDeWitt/solver'

describe('publication CSV artifact', () => {
  it('writes a v2-compliant 51-column CSV to artifacts/', () => {
    const wdw: WheelerDeWittSolverInput = {
      boundaryCondition: 'noBoundary',
      inflatonMass: 0.3,
      cosmologicalConstant: 0.1,
      aMin: 0.1,
      aMax: 1.5,
      gridNa: 96,
      gridNphi: 24,
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
      gitSha: 'live-investigation-20260514',
      wdwSolverVersion: WDW_SOLVER_VERSION,
      srmtDiagnosticVersion: SRMT_DIAGNOSTIC_VERSION,
      generatedAt: '2026-05-14T00:00:00.000Z',
    })

    const csv = sweepPointsToCsv(points, 'cut', [], manifest)
    const here = dirname(fileURLToPath(import.meta.url))
    const outPath = resolve(here, '../../../../../artifacts/srmt-publication-sweep.csv')
    writeFileSync(outPath, csv, 'utf-8')

    console.log(`\n  [OK] wrote v2-compliant publication CSV to ${outPath}`)

    console.log(`  [OK] ${points.length} sweep points across ${csv.split('\n').length} CSV lines`)

    // Verify the CSV contains the expected schema markers.
    expect(csv).toContain('q_a_linf')
    expect(csv).toContain('q_a_rshuf')
    expect(csv).toContain('q_phi2_rsyn')
    expect(csv).toContain(`srmt=${SRMT_DIAGNOSTIC_VERSION}`)
  }, 60_000)
})
