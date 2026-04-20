/**
 * Shared SRMT sweep CSV helpers for Playwright specs.
 *
 * The SRMT sweep export produces a two-table CSV:
 *  1. The main 29-column table with per-point `q`, `α`, `β`, `rEff`,
 *     `floorFrac` diagnostics — what every existing analysis spec
 *     consumes.
 *  2. A per-point spectra tail block introduced for the α-identification
 *     pipeline — rows of shape `point,clock,kind,values` where `values`
 *     is a `|`-delimited `Float32Array` of `K_n` / `E_n` spectrum
 *     entries.
 *
 * The tail is OPTIONAL for legacy parsers: the delimiter is a `#`
 * comment line, and this module exposes the delimiter so a spec can
 * cleanly split the CSV and ignore the tail without re-implementing the
 * split logic in every spec.
 *
 * @module scripts/playwright/helpers/srmt-csv
 */

/**
 * Line that marks the start of the per-point spectra tail block.
 * Must stay byte-identical to
 * {@link ../../../src/components/sections/Analysis/srmtSweepHelpers.SRMT_SWEEP_SPECTRA_TAIL_MARKER}.
 */
export const SRMT_SWEEP_SPECTRA_TAIL_MARKER = '# ---- spectra tail ----'

/** Column header of the tail block, emitted immediately after the marker. */
export const SRMT_SWEEP_SPECTRA_TAIL_HEADER = 'point,clock,kind,values'

/**
 * Split a full SRMT sweep CSV into its main-table text and optional
 * spectra-tail text. The main text is byte-identical to what the CSV
 * looked like before the tail block existed, so downstream parsers can
 * keep their fixed `cells.length` guards intact.
 *
 * @param csv - Full CSV as produced by `sweepPointsToCsv`.
 * @returns `main` — everything up to (but excluding) the tail marker
 *   line, with any trailing blank separator line stripped.
 *   `tail` — the tail text starting at the marker line, or `null` when
 *   no marker is present (legacy CSVs from before the tail existed).
 */
export function splitSrmtSweepCsv(csv: string): { main: string; tail: string | null } {
  const markerIdx = csv.indexOf(SRMT_SWEEP_SPECTRA_TAIL_MARKER)
  if (markerIdx < 0) return { main: csv, tail: null }
  // The serialiser emits exactly one blank separator line between the
  // main block and the tail marker, so the bytes just before `markerIdx`
  // are `\n\n`. Drop a single `\n` from `main` so it matches the
  // byte-for-byte shape the legacy (tail-less) CSV had.
  let cutoff = markerIdx
  if (cutoff > 0 && csv[cutoff - 1] === '\n') cutoff -= 1
  const main = csv.slice(0, cutoff)
  const tail = csv.slice(markerIdx)
  return { main, tail }
}
