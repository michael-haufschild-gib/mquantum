/**
 * EXPERIMENT 1b — Connes–Moscovici prolate operator, Sonin-constrained.
 *
 * Same outer-region operator as exp1 (L = ∂((x²−λ²)∂) + (2πλ)²x² on (λ, B],
 * zero-flux at the degenerate face x=λ), but diagonalized SUBJECT TO the
 * Fourier-side domain conditions of W_sa: the (cosine/sine) transform of ξ
 * must vanish on [0, λ] — the Sonin-space constraint. Without it (run 1) the
 * spectrum is a different self-adjoint extension and does not track zeta.
 *
 * Constrained eigenvalues of A on {x : Qᵀx = 0} (Q orthonormal, N×m) are
 * counted via bordered-matrix inertia (Haynsworth):
 *   count(σ) = n₋(A−σ) + n₊(Qᵀ(A−σ)⁻¹Q) − m,
 * then bisected. A−σ is tridiagonal ⇒ each evaluation is O(mN + m³).
 *
 * Run: node --experimental-strip-types scripts/research/hilbertPolya/exp1b_sonin.ts
 */

import { RIEMANN_ZEROS } from '../../../src/lib/physics/riemannZeta.ts'

import { buildSturmLiouville, type Tridiag } from './tridiag.ts'

const LAMBDA = Math.SQRT2
const FOUR_PI2_L2 = 4 * Math.PI * Math.PI * LAMBDA * LAMBDA

/** n₋ of (tridiag − σ) AND the solves (tridiag − σ)⁻¹·cols via LDLᵀ sweep. */
function ldlTridiag(
  t: Tridiag,
  sigma: number
): { nNeg: number; solve: (b: Float64Array) => Float64Array } {
  const { d, e } = t
  const n = d.length
  const dd = new Float64Array(n) // pivots
  const ll = new Float64Array(n) // multipliers l[i] couples (i, i+1)
  let nNeg = 0
  let prev = d[0]! - sigma
  if (prev === 0) prev = 1e-300
  dd[0] = prev
  if (prev < 0) nNeg++
  for (let i = 1; i < n; i++) {
    const li = e[i - 1]! / dd[i - 1]!
    ll[i - 1] = li
    let piv = d[i]! - sigma - li * e[i - 1]!
    if (piv === 0) piv = 1e-300
    dd[i] = piv
    if (piv < 0) nNeg++
  }
  const solve = (b: Float64Array): Float64Array => {
    const y = Float64Array.from(b)
    for (let i = 1; i < n; i++) y[i]! -= ll[i - 1]! * y[i - 1]!
    for (let i = 0; i < n; i++) y[i]! /= dd[i]!
    for (let i = n - 2; i >= 0; i--) y[i]! -= ll[i]! * y[i + 1]!
    return y
  }
  return { nNeg, solve }
}

/** Inertia (n₋, nZero, n₊) of a dense symmetric m×m via eigen-free LDLᵀ w/ Bunch–Kaufman-lite (diagonal pivoting + symmetric permutation). */
function denseInertia(M: Float64Array, m: number): { nNeg: number; nPos: number } {
  // Copy; simple symmetric Gaussian elimination with diagonal pivoting.
  const a = Float64Array.from(M)
  const perm = Array.from({ length: m }, (_, i) => i)
  let nNeg = 0
  let nPos = 0
  for (let k = 0; k < m; k++) {
    // Pick the largest |diagonal| among remaining for stability.
    let best = k
    for (let j = k + 1; j < m; j++) {
      if (Math.abs(a[perm[j]! * m + perm[j]!]!) > Math.abs(a[perm[best]! * m + perm[best]!]!))
        best = j
    }
    ;[perm[k], perm[best]] = [perm[best]!, perm[k]!]
    const pk = perm[k]!
    const piv = a[pk * m + pk]!
    if (Math.abs(piv) < 1e-13) {
      // Treat as zero pivot (semidefinite direction) — skip without counting.
      continue
    }
    if (piv < 0) nNeg++
    else nPos++
    for (let i = k + 1; i < m; i++) {
      const pi = perm[i]!
      const f = a[pi * m + pk]! / piv
      for (let j = i; j < m; j++) {
        const pj = perm[j]!
        a[pi * m + pj] = a[pi * m + pj]! - f * a[pj * m + pk]!
        a[pj * m + pi] = a[pi * m + pj]!
      }
    }
  }
  return { nNeg, nPos }
}

/** Modified Gram–Schmidt with reorthogonalization; drops near-dependent rows. */
function orthonormalize(rows: Float64Array[], dropTol = 1e-10): Float64Array[] {
  const out: Float64Array[] = []
  for (const r of rows) {
    const v = Float64Array.from(r)
    const norm0 = Math.hypot(...v)
    for (let pass = 0; pass < 2; pass++) {
      for (const q of out) {
        let dot = 0
        for (let i = 0; i < v.length; i++) dot += q[i]! * v[i]!
        for (let i = 0; i < v.length; i++) v[i]! -= dot * q[i]!
      }
    }
    let norm = 0
    for (let i = 0; i < v.length; i++) norm += v[i]! * v[i]!
    norm = Math.sqrt(norm)
    if (norm > dropTol * norm0) {
      for (let i = 0; i < v.length; i++) v[i]! /= norm
      out.push(v)
    }
  }
  return out
}

interface ConstrainedProblem {
  t: Tridiag
  q: Float64Array[] // orthonormal constraint vectors
}

/** count(σ) = n₋(A−σ) + n₊(Qᵀ(A−σ)⁻¹Q) − m. */
function constrainedCount(p: ConstrainedProblem, sigma: number): number {
  const { nNeg, solve } = ldlTridiag(p.t, sigma)
  const m = p.q.length
  if (m === 0) return nNeg
  // S = Qᵀ (A−σ)⁻¹ Q
  const n = p.t.d.length
  const s = new Float64Array(m * m)
  const sols: Float64Array[] = p.q.map((qi) => solve(qi))
  for (let i = 0; i < m; i++) {
    for (let j = i; j < m; j++) {
      let dot = 0
      const qi = p.q[i]!
      const sj = sols[j]!
      for (let k = 0; k < n; k++) dot += qi[k]! * sj[k]!
      s[i * m + j] = dot
      s[j * m + i] = dot
    }
  }
  const { nPos } = denseInertia(s, m)
  return nNeg + nPos - m
}

/** All constrained eigenvalues in (lo, hi) by bisection on constrainedCount. */
function constrainedEigs(p: ConstrainedProblem, lo: number, hi: number, tol = 1e-9): number[] {
  const nLo = constrainedCount(p, lo)
  const nHi = constrainedCount(p, hi)
  const out: number[] = []
  for (let k = nLo; k < nHi; k++) {
    let a = lo
    let b = hi
    while (b - a > tol * Math.max(1, Math.abs(a) + Math.abs(b))) {
      const mid = 0.5 * (a + b)
      if (constrainedCount(p, mid) > k) b = mid
      else a = mid
    }
    out.push(0.5 * (a + b))
  }
  return out
}

/** Build the Sonin-constrained problem for one parity sector. */
function buildProblem(parity: 'even' | 'odd', bTarget: number, nCells: number): ConstrainedProblem {
  // Right cutoff phase: even ~ sin(2πλx)/x ⇒ B at sin node; odd ⇒ cos node.
  const mNode = Math.round(2 * LAMBDA * bTarget - (parity === 'odd' ? 0.5 : 0))
  const B = (mNode + (parity === 'odd' ? 0.5 : 0)) / (2 * LAMBDA)
  const h = (B - LAMBDA) / nCells
  const t = buildSturmLiouville(
    LAMBDA,
    h,
    nCells,
    (x) => x * x - LAMBDA * LAMBDA,
    (x) => FOUR_PI2_L2 * x * x
  )
  // Sonin constraints: transform of ξ vanishes on [0, λ].
  // even: ξ̂(y) = 2∫ cos(2πxy) ξ dx;  odd: 2∫ sin(2πxy) ξ dx.
  const mConstraints = Math.ceil(4 * LAMBDA * B)
  const rows: Float64Array[] = []
  for (let j = 0; j < mConstraints; j++) {
    const y = (j / (mConstraints - 1)) * LAMBDA
    const row = new Float64Array(nCells)
    for (let i = 0; i < nCells; i++) {
      const x = LAMBDA + (i + 0.5) * h
      row[i] = parity === 'even' ? Math.cos(2 * Math.PI * x * y) : Math.sin(2 * Math.PI * x * y)
    }
    rows.push(row)
  }
  const q = orthonormalize(rows)
  return { t, q }
}

/** Validate machinery: constrained count vs brute force on a small toy. */
function validate(): void {
  // Toy: A = diag(1..12) tridiag with e=0.5; constraints: 2 random vectors.
  const n = 12
  const d = Float64Array.from({ length: n }, (_, i) => i + 1)
  const e = new Float64Array(n - 1).fill(0.5)
  const c1 = Float64Array.from({ length: n }, (_, i) => Math.sin(i + 1))
  const c2 = Float64Array.from({ length: n }, (_, i) => Math.cos(2 * i))
  const q = orthonormalize([c1, c2])
  // Brute force: project A to the (n-m)-dim null space via dense Jacobi.
  const basis: Float64Array[] = []
  for (let i = 0; i < n; i++) {
    const v = new Float64Array(n)
    v[i] = 1
    basis.push(v)
  }
  const proj = orthonormalize([...q.map((x) => Float64Array.from(x)), ...basis]).slice(q.length)
  const dim = proj.length
  const M = new Float64Array(dim * dim)
  const applyA = (v: Float64Array): Float64Array => {
    const out = new Float64Array(n)
    for (let i = 0; i < n; i++) {
      out[i] =
        d[i]! * v[i]! + (i > 0 ? e[i - 1]! * v[i - 1]! : 0) + (i < n - 1 ? e[i]! * v[i + 1]! : 0)
    }
    return out
  }
  for (let i = 0; i < dim; i++) {
    const av = applyA(proj[i]!)
    for (let j = i; j < dim; j++) {
      let dot = 0
      for (let k = 0; k < n; k++) dot += proj[j]![k]! * av[k]!
      M[i * dim + j] = dot
      M[j * dim + i] = dot
    }
  }
  // Jacobi eigenvalues of M.
  const jacobi = (a: Float64Array, sz: number): number[] => {
    const m = Float64Array.from(a)
    for (let sweep = 0; sweep < 100; sweep++) {
      let off = 0
      for (let i = 0; i < sz; i++) for (let j = i + 1; j < sz; j++) off += m[i * sz + j]! ** 2
      if (off < 1e-22) break
      for (let i = 0; i < sz; i++) {
        for (let j = i + 1; j < sz; j++) {
          const apq = m[i * sz + j]!
          if (Math.abs(apq) < 1e-14) continue
          const theta = (m[j * sz + j]! - m[i * sz + i]!) / (2 * apq)
          const tSign = Math.sign(theta) || 1
          const tt = tSign / (Math.abs(theta) + Math.sqrt(theta * theta + 1))
          const c = 1 / Math.sqrt(tt * tt + 1)
          const s = tt * c
          for (let k = 0; k < sz; k++) {
            const aik = m[i * sz + k]!
            const ajk = m[j * sz + k]!
            m[i * sz + k] = c * aik - s * ajk
            m[j * sz + k] = s * aik + c * ajk
          }
          for (let k = 0; k < sz; k++) {
            const aki = m[k * sz + i]!
            const akj = m[k * sz + j]!
            m[k * sz + i] = c * aki - s * akj
            m[k * sz + j] = s * aki + c * akj
          }
        }
      }
    }
    const evs: number[] = []
    for (let i = 0; i < sz; i++) evs.push(m[i * sz + i]!)
    return evs.sort((u, v) => u - v)
  }
  const brute = jacobi(M, dim)
  const mine = constrainedEigs(
    { t: { d: Float64Array.from(d), e: Float64Array.from(e) }, q },
    -5,
    20
  )
  let maxErr = 0
  for (let i = 0; i < Math.min(brute.length, mine.length); i++) {
    maxErr = Math.max(maxErr, Math.abs(brute[i]! - mine[i]!))
  }
  console.log(
    `validate: brute ${brute.length} eigs, bordered ${mine.length} eigs, max|Δ| = ${maxErr.toExponential(2)}`
  )
  if (brute.length !== mine.length || maxErr > 1e-6)
    throw new Error('constrained machinery FAILED validation')
  console.log('constrained-inertia machinery PASSED\n')
}

validate()

const B_TARGET = Number(process.env.SONIN_B ?? 24)
const N_CELLS = Number(process.env.SONIN_N ?? 16000)
const N_SHOW = Number(process.env.SONIN_SHOW ?? 30)

console.log(`Sonin-constrained prolate spectrum, λ=√2, B≈${B_TARGET}, N=${N_CELLS}`)
const tMax = RIEMANN_ZEROS[N_SHOW + 4]!
const alphaMin = -((tMax / 2) ** 2) * 1.1

// Optional window restriction: only resolve t̂ ∈ [SONIN_TLO, SONIN_THI].
const tLo = Number(process.env.SONIN_TLO ?? 0)
const tHi = Number(process.env.SONIN_THI ?? 0)
const lo = tHi > 0 ? -((tHi / 2) ** 2) : alphaMin
const hi = tLo > 0 ? -((tLo / 2) ** 2) : -1

const results: Record<string, number[]> = {}
for (const parity of ['even', 'odd'] as const) {
  const prob = buildProblem(parity, B_TARGET, N_CELLS)
  console.log(
    `${parity}: ${prob.q.length} independent Sonin constraints (of ${Math.ceil(4 * LAMBDA * B_TARGET)} sampled)`
  )
  const alphas = constrainedEigs(prob, lo, hi)
  results[parity] = alphas.map((a) => 2 * Math.sqrt(-a)).sort((u, v) => u - v)
  console.log(`${parity}: ${results[parity]!.length} negative constrained eigenvalues in range`)
}

const merged = [...results.even!, ...results.odd!].sort((u, v) => u - v)
const windowed = tLo > 0 || tHi > 0
console.log(
  `\n  n |   t̂_n (Sonin) | ${windowed ? 'nearest zero' : '   t_n (true)'} |     Δ     | family`
)
let ei = 0
let oi = 0
for (let i = 0; i < Math.min(N_SHOW, merged.length); i++) {
  const v = merged[i]!
  const fam = ei < results.even!.length && results.even![ei] === v ? (ei++, 'even') : (oi++, 'odd')
  const tn = windowed
    ? RIEMANN_ZEROS.reduce((best, z) => (Math.abs(z - v) < Math.abs(best - v) ? z : best), Infinity)
    : RIEMANN_ZEROS[i]!
  console.log(
    `${String(i + 1).padStart(4)} | ${v.toFixed(5).padStart(14)} | ${tn.toFixed(5).padStart(13)} | ${(
      v - tn
    )
      .toFixed(4)
      .padStart(9)} | ${fam}`
  )
}
