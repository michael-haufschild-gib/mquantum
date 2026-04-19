/**
 * Tests for the SRMT sweep reproducibility manifest.
 *
 * Pins the exact lines and fields emitted so archived CSVs can be
 * reproduced six months later: a silent drop of `# git:` or `# solver:`
 * would turn a published plot into a dead-end artefact, which is the
 * failure mode this manifest exists to prevent.
 */
import { describe, expect, it } from 'vitest'

import { DEFAULT_WHEELER_DEWITT_CONFIG } from '@/lib/geometry/extended/wheelerDeWitt'
import { buildSrmtSweepManifest } from '@/lib/physics/srmt/sweepManifest'
import type { SrmtSweepConfig } from '@/lib/physics/srmt/sweepTypes'

const WDW = {
  ...DEFAULT_WHEELER_DEWITT_CONFIG,
  boundaryCondition: 'tunneling' as const,
  inflatonMass: 0.42,
  cosmologicalConstant: -0.125,
  aMin: 0.1,
  aMax: 1.2,
  gridNa: 48,
  gridNphi: 13,
  phiExtent: 1.5,
}

const SWEEP: SrmtSweepConfig = {
  kind: 'mass',
  points: 9,
  clocks: ['a', 'phi1'],
  rankCap: 24,
  cutNormalized: 0.5,
  phiRef: 0.75,
  sweepMin: 0.1,
  sweepMax: 1.5,
}

function findLine(lines: readonly string[], prefix: string): string {
  const found = lines.find((l) => l.startsWith(prefix))
  if (!found) throw new Error(`missing manifest line with prefix "${prefix}"`)
  return found
}

describe('buildSrmtSweepManifest', () => {
  it('emits the six expected provenance lines with a fixed generatedAt', () => {
    const lines = buildSrmtSweepManifest({
      wdwConfig: WDW,
      srmtConfig: SWEEP,
      gitSha: 'abc1234',
      wdwSolverVersion: '1.0.0',
      srmtDiagnosticVersion: '1.0.0',
      generatedAt: '2026-04-19T10:00:00.000Z',
    })
    expect(lines).toHaveLength(6)
    expect(lines[0]).toBe('# generated: 2026-04-19T10:00:00.000Z')
    expect(lines[1]).toBe('# git: abc1234')
    expect(lines[2]).toBe('# solver: wdw=1.0.0 srmt=1.0.0')
    expect(findLine(lines, '# wdw: ')).toBe(
      '# wdw: boundaryCondition=tunneling inflatonMass=0.420000 ' +
        'cosmologicalConstant=-0.125000 aMin=0.100000 aMax=1.20000 ' +
        'gridNa=48 gridNphi=13 phiExtent=1.50000'
    )
    expect(findLine(lines, '# srmt: ')).toBe(
      '# srmt: kind=mass points=9 clocks=a+phi1 rankCap=24 ' +
        'cutNormalized=0.500000 phiRef=0.750000 sweepMin=0.100000 sweepMax=1.50000'
    )
    expect(findLine(lines, '# grid: ')).toMatch(
      /^# grid: Na=48 Nphi=13 da=0\.0234\d+ dphi=0\.250000$/
    )
  })

  it('omits the generated line when generatedAt is null', () => {
    const lines = buildSrmtSweepManifest({
      wdwConfig: WDW,
      srmtConfig: SWEEP,
      gitSha: 'abc1234',
      wdwSolverVersion: '1.0.0',
      srmtDiagnosticVersion: '1.0.0',
      generatedAt: null,
    })
    expect(lines).toHaveLength(5)
    expect(lines.find((l) => l.startsWith('# generated'))).toBeUndefined()
    expect(lines[0]).toBe('# git: abc1234')
  })

  it('accepts a Date object and normalises it to ISO', () => {
    const when = new Date('2026-04-19T12:34:56.000Z')
    const lines = buildSrmtSweepManifest({
      wdwConfig: WDW,
      srmtConfig: SWEEP,
      gitSha: 'abc1234',
      wdwSolverVersion: '1.0.0',
      srmtDiagnosticVersion: '1.0.0',
      generatedAt: when,
    })
    expect(lines[0]).toBe('# generated: 2026-04-19T12:34:56.000Z')
  })

  it('defaults clocks to a+phi1+phi2 when the sweep config list is empty', () => {
    const lines = buildSrmtSweepManifest({
      wdwConfig: WDW,
      srmtConfig: { ...SWEEP, clocks: [] },
      gitSha: 'abc1234',
      wdwSolverVersion: '1.0.0',
      srmtDiagnosticVersion: '1.0.0',
      generatedAt: null,
    })
    expect(findLine(lines, '# srmt: ')).toContain('clocks=a+phi1+phi2')
  })

  it('sanitises newlines and hash chars in string inputs so the manifest stays single-line per row', () => {
    const lines = buildSrmtSweepManifest({
      wdwConfig: WDW,
      srmtConfig: SWEEP,
      gitSha: 'bad\nvalue',
      wdwSolverVersion: '1.0.0',
      srmtDiagnosticVersion: '1#0#0',
      generatedAt: null,
    })
    expect(findLine(lines, '# git: ')).toBe('# git: bad_value')
    expect(findLine(lines, '# solver: ')).toBe('# solver: wdw=1.0.0 srmt=1_0_0')
  })

  it('computes grid spacing as (aMax - aMin) / (gridNa - 1) and 2·phiExtent / (gridNphi - 1)', () => {
    const lines = buildSrmtSweepManifest({
      wdwConfig: { ...WDW, gridNa: 3, gridNphi: 5, aMin: 0, aMax: 2, phiExtent: 2 },
      srmtConfig: SWEEP,
      gitSha: 'abc1234',
      wdwSolverVersion: '1.0.0',
      srmtDiagnosticVersion: '1.0.0',
      generatedAt: null,
    })
    // da = (2 - 0)/(3 - 1) = 1.00000
    // dphi = 2·2/(5 - 1) = 1.00000
    expect(findLine(lines, '# grid: ')).toBe('# grid: Na=3 Nphi=5 da=1.00000 dphi=1.00000')
  })

  it('emits NaN for non-finite numerics rather than crashing — defensive sanity', () => {
    const lines = buildSrmtSweepManifest({
      wdwConfig: { ...WDW, inflatonMass: Number.NaN },
      srmtConfig: SWEEP,
      gitSha: 'abc1234',
      wdwSolverVersion: '1.0.0',
      srmtDiagnosticVersion: '1.0.0',
      generatedAt: null,
    })
    expect(findLine(lines, '# wdw: ')).toContain('inflatonMass=NaN')
  })

  it('clocks list is sorted so dispatch-order variations produce byte-identical manifests', () => {
    // `['phi1', 'a']` (runtime dispatch order chosen for CPU-cost reasons)
    // and `['a', 'phi1']` (UI-picker order) represent the same set of
    // clocks. The provenance record must be insensitive to this choice.
    const lineA = buildSrmtSweepManifest({
      wdwConfig: WDW,
      srmtConfig: { ...SWEEP, clocks: ['a', 'phi1'] },
      gitSha: 'abc1234',
      wdwSolverVersion: '1.0.0',
      srmtDiagnosticVersion: '1.0.0',
      generatedAt: null,
    })
    const lineB = buildSrmtSweepManifest({
      wdwConfig: WDW,
      srmtConfig: { ...SWEEP, clocks: ['phi1', 'a'] },
      gitSha: 'abc1234',
      wdwSolverVersion: '1.0.0',
      srmtDiagnosticVersion: '1.0.0',
      generatedAt: null,
    })
    expect(lineA.join('\n')).toBe(lineB.join('\n'))
    expect(findLine(lineA, '# srmt: ')).toContain('clocks=a+phi1')
  })

  it('output is byte-identical across two calls with the same inputs — reproducibility contract', () => {
    const run = () =>
      buildSrmtSweepManifest({
        wdwConfig: WDW,
        srmtConfig: SWEEP,
        gitSha: 'abc1234',
        wdwSolverVersion: '1.0.0',
        srmtDiagnosticVersion: '1.0.0',
        generatedAt: '2026-04-19T10:00:00.000Z',
      })
    expect(run().join('\n')).toBe(run().join('\n'))
  })
})
