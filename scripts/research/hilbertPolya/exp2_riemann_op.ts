/**
 * EXPERIMENT 2 — the Yakaboylu Riemann operator R̂ as a finite matrix.
 *
 * In the T̂-representation with u = log t (arXiv:2408.15135 eq 20, unitarily
 * mapped to L²(ℝ, du)):  A = −i(∂_u + μ(e^u)),  μ(t) = t·tanh(t/2) − 1.
 * The Dirichlet condition Ψ(0) = 0 is the single linear functional
 * cᵀG = ∫ e^{u/2} G(u) du = 0.  Unconditional theorem: the constrained
 * spectrum is {i(1/2−λ) | Λ(λ)=0}; on the critical line these are REAL
 * eigenvalues z = γ_n, while the (1−2^{1−s}) prefactor zeros give the branch
 * z = −2πk/log2 − i/2.
 *
 * A = −i·B with B = D + diag(μ) REAL, so we diagonalize the real compressed
 * matrix P B P (P = I − ĉĉᵀ) by Hessenberg + Francis double-shift QR.
 * β ∈ spec(B) ↔ z = −iβ: zeta zeros ⟺ β = ±iγ_n (imaginary axis),
 * eta-prefactor zeros ⟺ β = 1/2 ∓ 2πik/log2 (Re = 1/2 branch).
 *
 * Run: node --experimental-strip-types scripts/research/hilbertPolya/exp2_riemann_op.ts
 */

import { RIEMANN_ZEROS } from '../../../src/lib/physics/riemannZeta.ts'

/** μ(t) = t·tanh(t/2) − 1, evaluated stably for large t. */
function mu(t: number): number {
  return t * Math.tanh(t / 2) - 1
}

interface ComplexEig {
  re: number
  im: number
}

/**
 * Eigenvalues of a real dense matrix: Householder reduction to upper
 * Hessenberg followed by Francis double-shift QR (Numerical Recipes
 * balance-free variant; eigenvalues only).
 */
function realEigenvalues(aIn: Float64Array, n: number): ComplexEig[] {
  const a = Float64Array.from(aIn)
  const at = (i: number, j: number): number => a[i * n + j]!
  const set = (i: number, j: number, v: number): void => {
    a[i * n + j] = v
  }

  // --- Reduction to upper Hessenberg (elimination with pivoting, NR elmhes) ---
  for (let m = 1; m < n - 1; m++) {
    let x = 0
    let piv = m
    for (let j = m; j < n; j++) {
      if (Math.abs(at(j, m - 1)) > Math.abs(x)) {
        x = at(j, m - 1)
        piv = j
      }
    }
    if (piv !== m) {
      for (let j = m - 1; j < n; j++) {
        const tmp = at(piv, j)
        set(piv, j, at(m, j))
        set(m, j, tmp)
      }
      for (let j = 0; j < n; j++) {
        const tmp = at(j, piv)
        set(j, piv, at(j, m))
        set(j, m, tmp)
      }
    }
    if (x !== 0) {
      for (let i = m + 1; i < n; i++) {
        let y = at(i, m - 1)
        if (y !== 0) {
          y /= x
          set(i, m - 1, y)
          for (let j = m; j < n; j++) set(i, j, at(i, j) - y * at(m, j))
          for (let j = 0; j < n; j++) set(j, m, at(j, m) + y * at(j, i))
        }
      }
    }
  }
  // Zero below the subdiagonal.
  for (let i = 2; i < n; i++) for (let j = 0; j < i - 1; j++) set(i, j, 0)

  // --- Francis double-shift QR on the Hessenberg matrix (NR hqr) ---
  const eig: ComplexEig[] = []
  let anorm = 0
  for (let i = 0; i < n; i++) {
    for (let j = Math.max(i - 1, 0); j < n; j++) anorm += Math.abs(at(i, j))
  }
  let nn = n - 1
  let t = 0
  while (nn >= 0) {
    let its = 0
    let l: number
    do {
      for (l = nn; l >= 1; l--) {
        const s = Math.abs(at(l - 1, l - 1)) + Math.abs(at(l, l))
        const sc = s === 0 ? anorm : s
        if (Math.abs(at(l, l - 1)) + sc === sc) {
          set(l, l - 1, 0)
          break
        }
      }
      let x = at(nn, nn)
      if (l === nn) {
        eig.push({ re: x + t, im: 0 })
        nn--
      } else {
        let y = at(nn - 1, nn - 1)
        let w = at(nn, nn - 1) * at(nn - 1, nn)
        if (l === nn - 1) {
          const p = 0.5 * (y - x)
          const q = p * p + w
          const zz = Math.sqrt(Math.abs(q))
          x += t
          if (q >= 0) {
            const z2 = p + (p >= 0 ? zz : -zz)
            eig.push({ re: x + z2, im: 0 })
            eig.push({ re: z2 === 0 ? x : x - w / z2, im: 0 })
          } else {
            eig.push({ re: x + p, im: zz })
            eig.push({ re: x + p, im: -zz })
          }
          nn -= 2
        } else {
          if (its === 60) throw new Error('hqr: too many iterations')
          if (its === 10 || its === 20) {
            t += x
            for (let i = 0; i <= nn; i++) set(i, i, at(i, i) - x)
            const s = Math.abs(at(nn, nn - 1)) + Math.abs(at(nn - 1, nn - 2))
            y = 0.75 * s
            x = y
            w = -0.4375 * s * s
          }
          its++
          let m: number
          let p = 0
          let q = 0
          let r = 0
          for (m = nn - 2; m >= l; m--) {
            const z2 = at(m, m)
            const rr = x - z2
            const ss = y - z2
            p = (rr * ss - w) / at(m + 1, m) + at(m, m + 1)
            q = at(m + 1, m + 1) - z2 - rr - ss
            r = at(m + 2, m + 1)
            const s = Math.abs(p) + Math.abs(q) + Math.abs(r)
            p /= s
            q /= s
            r /= s
            if (m === l) break
            const u = Math.abs(at(m, m - 1)) * (Math.abs(q) + Math.abs(r))
            const v =
              Math.abs(p) *
              (Math.abs(at(m - 1, m - 1)) + Math.abs(at(m, m)) + Math.abs(at(m + 1, m + 1)))
            if (u + v === v) break
          }
          for (let i = m + 2; i <= nn; i++) {
            set(i, i - 2, 0)
            if (i !== m + 2) set(i, i - 3, 0)
          }
          for (let k = m; k <= nn - 1; k++) {
            if (k !== m) {
              p = at(k, k - 1)
              q = at(k + 1, k - 1)
              r = k + 2 <= nn ? at(k + 2, k - 1) : 0
              const xx = Math.abs(p) + Math.abs(q) + Math.abs(r)
              if (xx !== 0) {
                p /= xx
                q /= xx
                r /= xx
              }
            }
            const s0 = Math.sqrt(p * p + q * q + r * r)
            const s = p >= 0 ? s0 : -s0
            if (s === 0) continue
            if (k === m) {
              if (l !== m) set(k, k - 1, -at(k, k - 1))
            } else {
              set(k, k - 1, -s * (Math.abs(at(k, k - 1)) === 0 ? 1 : Math.abs(at(k, k - 1))))
              // NR uses: a[k][k-1] = -s*x where x is the scale; using the
              // scaled form below keeps the matrix consistent.
            }
            p += s
            const xx = p / s
            const yy = q / s
            const zz = r / s
            q /= p
            r /= p
            for (let j = k; j <= nn; j++) {
              let pp = at(k, j) + q * at(k + 1, j)
              if (k + 2 <= nn) {
                pp += r * at(k + 2, j)
                set(k + 2, j, at(k + 2, j) - pp * zz)
              }
              set(k + 1, j, at(k + 1, j) - pp * yy)
              set(k, j, at(k, j) - pp * xx)
            }
            const mmin = nn < k + 3 ? nn : k + 3
            for (let i = l; i <= mmin; i++) {
              let pp = xx * at(i, k) + yy * at(i, k + 1)
              if (k + 2 <= nn) {
                pp += zz * at(i, k + 2)
                set(i, k + 2, at(i, k + 2) - pp * r)
              }
              set(i, k + 1, at(i, k + 1) - pp * q)
              set(i, k, at(i, k) - pp)
            }
          }
        }
      }
    } while (l < nn - 1 && nn >= 0)
  }
  return eig
}

/** Self-test for the QR eigensolver on matrices with known spectra. */
function selfTestEig(): void {
  // Companion-style: rotation block ⊕ real values.
  const n = 6
  const m = new Float64Array(n * n)
  // 2x2 rotation with eigenvalues 3 ± 4i.
  m[0 * n + 0] = 3
  m[0 * n + 1] = 4
  m[1 * n + 0] = -4
  m[1 * n + 1] = 3
  // Upper-triangular tail with eigenvalues -1, 2, 5, 7 (+ couplings).
  const diag = [-1, 2, 5, 7]
  for (let i = 0; i < 4; i++) {
    m[(i + 2) * n + (i + 2)] = diag[i]!
    if (i < 3) m[(i + 2) * n + (i + 3)] = 1.5
  }
  m[0 * n + 3] = 2 // extra coupling, spectrum unchanged (block triangular)
  const eig = realEigenvalues(m, n).sort((a, b) => a.re - b.re || a.im - b.im)
  const expected = [
    { re: -1, im: 0 },
    { re: 2, im: 0 },
    { re: 3, im: -4 },
    { re: 3, im: 4 },
    { re: 5, im: 0 },
    { re: 7, im: 0 },
  ]
  let maxErr = 0
  for (let i = 0; i < n; i++) {
    maxErr = Math.max(
      maxErr,
      Math.hypot(eig[i]!.re - expected[i]!.re, eig[i]!.im - expected[i]!.im)
    )
  }
  console.log(`eig self-test: max|Δ| = ${maxErr.toExponential(2)}`)
  if (maxErr > 1e-8) throw new Error('eig self-test FAILED')
}

selfTestEig()

// ---------------- Build B = D + diag(μ(e^u)) and compress ----------------

const U_MIN = Number(process.env.RZOP_UMIN ?? -12)
const U_MAX = Number(process.env.RZOP_UMAX ?? 4.2)
const N = Number(process.env.RZOP_N ?? 900)

const duStep = (U_MAX - U_MIN) / (N - 1)
const us = Array.from({ length: N }, (_, i) => U_MIN + i * duStep)

const B = new Float64Array(N * N)
// Central differences; 2nd-order one-sided at the ends.
for (let i = 0; i < N; i++) {
  if (i > 0 && i < N - 1) {
    B[i * N + (i + 1)] = 1 / (2 * duStep)
    B[i * N + (i - 1)] = -1 / (2 * duStep)
  } else if (i === 0) {
    B[0 * N + 0] = -1.5 / duStep
    B[0 * N + 1] = 2 / duStep
    B[0 * N + 2] = -0.5 / duStep
  } else {
    B[i * N + i] = 1.5 / duStep
    B[i * N + (i - 1)] = -2 / duStep
    B[i * N + (i - 2)] = 0.5 / duStep
  }
  B[i * N + i] += mu(Math.exp(us[i]!))
}

// Constraint vector c_i = e^{u_i/2} (trapezoid weights folded in).
const c = new Float64Array(N)
for (let i = 0; i < N; i++) {
  const w = i === 0 || i === N - 1 ? 0.5 : 1
  c[i] = Math.exp(us[i]! / 2) * w * duStep
}
let cn = 0
for (let i = 0; i < N; i++) cn += c[i]! * c[i]!
cn = Math.sqrt(cn)
for (let i = 0; i < N; i++) c[i]! /= cn

// P B P with P = I − ccᵀ.
const Bc = Float64Array.from(B)
const tmp = new Float64Array(N)
// Bc = B − c(cᵀB):
for (let j = 0; j < N; j++) {
  let dot = 0
  for (let i = 0; i < N; i++) dot += c[i]! * B[i * N + j]!
  tmp[j] = dot
}
for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) Bc[i * N + j]! -= c[i]! * tmp[j]!
// Bc = Bc − (Bc c)cᵀ:
for (let i = 0; i < N; i++) {
  let dot = 0
  for (let j = 0; j < N; j++) dot += Bc[i * N + j]! * c[j]!
  tmp[i] = dot
}
for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) Bc[i * N + j]! -= tmp[i]! * c[j]!

console.log(`Riemann operator matrix: N=${N}, u ∈ [${U_MIN}, ${U_MAX}], δu=${duStep.toFixed(4)}`)
const eigs = realEigenvalues(Bc, N)

// z = −iβ: zeta-zero branch ⟺ β ≈ ±iγ (|Re β| small); eta branch ⟺ Re β ≈ 1/2.
const zetaBranch = eigs.filter((e) => Math.abs(e.re) < 0.2 && e.im > 1).sort((a, b) => a.im - b.im)
const etaBranch = eigs
  .filter((e) => Math.abs(e.re - 0.5) < 0.2 && Math.abs(e.im) > 1)
  .sort((a, b) => Math.abs(a.im) - Math.abs(b.im))

console.log(`\nzeta-branch candidates (Re β ≈ 0, Im β > 0): ${zetaBranch.length}`)
console.log('  n |   Im β (= γ̂_n) |   γ_n (true) |     Δ     |  Re β')
for (let i = 0; i < Math.min(zetaBranch.length, 25); i++) {
  const tn = RIEMANN_ZEROS[i]!
  console.log(
    `${String(i + 1).padStart(4)} | ${zetaBranch[i]!.im.toFixed(5).padStart(15)} | ${tn
      .toFixed(5)
      .padStart(12)} | ${(zetaBranch[i]!.im - tn).toFixed(4).padStart(9)} | ${zetaBranch[
      i
    ]!.re.toExponential(1).padStart(8)}`
  )
}
console.log(`\neta-prefactor branch (Re β ≈ 1/2): ${etaBranch.length} — expected |Im| ≈ 9.0647·k`)
for (let i = 0; i < Math.min(etaBranch.length, 8); i++) {
  const e = etaBranch[i]!
  const k = Math.round(Math.abs(e.im) / ((2 * Math.PI) / Math.LN2))
  console.log(
    `  Re=${e.re.toFixed(4)}, Im=${e.im.toFixed(4)}  (2πk/log2 for k=${k}: ${(
      (k * 2 * Math.PI) /
      Math.LN2
    ).toFixed(4)})`
  )
}

// Histogram of all eigenvalues by Re β (structure overview).
const bands = new Map<string, number>()
for (const e of eigs) {
  const key = (Math.round(e.re * 2) / 2).toFixed(1)
  bands.set(key, (bands.get(key) ?? 0) + 1)
}
console.log('\nRe-β band histogram (band: count):')
console.log(
  [...bands.entries()]
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([k, v]) => `${k}: ${v}`)
    .join('  ')
)
