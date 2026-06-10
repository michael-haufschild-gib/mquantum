/**
 * EXPERIMENT 4 — Weil positivity from the PRIME side (the RH keystone, numerically).
 *
 * The reduction chain (see logs/rh_proof_quest_20260610_204044.md):
 *   RH ⟺ Weil positivity ⟺ λ_min ≥ 0 for the Gram family
 *     M_{jk}(σ; u) = Σ_ρ ĝ_j(γ_ρ) ĝ_k(γ_ρ),   ĝ_j(r) = e^{−(r−u_j)²/4σ²} + e^{−(r+u_j)²/4σ²}
 * over all grids u and widths σ. Each entry reduces (Gaussian product rule) to
 *     M_{jk} = Σ_{a∈±u_j, b∈±u_k} e^{−(a−b)²/8σ²} · W1((a+b)/2),
 *     W1(m)  = Σ_γ e^{−(γ−m)²/2σ²}   (sum over ALL zeros, both signs).
 * W1 is computable WITHOUT knowing the zeros via the Weil explicit formula
 * (Iwaniec–Kowalski Thm 5.12 form, h even, entire, Gaussian-decaying):
 *     Σ_γ h(γ) = h(i/2) + h(−i/2)
 *              + (1/2π)∫ h(r)[Re ψ(1/4 + ir/2) − log π] dr
 *              − 2 Σ_{p^k≤N} (log p) p^{−k/2} g(k log p),
 *     g(x) = (1/2π)∫h(r)e^{−ixr}dr.
 * PART A certifies this bridge against the 100 known zeros.
 * PART B computes λ_min of M from the prime side only — a negative value
 * (beyond numerical error) would be a DEFINITE FALSIFICATION of RH.
 * PART C tracks the positivity margin as σ shrinks toward the critical regime.
 *
 * Run: node --experimental-strip-types scripts/research/hilbertPolya/exp4_weil_positivity.ts
 */

import { RIEMANN_ZEROS } from '../../../src/lib/physics/riemannZeta.ts'

const SQRT_2PI = Math.sqrt(2 * Math.PI)

// ---------- complex digamma (recurrence + Stirling), Re ψ(1/4 + ir/2) ----------
function rePsiQuarter(r: number): number {
  // z = 1/4 + ir/2; push Re z up by recurrence ψ(z) = ψ(z+1) − 1/z.
  let re = 0.25
  let im = r / 2
  let accRe = 0
  while (re < 16) {
    const d = re * re + im * im
    accRe -= re / d
    re += 1
  }
  // Stirling: ψ(z) ≈ log z − 1/2z − 1/12z² + 1/120z⁴ − 1/252z⁶
  const d = re * re + im * im
  const logRe = 0.5 * Math.log(d)
  const izRe = re / d // Re(1/z)
  // 1/z² and powers
  const z2Re = (re * re - im * im) / (d * d)
  const z2Im = (-2 * re * im) / (d * d)
  const z4Re = z2Re * z2Re - z2Im * z2Im
  const z6Re = z4Re * z2Re - (z2Re * z2Im + z2Im * z2Re) * z2Im
  return accRe + logRe - 0.5 * izRe - z2Re / 12 + z4Re / 120 - z6Re / 252
}

// ---------- prime-power bins: A[x-bin] = Σ Λ(n) n^{−1/2} for log n in bin ----------
const N_MAX = 10_000_000
const DX = 5e-5
const X_MAX = Math.log(N_MAX) + DX
const NBINS = Math.ceil(X_MAX / DX)

interface PrimeBins {
  a0: Float64Array
  a1: Float64Array
}

function buildPrimeBins(): PrimeBins {
  // zeroth and first moments per bin: a0 = Σ w, a1 = Σ w·(x − x_bin), so the
  // per-u sum can use f(x) ≈ f(x_bin) + f′(x_bin)(x − x_bin) — kills the
  // phase error u·Δx that limited run 1 to ~1e-4.
  const a0 = new Float64Array(NBINS)
  const a1 = new Float64Array(NBINS)
  const sieve = new Uint8Array(N_MAX + 1) // 0 = prime
  sieve[0] = sieve[1] = 1
  for (let p = 2; p * p <= N_MAX; p++) {
    if (sieve[p]) continue
    for (let q = p * p; q <= N_MAX; q += p) sieve[q] = 1
  }
  for (let p = 2; p <= N_MAX; p++) {
    if (sieve[p]) continue
    const lp = Math.log(p)
    for (let q = p; q <= N_MAX; q *= p) {
      const x = Math.log(q)
      const b = Math.floor(x / DX)
      const w = lp / Math.sqrt(q)
      a0[b] += w
      a1[b] += w * (x - (b + 0.5) * DX)
      if (q > N_MAX / p) break
    }
  }
  return { a0, a1 }
}

// ---------- explicit-formula evaluation of Σ_γ h(γ), h = Gaussian pair ----------
interface EfParts {
  total: number
  pole: number
  arch: number
  primes: number
  tailBound: number
}

function efGaussianPair(u: number, sigma: number, bins: PrimeBins): EfParts {
  const s2 = sigma * sigma
  // pole term h(i/2) + h(−i/2) = 4 e^{(1/4−u²)/2σ²} cos(u/2σ²)
  const pole = 4 * Math.exp((0.25 - u * u) / (2 * s2)) * Math.cos(u / (2 * s2))
  // archimedean: (1/π)∫_0^∞ h(r)[Re ψ(1/4+ir/2) − log π] dr  (integrand even)
  const lo = 0
  const hi = u + 14 * sigma + 2
  const nStep = 2 * Math.max(1000, Math.ceil((hi - lo) / (sigma / 24)))
  const dr = (hi - lo) / nStep
  let arch = 0
  for (let i = 0; i <= nStep; i++) {
    const r = lo + i * dr
    const h = Math.exp((-(r - u) * (r - u)) / (2 * s2)) + Math.exp((-(r + u) * (r + u)) / (2 * s2))
    if (h < 1e-22) continue
    const w = i === 0 || i === nStep ? 1 : i % 2 === 1 ? 4 : 2
    arch += w * h * (rePsiQuarter(r) - Math.log(Math.PI))
  }
  arch *= dr / 3 / Math.PI
  // prime sum: 2 Σ Λ(n) n^{−1/2} g(log n), g(x) = (σ/√2π) e^{−σ²x²/2} 2cos(ux)
  let primes = 0
  for (let b = 0; b < NBINS; b++) {
    const a = bins.a0[b]!
    if (a === 0) continue
    const x = (b + 0.5) * DX
    const env = Math.exp(-0.5 * s2 * x * x)
    const c = Math.cos(u * x)
    const s = Math.sin(u * x)
    // f(x) = env·cos(ux); first-order in-bin correction via f′
    primes += a * env * c + bins.a1[b]! * env * (-s2 * x * c - u * s)
  }
  primes *= (4 * sigma) / SQRT_2PI
  // truncation tail bound: ∫_{X}^∞ e^{x/2 − σ²x²/2} dx · (4σ/√2π), ψ(t)≈t density
  const X = Math.log(N_MAX)
  const slope = 0.5 - s2 * X
  const tailBound =
    slope < -0.05
      ? ((4 * sigma) / SQRT_2PI) * (Math.exp(0.5 * X - 0.5 * s2 * X * X) / -slope)
      : Infinity
  return { total: pole + arch - primes, pole, arch, primes, tailBound }
}

/** Zero side: Σ over all zeros (±γ) of the same Gaussian pair = 2 Σ_{γ>0} h(γ). */
function zeroSidePair(u: number, sigma: number): number {
  const s2 = sigma * sigma
  let sum = 0
  for (const g of RIEMANN_ZEROS) {
    sum += Math.exp((-(g - u) * (g - u)) / (2 * s2)) + Math.exp((-(g + u) * (g + u)) / (2 * s2))
  }
  return 2 * sum
}

// ---------- Jacobi eigenvalues (symmetric dense, small n) ----------
function jacobiEig(aIn: Float64Array, n: number): { vals: number[]; minVec: Float64Array } {
  const m = Float64Array.from(aIn)
  const v = new Float64Array(n * n)
  for (let i = 0; i < n; i++) v[i * n + i] = 1
  for (let sweep = 0; sweep < 300; sweep++) {
    let off = 0
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += m[i * n + j]! ** 2
    if (off < 1e-26) break
    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) {
        const apq = m[p * n + q]!
        if (Math.abs(apq) < 1e-18) continue
        const theta = (m[q * n + q]! - m[p * n + p]!) / (2 * apq)
        const t = Math.sign(theta) / (Math.abs(theta) + Math.sqrt(theta * theta + 1))
        const c = 1 / Math.sqrt(t * t + 1)
        const s = t * c
        for (let k = 0; k < n; k++) {
          const akp = m[k * n + p]!
          const akq = m[k * n + q]!
          m[k * n + p] = c * akp - s * akq
          m[k * n + q] = s * akp + c * akq
        }
        for (let k = 0; k < n; k++) {
          const apk = m[p * n + k]!
          const aqk = m[q * n + k]!
          m[p * n + k] = c * apk - s * aqk
          m[q * n + k] = s * apk + c * aqk
        }
        for (let k = 0; k < n; k++) {
          const vkp = v[k * n + p]!
          const vkq = v[k * n + q]!
          v[k * n + p] = c * vkp - s * vkq
          v[k * n + q] = s * vkp + c * vkq
        }
      }
    }
  }
  const vals: number[] = []
  for (let i = 0; i < n; i++) vals.push(m[i * n + i]!)
  let iMin = 0
  for (let i = 1; i < n; i++) if (vals[i]! < vals[iMin]!) iMin = i
  const minVec = new Float64Array(n)
  for (let k = 0; k < n; k++) minVec[k] = v[k * n + iMin]!
  vals.sort((a, b) => a - b)
  return { vals, minVec }
}

// ---------- Gram assembly from W1 (either side) ----------
function buildGram(us: number[], sigma: number, w1: (m: number) => number): Float64Array {
  const n = us.length
  const s2 = sigma * sigma
  const M = new Float64Array(n * n)
  for (let j = 0; j < n; j++) {
    for (let k = j; k < n; k++) {
      let e = 0
      for (const a of [us[j]!, -us[j]!]) {
        for (const b of [us[k]!, -us[k]!]) {
          e += Math.exp((-(a - b) * (a - b)) / (8 * s2)) * w1(Math.abs(a + b) / 2)
        }
      }
      M[j * n + k] = e
      M[k * n + j] = e
    }
  }
  return M
}

// ====================== RUN ======================
console.log('building prime-power bins to N =', N_MAX, '…')
const t0 = Date.now()
const bins = buildPrimeBins()
console.log(`bins built in ${((Date.now() - t0) / 1000).toFixed(1)}s\n`)

console.log('PART A — explicit-formula bridge certification (zero side vs prime side)')
console.log('   u     σ      zero side     prime side     rel.err    tail bound')
for (const [u, sigma] of [
  [14.13, 0.5],
  [25, 0.5],
  [40, 0.75],
  [50, 1.0],
  [10, 1.5],
  [30, 0.4],
  [55, 0.35],
] as const) {
  const ef = efGaussianPair(u, sigma, bins)
  const zs = zeroSidePair(u, sigma)
  const rel = Math.abs(ef.total - zs) / Math.max(1e-12, Math.abs(zs))
  console.log(
    `  ${u.toFixed(2).padStart(5)}  ${sigma.toFixed(2)}  ${zs.toFixed(8).padStart(13)}  ${ef.total
      .toFixed(8)
      .padStart(13)}  ${rel.toExponential(2).padStart(9)}  ${ef.tailBound.toExponential(1)}`
  )
}

console.log('\nPART B — prime-side Gram positivity scan (λ_min < 0 ⇒ RH false)')
const coarse: number[] = []
for (let u = 2; u <= 60; u += 2.5) coarse.push(u)
const fine: number[] = []
for (let u = 10; u <= 40; u += 1) fine.push(u)
const sigmas = [1.5, 1.0, 0.75, 0.5, 0.4, 0.35]
console.log('   σ    grid    n     λ_min(prime)    λ_min(zero)     λ_max     margin λmin/λmax')
const marginBySigma: Array<{ sigma: number; margin: number; minVec: Float64Array; us: number[] }> =
  []
for (const sigma of sigmas) {
  for (const [label, us] of [
    ['coarse', coarse],
    ['fine', fine],
  ] as const) {
    if (label === 'fine' && sigma > 0.76) continue // fine grid only matters near-critical
    const cache = new Map<number, number>()
    const w1Prime = (m: number): number => {
      const key = Math.round(m * 1e6)
      let v = cache.get(key)
      if (v === undefined) {
        v = efGaussianPair(m, sigma, bins).total / 2
        cache.set(key, v)
      }
      return v
    }
    const w1Zero = (m: number): number => zeroSidePair(m, sigma) / 2
    const MP = buildGram(us, sigma, w1Prime)
    const MZ = buildGram(us, sigma, w1Zero)
    const ep = jacobiEig(MP, us.length)
    const ez = jacobiEig(MZ, us.length)
    const lminP = ep.vals[0]!
    const lmaxP = ep.vals[ep.vals.length - 1]!
    const margin = lminP / lmaxP
    console.log(
      `  ${sigma.toFixed(2)}  ${label.padEnd(6)} ${String(us.length).padStart(3)}  ${lminP
        .toExponential(4)
        .padStart(13)}  ${ez.vals[0]!.toExponential(4).padStart(13)}  ${lmaxP
        .toExponential(3)
        .padStart(9)}  ${margin.toExponential(3).padStart(11)}`
    )
    if (label === 'fine' || sigma > 0.76) {
      marginBySigma.push({ sigma, margin, minVec: ep.minVec, us })
    }
  }
}

console.log('\nPART C — minimal-eigenvector localization (where positivity is tightest)')
for (const rec of marginBySigma) {
  let iPeak = 0
  for (let i = 1; i < rec.minVec.length; i++) {
    if (Math.abs(rec.minVec[i]!) > Math.abs(rec.minVec[iPeak]!)) iPeak = i
  }
  // participation ratio: 1 = delocalized over n, →1/n means single-site
  let s2 = 0
  let s4 = 0
  for (let i = 0; i < rec.minVec.length; i++) {
    const c = rec.minVec[i]! * rec.minVec[i]!
    s2 += c
    s4 += c * c
  }
  const pr = (s2 * s2) / s4 / rec.minVec.length
  console.log(
    `  σ=${rec.sigma.toFixed(2)}  margin=${rec.margin.toExponential(2)}  peak at u=${rec.us[
      iPeak
    ]!.toFixed(1)}  participation=${(pr * 100).toFixed(0)}%`
  )
}
