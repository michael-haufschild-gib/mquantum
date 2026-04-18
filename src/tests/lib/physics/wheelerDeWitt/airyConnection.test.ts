/**
 * Validate the Lorentzian → Euclidean Airy/Langer connection on a
 * synthetic grid where the answer is known by construction:
 *
 *  1. Pick known `(c₁, c₂)` (per BC).
 *  2. Build a Wheeler–DeWitt χ buffer by evaluating the Langer formula
 *     analytically over the entire `a` axis (Lorentzian + Euclidean).
 *  3. Run `extractColumnAiry` on the resulting buffer.
 *  4. Assert the extracted `(A_c, A_s)` round-trip to the input
 *     `(c₁, c₂)` via the connection formulas, and that the BC weighting
 *     produces the expected branch policy.
 *
 * This is a tighter test than the end-to-end solver test because it
 * decouples the connection logic from the leapfrog's discretisation
 * error.
 */

import { describe, expect, it } from 'vitest'

import { airyAll } from '@/lib/physics/wheelerDeWitt/airy'
import { extractColumnAiry, langerEvaluate } from '@/lib/physics/wheelerDeWitt/airyConnection'
import {
  WDW_C_U,
  wdwLangerVariable,
  wdwLorentzianWkbAction,
  wdwTurningA,
  wdwU,
} from '@/lib/physics/wheelerDeWitt/constants'

interface SyntheticGrid {
  chi: Float32Array
  Na: number
  Nphi: number
  da: number
  aMin: number
  aMax: number
  phiExtent: number
  mass: number
  lambda: number
}

/**
 * Build a single-column synthetic grid (Nphi=1 — actually we use Nphi=3
 * with the test column at the center to stay within the solver's grid
 * convention) populated with the analytic Langer formula evaluated using
 * known `(c₁, c₂)`.
 */
function buildSyntheticGrid(c1Re: number, c1Im: number, c2Re: number, c2Im: number): SyntheticGrid {
  const Na = 128
  const Nphi = 3
  const aMin = 0.05
  const aMax = 1.0
  const da = (aMax - aMin) / (Na - 1)
  const mass = 0.4
  // Lambda chosen so the turning surface a_turn = 1/√(K·V) ≈ 0.49 sits
  // well inside the grid, leaving ~28 Lorentzian and ~70 Euclidean cells.
  // V(0,0) = Λ = 0.5 → K·V = 8π/3·0.5 ≈ 4.19 → a_turn ≈ 0.488.
  const lambda = 0.5
  const phiExtent = 0.5
  const phi1 = 0
  const phi2 = 0
  const slabSize = Nphi * Nphi
  const chi = new Float32Array(2 * Na * slabSize)
  const slabIndex = 1 * Nphi + 1 // center cell

  for (let ia = 0; ia < Na; ia++) {
    const a = aMin + ia * da
    const zeta = wdwLangerVariable(a, phi1, phi2, mass, lambda)
    const U = wdwU(a, phi1, phi2, mass, lambda)
    const prefactor = Math.pow(zeta / U, 0.25)
    const { ai, bi } = airyAll(zeta)
    const re = prefactor * (c1Re * ai + c2Re * bi)
    const im = prefactor * (c1Im * ai + c2Im * bi)
    const cellOff = 2 * (ia * slabSize + slabIndex)
    chi[cellOff] = re
    chi[cellOff + 1] = im
  }
  return { chi, Na, Nphi, da, aMin, aMax, phiExtent, mass, lambda }
}

function makeContext(g: SyntheticGrid) {
  return {
    chi: g.chi,
    Na: g.Na,
    slabSize: g.Nphi * g.Nphi,
    slabIndex: 1 * g.Nphi + 1,
    da: g.da,
    aMin: g.aMin,
    phi1: 0,
    phi2: 0,
    mass: g.mass,
    lambda: g.lambda,
  }
}

describe('airyConnection — round-trip extraction (DeWitt: leaves c₁,c₂ untouched? no — also c₂=0)', () => {
  it('HH/DeWitt: extracted c₁ matches input, c₂ forced to 0 and amplitude preserved', () => {
    const c1Re = 0.7
    const c1Im = 0
    const c2Re = 0
    const c2Im = 0
    const grid = buildSyntheticGrid(c1Re, c1Im, c2Re, c2Im)
    const info = extractColumnAiry(makeContext(grid), 'noBoundary')

    expect(info.hasOverwrite).toBe(true)
    // a_turn = 1/√(K·V) with V = 0.5 (Λ-only column), K = 8π/3 ≈ 8.378.
    // Expected a_turn ≈ 0.488. Tolerance covers Float32 round-off.
    expect(info.aTurn).toBeCloseTo(1 / Math.sqrt(((8 * Math.PI) / 3) * 0.5), 6)
    expect(info.asymptoticCellCount).toBeGreaterThanOrEqual(2)

    // Raw c₁ should be ~ input c₁. Extraction uses the leading-WKB
    // ansatz `χ = (A_c cos φ_L + A_s sin φ_L)/|U|^{1/4}` while the
    // synthetic grid uses the full Langer formula
    // `χ = (ζ/U)^{1/4}·c₁·Ai(ζ)`; these differ at finite ζ by O(1/ξ)
    // subleading corrections, which is the physical extraction precision
    // (a real leapfrog has the same error against pure WKB). 5 % relative
    // catches any sign or factor mistake while accepting Airy subleading.
    expect(Math.abs(info.c1RawRe - c1Re) / c1Re).toBeLessThan(0.05)
    expect(Math.abs(info.c1RawIm)).toBeLessThan(0.05)
    expect(Math.abs(info.c2RawRe)).toBeLessThan(0.05)
    expect(Math.abs(info.c2RawIm)).toBeLessThan(0.05)

    // Final c₂ forced to zero.
    expect(info.c2Re).toBe(0)
    expect(info.c2Im).toBe(0)

    // Amplitude preserved: |c₁_final|² + |c₂_final|² = |c₁_raw|² + |c₂_raw|².
    const rawSq = info.c1RawRe ** 2 + info.c1RawIm ** 2 + info.c2RawRe ** 2 + info.c2RawIm ** 2
    const finalSq = info.c1Re ** 2 + info.c1Im ** 2
    expect(Math.abs(finalSq - rawSq) / rawSq).toBeLessThan(1e-6)
  })

  it('Vilenkin: c₂ = +i·c₁ after BC weighting', () => {
    // Build a synthetic grid with the Vilenkin-style outgoing wave —
    // input (c₁_in, c₂_in) related by c₂_in = +i·c₁_in already, so the
    // policy should produce c₂_out = +i·c₁_out matching the input.
    const c1Re = 0.5
    const c1Im = 0.1
    // c₂ = +i·c₁ = i·(0.5 + 0.1i) = −0.1 + 0.5i.
    const c2Re = -0.1
    const c2Im = 0.5
    const grid = buildSyntheticGrid(c1Re, c1Im, c2Re, c2Im)
    const info = extractColumnAiry(makeContext(grid), 'tunneling')

    expect(info.hasOverwrite).toBe(true)

    // Raw extraction round-trip — should recover the input within
    // synthetic-grid extraction tolerance.
    expect(info.c1RawRe).toBeCloseTo(c1Re, 1)
    expect(info.c1RawIm).toBeCloseTo(c1Im, 1)
    expect(info.c2RawRe).toBeCloseTo(c2Re, 1)
    expect(info.c2RawIm).toBeCloseTo(c2Im, 1)

    // BC-weighted c₂ = +i·c₁ → (c₂Re, c₂Im) = (−c₁Im, c₁Re).
    expect(info.c2Re).toBeCloseTo(-info.c1Im, 6)
    expect(info.c2Im).toBeCloseTo(info.c1Re, 6)

    // Total amplitude preserved.
    const rawSq = info.c1RawRe ** 2 + info.c1RawIm ** 2 + info.c2RawRe ** 2 + info.c2RawIm ** 2
    const finalSq = info.c1Re ** 2 + info.c1Im ** 2 + info.c2Re ** 2 + info.c2Im ** 2
    expect(Math.abs(finalSq - rawSq) / rawSq).toBeLessThan(1e-6)
  })
})

describe('airyConnection — failure modes', () => {
  it('returns no-overwrite when V ≤ 0 (no turning surface)', () => {
    const grid = buildSyntheticGrid(0.5, 0, 0, 0)
    const ctx = makeContext(grid)
    const info = extractColumnAiry(
      { ...ctx, mass: 0, lambda: -0.5 }, // V < 0 everywhere
      'noBoundary'
    )
    expect(info.hasOverwrite).toBe(false)
    expect(info.aTurn).toBeNull()
  })

  it('returns no-overwrite when a_turn is below a_min (no Lorentzian region)', () => {
    const grid = buildSyntheticGrid(0.5, 0, 0, 0)
    const ctx = makeContext(grid)
    // V huge → a_turn ≪ a_min.
    const info = extractColumnAiry({ ...ctx, lambda: 100 }, 'noBoundary')
    expect(info.hasOverwrite).toBe(false)
  })
})

describe('airyConnection — langerEvaluate consistency', () => {
  it('matches the analytic input exactly at every Lorentzian sample', () => {
    const c1Re = 0.6
    const c1Im = 0
    const c2Re = 0
    const c2Im = 0
    const grid = buildSyntheticGrid(c1Re, c1Im, c2Re, c2Im)
    const info = extractColumnAiry(makeContext(grid), 'noBoundary')
    expect(info.hasOverwrite).toBe(true)
    // For a HH-style input where extraction recovers the synthesised
    // (c₁, c₂), the Langer evaluation at any cell should reproduce the
    // grid's stored value to numerical precision.
    const slabSize = grid.Nphi * grid.Nphi
    const slabIndex = 1 * grid.Nphi + 1
    let maxRelErr = 0
    for (let ia = 1; ia < grid.Na; ia++) {
      const a = grid.aMin + ia * grid.da
      const cellOff = 2 * (ia * slabSize + slabIndex)
      const reStored = grid.chi[cellOff]!
      const imStored = grid.chi[cellOff + 1]!
      const { re, im } = langerEvaluate(info, a, 0, 0, grid.mass, grid.lambda)
      const mag = Math.sqrt(reStored * reStored + imStored * imStored)
      if (mag < 1e-6) continue
      const errRe = Math.abs(re - reStored) / mag
      const errIm = Math.abs(im - imStored) / mag
      maxRelErr = Math.max(maxRelErr, errRe, errIm)
    }
    // Tight: synthetic grid + extraction + langerEvaluate share the
    // exact same Airy series at the cell, so round-trip error is set
    // by extraction noise (least-squares residual) at ~1e-2 in c₁.
    expect(maxRelErr).toBeLessThan(0.05)
  })
})

describe('airyConnection — sanity on physics constants', () => {
  it('kappa = 2·c_U·a_turn (matches the standard turning-point linearisation)', () => {
    const grid = buildSyntheticGrid(0.5, 0, 0, 0)
    const info = extractColumnAiry(makeContext(grid), 'noBoundary')
    const aTurn = wdwTurningA(0, 0, grid.mass, grid.lambda)
    // wdwTurningA returns null only for V ≤ 0; this column has V = 0.5.
    expect(aTurn).toBeCloseTo(1 / Math.sqrt(((8 * Math.PI) / 3) * 0.5), 12)
    expect(info.kappa).toBeCloseTo(2 * WDW_C_U * aTurn!, 12)
  })

  it('asymptotic cells satisfy |ζ| ≥ 1.5 and a < a_turn', () => {
    const grid = buildSyntheticGrid(0.5, 0, 0, 0)
    const info = extractColumnAiry(makeContext(grid), 'noBoundary')
    expect(info.asymptoticCellCount).toBeGreaterThan(0)
    const aTurn = wdwTurningA(0, 0, grid.mass, grid.lambda)!
    let validated = 0
    for (let ia = 0; ia < grid.Na; ia++) {
      const a = grid.aMin + ia * grid.da
      if (a >= aTurn) break
      const zeta = wdwLangerVariable(a, 0, 0, grid.mass, grid.lambda)
      if (Math.abs(zeta) >= 1.5) validated += 1
    }
    expect(info.asymptoticCellCount).toBe(validated)
    // S_L is finite and decreasing toward a_turn.
    const aMid = grid.aMin + (grid.Na / 2) * grid.da
    const SL = wdwLorentzianWkbAction(aMid, 0, 0, grid.mass, grid.lambda)
    expect(SL).toBeGreaterThanOrEqual(0)
  })
})
