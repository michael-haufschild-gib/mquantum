/**
 * EXPERIMENT 1 — Connes–Moscovici prolate operator vs the Riemann zeros.
 *
 * Operator (arXiv:2112.05500): on the outer region (λ, ∞), λ = √2,
 *   L = ∂_x((x² − λ²)∂_x) + (2πλ)² x² ,
 * with the W_sa boundary condition lim_{x→λ}(x²−λ²)ξ'(x) = 0 at the
 * degenerate endpoint (enforced exactly by the zero-flux face at x=λ in the
 * cell-centered FV scheme) and the phase conditions (17)/(18) at infinity,
 * approximated by Dirichlet cutoffs at nodes of sin(2πλx) (even family) and
 * cos(2πλx) (odd family).
 *
 * Theorem 6.1 (CM): the spectrum of 2Đ is ±2√α over α ∈ spec(L); its
 * imaginary eigenvalues (α < 0) count like Riemann's N(T). Numerically the
 * eigenvalues track the zeros themselves (CM Figs 2–4). Here we reproduce
 * that from scratch:  t̂ = 2√(−α)  vs the true zeros.
 *
 * Run: node --experimental-strip-types scripts/research/hilbertPolya/exp1_prolate.ts
 */

import { RIEMANN_ZEROS } from '../../../src/lib/physics/riemannZeta.ts'

import { buildSturmLiouville, type Tridiag } from './tridiag.ts'

const LAMBDA = Math.SQRT2
const FOUR_PI2_L2 = 4 * Math.PI * Math.PI * LAMBDA * LAMBDA // (2πλ)² = 8π²

/** #eigenvalues of the symmetric tridiagonal (d, e) strictly below sigma. */
function sturmCount(t: Tridiag, sigma: number): number {
  const { d, e } = t
  const n = d.length
  let count = 0
  let q = d[0]! - sigma
  if (q < 0) count++
  for (let i = 1; i < n; i++) {
    const ei = e[i - 1]!
    // Guard against division blow-up at exact pivots.
    const denom = q === 0 ? 1e-300 : q
    q = d[i]! - sigma - (ei * ei) / denom
    if (q < 0) count++
  }
  return count
}

/** All eigenvalues in (lo, hi), each bisected to relative tolerance. */
function eigenvaluesInRange(t: Tridiag, lo: number, hi: number, relTol = 1e-12): number[] {
  const nLo = sturmCount(t, lo)
  const nHi = sturmCount(t, hi)
  const out: number[] = []
  // Eigenvalues with index k in [nLo, nHi): bisect the k-th eigenvalue.
  for (let k = nLo; k < nHi; k++) {
    let a = lo
    let b = hi
    while (b - a > relTol * Math.max(1, Math.abs(a) + Math.abs(b))) {
      const mid = 0.5 * (a + b)
      if (sturmCount(t, mid) > k) b = mid
      else a = mid
    }
    out.push(0.5 * (a + b))
  }
  return out
}

/** Build L on (λ, X] and return negative eigenvalues mapped to t̂ = 2√(−α). */
function family(phase: 'sin' | 'cos', xTarget: number, h: number, alphaMin: number): number[] {
  // Right cutoff at a node of sin(2πλx) (m/(2λ)) or cos ((m+1/2)/(2λ)).
  const m = Math.round(2 * LAMBDA * xTarget - (phase === 'cos' ? 0.5 : 0))
  const X = (m + (phase === 'cos' ? 0.5 : 0)) / (2 * LAMBDA)
  const n = Math.round((X - LAMBDA) / h)
  const hEff = (X - LAMBDA) / n // snap h so the last face lands exactly on X
  const t = buildSturmLiouville(
    LAMBDA,
    hEff,
    n,
    (x) => x * x - LAMBDA * LAMBDA,
    (x) => FOUR_PI2_L2 * x * x
  )
  const alphas = eigenvaluesInRange(t, alphaMin, -1)
  return alphas.map((a) => 2 * Math.sqrt(-a)).sort((u, v) => u - v)
}

function run(h: number, xTarget: number, nShow: number): number[] {
  const tMax = RIEMANN_ZEROS[nShow + 6]!
  const alphaMin = -((tMax / 2) ** 2) * 1.15
  const sinF = family('sin', xTarget, h, alphaMin)
  const cosF = family('cos', xTarget, h, alphaMin)
  const merged = [...sinF, ...cosF].sort((u, v) => u - v)
  console.log(
    `\n=== h=${h}, X≈${xTarget}: sin-family ${sinF.length}, cos-family ${cosF.length} ===`
  )
  console.log('  n |   t̂_n (sin∪cos) |    t_n (true) |     Δ      | family')
  let si = 0
  let ci = 0
  for (let i = 0; i < Math.min(nShow, merged.length); i++) {
    const v = merged[i]!
    const fam = si < sinF.length && sinF[si] === v ? (si++, 'sin') : (ci++, 'cos')
    const tn = RIEMANN_ZEROS[i]!
    console.log(
      `${String(i + 1).padStart(4)} | ${v.toFixed(6).padStart(15)} | ${tn
        .toFixed(6)
        .padStart(13)} | ${(v - tn).toFixed(4).padStart(10)} | ${fam}`
    )
  }
  return merged
}

const N_SHOW = 40
const coarse = run(2e-3, 30, N_SHOW)
const fine = run(1e-3, 30, N_SHOW)
const wide = run(1e-3, 60, N_SHOW)

console.log('\n=== Convergence (first 12 t̂) ===')
console.log('  n |   h=2e-3,X30 |   h=1e-3,X30 |   h=1e-3,X60 |  |Δh|     |  |ΔX|')
for (let i = 0; i < 12; i++) {
  console.log(
    `${String(i + 1).padStart(4)} | ${coarse[i]!.toFixed(6).padStart(12)} | ${fine[i]!.toFixed(
      6
    ).padStart(12)} | ${wide[i]!.toFixed(6).padStart(12)} | ${Math.abs(
      fine[i]! - coarse[i]!
    ).toExponential(1)} | ${Math.abs(wide[i]! - fine[i]!).toExponential(1)}`
  )
}
