/**
 * Shared SRMT sweep CSV helpers for Playwright specs.
 *
 * The SRMT sweep export produces a two-table CSV:
 *  1. The main 30-column table with per-point `q`, `α`, `β`, `rEff`,
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

export {
  splitSrmtSweepCsv,
  SRMT_SWEEP_SPECTRA_TAIL_HEADER,
  SRMT_SWEEP_SPECTRA_TAIL_MARKER,
} from '@/components/sections/Analysis/srmtSweepHelpers'
