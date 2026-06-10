/**
 * EXPERIMENT 7 — pod-scale kill test (round 4).
 *
 * Same explicit-formula instrument as exp6, with a segmented sieve (N up to
 * 1e10) and CLI job specs so many configs run as parallel processes on the
 * 64-thread runpod. Per-job: build bins once, evaluate probes, print results.
 *
 * Usage:
 *   node --experimental-strip-types exp7_pod.ts --n=1e9 --dx=7.1e-8 \
 *     --zeros=data/zeros1.txt --job=cert:1000,0.5
 *   jobs: cert:m,sigma | gram:center,sigma | push:sigma   (push = G1 grid [15,60])
 */
import { readFileSync } from 'node:fs'

const args = new Map<string, string>()
for (const a of process.argv.slice(2)) {
  const m = a.match(/^--([a-z]+)=(.+)$/)
  if (m) args.set(m[1]!, m[2]!)
}
const N_MAX = Number(args.get('n') ?? '1e9')
const DX = Number(args.get('dx') ?? '7.1e-8')
const ZEROS_PATH = args.get('zeros') ?? 'scripts/research/hilbertPolya/data/zeros1.txt'
const JOB = args.get('job') ?? 'cert:1000,0.5'

const SQRT_2PI = Math.sqrt(2 * Math.PI)
const NBINS = Math.ceil((Math.log(N_MAX) + DX) / DX)

const ZEROS: Float64Array = (() => {
  const lines = readFileSync(ZEROS_PATH, 'utf8').trim().split('\n')
  const z = new Float64Array(lines.length)
  for (let i = 0; i < lines.length; i++) z[i] = parseFloat(lines[i]!)
  return z
})()

function buildBinsSegmented(): { a0: Float64Array; a1: Float64Array } {
  const a0 = new Float64Array(NBINS)
  const a1 = new Float64Array(NBINS)
  const add = (q: number, lp: number): void => {
    const x = Math.log(q)
    const b = Math.floor(x / DX)
    const w = lp / Math.sqrt(q)
    a0[b] += w
    a1[b] += w * (x - (b + 0.5) * DX)
  }
  const root = Math.floor(Math.sqrt(N_MAX))
  const base = new Uint8Array(root + 1)
  const basePrimes: number[] = []
  for (let p = 2; p <= root; p++) {
    if (base[p]) continue
    basePrimes.push(p)
    for (let q = p * p; q <= root; q += p) base[q] = 1
  }
  // prime powers k ≥ 2 (all have p ≤ √N)
  for (const p of basePrimes) {
    const lp = Math.log(p)
    for (let q = p * p; q <= N_MAX; q *= p) {
      add(q, lp)
      if (q > N_MAX / p) break
    }
  }
  // primes themselves, segment by segment
  const SEG = 16_000_000
  const seg = new Uint8Array(SEG)
  for (let lo = 2; lo <= N_MAX; lo += SEG) {
    const hi = Math.min(lo + SEG - 1, N_MAX)
    seg.fill(0, 0, hi - lo + 1)
    for (const p of basePrimes) {
      if (p * p > hi) break
      let start = Math.max(p * p, Math.ceil(lo / p) * p)
      for (let q = start; q <= hi; q += p) seg[q - lo] = 1
    }
    for (let q = Math.max(lo, 2); q <= hi; q++) {
      if (!seg[q - lo]) add(q, Math.log(q))
    }
  }
  return { a0, a1 }
}

function rePsiQuarter(r: number): number {
  let re = 0.25
  const im = r / 2
  let acc = 0
  while (re < 16) {
    const d = re * re + im * im
    acc -= re / d
    re += 1
  }
  const d = re * re + im * im
  const z2Re = (re * re - im * im) / (d * d)
  const z2Im = (-2 * re * im) / (d * d)
  const z4Re = z2Re * z2Re - z2Im * z2Im
  const z6Re = z4Re * z2Re - (z2Re * z2Im + z2Im * z2Re) * z2Im
  return acc + 0.5 * Math.log(d) - (0.5 * re) / d - z2Re / 12 + z4Re / 120 - z6Re / 252
}

console.error(`[exp7] N=${N_MAX} DX=${DX} NBINS=${NBINS} job=${JOB}`)
const tSieve = Date.now()
const bins = buildBinsSegmented()
console.error(`[exp7] sieve+bins ${((Date.now() - tSieve) / 1000).toFixed(0)}s`)

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
    arch += (i === 0 || i === nStep ? 1 : i % 2 === 1 ? 4 : 2) * h * (rePsiQuarter(r) - Math.log(Math.PI))
  }
  arch *= dr / 3 / Math.PI
  let primes = 0
  let comp = 0 // Kahan
  for (let b = 0; b < NBINS; b++) {
    const a = bins.a0[b]!
    if (a === 0) continue
    const x = (b + 0.5) * DX
    const env = Math.exp(-0.5 * s2 * x * x)
    if (env < 1e-22) continue
    const c = Math.cos(u * x)
    const s = Math.sin(u * x)
    const term = a * env * c + bins.a1[b]! * env * (-s2 * x * c - u * s)
    const y = term - comp
    const t = primes + y
    comp = t - primes - y
    primes = t
  }
  primes *= (4 * sigma) / SQRT_2PI
  return pole + arch - primes
}

function zeroPair(u: number, sigma: number): number {
  const s2 = sigma * sigma
  let sum = 0
  const lo = u - 14 * sigma
  const hi = u + 14 * sigma
  for (let i = 0; i < ZEROS.length; i++) {
    const g = ZEROS[i]!
    if (g > hi) break
    if (g >= lo) sum += Math.exp((-(g - u) * (g - u)) / (2 * s2))
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
      const e =
        Math.exp((-(us[j]! - us[k]!) * (us[j]! - us[k]!)) / (8 * s2)) * w1((us[j]! + us[k]!) / 2)
      M[j * n + k] = e
      M[k * n + j] = e
    }
  }
  return M
}

const [kind, rest] = JOB.split(':') as [string, string]
if (kind === 'cert') {
  const [m, sigma] = rest.split(',').map(Number) as [number, number]
  const zs = zeroPair(m, sigma)
  const ps = efPair(m, sigma)
  console.log(
    `CERT m=${m} σ=${sigma}  zero=${zs.toFixed(9)}  prime=${ps.toFixed(9)}  rel=${(
      Math.abs(ps - zs) / Math.abs(zs)
    ).toExponential(2)}`
  )
} else if (kind === 'gram' || kind === 'push') {
  let center: number
  let sigma: number
  let us: number[] = []
  if (kind === 'gram') {
    ;[center, sigma] = rest.split(',').map(Number) as [number, number]
    const sp = 4 * sigma + 2
    for (let i = 0; i < 10; i++) us.push(center + (i - 4.5) * sp)
  } else {
    sigma = Number(rest)
    center = 35
    for (let u = 15; u <= 60; u += 5) us.push(u)
  }
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
  const ep = jacobiMin(gram(us, sigma, w1p), us.length)
  const ez = jacobiMin(gram(us, sigma, w1z), us.length)
  console.log(
    `${kind.toUpperCase()} m=${center} σ=${sigma}  λmin(prime)=${ep.min.toExponential(
      4
    )}  λmin(zero)=${ez.min.toExponential(4)}  λmax=${ep.max.toExponential(2)}  |Δ|=${Math.abs(
      ep.min - ez.min
    ).toExponential(1)}`
  )
}
