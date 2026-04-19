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

/** Indices where the winning clock changes across consecutive sweep points. */
export interface ChampionFlip {
  index: number
  sweepValue: number
  newChampion: SrmtClock
}

/**
 * Find indices where the champion clock changes (non-null →
 * different non-null). Ties (either side null) are skipped so the
 * marker renders only on decisive transitions, which is what the UI
 * wants.
 *
 * @param points - The streamed sweep points, ascending-index order.
 * @returns Flip events; empty when one clock dominates the whole sweep.
 */
export function computeChampionFlips(points: SrmtSweepPoint[]): ChampionFlip[] {
  const out: ChampionFlip[] = []
  const champions = points.map((p) =>
    findChampionClock({
      a: p.quality.a ?? Number.NaN,
      phi1: p.quality.phi1 ?? Number.NaN,
      phi2: p.quality.phi2 ?? Number.NaN,
    })
  )
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
    [
      'index',
      'sweepValue',
      'sweepValueBc',
      'cutNormalized',
      'q_a',
      'q_a_sigma',
      'q_a_rigid',
      'q_a_rigid_sigma',
      'q_phi1',
      'q_phi1_sigma',
      'q_phi1_rigid',
      'q_phi1_rigid_sigma',
      'q_phi2',
      'q_phi2_sigma',
      'q_phi2_rigid',
      'q_phi2_rigid_sigma',
      'computeMs',
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
      formatNumber(p.quality.phi1),
      formatNumber(p.qStdev?.phi1),
      formatNumber(p.qRigid?.phi1),
      formatNumber(p.qRigidStdev?.phi1),
      formatNumber(p.quality.phi2),
      formatNumber(p.qStdev?.phi2),
      formatNumber(p.qRigid?.phi2),
      formatNumber(p.qRigidStdev?.phi2),
      p.computeMs.toFixed(1),
    ]
      .map(csvCell)
      .join(',')
  )
  return [header, ...rows].join('\n') + '\n'
}

/** Human label for the sweep-axis annotation on the plot. */
export function labelForKind(kind: SrmtSweepKind): string {
  if (kind === 'cut') return 'cut normalised'
  if (kind === 'mass') return 'inflaton mass m'
  if (kind === 'lambda') return 'cosmological constant Λ'
  if (kind === 'phiRef') return 'φref (landmark reference)'
  if (kind === 'rankCap') return 'rankCap'
  if (kind === 'phiExtent') return 'φextent'
  return 'boundary condition'
}

function formatNumber(v: number | undefined): string {
  if (v === undefined || !Number.isFinite(v)) return ''
  return v.toPrecision(6)
}
