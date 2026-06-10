/**
 * EXPERIMENT 6 — kill-window extension: heights ≤ 90 → ≤ 2000.
 *
 * Same explicit-formula instrument as exp4, three upgrades: (i) Odlyzko's first
 * 100k zeros (data/zeros1.txt, heights to 74920) replace the 100-zero table for
 * certification; (ii) bins at DX = 5e-6 with first-moment correction keep the
 * cos(u·x) phase error ≤ ~3e-6 relative at u = 2000; (iii) probes placed at
 * heights m ∈ {100, 500, 1000, 2000}.
 *
 * PART A: bridge certification at height. PART B: prime-side Gram λ_min on
 * full-rank local grids (zero spacing ~2π/log(m/2π) shrinks with height, so a
 * 10-pt grid spans plenty of zeros). PART D: doublet detector calibration at
 * γ₀ ≈ 1000 (zero side) vs the measured prime-vs-zero error floor.
 *
 * Run: node --experimental-strip-types scripts/research/hilbertPolya/exp6_highwindow.ts
 */
import { readFileSync } from 'node:fs'

const SQRT_2PI = Math.sqrt(2 * Math.PI)

const ZEROS: Float64Array = (() => {
  const lines = readFileSync('scripts/research/hilbertPolya/data/zeros1.txt', 'utf8')
    .trim()
    .split('\n')
  const z = new Float64Array(lines.length)
  for (let i = 0; i < lines.length; i++) z[i] = parseFloat(lines[i]!)
  return z
})()

function rePsiQuarter(r: number): number {
  let re = 0.25
  const im = r / 2
  let accRe = 0
  while (re < 16) {
    const d = re * re + im * im
    accRe -= re / d
    re += 1
  }
  const d = re * re + im * im
  const z2Re = (re * re - im * im) / (d * d)
  const z2Im = (-2 * re * im) / (d * d)
  const z4Re = z2Re * z2Re - z2Im * z2Im
  const z6Re = z4Re * z2Re - (z2Re * z2Im + z2Im * z2Re) * z2Im
  return accRe + 0.5 * Math.log(d) - (0.5 * re) / d - z2Re / 12 + z4Re / 120 - z6Re / 252
}

const N_MAX = 10_000_000
const DX = 5e-6
const NBINS = Math.ceil((Math.log(N_MAX) + DX) / DX)

function buildPrimeBins(): { a0: Float64Array; a1: Float64Array } {
  const a0 = new Float64Array(NBINS)
  const a1 = new Float64Array(NBINS)
  const sieve = new Uint8Array(N_MAX + 1)
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

const bins = buildPrimeBins()

/** Prime-side Σ_γ h(γ) for the even Gaussian pair h_{u,σ}. */
function efPair(u: number, sigma: number): number {
  const s2 = sigma * sigma
  const pole = 4 * Math.exp((0.25 - u * u) / (2 * s2)) * Math.cos(u / (2 * s2))
  const hi = u + 14 * sigma + 2
  const nStep = 2 * Math.max(1000, Math.ceil(hi / (sigma / 24)))
  const dr = hi / nStep
  let arch = 0
  for (let i = 0; i <= nStep; i++) {
    const r = i * dr
    const h = Math.exp((-(r - u) * (r - u)) / (2 * s2)) + Math.exp((-(r + u) * (r + u)) / (2 * s2))
    if (h < 1e-22) continue
    const w = i === 0 || i === nStep ? 1 : i % 2 === 1 ? 4 : 2
    arch += w * h * (rePsiQuarter(r) - Math.log(Math.PI))
  }
  arch *= dr / 3 / Math.PI
  let primes = 0
  for (let b = 0; b < NBINS; b++) {
    const a = bins.a0[b]!
    if (a === 0) continue
    const x = (b + 0.5) * DX
    const env = Math.exp(-0.5 * s2 * x * x)
    const c = Math.cos(u * x)
    const s = Math.sin(u * x)
    primes += a * env * c + bins.a1[b]! * env * (-s2 * x * c - u * s)
  }
  primes *= (4 * sigma) / SQRT_2PI
  return pole + arch - primes
}

function zeroPair(u: number, sigma: number): number {
  const s2 = sigma * sigma
  let sum = 0
  // zeros sorted ascending: restrict to the Gaussian reach window
  const lo = u - 14 * sigma
  const hi = u + 14 * sigma
  for (let i = 0; i < ZEROS.length; i++) {
    const g = ZEROS[i]!
    if (g > hi) break
    if (g >= lo) sum += Math.exp((-(g - u) * (g - u)) / (2 * s2))
    // mirror term e^{−(g+u)²/2σ²} negligible for u ≥ 100
  }
  return 2 * sum
}

function jacobiMin(aIn: Float64Array, n: number): { min: number; max: number } {
  const m = Float64Array.from(aIn)
  for (let sweep = 0; sweep < 300; sweep++) {
    let off = 0
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += m[i * n + j]! ** 2
    if (off < 1e-26) break
    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) {
        const apq = m[p * n + q]!
        if (Math.abs(apq) < 1e-18) continue
        const th = (m[q * n + q]! - m[p * n + p]!) / (2 * apq)
        const t = Math.sign(th) / (Math.abs(th) + Math.sqrt(th * th + 1))
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
      }
    }
  }
  let mn = Infinity
  let mx = -Infinity
  for (let i = 0; i < n; i++) {
    mn = Math.min(mn, m[i * n + i]!)
    mx = Math.max(mx, m[i * n + i]!)
  }
  return { min: mn, max: mx }
}

function gram(us: number[], sigma: number, w1: (m: number) => number): Float64Array {
  const n = us.length
  const s2 = sigma * sigma
  const M = new Float64Array(n * n)
  for (let j = 0; j < n; j++) {
    for (let k = j; k < n; k++) {
      // u ≥ 100 ≫ σ: the ±mirror cross terms are 0 to f64; keep the two real ones
      const e =
        Math.exp((-(us[j]! - us[k]!) * (us[j]! - us[k]!)) / (8 * s2)) *
        w1((us[j]! + us[k]!) / 2)
      M[j * n + k] = e
      M[k * n + j] = e
    }
  }
  return M
}

console.log('PART A — bridge certification at height (DX = 5e-6, N = 1e7, 100k zeros)')
console.log('    m      σ      zero side       prime side      rel.err')
for (const [m, sigma] of [
  [100, 0.5],
  [100, 1.0],
  [500, 0.5],
  [500, 1.0],
  [1000, 0.5],
  [1000, 1.0],
  [2000, 0.5],
] as const) {
  const zs = zeroPair(m, sigma)
  const ps = efPair(m, sigma)
  console.log(
    `  ${String(m).padStart(5)}  ${sigma.toFixed(2)}  ${zs.toFixed(8).padStart(13)}  ${ps
      .toFixed(8)
      .padStart(13)}  ${(Math.abs(ps - zs) / Math.abs(zs)).toExponential(2)}`
  )
}

console.log('\nPART B — prime-side positivity at height (10-pt local grids, spacing 4σ+2)')
console.log('    m      σ     λ_min(prime)    λ_min(zero)     λ_max     |Δλmin|')
for (const center of [100, 500, 1000, 2000]) {
  for (const sigma of [0.5, 0.75, 1.0]) {
    const us: number[] = []
    const sp = 4 * sigma + 2
    for (let i = 0; i < 10; i++) us.push(center + (i - 4.5) * sp)
    const cache = new Map<number, number>()
    const w1p = (x: number): number => {
      const k = Math.round(x * 1e6)
      let v = cache.get(k)
      if (v === undefined) {
        v = efPair(x, sigma) / 2
        cache.set(k, v)
      }
      return v
    }
    const w1z = (x: number): number => zeroPair(x, sigma) / 2
    const ep = jacobiMin(gram(us, sigma, w1p), 10)
    const ez = jacobiMin(gram(us, sigma, w1z), 10)
    console.log(
      `  ${String(center).padStart(5)}  ${sigma.toFixed(2)}  ${ep.min
        .toExponential(4)
        .padStart(13)}  ${ez.min.toExponential(4).padStart(13)}  ${ep.max
        .toExponential(2)
        .padStart(9)}  ${Math.abs(ep.min - ez.min).toExponential(1)}`
    )
  }
}

console.log('\nPART D — doublet detector at γ₀ ≈ 1000 (zero side, dense grid sp=0.8, σ=0.5)')
const G0 = 999.7918 // nearest tabulated zero to 1000
for (const delta of [0, 0.02, 0.05, 0.1]) {
  const sigma = 0.5
  const s2 = sigma * sigma
  const w1mod = (x: number): number => {
    let v = zeroPair(x, sigma) / 2
    const t = G0 - x
    v -= Math.exp((-t * t) / (2 * s2))
    v += Math.exp(-(t * t - delta * delta) / (2 * s2)) * Math.cos((t * delta) / s2)
    return v
  }
  const us: number[] = []
  for (let i = 0; i < 10; i++) us.push(996 + i * 0.8)
  const e = jacobiMin(gram(us, sigma, delta === 0 ? (x) => zeroPair(x, sigma) / 2 : w1mod), 10)
  console.log(`  δ=${delta.toFixed(2)}  λ_min=${e.min.toExponential(4).padStart(12)}`)
}
