/**
 * SRMT sweep CSV reproducibility manifest.
 *
 * Six months after an experiment, the plot published from the exported
 * CSV is worthless without the exact physics + numerical knobs that
 * produced it. This module emits a machine-parseable block of
 * `#`-prefixed comment lines that pins:
 *
 *   - the Wheeler–DeWitt physics config at sweep start
 *     (`# wdw: boundaryCondition=… inflatonMass=… …`)
 *   - the SRMT sweep config snapshot
 *     (`# srmt: kind=… points=… clocks=… rankCap=… …`)
 *   - the derived grid info (`# grid: Na=… Nphi=… da=… dphi=…`)
 *   - the git SHA of the build (`# git: 8398bd4a`)
 *   - the solver + diagnostic semver tags (`# solver: wdw=1.0.0 srmt=1.0.0`)
 *   - the generation timestamp (`# generated: 2026-04-19T10:21:00.000Z`)
 *
 * The builder does NOT emit the leading `# SRMT sweep, kind=<kind>` line —
 * {@link sweepPointsToCsv} still owns that. Manifest lines are inserted
 * between the kind line and the landmark lines so the human-eye read is:
 * "what is this? → which physics? → which landmarks? → data".
 *
 * Pure function. Values are passed in; no global lookups, no I/O. Tests
 * pass a fixed `generatedAt` string for byte-exact determinism.
 *
 * @module lib/physics/srmt/sweepManifest
 */

import type { WheelerDeWittConfig } from '@/lib/geometry/extended/wheelerDeWitt'

import type { SrmtSweepConfig } from './sweepTypes'

/** Inputs to {@link buildSrmtSweepManifest}. */
export interface SrmtSweepManifestInputs {
  /** Wheeler–DeWitt config snapshot captured at sweep start. */
  wdwConfig: WheelerDeWittConfig
  /** SRMT sweep config actually dispatched (post-default-merge). */
  srmtConfig: SrmtSweepConfig
  /** Short git SHA from {@link getGitSha}. */
  gitSha: string
  /** Semver tag of the Wheeler–DeWitt solver (e.g. `'1.0.0'`). */
  wdwSolverVersion: string
  /** Semver tag of the SRMT diagnostic pipeline. */
  srmtDiagnosticVersion: string
  /**
   * Timestamp for the `# generated:` line. Defaults to `new Date()` at
   * call time. Pass a fixed ISO string to produce byte-exact CSVs in
   * tests, or `null` to suppress the line entirely (useful when the
   * downstream tool should stamp its own time instead).
   */
  generatedAt?: Date | string | null
}

/**
 * Build the manifest comment lines. Each entry is a single logical line
 * with no trailing `\n` — the caller joins them.
 */
export function buildSrmtSweepManifest(inputs: SrmtSweepManifestInputs): readonly string[] {
  const { wdwConfig, srmtConfig, gitSha, wdwSolverVersion, srmtDiagnosticVersion, generatedAt } =
    inputs

  const lines: string[] = []

  const generatedLine = formatGeneratedLine(generatedAt)
  if (generatedLine) lines.push(generatedLine)

  lines.push(`# git: ${sanitise(gitSha)}`)
  lines.push(`# solver: wdw=${sanitise(wdwSolverVersion)} srmt=${sanitise(srmtDiagnosticVersion)}`)
  lines.push(`# wdw: ${formatWdwConfig(wdwConfig)}`)
  lines.push(`# srmt: ${formatSrmtConfig(srmtConfig)}`)
  lines.push(`# grid: ${formatGridInfo(wdwConfig)}`)

  return lines
}

function formatGeneratedLine(value: Date | string | null | undefined): string | null {
  if (value === null) return null
  if (value === undefined) return `# generated: ${new Date().toISOString()}`
  if (typeof value === 'string') return `# generated: ${sanitise(value)}`
  return `# generated: ${value.toISOString()}`
}

function formatWdwConfig(w: WheelerDeWittConfig): string {
  return [
    `boundaryCondition=${sanitise(w.boundaryCondition)}`,
    `inflatonMass=${formatNumeric(w.inflatonMass)}`,
    `cosmologicalConstant=${formatNumeric(w.cosmologicalConstant)}`,
    `aMin=${formatNumeric(w.aMin)}`,
    `aMax=${formatNumeric(w.aMax)}`,
    `gridNa=${formatInteger(w.gridNa)}`,
    `gridNphi=${formatInteger(w.gridNphi)}`,
    `phiExtent=${formatNumeric(w.phiExtent)}`,
  ].join(' ')
}

function formatSrmtConfig(c: SrmtSweepConfig): string {
  // Normalise clock ordering so a provenance record never depends on the
  // runtime dispatch order (e.g., `['phi1', 'a']` from a URL-decoded set
  // vs. `['a', 'phi1']` from a UI picker must produce byte-identical
  // manifests for the same {clock-set, physics} pair). Dispatch order
  // belongs in runtime logs, not provenance.
  const clocksList = c.clocks.length > 0 ? [...c.clocks].sort().join('+') : 'a+phi1+phi2'
  return [
    `kind=${sanitise(c.kind)}`,
    `points=${formatInteger(c.points)}`,
    `clocks=${sanitise(clocksList)}`,
    `rankCap=${formatInteger(c.rankCap)}`,
    `cutNormalized=${formatNumeric(c.cutNormalized)}`,
    `phiRef=${formatNumeric(c.phiRef)}`,
    `sweepMin=${formatNumeric(c.sweepMin)}`,
    `sweepMax=${formatNumeric(c.sweepMax)}`,
  ].join(' ')
}

function formatGridInfo(w: WheelerDeWittConfig): string {
  const Na = w.gridNa
  const Nphi = w.gridNphi
  const da = Na > 1 ? (w.aMax - w.aMin) / (Na - 1) : 0
  const dphi = Nphi > 1 ? (2 * w.phiExtent) / (Nphi - 1) : 0
  return [
    `Na=${formatInteger(Na)}`,
    `Nphi=${formatInteger(Nphi)}`,
    `da=${formatNumeric(da)}`,
    `dphi=${formatNumeric(dphi)}`,
  ].join(' ')
}

/**
 * Format a numeric field at 6-significant-digit precision. Mirrors the
 * CSV data-row convention in `srmtSweepHelpers.ts` so manifest numbers
 * and data-row numbers parse the same way downstream.
 */
function formatNumeric(v: number): string {
  if (!Number.isFinite(v)) return 'NaN'
  return v.toPrecision(6)
}

function formatInteger(v: number): string {
  if (!Number.isFinite(v)) return 'NaN'
  return String(Math.trunc(v))
}

/**
 * Strip characters that would break the single-line manifest format
 * (newlines, carriage returns, hash chars that could pretend to be a
 * new comment line). Manifest lines are already `#`-prefixed so they're
 * not interpreted as data by RFC-4180 parsers, but defensive sanitation
 * keeps downstream regex scans (`grep '^# git: '`) unambiguous.
 */
function sanitise(v: string): string {
  return v.replace(/[\r\n#]/g, '_')
}
