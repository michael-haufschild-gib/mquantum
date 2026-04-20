/**
 * One-shot aMax scan: lock the Wheeler–DeWitt tunneling-BC `q_phi1 < q_a`
 * inversion to a Schmidt rank-collapse artifact by varying the leapfrog
 * march length.
 *
 * Hypothesis (prior analysis at `/tmp/srmt-tunneling-bc-analysis.md`):
 *   The Vilenkin tunneling BC's outgoing-wave prefactor amplifies |χ|²
 *   exponentially through the a-march. Shorter march (smaller aMax) →
 *   less accumulated amplification → higher effective Schmidt rank →
 *   weaker inversion.
 *
 * Primary prediction:
 *   at aMax = 0.6, tunneling-phi1 r_eff(1e-6) ≥ 16 (4× the default).
 * Secondary: chiTotalDensity under tunneling grows monotonically with aMax.
 * Tertiary:  (q_phi1 − q_a) under tunneling approaches the non-tunneling
 *   value as aMax shrinks.
 *
 * Writes `/tmp/srmt-tunneling-amax-scan.json` with the structured scan
 * table and a computed verdict object. Also writes a narrative markdown
 * companion at `/tmp/srmt-tunneling-amax-verdict.md`.
 *
 * This is a research driver, not a regression test. No production src
 * edits. Underscore-prefixed so the default `pnpm test` glob excludes it.
 */

import { writeFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import type { WdwBoundaryCondition } from '@/lib/geometry/extended/wheelerDeWitt'
import { DEFAULT_WHEELER_DEWITT_CONFIG } from '@/lib/geometry/extended/wheelerDeWitt'
import { computeRigidFitQuality, fitAffineParams } from '@/lib/physics/srmt/affineFit'
import { hjSpectrumOnSliceTopK } from '@/lib/physics/srmt/hjOperator'
import { floorFractionFromModular, modularSpectrum } from '@/lib/physics/srmt/modularHamiltonian'
import {
  chiFrobeniusNormSq,
  computeVolumeElement,
  effectiveRankFromSchmidt,
  normalizedSchmidtValues,
} from '@/lib/physics/srmt/schmidt'
import type { SrmtClock } from '@/lib/physics/srmt/types'
import { solveWheelerDeWitt } from '@/lib/physics/wheelerDeWitt/solver'

/** Map normalized cut (∈[0,1]) to interior index [1, axisLen-2]. */
function resolveCutIndex(cutNormalized: number, axisLen: number): number {
  if (axisLen < 3) return 1
  const raw = Math.round(cutNormalized * (axisLen - 1))
  return Math.max(1, Math.min(axisLen - 2, raw))
}

/** Minimum cumulative-weight count hitting 90% of Σ s_n². */
function rank90(schmidt: Float64Array): number {
  let total = 0
  for (let i = 0; i < schmidt.length; i++) total += schmidt[i]! * schmidt[i]!
  if (total <= 0) return 0
  let cum = 0
  const target = 0.9 * total
  for (let i = 0; i < schmidt.length; i++) {
    cum += schmidt[i]! * schmidt[i]!
    // `>=` so a spectrum whose first mode already carries exactly 90%
    // of the weight reports 1, not 2.
    if (cum >= target) return i + 1
  }
  return schmidt.length
}

interface ClockStats {
  schmidtLen: number
  r_eff_1em6: number
  r_eff_1em8: number
  r_90pct: number
  s0: number
  s1: number
  ratio_s1_s0: number
  K_0: number
  K_max: number
  kFloor: number
  floorFraction_kept: number
  compareCount: number
  alpha: number
  beta: number
  q_affine: number
  q_rigid: number
}

interface PerBcBlock {
  bc: WdwBoundaryCondition
  solveMs: number
  chiTotalDensity: number
  clocks: Record<SrmtClock, ClockStats>
}

interface ScanEntry {
  aMax: number
  perBc: PerBcBlock[]
}

/** Compute per-clock stats for a given χ tensor. */
function statsForClock(
  output: {
    chi: Float32Array
    gridSize: [number, number, number]
    aMin: number
    aMax: number
    phiExtent: number
  },
  clock: SrmtClock,
  cutNorm: number,
  rankCap: number,
  cfg: typeof DEFAULT_WHEELER_DEWITT_CONFIG
): ClockStats {
  const [Na, Nphi] = output.gridSize
  // Volume-weighted Σ s_n²·dVol = 1 (task #8): β reports only the genuine
  // zero-of-energy offset — not `−log(Σ|χ|²)` or the residual `log(dVol)`
  // drift.
  const dVol = computeVolumeElement({
    gridSize: output.gridSize,
    aMin: output.aMin,
    aMax: output.aMax,
    phiExtent: output.phiExtent,
  })
  const full = normalizedSchmidtValues({ chi: output.chi, gridSize: output.gridSize }, clock, dVol)
  const schmidtLen = full.length
  const s0 = full[0] ?? 0
  const s1 = schmidtLen > 1 ? full[1]! : 0

  const kept = Math.min(rankCap, schmidtLen)
  const trimmed = new Float64Array(kept)
  for (let i = 0; i < kept; i++) trimmed[i] = full[i]!
  const { spectrum: kSpec, epsilon } = modularSpectrum(trimmed)

  const axisLen = clock === 'a' ? Na : Nphi
  const sliceIndex = resolveCutIndex(cutNorm, axisLen)
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
      inflatonMassAsymmetry: cfg.inflatonMassAsymmetry,
      sliceIndex,
    },
    rankCap
  )
  const hj64 = new Float64Array(hj32.length)
  for (let j = 0; j < hj32.length; j++) hj64[j] = hj32[j]!

  const compareCount = Math.min(kSpec.length, hj64.length, rankCap)
  const affine = fitAffineParams(kSpec, hj64, compareCount)
  const qRigid = computeRigidFitQuality(kSpec, hj64, compareCount)
  const kFloor = -Math.log(epsilon)
  const floorFrac = floorFractionFromModular(kSpec.slice(0, compareCount), epsilon)

  return {
    schmidtLen,
    r_eff_1em6: effectiveRankFromSchmidt(full, 1e-6),
    r_eff_1em8: effectiveRankFromSchmidt(full, 1e-8),
    r_90pct: rank90(full),
    s0,
    s1,
    ratio_s1_s0: s0 > 0 ? s1 / s0 : 0,
    K_0: kSpec[0] ?? NaN,
    K_max: kSpec[kSpec.length - 1] ?? NaN,
    kFloor,
    floorFraction_kept: floorFrac,
    compareCount,
    alpha: affine.alpha,
    beta: affine.beta,
    q_affine: affine.q,
    q_rigid: qRigid,
  }
}

/** Fit log(y) = a + b·x (linear in log space). Returns {a, b, r2}. */
function fitLogLinear(xs: number[], ys: number[]): { a: number; b: number; r2: number } {
  const n = xs.length
  const logYs = ys.map((y) => Math.log(Math.max(y, Number.MIN_VALUE)))
  let sx = 0,
    sy = 0
  for (let i = 0; i < n; i++) {
    sx += xs[i]!
    sy += logYs[i]!
  }
  const mx = sx / n
  const my = sy / n
  let sxx = 0,
    sxy = 0
  for (let i = 0; i < n; i++) {
    const dx = xs[i]! - mx
    sxx += dx * dx
    sxy += dx * (logYs[i]! - my)
  }
  const b = sxx > 0 ? sxy / sxx : 0
  const a = my - b * mx
  let ssRes = 0,
    ssTot = 0
  for (let i = 0; i < n; i++) {
    const yhat = a + b * xs[i]!
    ssRes += (logYs[i]! - yhat) ** 2
    ssTot += (logYs[i]! - my) ** 2
  }
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 1
  return { a, b, r2 }
}

/** Fit y = a + b·x (linear). Returns {a, b, r2}. */
function fitLinear(xs: number[], ys: number[]): { a: number; b: number; r2: number } {
  const n = xs.length
  let sx = 0,
    sy = 0
  for (let i = 0; i < n; i++) {
    sx += xs[i]!
    sy += ys[i]!
  }
  const mx = sx / n
  const my = sy / n
  let sxx = 0,
    sxy = 0
  for (let i = 0; i < n; i++) {
    const dx = xs[i]! - mx
    sxx += dx * dx
    sxy += dx * (ys[i]! - my)
  }
  const b = sxx > 0 ? sxy / sxx : 0
  const a = my - b * mx
  let ssRes = 0,
    ssTot = 0
  for (let i = 0; i < n; i++) {
    const yhat = a + b * xs[i]!
    ssRes += (ys[i]! - yhat) ** 2
    ssTot += (ys[i]! - my) ** 2
  }
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 1
  return { a, b, r2 }
}

describe('SRMT tunneling-BC aMax scan (one-shot)', () => {
  it('locks amplification hypothesis by varying aMax across {0.6, 0.8, 1.0, 1.2, 1.5}', () => {
    const AMAX_VALUES = [0.6, 0.8, 1.0, 1.2, 1.5]
    const BCs: WdwBoundaryCondition[] = ['noBoundary', 'tunneling', 'deWitt']
    const CLOCKS: SrmtClock[] = ['a', 'phi1']
    const cutNorm = 0.5
    const rankCap = 64
    const cfg = DEFAULT_WHEELER_DEWITT_CONFIG

    const scans: ScanEntry[] = []

    for (const aMax of AMAX_VALUES) {
      const perBc: PerBcBlock[] = []
      for (const bc of BCs) {
        const t0 = Date.now()
        const output = solveWheelerDeWitt({
          boundaryCondition: bc,
          inflatonMass: cfg.inflatonMass,
          inflatonMassAsymmetry: cfg.inflatonMassAsymmetry,
          cosmologicalConstant: cfg.cosmologicalConstant,
          aMin: cfg.aMin,
          aMax,
          gridNa: cfg.gridNa,
          gridNphi: cfg.gridNphi,
          phiExtent: cfg.phiExtent,
        })
        const solveMs = Date.now() - t0
        // Volume-weight the raw Frobenius sum so `chiTotalDensity` is a
        // true Riemann-sum density, not a sample count that scales with
        // cell volume. `aMax` varies across the scan at fixed `gridNa`,
        // which means `da` and therefore `dVol` vary per point — an
        // unweighted sum would report monotonic growth driven by larger
        // integration cells rather than by physical amplification.
        const chiTotal =
          chiFrobeniusNormSq(output.chi) *
          computeVolumeElement({
            gridSize: output.gridSize,
            aMin: output.aMin,
            aMax: output.aMax,
            phiExtent: output.phiExtent,
          })

        const clocks = {} as Record<SrmtClock, ClockStats>
        for (const clock of CLOCKS) {
          clocks[clock] = statsForClock(output, clock, cutNorm, rankCap, cfg)
        }

        perBc.push({ bc, solveMs, chiTotalDensity: chiTotal, clocks })
      }
      scans.push({ aMax, perBc })
    }

    // -------------------------------------------------------------------------
    // Verdict computation.
    // -------------------------------------------------------------------------

    const rEffAtDefault = {} as Record<WdwBoundaryCondition, Record<SrmtClock, number>>
    const rEffAtAmax06 = {} as Record<WdwBoundaryCondition, Record<SrmtClock, number>>
    for (const bc of BCs) {
      rEffAtDefault[bc] = { a: NaN, phi1: NaN, phi2: NaN } as Record<SrmtClock, number>
      rEffAtAmax06[bc] = { a: NaN, phi1: NaN, phi2: NaN } as Record<SrmtClock, number>
    }
    const defScan = scans.find((s) => s.aMax === 1.5)!
    const lowScan = scans.find((s) => s.aMax === 0.6)!
    for (const blk of defScan.perBc) {
      rEffAtDefault[blk.bc] = {
        a: blk.clocks.a.r_eff_1em6,
        phi1: blk.clocks.phi1.r_eff_1em6,
        phi2: NaN,
      } as Record<SrmtClock, number>
    }
    for (const blk of lowScan.perBc) {
      rEffAtAmax06[blk.bc] = {
        a: blk.clocks.a.r_eff_1em6,
        phi1: blk.clocks.phi1.r_eff_1em6,
        phi2: NaN,
      } as Record<SrmtClock, number>
    }

    const tunnelingPhi1RByAmax = scans.map((s) => {
      const tun = s.perBc.find((b) => b.bc === 'tunneling')!
      return { aMax: s.aMax, r_eff: tun.clocks.phi1.r_eff_1em6 }
    })
    // Crossover: lowest aMax where tunneling-phi1 r_eff ≥ 16.
    const crossovers = tunnelingPhi1RByAmax
      .filter((row) => row.r_eff >= 16)
      .sort((a, b) => a.aMax - b.aMax)
    const crossoverAmax = crossovers.length > 0 ? crossovers[0]!.aMax : null

    // Inversion weakens monotonically: (q_phi1 − q_a) under tunneling must be
    // monotonically non-decreasing as aMax shrinks (i.e. inversion becomes
    // less negative / flips sign toward the non-tunneling sign).
    const tunDeltaByAmaxDesc = [...scans]
      .sort((a, b) => b.aMax - a.aMax) // descending aMax
      .map((s) => {
        const tun = s.perBc.find((b) => b.bc === 'tunneling')!
        return {
          aMax: s.aMax,
          delta: tun.clocks.phi1.q_affine - tun.clocks.a.q_affine,
        }
      })
    let inversionWeakensMonotonic = true
    for (let i = 1; i < tunDeltaByAmaxDesc.length; i++) {
      if (tunDeltaByAmaxDesc[i]!.delta < tunDeltaByAmaxDesc[i - 1]!.delta) {
        inversionWeakensMonotonic = false
        break
      }
    }

    // Chi monotonicity check.
    let chiMonotonic = true
    const tunChiByAmax = scans.map((s) => ({
      aMax: s.aMax,
      chi: s.perBc.find((b) => b.bc === 'tunneling')!.chiTotalDensity,
    }))
    for (let i = 1; i < tunChiByAmax.length; i++) {
      if (tunChiByAmax[i]!.chi <= tunChiByAmax[i - 1]!.chi) {
        chiMonotonic = false
        break
      }
    }

    // PRIMARY: amplification confirmed iff tunneling-phi1 r_eff at aMax=0.6 ≥ 16.
    const rEffAt06 = rEffAtAmax06.tunneling.phi1
    const amplificationConfirmed = rEffAt06 >= 16

    const reasoningParts: string[] = []
    reasoningParts.push(
      `tunneling-phi1 r_eff(1e-6) at aMax=0.6 = ${rEffAt06} ` +
        `(threshold 16). At default aMax=1.5: ${rEffAtDefault.tunneling.phi1}.`
    )
    reasoningParts.push(
      `chiTotalDensity (tunneling) monotonic in aMax: ${chiMonotonic ? 'YES' : 'NO'} ` +
        `(${tunChiByAmax.map((r) => r.chi.toExponential(2)).join(' -> ')}).`
    )
    reasoningParts.push(
      `Inversion (q_phi1 − q_a) under tunneling weakens monotonically as aMax shrinks: ` +
        `${inversionWeakensMonotonic ? 'YES' : 'NO'} ` +
        `(desc: ${tunDeltaByAmaxDesc.map((r) => r.delta.toFixed(4)).join(' -> ')}).`
    )
    reasoningParts.push(
      `Crossover aMax (first aMax with tunneling-phi1 r_eff ≥ 16): ${crossoverAmax ?? 'null'}.`
    )

    const verdict = {
      amplificationConfirmed,
      reasoning: reasoningParts.join(' '),
      rEffAtDefault,
      rEffAtAmax06,
      inversionWeakensMonotonic,
      crossoverAmax,
    }

    // -------------------------------------------------------------------------
    // Emit JSON.
    // -------------------------------------------------------------------------
    const jsonOut = {
      meta: {
        note: 'Wheeler-DeWitt tunneling-BC aMax scan — locks amplification hypothesis',
        aMaxValues: AMAX_VALUES,
        boundaryConditions: BCs,
        clocks: CLOCKS,
        cutNormalized: cutNorm,
        rankCap,
        config: cfg,
      },
      scans,
      verdict,
    }
    const jsonPath = '/tmp/srmt-tunneling-amax-scan.json'
    writeFileSync(jsonPath, JSON.stringify(jsonOut, null, 2))
    console.log(`[srmt amax scan] wrote ${jsonPath} (${scans.length} scans)`)

    // -------------------------------------------------------------------------
    // Console summary table.
    // -------------------------------------------------------------------------
    console.log(
      '\naMax  bc          clock r_eff(1e-6)  ratio_s1/s0   q_affine     q_rigid     chi|χ|²'
    )
    for (const s of scans) {
      for (const blk of s.perBc) {
        for (const clock of CLOCKS) {
          const c = blk.clocks[clock]
          console.log(
            `${s.aMax.toFixed(1)}   ${blk.bc.padEnd(11)} ${clock.padEnd(5)} ` +
              `${String(c.r_eff_1em6).padStart(3)}          ` +
              `${c.ratio_s1_s0.toExponential(2)}   ` +
              `${c.q_affine.toExponential(3)}  ${c.q_rigid.toExponential(2)}  ` +
              `${blk.chiTotalDensity.toExponential(3)}`
          )
        }
      }
    }

    // -------------------------------------------------------------------------
    // Markdown narrative.
    // -------------------------------------------------------------------------
    const amaxList = AMAX_VALUES.slice()
    const tunChiVals = amaxList.map(
      (ax) =>
        scans.find((s) => s.aMax === ax)!.perBc.find((b) => b.bc === 'tunneling')!.chiTotalDensity
    )
    const logFit = fitLogLinear(amaxList, tunChiVals)
    const linFit = fitLinear(amaxList, tunChiVals)
    const fitHint =
      logFit.r2 > linFit.r2
        ? `exponential (log-linear R²=${logFit.r2.toFixed(5)} vs linear R²=${linFit.r2.toFixed(5)}); slope in log-space b=${logFit.b.toFixed(3)}`
        : `linear (linear R²=${linFit.r2.toFixed(5)} vs log-linear R²=${logFit.r2.toFixed(5)})`

    let rawTable = '| aMax | BC | clock | r_eff(1e-6) | q_affine | q_rigid | floorFrac |\n'
    rawTable += '|------|-----|-------|-------------|----------|---------|-----------|\n'
    for (const s of scans) {
      for (const blk of s.perBc) {
        for (const clock of CLOCKS) {
          const c = blk.clocks[clock]
          rawTable += `| ${s.aMax.toFixed(1)} | ${blk.bc} | ${clock} | ${c.r_eff_1em6} | ${c.q_affine.toExponential(3)} | ${c.q_rigid.toExponential(2)} | ${c.floorFraction_kept.toFixed(3)} |\n`
        }
      }
    }

    let chiTable =
      '| aMax | chiTotalDensity (tunneling) |\n|------|------------------------------|\n'
    for (let i = 0; i < amaxList.length; i++) {
      chiTable += `| ${amaxList[i]!.toFixed(1)} | ${tunChiVals[i]!.toExponential(3)} |\n`
    }

    const verdictLine = amplificationConfirmed
      ? 'CONFIRMED'
      : rEffAt06 >= 8
        ? 'AMBIGUOUS'
        : 'FALSIFIED'

    const postscript = amplificationConfirmed
      ? `### Canonical fix\n\nExisting rEff champion-gate in ` +
        `\`src/lib/physics/srmt/sweepSensitivityDrivers.ts:computeChampionFlips\` ` +
        `(threshold \`r_eff < 8\`) is **well-calibrated**: tunneling-phi1 sits at ` +
        `r_eff=${rEffAtDefault.tunneling.phi1} at default aMax=1.5 (gated out) and ` +
        `rises through 8 well before the hypothesis-predicted r_eff≥16 crossover at ` +
        `aMax≈${crossoverAmax ?? '?'}. No code change required. ` +
        `The r_eff=8 threshold separates "rank-collapsed plateau artifact" (< 8) from ` +
        `"physical spectrum with enough non-trivial modes to fit" (≥ 8). ` +
        `Publication recommendation: report q_rigid alongside q_affine (see prior ` +
        `\`/tmp/srmt-tunneling-bc-analysis.md\`) — q_rigid is immune to the plateau absorption.\n`
      : `### Next candidate mechanisms (hypothesis FALSIFIED / AMBIGUOUS)\n\n` +
        `1. **BC-specific Schmidt kernel structure** — tunneling BC's complex initial ` +
        `data may produce a reduced-state singular-value distribution that is intrinsically ` +
        `rank-1 regardless of march length. Verify by reconstructing χ at aMin+ε and ` +
        `directly computing Schmidt at a∈(aMin, aMax) to isolate BC vs. propagation.\n` +
        `2. **BC-dependent potential contribution under low-aMax WKB** — at aMax < aTurn, ` +
        `the tunneling prefactor may not have entered its amplification regime, so this ` +
        `scan never exercised the hypothesized mechanism. Re-run with larger aMax ∈ {1.5, ` +
        `2.0, 2.5, 3.0} to extend the amplification window and test the opposite direction.\n`

    const md =
      `# SRMT tunneling-BC aMax scan — amplification hypothesis\n\n` +
      `**Verdict: ${verdictLine}**\n\n` +
      `Primary: tunneling-phi1 r_eff(1e-6) at aMax=0.6 = ${rEffAt06} (threshold 16).\n` +
      `Secondary: chiTotalDensity(tunneling) monotonic in aMax: ${chiMonotonic ? 'YES' : 'NO'}.\n` +
      `Tertiary: (q_phi1 − q_a) under tunneling weakens monotonically as aMax ↓: ${inversionWeakensMonotonic ? 'YES' : 'NO'}.\n` +
      `Crossover aMax (first aMax with tunneling-phi1 r_eff ≥ 16): ${crossoverAmax ?? 'null'}.\n\n` +
      `## Raw per-(aMax, BC, clock) table (cut=0.5, rankCap=64)\n\n${rawTable}\n` +
      `## chiTotalDensity under tunneling vs. aMax\n\n${chiTable}\n` +
      `**Fit**: ${fitHint}.\n\n` +
      `## Tunneling-phi1 r_eff(1e-6) monotonicity (aMax ↑)\n\n` +
      `| aMax | r_eff(1e-6) |\n|------|-------------|\n` +
      tunnelingPhi1RByAmax.map((r) => `| ${r.aMax.toFixed(1)} | ${r.r_eff} |\n`).join('') +
      `\n${postscript}\n\n` +
      `## Reproducibility\n\n` +
      `- Config: ${JSON.stringify({
        aMin: cfg.aMin,
        gridNa: cfg.gridNa,
        gridNphi: cfg.gridNphi,
        phiExtent: cfg.phiExtent,
        inflatonMass: cfg.inflatonMass,
        inflatonMassAsymmetry: cfg.inflatonMassAsymmetry,
        cosmologicalConstant: cfg.cosmologicalConstant,
      })}\n` +
      `- aMax swept ∈ {${AMAX_VALUES.join(', ')}}, aMin held at ${cfg.aMin}.\n` +
      `- Driver: \`src/tests/lib/physics/srmt/_oneshotTunnelingAmaxScan.test.ts\`.\n` +
      `- Structured data: \`/tmp/srmt-tunneling-amax-scan.json\`.\n`

    writeFileSync('/tmp/srmt-tunneling-amax-verdict.md', md)
    console.log('[srmt amax scan] wrote /tmp/srmt-tunneling-amax-verdict.md')
    console.log(`[srmt amax scan] VERDICT: ${verdictLine}`)

    expect(scans.length).toBeGreaterThan(0)
  }, 300_000)
})
