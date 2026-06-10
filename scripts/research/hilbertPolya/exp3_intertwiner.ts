/**
 * EXPERIMENT 3 — the regularized intertwiner Ŵ as a Cauchy kernel on zeros.
 *
 * From Yakaboylu eq (52): ⟨Ψ_s|V̂_{R,ε}Ψ_{s'}⟩ = ε²/(ε² − (s̄+s'−1)²).
 * On the critical line s̄+s'−1 = i(γ'−γ), so the Gram matrix of the
 * regularized intertwiner on N zeros is the CAUCHY (Poisson) kernel
 *     W_ε[n,m] = ε²/(ε² + (γ_n−γ_m)²),
 * positive definite for ANY point set (Bochner). Three measurements:
 *   1. λ_min(W_ε) > 0 on the true zeros across ε (positivity, on-line sector);
 *   2. inject one off-line doublet ρ₀ = β+iγ₀, 1−β̄₀-partner: the continued
 *      values couple the pair via a block → λ_min < 0 as ε→0 (RH content);
 *   3. λ_min on true (GUE-repelling) zeros vs Poisson vs picket-fence points
 *      at matched unit density — does level repulsion protect positivity?
 *
 * Run: node --experimental-strip-types scripts/research/hilbertPolya/exp3_intertwiner.ts
 */

import { RIEMANN_ZEROS, unfoldedZeroSpacings } from '../../../src/lib/physics/riemannZeta.ts'

/** Jacobi eigenvalues of a dense symmetric matrix (small sizes). */
function jacobiEigenvalues(aIn: Float64Array, n: number): number[] {
  const m = Float64Array.from(aIn)
  for (let sweep = 0; sweep < 200; sweep++) {
    let off = 0
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += m[i * n + j]! ** 2
    if (off < 1e-24) break
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const apq = m[i * n + j]!
        if (Math.abs(apq) < 1e-15) continue
        const theta = (m[j * n + j]! - m[i * n + i]!) / (2 * apq)
        const tSign = Math.sign(theta) || 1
        const t = tSign / (Math.abs(theta) + Math.sqrt(theta * theta + 1))
        const c = 1 / Math.sqrt(t * t + 1)
        const s = t * c
        for (let k = 0; k < n; k++) {
          const aik = m[i * n + k]!
          const ajk = m[j * n + k]!
          m[i * n + k] = c * aik - s * ajk
          m[j * n + k] = s * aik + c * ajk
        }
        for (let k = 0; k < n; k++) {
          const aki = m[k * n + i]!
          const akj = m[k * n + j]!
          m[k * n + i] = c * aki - s * akj
          m[k * n + j] = s * aki + c * akj
        }
      }
    }
  }
  const evs: number[] = []
  for (let i = 0; i < n; i++) evs.push(m[i * n + i]!)
  return evs.sort((u, v) => u - v)
}

/** Cauchy-kernel Gram on a 1-D point set. */
function cauchyGram(points: number[], eps: number): Float64Array {
  const n = points.length
  const g = new Float64Array(n * n)
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const d = points[i]! - points[j]!
      g[i * n + j] = (eps * eps) / (eps * eps + d * d)
    }
  }
  return g
}

// ---- 1. Positivity on the true zeros ----
const zeros = [...RIEMANN_ZEROS]
console.log('1) λ_min of W_ε on the 100 true zeros:')
for (const eps of [0.1, 0.5, 1, 2, 5, 10]) {
  const ev = jacobiEigenvalues(cauchyGram(zeros, eps), zeros.length)
  console.log(
    `   ε=${String(eps).padStart(4)}: λ_min = ${ev[0]!.toExponential(3)}, λ_max = ${ev[ev.length - 1]!.toFixed(3)}`
  )
}

// ---- 2. Off-line doublet detection ----
// Doublet ρ₀ = β+iγ₀ and its functional-equation partner 1−β+iγ₀ (β ≠ 1/2).
// Continued values (eq 52): entry(s,s') = ε²/(ε² − (s̄+s'−1)²) with
// s̄+s'−1 = (β₁+β₂−1) + i(γ'−γ). For the on-line points β=1/2 this is the
// Cauchy kernel; doublet cross terms get β₁+β₂−1 = 0 (partner) or ±(2β−1).
console.log('\n2) λ_min with one off-line doublet injected (β = 0.7, γ₀ = 60.5):')
function gramWithDoublet(eps: number, beta: number, g0: number): { m: Float64Array; n: number } {
  const pts = zeros.map((g) => ({ b: 0.5, g }))
  pts.push({ b: beta, g: g0 }, { b: 1 - beta, g: g0 })
  const n = pts.length
  const m = new Float64Array(n * n)
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const re = pts[i]!.b + pts[j]!.b - 1
      const im = pts[j]!.g - pts[i]!.g
      // ε²/(ε² − (re+i·im)²) — Hermitian for our symmetric construction; the
      // real part is the symmetric Gram entry (imaginary parts cancel pairwise
      // for the doublet-symmetric set; we keep the real part).
      const dRe = eps * eps - (re * re - im * im)
      const dIm = -2 * re * im
      const den = dRe * dRe + dIm * dIm
      m[i * n + j] = (eps * eps * dRe) / den
    }
  }
  return { m, n }
}
for (const eps of [2, 1, 0.5, 0.25, 0.1]) {
  const { m, n } = gramWithDoublet(eps, 0.7, 60.5)
  const ev = jacobiEigenvalues(m, n)
  console.log(
    `   ε=${String(eps).padStart(5)}: λ_min = ${ev[0]!.toFixed(6)}  ${ev[0]! < 0 ? '← NEGATIVE (off-line zero detected)' : ''}`
  )
}

// ---- 3. Does GUE repulsion protect positivity? ----
// Compare λ_min on unfolded zeros vs Poisson vs picket fence, unit density.
const spacings = unfoldedZeroSpacings()
const unfoldedZeros: number[] = [0]
for (const s of spacings) unfoldedZeros.push(unfoldedZeros[unfoldedZeros.length - 1]! + s)

// Deterministic LCG for the Poisson ensemble (fixed seed).
let lcg = 123456789 >>> 0
const rand = (): number => {
  lcg = (1103515245 * lcg + 12345) >>> 0
  return lcg / 4294967296
}
const NPTS = unfoldedZeros.length
console.log(`\n3) λ_min at matched unit density (${NPTS} points), 12 Poisson realizations:`)
console.log('      ε |  zeros (GUE) |  Poisson mean ± sd  |  picket')
for (const eps of [0.05, 0.1, 0.2, 0.4, 0.8]) {
  const evZ = jacobiEigenvalues(cauchyGram(unfoldedZeros, eps), NPTS)[0]!
  const pVals: number[] = []
  for (let r = 0; r < 12; r++) {
    const pts: number[] = [0]
    for (let i = 1; i < NPTS; i++) pts.push(pts[i - 1]! - Math.log(1 - rand()))
    pVals.push(jacobiEigenvalues(cauchyGram(pts, eps), NPTS)[0]!)
  }
  const mean = pVals.reduce((a, b) => a + b, 0) / pVals.length
  const sd = Math.sqrt(pVals.reduce((a, b) => a + (b - mean) ** 2, 0) / pVals.length)
  const picket = Array.from({ length: NPTS }, (_, i) => i)
  const evP = jacobiEigenvalues(cauchyGram(picket, eps), NPTS)[0]!
  console.log(
    `  ${String(eps).padStart(5)} | ${evZ.toExponential(3).padStart(12)} | ${mean
      .toExponential(3)
      .padStart(10)} ± ${sd.toExponential(1)} | ${evP.toExponential(3)}`
  )
}
