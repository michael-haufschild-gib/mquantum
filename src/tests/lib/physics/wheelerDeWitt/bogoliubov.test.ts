/**
 * End-to-end Bogoliubov-coefficient extraction tests for the three
 * Wheeler–DeWitt boundary-condition flavors.
 *
 * Physical predictions (Stage-3 Airy/Langer connection):
 *
 *  - **HH (`noBoundary`)**: real Lorentzian wave (cos pattern) →
 *    `|α| ≈ |β|` per column → mean flux ratio `≈ 0` (standing-wave
 *    structure, no net particle flux).
 *  - **DeWitt (`deWitt`)**: real Lorentzian wave with linear-in-`a`
 *    initial condition → also a standing-wave dominantly → mean flux
 *    ratio `≈ 0`.
 *  - **Vilenkin (`tunneling`)**: outgoing Lorentzian wave (Stage-3
 *    enforces `c₂ = +i·c₁`) → `β = 0`, `|α| > 0` per column → mean flux
 *    ratio `≈ +1` (pure outgoing, "tunneling" selection of the
 *    expanding-universe branch).
 *
 * The mean is over columns with successful Airy extraction (those with
 * a turning surface inside the grid and ≥ 2 Lorentzian-asymptotic cells).
 */

import { describe, expect, it } from 'vitest'

import { extractBogoliubov } from '@/lib/physics/wheelerDeWitt/bogoliubov'
import {
  solveWheelerDeWitt,
  type WheelerDeWittSolverInput,
} from '@/lib/physics/wheelerDeWitt/solver'

/** Configuration with positive Λ so most columns have a turning surface. */
const BC_INPUT: WheelerDeWittSolverInput = {
  boundaryCondition: 'noBoundary',
  inflatonMass: 0.3,
  cosmologicalConstant: 0.5,
  aMin: 0.05,
  aMax: 1.5,
  gridNa: 96,
  gridNphi: 16,
  phiExtent: 1.5,
}

describe('bogoliubov — Wheeler–DeWitt particle-number diagnostic', () => {
  it('Hartle–Hawking: standing wave → mean flux ratio ≈ 0', () => {
    const out = solveWheelerDeWitt({ ...BC_INPUT, boundaryCondition: 'noBoundary' })
    const summary = extractBogoliubov(out)

    expect(summary.extractedCount).toBeGreaterThan(0)
    // Standing wave: |α| ≈ |β| per column → fluxRatio ≈ 0.
    expect(Math.abs(summary.meanFluxRatio)).toBeLessThan(0.2)
    // |β/α| ≈ 1 for a pure standing wave.
    expect(summary.meanBetaOverAlpha).toBeGreaterThan(0.5)
    expect(summary.meanBetaOverAlpha).toBeLessThan(2.0)
  })

  it('Vilenkin: WKB BC fix shifts mean flux ratio away from zero', () => {
    // Pure outgoing-wave selection (β = 0 → fluxRatio = +1) is the
    // physical Vilenkin proposal. Achieving it from a finite-difference
    // leapfrog with a small-`a_min` BC is intrinsically approximate
    // because the WKB ansatz `χ ∝ e^{+iS}/|U|^{1/4}` carries an
    // O(∂_a|U|/(4|U|)) prefactor correction that is *the same order* as
    // the leading phase term `√|U|` at small `a`. The corrected BC
    //
    //     χ′(a_min) = (i·√|U| − (∂_a|U|)/(4|U|)) · χ(a_min)
    //
    // imposes both terms exactly, but the underlying ansatz still
    // satisfies the PDE only to leading WKB. Result: low-V columns
    // (where √|U| ≫ prefactor) show fluxRatio ~ +0.3 (clearly
    // outgoing-leaning), while high-V columns degrade to standing-wave
    // structure. The mean over the φ grid sits in [0.02, 0.20] —
    // distinguishable from the HH/DeWitt mean (≈ 0) but not the
    // physical +1.
    //
    // To actually reach fluxRatio → +1 we would need either: (a) a
    // larger `a_min` where leading WKB is accurate, (b) exact mode
    // functions at a_min instead of the WKB ansatz, or (c) a higher-
    // order absorbing BC. None are in scope here. See Stage-3 task #6
    // for context.
    const out = solveWheelerDeWitt({ ...BC_INPUT, boundaryCondition: 'tunneling' })
    const summary = extractBogoliubov(out)

    expect(summary.extractedCount).toBeGreaterThan(0)
    // Mean is positive (outgoing-leaning), not exactly zero (standing).
    expect(summary.meanFluxRatio).toBeGreaterThan(0.01)
    // Edge columns reach >0.2; assert at least one column is clearly outgoing.
    const maxFluxRatio = summary.columns.reduce(
      (m, c) => (c ? Math.max(m, c.fluxRatio) : m),
      -Infinity
    )
    expect(maxFluxRatio).toBeGreaterThan(0.2)
  })

  it('Vilenkin (synthetic): bogoliubov logic yields β = 0 when input has A_s = -i·A_c', () => {
    // Independent of any leapfrog evolution, validate the bogoliubov
    // logic itself: hand-craft a `WheelerDeWittSolverOutput` with one
    // column whose `columnAiry` reflects the Vilenkin Lorentzian wave
    // shape A·e^{-iφ_L}/|U|^{1/4} → (A_c = A, A_s = -i·A) and verify
    // extractBogoliubov produces α ≠ 0, β = 0.
    //
    // Note: in the (c₁, c₂) convention the same wave has c₂ = +i·c₁;
    // the conversion is just A_c = (c₁+c₂)/√(2π), A_s = (c₁−c₂)/√(2π).
    const Nphi = 1
    const N = Nphi * Nphi
    const acRe = 0.7
    const acIm = 0.2
    // A_s = -i·A_c = -i·(0.7 + 0.2i) = 0.2 - 0.7i.
    const asRe = 0.2
    const asIm = -0.7
    const mockOutput = {
      chi: new Float32Array(2),
      lorentzianMask: new Uint8Array(1),
      bandKind: new Uint8Array(1),
      gridSize: [2, Nphi, Nphi] as [number, number, number],
      aMin: 0.05,
      aMax: 1.0,
      phiExtent: 1.0,
      maxDensity: 1,
      columnAiry: [
        {
          hasOverwrite: true,
          aTurn: 0.5,
          kappa: 1,
          asymptoticCellCount: 5,
          acRe,
          acIm,
          asRe,
          asIm,
          c1RawRe: 0,
          c1RawIm: 0,
          c2RawRe: 0,
          c2RawIm: 0,
          c1Re: 0,
          c1Im: 0,
          c2Re: 0,
          c2Im: 0,
        },
      ],
    }
    for (let i = 0; i < N - 1; i++) {
      ;(mockOutput.columnAiry as unknown[]).push({
        hasOverwrite: false,
        aTurn: null,
        kappa: 0,
        asymptoticCellCount: 0,
        acRe: 0,
        acIm: 0,
        asRe: 0,
        asIm: 0,
        c1RawRe: 0,
        c1RawIm: 0,
        c2RawRe: 0,
        c2RawIm: 0,
        c1Re: 0,
        c1Im: 0,
        c2Re: 0,
        c2Im: 0,
      })
    }
    const summary = extractBogoliubov(mockOutput)
    expect(summary.extractedCount).toBe(1)
    const col = summary.columns[0]!
    // α = (A_c + i·A_s)/√2 = (0.7 + 0.2i + i·(0.2 − 0.7i))/√2
    //   = (0.7 + 0.7 + i·(0.2 + 0.2))/√2 = (1.4 + 0.4i)/√2.
    expect(col.asymptoticCellCount).toBe(5)
    expect(col.alphaRe).toBeCloseTo(1.4 / Math.sqrt(2), 6)
    expect(col.alphaIm).toBeCloseTo(0.4 / Math.sqrt(2), 6)
    // β = (A_c − i·A_s)/√2 = (0.7 + 0.2i − i·(0.2 − 0.7i))/√2
    //   = (0.7 − 0.7 + i·(0.2 − 0.2))/√2 = 0.
    expect(Math.abs(col.betaRe)).toBeLessThan(1e-12)
    expect(Math.abs(col.betaIm)).toBeLessThan(1e-12)
    expect(col.fluxRatio).toBeCloseTo(1.0, 6)
  })

  it('DeWitt: real BC → standing-wave-dominated → mean flux ratio ≈ 0', () => {
    const out = solveWheelerDeWitt({ ...BC_INPUT, boundaryCondition: 'deWitt' })
    const summary = extractBogoliubov(out)

    expect(summary.extractedCount).toBeGreaterThan(0)
    expect(Math.abs(summary.meanFluxRatio)).toBeLessThan(0.3)
  })

  it('All BCs: per-column unitarity invariant matches definition', () => {
    // |α|² − |β|² = 2·Im(A_c · conj(A_s)) = 2·(acIm·asRe − acRe·asIm).
    // Confirm the stored `flux` field equals the recomputed value.
    const out = solveWheelerDeWitt({ ...BC_INPUT, boundaryCondition: 'tunneling' })
    const summary = extractBogoliubov(out)
    let validated = 0
    for (const col of summary.columns) {
      if (!col) continue
      // Recompute |α|² − |β|² from raw α, β.
      const expected = col.alphaSq - col.betaSq
      expect(Math.abs(col.flux - expected)).toBeLessThan(1e-9 * Math.max(1, Math.abs(expected)))
      validated += 1
    }
    expect(validated).toBeGreaterThan(0)
  })

  it('Failed columns are reported as null (V ≤ 0 or extraction degeneracy)', () => {
    // Force a config where most columns have V ≤ 0 (negative Λ
    // overwhelms small inflaton mass term): expect many null entries.
    const out = solveWheelerDeWitt({
      ...BC_INPUT,
      cosmologicalConstant: -0.5,
      inflatonMass: 0.05,
    })
    const summary = extractBogoliubov(out)
    const nullCount = summary.columns.filter((c) => c === null).length
    expect(nullCount).toBeGreaterThan(0)
    expect(summary.extractedCount + nullCount).toBe(summary.totalColumns)
  })
})

describe('bogoliubov — sign convention check', () => {
  it('Vilenkin "outgoing" is the +α branch (β suppressed)', () => {
    // Compare per-column α and β explicitly: Vilenkin should have
    // |α|² > |β|² for the majority of columns. If the sign convention
    // were flipped (c₂ = −i·c₁ instead of +i·c₁) we would see the
    // opposite pattern, with most columns having |β|² > |α|².
    const out = solveWheelerDeWitt({ ...BC_INPUT, boundaryCondition: 'tunneling' })
    const summary = extractBogoliubov(out)
    let alphaWins = 0
    let betaWins = 0
    for (const col of summary.columns) {
      if (!col) continue
      if (col.alphaSq > col.betaSq) alphaWins += 1
      else betaWins += 1
    }
    expect(alphaWins).toBeGreaterThan(betaWins)
  })
})
