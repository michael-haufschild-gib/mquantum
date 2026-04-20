/**
 * One-shot diagnostic: Wheeler–DeWitt tunneling-BC q_phi1 inversion.
 *
 * Research task (not a regression test). Discriminates between:
 *   H1 — rank-collapse artifact: tunneling χ's phi1 bipartition has low
 *        effective Schmidt rank, so most K_n saturate at the ε-floor,
 *        α → 0, β → floor, and q_affine is artificially small.
 *   H2 — genuine physics: tunneling BC produces a modular spectrum whose
 *        shape tracks the HJ spectrum under the phi1 clock.
 *
 * Writes `<tmpdir>/srmt-tunneling-analysis.json` with the per-BC per-clock
 * table. Does not assert anything — this test is documentation, not a
 * guard; it prints a summary so vitest surfaces the numbers.
 */

import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import type { WdwBoundaryCondition } from '@/lib/geometry/extended/wheelerDeWitt'
import { DEFAULT_WHEELER_DEWITT_CONFIG } from '@/lib/geometry/extended/wheelerDeWitt'
import { computeRigidFitQuality, fitAffineParams } from '@/lib/physics/srmt/affineFit'
import { hjSpectrumOnSliceTopK } from '@/lib/physics/srmt/hjOperator'
import { modularSpectrum } from '@/lib/physics/srmt/modularHamiltonian'
import { computeVolumeElement, normalizedSchmidtValues } from '@/lib/physics/srmt/schmidt'
import type { SrmtClock } from '@/lib/physics/srmt/types'
import { solveWheelerDeWitt } from '@/lib/physics/wheelerDeWitt/solver'

/** Map normalized cut (∈[0,1]) to interior index [1, axisLen-2]. */
function resolveCutIndex(cutNormalized: number, axisLen: number): number {
  if (axisLen < 3) return 1
  const raw = Math.round(cutNormalized * (axisLen - 1))
  return Math.max(1, Math.min(axisLen - 2, raw))
}

/** Total |χ|² summed over the grid (sanity check on solver output magnitude). */
function chiTotalDensity(chi: Float32Array): number {
  let acc = 0
  for (let i = 0; i < chi.length; i += 2) {
    const re = chi[i]!
    const im = chi[i + 1]!
    acc += re * re + im * im
  }
  return acc
}

/** Count indices where s_n²/s_0² > thresh. Full spectrum. */
function effectiveRank(schmidt: Float64Array, thresh: number): number {
  if (schmidt.length === 0) return 0
  const s0 = schmidt[0]!
  if (s0 <= 0) return 0
  const cutoff = thresh * s0 * s0
  let n = 0
  for (let i = 0; i < schmidt.length; i++) {
    const s = schmidt[i]!
    if (s * s > cutoff) n++
  }
  return n
}

/** Min k such that Σ_{n<k} s_n² / Σ s_n² > 0.9. */
function rank90(schmidt: Float64Array): number {
  let total = 0
  for (let i = 0; i < schmidt.length; i++) total += schmidt[i]! * schmidt[i]!
  if (total <= 0) return 0
  let cum = 0
  const target = 0.9 * total
  for (let i = 0; i < schmidt.length; i++) {
    cum += schmidt[i]! * schmidt[i]!
    if (cum > target) return i + 1
  }
  return schmidt.length
}

/** Fraction of K[0..count-1] within `tol` of the saturation floor. */
function floorFraction(K: Float64Array, count: number, kFloor: number, tol: number): number {
  if (count <= 0) return 0
  let hits = 0
  for (let i = 0; i < count; i++) {
    const k = K[i]!
    if (Math.abs(k - kFloor) <= tol * Math.abs(kFloor)) hits++
  }
  return hits / count
}

interface PerClockRow {
  bc: WdwBoundaryCondition
  clock: SrmtClock
  schmidtLen: number
  chiNormSq: number
  s0: number
  s1: number
  s7: number
  ratio_s1_s0: number
  ratio_s7_s0: number
  topRatios: number[]
  r_eff_1em6: number
  r_eff_1em8: number
  r_90pct: number
  kFloor: number
  K_0: number
  K_1: number
  K_7: number
  K_max: number
  kFloorFraction_kept: number
  compareCount: number
  alpha: number
  beta: number
  q_affine: number
  q_rigid: number
  E_0: number
  E_7: number
  E_last: number
}

describe('SRMT tunneling-BC inversion analysis (one-shot)', () => {
  it('emits per-BC/per-clock Schmidt + modular + HJ spectrum table', () => {
    const BCs: WdwBoundaryCondition[] = ['noBoundary', 'tunneling', 'deWitt']
    const CLOCKS: SrmtClock[] = ['a', 'phi1', 'phi2']
    const cutNorm = 0.5
    const rankCap = 64
    const cfg = DEFAULT_WHEELER_DEWITT_CONFIG

    const rows: PerClockRow[] = []
    const perBcSolveMs: Record<string, number> = {}
    const perBcChiNormSq: Record<string, number> = {}

    for (const bc of BCs) {
      const t0 = Date.now()
      const output = solveWheelerDeWitt({
        boundaryCondition: bc,
        inflatonMass: cfg.inflatonMass,
        cosmologicalConstant: cfg.cosmologicalConstant,
        aMin: cfg.aMin,
        aMax: cfg.aMax,
        gridNa: cfg.gridNa,
        gridNphi: cfg.gridNphi,
        phiExtent: cfg.phiExtent,
      })
      perBcSolveMs[bc] = Date.now() - t0
      const chiNorm = chiTotalDensity(output.chi)
      perBcChiNormSq[bc] = chiNorm

      const [Na, Nphi] = output.gridSize

      // Volume-weighted Σ s_n²·dVol = 1 (task #8): β now reports the
      // genuine zero-of-energy offset; the pre-Frobenius `log(Σ|χ|²)` and
      // pre-volume `log(dVol)` artefacts are both absorbed into the
      // normalisation.
      const dVol = computeVolumeElement({
        gridSize: output.gridSize,
        aMin: output.aMin,
        aMax: output.aMax,
        phiExtent: output.phiExtent,
      })

      for (const clock of CLOCKS) {
        // Volume-weighted Schmidt spectrum (no rank truncation).
        const full = normalizedSchmidtValues(
          { chi: output.chi, gridSize: output.gridSize },
          clock,
          dVol
        )
        const schmidtLen = full.length
        const s0 = full[0] ?? 0
        const s1 = schmidtLen > 1 ? full[1]! : 0
        const s7 = schmidtLen > 7 ? full[7]! : 0
        const topRatios: number[] = []
        for (let i = 0; i < Math.min(8, schmidtLen); i++) {
          topRatios.push(s0 > 0 ? full[i]! / s0 : 0)
        }

        // Build the truncated Schmidt that the sweep used.
        const axisLen = clock === 'a' ? Na : Nphi
        const cutIdx = resolveCutIndex(cutNorm, axisLen)
        const kept = Math.min(rankCap, schmidtLen)
        const trimmed = new Float64Array(kept)
        for (let i = 0; i < kept; i++) trimmed[i] = full[i]!
        const { spectrum: kSpec, epsilon } = modularSpectrum(trimmed)

        // HJ top-k at the same rankCap.
        const { spectrum: hj32 } = hjSpectrumOnSliceTopK(
          clock,
          {
            Na,
            Nphi,
            aMin: output.aMin,
            aMax: output.aMax,
            phiExtent: output.phiExtent,
            inflatonMass: cfg.inflatonMass,
            cosmologicalConstant: cfg.cosmologicalConstant,
            sliceIndex: cutIdx,
          },
          rankCap
        )
        const hj64 = new Float64Array(hj32.length)
        for (let j = 0; j < hj32.length; j++) hj64[j] = hj32[j]!

        const compareCount = Math.min(kSpec.length, hj64.length, rankCap)
        const affine = fitAffineParams(kSpec, hj64, compareCount)
        const qRigid = computeRigidFitQuality(kSpec, hj64, compareCount)
        const kFloor = -Math.log(epsilon)

        rows.push({
          bc,
          clock,
          schmidtLen,
          chiNormSq: chiNorm,
          s0,
          s1,
          s7,
          ratio_s1_s0: s0 > 0 ? s1 / s0 : 0,
          ratio_s7_s0: s0 > 0 ? s7 / s0 : 0,
          topRatios,
          r_eff_1em6: effectiveRank(full, 1e-6),
          r_eff_1em8: effectiveRank(full, 1e-8),
          r_90pct: rank90(full),
          kFloor,
          K_0: kSpec[0] ?? NaN,
          K_1: kSpec.length > 1 ? kSpec[1]! : NaN,
          K_7: kSpec.length > 7 ? kSpec[7]! : NaN,
          K_max: kSpec[kSpec.length - 1] ?? NaN,
          kFloorFraction_kept: floorFraction(kSpec, compareCount, kFloor, 0.01),
          compareCount,
          alpha: affine.alpha,
          beta: affine.beta,
          q_affine: affine.q,
          q_rigid: qRigid,
          E_0: hj64[0] ?? NaN,
          E_7: hj64.length > 7 ? hj64[7]! : NaN,
          E_last: hj64[hj64.length - 1] ?? NaN,
        })
      }
    }

    const outPath = join(tmpdir(), 'srmt-tunneling-analysis.json')
    writeFileSync(
      outPath,
      JSON.stringify(
        {
          meta: {
            note: 'Wheeler-DeWitt tunneling-BC inversion diagnostic',
            cutNormalized: cutNorm,
            rankCap,
            config: cfg,
            solveMs: perBcSolveMs,
            chiNormSq: perBcChiNormSq,
          },
          rows,
        },
        null,
        2
      )
    )
    console.log(`[srmt one-shot] wrote ${outPath} (${rows.length} rows)`)

    // Summary log: per-BC per-clock q_affine and effective rank.
    for (const r of rows) {
      console.log(
        `${r.bc.padEnd(12)} ${r.clock.padEnd(5)} ` +
          `r_eff(1e-6)=${String(r.r_eff_1em6).padStart(3)} ` +
          `r_eff(1e-8)=${String(r.r_eff_1em8).padStart(3)} ` +
          `r90=${String(r.r_90pct).padStart(3)} ` +
          `s1/s0=${r.ratio_s1_s0.toExponential(2)} ` +
          `floorFrac=${r.kFloorFraction_kept.toFixed(3)} ` +
          `α=${r.alpha.toExponential(3)} β=${r.beta.toFixed(2)} ` +
          `q_aff=${r.q_affine.toExponential(3)} q_rig=${r.q_rigid.toExponential(3)}`
      )
    }

    expect(rows.length).toBe(BCs.length * CLOCKS.length)
  }, 120_000)
})
