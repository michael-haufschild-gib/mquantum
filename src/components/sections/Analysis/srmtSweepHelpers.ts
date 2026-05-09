/**
 * Pure helpers for the SRMT sweep UI.
 *
 * Extracted from `SrmtSweepSection.tsx` so the section file stays under
 * the `max-lines` budget and the `react-refresh/only-export-components`
 * rule is satisfied (the section only exports components).
 *
 * @module components/sections/Analysis/srmtSweepHelpers
 */

import { findChampionClock, type SrmtClock } from '@/lib/physics/srmt'
import type {
  SrmtSweepKind,
  SrmtSweepLandmark,
  SrmtSweepPoint,
} from '@/lib/physics/srmt/sweepTypes'

/**
 * Delimiter line marking the start of the per-point spectra tail block
 * emitted by {@link sweepPointsToCsv}. Legacy parsers that only consume
 * the main 30-column table should stop row accumulation when this line
 * appears — the rows that follow have a different schema (4 cells) and
 * would otherwise trip fixed-width column guards.
 */
export const SRMT_SWEEP_SPECTRA_TAIL_MARKER = '# ---- spectra tail ----'

/** Column header for the tail block: one row per (point, clock, kind). */
export const SRMT_SWEEP_SPECTRA_TAIL_HEADER = 'point,clock,kind,values'

function isLineEnd(csv: string, idx: number): boolean {
  if (idx >= csv.length) return true
  const next = csv[idx]
  return next === '\n' || next === '\r'
}

interface CsvScanStep {
  inQuotedCell: boolean
  lineStart: boolean
  nextIndex: number
}

function tailMarkerStartsAt(
  csv: string,
  idx: number,
  lineStart: boolean,
  inQuotedCell: boolean
): boolean {
  if (inQuotedCell || !lineStart || !csv.startsWith(SRMT_SWEEP_SPECTRA_TAIL_MARKER, idx)) {
    return false
  }
  const afterMarker = idx + SRMT_SWEEP_SPECTRA_TAIL_MARKER.length
  return isLineEnd(csv, afterMarker)
}

function advanceQuoteScan(csv: string, idx: number, inQuotedCell: boolean): CsvScanStep {
  if (inQuotedCell && csv[idx + 1] === '"') {
    return { inQuotedCell, lineStart: false, nextIndex: idx + 1 }
  }
  return { inQuotedCell: !inQuotedCell, lineStart: false, nextIndex: idx }
}

function advanceLineBreakScan(csv: string, idx: number, inQuotedCell: boolean): CsvScanStep {
  if (inQuotedCell) return { inQuotedCell, lineStart: false, nextIndex: idx }
  const nextIndex = csv[idx] === '\r' && csv[idx + 1] === '\n' ? idx + 1 : idx
  return { inQuotedCell, lineStart: true, nextIndex }
}

function advanceTailMarkerScan(csv: string, idx: number, inQuotedCell: boolean): CsvScanStep {
  const ch = csv[idx]
  if (ch === '"') return advanceQuoteScan(csv, idx, inQuotedCell)
  if (ch === '\n' || ch === '\r') return advanceLineBreakScan(csv, idx, inQuotedCell)
  return { inQuotedCell, lineStart: false, nextIndex: idx }
}

function findTailMarkerLine(csv: string): number {
  let lineStart = true
  let inQuotedCell = false
  for (let i = 0; i < csv.length; i++) {
    if (tailMarkerStartsAt(csv, i, lineStart, inQuotedCell)) return i
    const next = advanceTailMarkerScan(csv, i, inQuotedCell)
    inQuotedCell = next.inQuotedCell
    lineStart = next.lineStart
    i = next.nextIndex
  }
  return -1
}

function lineBreakLengthEndingAt(csv: string, idx: number): number {
  if (idx <= 0) return 0
  const prev = csv[idx - 1]
  if (prev === '\n') return idx > 1 && csv[idx - 2] === '\r' ? 2 : 1
  return prev === '\r' ? 1 : 0
}

function stripBlankSeparatorLine(csv: string, markerIdx: number): number {
  const markerPrefixBreak = lineBreakLengthEndingAt(csv, markerIdx)
  if (markerPrefixBreak === 0) return markerIdx
  const separatorStart = markerIdx - markerPrefixBreak
  const separatorPrefixBreak = lineBreakLengthEndingAt(csv, separatorStart)
  return separatorPrefixBreak > 0 ? separatorStart : markerIdx
}

/**
 * Split a full SRMT sweep CSV into its main-table text and optional
 * spectra-tail text. Marker detection is structural: the marker must be
 * an unquoted full line, so manifest text or RFC-4180 quoted cells that
 * happen to contain the marker bytes do not truncate the main table.
 */
export function splitSrmtSweepCsv(csv: string): { main: string; tail: string | null } {
  const markerIdx = findTailMarkerLine(csv)
  if (markerIdx < 0) return { main: csv, tail: null }
  const afterMarker = markerIdx + SRMT_SWEEP_SPECTRA_TAIL_MARKER.length
  const headerStart = csv[afterMarker] === '\r' ? afterMarker + 2 : afterMarker + 1
  if (!csv.startsWith(SRMT_SWEEP_SPECTRA_TAIL_HEADER, headerStart)) {
    return { main: csv, tail: null }
  }
  const cutoff = stripBlankSeparatorLine(csv, markerIdx)
  const main = csv.slice(0, cutoff)
  const tail = csv.slice(markerIdx)
  return { main, tail }
}

const SRMT_CLOCKS_IN_TAIL_ORDER: readonly SrmtClock[] = ['a', 'phi1', 'phi2']

/** Indices where the winning clock changes across consecutive sweep points. */
export interface ChampionFlip {
  index: number
  sweepValue: number
  newChampion: SrmtClock
}

/**
 * Minimum effective Schmidt rank required before a point's champion
 * clock counts as meaningful. Below this the spectrum has too few
 * non-trivial modes for the `K ≈ α·E + β` fit to discriminate between
 * clocks — the "winner" reflects floor-pinning of K_n, not physics
 * (see `/tmp/srmt-tunneling-bc-analysis.md`, where tunneling-φ₁'s
 * `r_eff = 4` produced a false `q_phi1 < q_a` inversion).
 */
const CHAMPION_MIN_REFF = 8

/**
 * Return `true` when a sweep point's effective-rank diagnostics clear
 * the publication gate — every clock with a reported `rEff` meets the
 * {@link CHAMPION_MIN_REFF} threshold. Points that predate the
 * `rEffByClock` field (no `rEffByClock` at all) pass unconditionally
 * so downstream UIs loading historical fixtures still render.
 */
function passesChampionGate(p: SrmtSweepPoint): boolean {
  const rEff = p.rEffByClock
  if (!rEff) return true
  for (const clock of ['a', 'phi1', 'phi2'] as const) {
    const r = rEff[clock]
    if (r !== undefined && r < CHAMPION_MIN_REFF) return false
  }
  return true
}

/**
 * Find indices where the champion clock changes (non-null →
 * different non-null). Ties (either side null) are skipped so the
 * marker renders only on decisive transitions, which is what the UI
 * wants.
 *
 * ## Publication gate
 *
 * Points whose effective Schmidt rank falls below
 * {@link CHAMPION_MIN_REFF} on any clock are treated as "no champion"
 * — their `findChampionClock` result is discarded before the
 * transition scan. This suppresses spurious flips driven by
 * floor-pinned K_n vectors rather than genuine clock preference. The
 * gate is UI-visible: such points render the plot line but never
 * mark a champion flip.
 *
 * @param points - The streamed sweep points, ascending-index order.
 * @returns Flip events; empty when one clock dominates the whole sweep.
 */
export function computeChampionFlips(points: SrmtSweepPoint[]): ChampionFlip[] {
  const out: ChampionFlip[] = []
  const champions = points.map((p) => {
    if (!passesChampionGate(p)) return null
    return findChampionClock({
      a: p.quality.a ?? Number.NaN,
      phi1: p.quality.phi1 ?? Number.NaN,
      phi2: p.quality.phi2 ?? Number.NaN,
    })
  })
  for (let i = 1; i < champions.length; i++) {
    const prev = champions[i - 1]
    const cur = champions[i]
    if (prev && cur && prev !== cur) {
      out.push({ index: i, sweepValue: points[i]!.sweepValue, newChampion: cur })
    }
  }
  return out
}

/**
 * Match cells that need defusing before Excel / LibreOffice / Google
 * Sheets interpret them as formulas (OWASP WSTG-INPV-14). Numeric
 * negatives like `-0.5` are *not* formulas — they parse as numbers — so
 * the `-`/`+` branch only triggers when the rest of the cell is not a
 * well-formed signed number, preserving numeric semantics in the export.
 */
const CSV_FORMULA_TRIGGERS = /^[=@\t\r]|^[+-](?!\d|\.\d)/

/**
 * Format a single CSV field: RFC-4180 quoting for embedded commas /
 * quotes / newlines, plus a leading apostrophe on formula triggers.
 * Numeric and enum fields in the SRMT sweep export are machine-generated
 * so the injection risk is theoretical — but the downstream user
 * trusts the CSV opened in Excel, so defuse the vector before it ships.
 */
function csvCell(value: string): string {
  let v = value
  if (CSV_FORMULA_TRIGGERS.test(v)) v = `'${v}`
  if (/[",\n\r]/.test(v)) v = `"${v.replace(/"/g, '""')}"`
  return v
}

/**
 * Serialise sweep points to CSV. Emits a comment block with landmark
 * metadata followed by a stable column header and one row per point.
 * Each cell is passed through {@link csvCell} for RFC-4180 compliance
 * and formula-injection hardening.
 *
 * When a `manifest` is supplied (built by
 * {@link buildSrmtSweepManifest}), its `# `-prefixed lines are inserted
 * between the leading `# SRMT sweep, kind=<kind>` line and the landmark
 * block so the full provenance stays visible in every archived export.
 *
 * ## Spectra tail block
 *
 * After the main 30-column table, a secondary table is appended:
 *
 * ```
 * # ---- spectra tail ----
 * point,clock,kind,values
 * 0,a,K,-8.247689|-6.620331|…
 * 0,a,E,0.5123456|1.487234|…
 * ```
 *
 * One row per `(point, clock, kind ∈ {K, E})` where the underlying
 * spectrum Float32Array is populated. The `values` cell pipe-delimits
 * `.toPrecision(7)` numbers — pipes never collide with CSV delimiters,
 * so the cell requires no RFC-4180 quoting in practice but still passes
 * through {@link csvCell} for formula-injection hardening.
 *
 * The tail is OPTIONAL for downstream parsers: the marker line is a
 * `#` comment and can be recognised to break out of a main-row loop
 * that enforces a fixed cell width (see
 * {@link SRMT_SWEEP_SPECTRA_TAIL_MARKER}). The marker and sub-header
 * are always emitted, even when no spectra are present, so consumers
 * can key off a stable "tail begins here" signal.
 *
 * @param manifest - Reproducibility manifest lines (git SHA, solver
 *   versions, wdw + srmt config, grid info). Default `[]` preserves the
 *   legacy minimal header for callers (e.g. Lanczos-determinism tests)
 *   that don't have a sweep config snapshot to pin.
 */
export function sweepPointsToCsv(
  points: SrmtSweepPoint[],
  kind: SrmtSweepKind,
  landmarks: SrmtSweepLandmark[],
  manifest: readonly string[] = []
): string {
  const header = [
    `# SRMT sweep, kind=${kind}`,
    ...manifest,
    ...landmarks
      .filter((l) => l.sweepValueAtLandmark !== null)
      .map(
        (l) =>
          `# landmark clock=${l.clock} abs=${l.absoluteCoordinate?.toFixed(6)} norm=${l.sweepValueAtLandmark?.toFixed(6)}`
      ),
    // Sigma columns interleave each q column (jackknife stdev, see
    // {@link jackknifeAffineFitStdev}). The user-visible contract is
    // "every published q ships with its σ" — never collapse these.
    // q_rigid_* columns follow the same pattern for the strict-α=1
    // metric; see docs/physics/srmt-metric.md for why both are emitted.
    // alpha_* / beta_* are the raw least-squares parameters from the
    // affine fit `K ≈ α·E + β`; exposed here so the unit-conversion
    // factor hidden inside `q_affine` (which `α` carries across many
    // decades when `q_rigid / q_affine ≫ 1`) is visible in the CSV.
    // rEff_* / floorFrac_* are spectrum-degeneracy diagnostics: rEff
    // is the count of Schmidt modes with `(s_n/s_0)² > 1e-6`,
    // floorFrac is the fraction of the top-rankCap `K_n` pinned
    // within 1.5 nats of the ε-floor. A claim rooted in points with
    // `rEff < 8` or `floorFrac ≥ 0.25` is probably a metric artifact
    // — the champion-clock UI gate reflects the same rule.
    // Total column count: 30 — Playwright CSV parsers tolerate `>= 29`
    // so the trailing `coupledGridNa` column can be appended without
    // breaking existing readers. `coupledGridNa` is populated only for
    // `gridNphiCoupled` (empty on every other kind). Never reorder
    // existing columns.
    [
      'index',
      'sweepValue',
      'sweepValueBc',
      'cutNormalized',
      'q_a',
      'q_a_sigma',
      'q_a_rigid',
      'q_a_rigid_sigma',
      'alpha_a',
      'beta_a',
      'rEff_a',
      'floorFrac_a',
      'q_phi1',
      'q_phi1_sigma',
      'q_phi1_rigid',
      'q_phi1_rigid_sigma',
      'alpha_phi1',
      'beta_phi1',
      'rEff_phi1',
      'floorFrac_phi1',
      'q_phi2',
      'q_phi2_sigma',
      'q_phi2_rigid',
      'q_phi2_rigid_sigma',
      'alpha_phi2',
      'beta_phi2',
      'rEff_phi2',
      'floorFrac_phi2',
      'computeMs',
      'coupledGridNa',
    ].join(','),
  ].join('\n')
  const rows = points.map((p) =>
    [
      String(p.index),
      String(p.sweepValue),
      p.sweepValueBc ?? '',
      String(p.cutNormalized),
      formatNumber(p.quality.a),
      formatNumber(p.qStdev?.a),
      formatNumber(p.qRigid?.a),
      formatNumber(p.qRigidStdev?.a),
      formatNumber(p.alphaByClock?.a),
      formatNumber(p.betaByClock?.a),
      formatNumber(p.rEffByClock?.a),
      formatNumber(p.floorFractionByClock?.a),
      formatNumber(p.quality.phi1),
      formatNumber(p.qStdev?.phi1),
      formatNumber(p.qRigid?.phi1),
      formatNumber(p.qRigidStdev?.phi1),
      formatNumber(p.alphaByClock?.phi1),
      formatNumber(p.betaByClock?.phi1),
      formatNumber(p.rEffByClock?.phi1),
      formatNumber(p.floorFractionByClock?.phi1),
      formatNumber(p.quality.phi2),
      formatNumber(p.qStdev?.phi2),
      formatNumber(p.qRigid?.phi2),
      formatNumber(p.qRigidStdev?.phi2),
      formatNumber(p.alphaByClock?.phi2),
      formatNumber(p.betaByClock?.phi2),
      formatNumber(p.rEffByClock?.phi2),
      formatNumber(p.floorFractionByClock?.phi2),
      p.computeMs.toFixed(1),
      p.coupledGridNa !== undefined ? String(p.coupledGridNa) : '',
    ]
      .map(csvCell)
      .join(',')
  )
  const tailRows: string[] = []
  for (const p of points) {
    for (const clock of SRMT_CLOCKS_IN_TAIL_ORDER) {
      const k = p.kSpectrumByClock[clock]
      if (k && k.length > 0) {
        tailRows.push([String(p.index), clock, 'K', formatSpectrumCell(k)].map(csvCell).join(','))
      }
      const e = p.hjSpectrumByClock[clock]
      if (e && e.length > 0) {
        tailRows.push([String(p.index), clock, 'E', formatSpectrumCell(e)].map(csvCell).join(','))
      }
    }
  }
  const tail = ['', SRMT_SWEEP_SPECTRA_TAIL_MARKER, SRMT_SWEEP_SPECTRA_TAIL_HEADER, ...tailRows]
  return [header, ...rows, ...tail].join('\n') + '\n'
}

/**
 * Serialise a `Float32Array` as a pipe-delimited list of
 * 7-significant-digit decimals. Pipes are chosen so the cell contains
 * no CSV delimiters (comma / newline / double-quote), keeping the
 * encoded spectrum a single un-quoted CSV cell.
 */
function formatSpectrumCell(values: Float32Array): string {
  const parts: string[] = new Array(values.length)
  for (let i = 0; i < values.length; i++) {
    const v = values[i]!
    parts[i] = Number.isFinite(v) ? v.toPrecision(7) : String(v)
  }
  return parts.join('|')
}

/**
 * Shape of the sweep UI state the section holds in React.
 * Mirrors the private `SweepUiState` in `SrmtSweepSection.tsx` —
 * duplicated here so the helper can be used without a circular import.
 */
export interface SrmtSweepUiState {
  kind: SrmtSweepKind
  points: number
  sweepMin: number
  sweepMax: number
  phiRef: number
  cutAnchor: number
}

/**
 * Return a UI-state clamped so `phiRef` (and, for `kind='phiRef'`, the
 * sweep bounds) stay inside `[0, phiExtent]`. Returns the original state
 * reference when no field changes, so React.useState short-circuits the
 * re-render when phiExtent grew rather than shrank.
 */
export function clampUiStateToPhiExtent(s: SrmtSweepUiState, phiExtent: number): SrmtSweepUiState {
  const clamp = (v: number): number => Math.min(Math.max(v, 0), phiExtent)
  const phiRef = clamp(s.phiRef)
  if (s.kind !== 'phiRef') {
    return phiRef === s.phiRef ? s : { ...s, phiRef }
  }
  const sweepMin = clamp(s.sweepMin)
  const sweepMax = Math.min(phiExtent, Math.max(sweepMin + 0.05, clamp(s.sweepMax)))
  if (phiRef === s.phiRef && sweepMin === s.sweepMin && sweepMax === s.sweepMax) return s
  return { ...s, phiRef, sweepMin, sweepMax }
}

/** Human label for the sweep-axis annotation on the plot. */
export function labelForKind(kind: SrmtSweepKind): string {
  if (kind === 'cut') return 'cut normalised'
  if (kind === 'mass') return 'inflaton mass m'
  if (kind === 'lambda') return 'cosmological constant Λ'
  if (kind === 'phiRef') return 'φref (landmark reference)'
  if (kind === 'rankCap') return 'rankCap'
  if (kind === 'phiExtent') return 'φextent'
  if (kind === 'gridNa') return 'gridN_a'
  if (kind === 'gridNphi') return 'gridN_φ'
  if (kind === 'gridNphiCoupled') return 'gridN_φ (coupled N_a)'
  return 'boundary condition'
}

function formatNumber(v: number | undefined): string {
  if (v === undefined || !Number.isFinite(v)) return ''
  return v.toPrecision(6)
}
