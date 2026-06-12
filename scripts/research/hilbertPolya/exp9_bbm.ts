/**
 * EXPERIMENT 9 — honest lattice spectrum of the Bender-Brody-Mueller operator.
 *
 * BBM (PRL 2017): H = D^{-1} (xp+px) D, D = 1 - e^{-ip} (i.e. (Dpsi)(x) =
 * psi(x) - psi(x-1)), Dirichlet psi(0) = 0. Continuum eigenfunctions
 * psi_z(x) = -zeta_Hurwitz(z, x+1), eigenvalue E = i(2z-1); psi(0) = 0 iff
 * zeta(z) = 0, so z = 1/2 + i*gamma gives REAL E = -2*gamma. Dismissed:
 * unbounded similarity, non-normalizable eigenfunctions. Here: discretize
 * honestly (grid h = 1/m so the unit shift is exact), box at x = L, and ask
 * the matrix what its spectrum actually is.
 *
 * Working variable: mu = iE, i.e. the real generalized problem
 * (2x d/dx + 1) (D psi) = mu (D psi), restricted by psi(0)=psi(L)=0.
 * BBM prediction: eigenvalues mu = -2*gamma*i on the IMAGINARY axis.
 * C = B^{-1} A (B = Delta matrix, unit lower triangular), Hessenberg-reduce
 * once, then O(N^2) determinant scan along the imaginary axis.
 *
 * Run: node --experimental-strip-types scripts/research/hilbertPolya/exp9_bbm.ts [m] [L]
 */

const m = Number(process.argv[2] ?? '8') // points per unit length
const L = Number(process.argv[3] ?? '50') // box size
const h = 1 / m
const N = m * L - 1 // unknowns psi_1..psi_N (psi_0 = psi_{mL} = 0)

console.log(`[exp9] BBM lattice: h=1/${m}, L=${L}, N=${N}`)

// phi_i = psi_i - psi_{i-m} as sparse row over psi_1..psi_N (indices 1..N)
function bRow(i: number): Map<number, number> {
  const r = new Map<number, number>()
  if (i >= 1 && i <= N) r.set(i, 1)
  const k = i - m
  if (k >= 1 && k <= N) r.set(k, (r.get(k) ?? 0) - 1)
  return r
}

// A row j (j = 1..N): (2 x_j d/dx + 1) phi at j = j*(phi_{j+1} - phi_{j-1}) + phi_j
// (2 x_j / (2h) = j since x_j = j h)
const A: Float64Array[] = []
for (let j = 1; j <= N; j++) {
  const row = new Float64Array(N + 1) // 1-indexed
  const acc = (mp: Map<number, number>, f: number): void => {
    for (const [k, v] of mp) row[k]! += f * v
  }
  acc(bRow(j + 1), j)
  acc(bRow(j - 1), -j)
  acc(bRow(j), 1)
  A.push(row)
}

// C = B^{-1} A: forward substitution per column; B unit lower triangular,
// B[j][j] = 1, B[j][j-m] = -1 -> c_j = a_j + c_{j-m}
const Cm: Float64Array[] = []
for (let j = 1; j <= N; j++) Cm.push(new Float64Array(N + 1))
for (let col = 1; col <= N; col++) {
  for (let j = 1; j <= N; j++) {
    const prev = j - m >= 1 ? Cm[j - m - 1]![col]! : 0
    Cm[j - 1]![col] = A[j - 1]![col]! + prev
  }
}

// Householder reduction to upper Hessenberg (real, in place on dense copy)
const Hm: Float64Array[] = Cm.map((r) => Float64Array.from(r))
for (let k = 1; k <= N - 2; k++) {
  // zero column k below row k+1
  let nrm = 0
  for (let i = k + 1; i <= N; i++) nrm += Hm[i - 1]![k]! ** 2
  nrm = Math.sqrt(nrm)
  if (nrm < 1e-300) continue
  const alpha = Hm[k]![k]! >= 0 ? -nrm : nrm
  const v = new Float64Array(N + 1)
  v[k + 1] = Hm[k]![k]! - alpha
  for (let i = k + 2; i <= N; i++) v[i] = Hm[i - 1]![k]!
  let vv = 0
  for (let i = k + 1; i <= N; i++) vv += v[i]! ** 2
  if (vv < 1e-300) continue
  // H <- (I - 2vv^T/vv) H
  for (let col = k; col <= N; col++) {
    let dot = 0
    for (let i = k + 1; i <= N; i++) dot += v[i]! * Hm[i - 1]![col]!
    const f = (2 * dot) / vv
    for (let i = k + 1; i <= N; i++) Hm[i - 1]![col]! -= f * v[i]!
  }
  // H <- H (I - 2vv^T/vv)
  for (let rrow = 1; rrow <= N; rrow++) {
    let dot = 0
    for (let i = k + 1; i <= N; i++) dot += Hm[rrow - 1]![i]! * v[i]!
    const f = (2 * dot) / vv
    for (let i = k + 1; i <= N; i++) Hm[rrow - 1]![i]! -= f * v[i]!
  }
}

// complex log|det(H - lambda I)| via Hessenberg Gaussian elimination O(N^2)
function logDet(lre: number, lim: number): number {
  // copy active band: Hessenberg has subdiagonal only
  const re: Float64Array[] = []
  const im: Float64Array[] = []
  for (let i = 0; i < N; i++) {
    re.push(Float64Array.from(Hm[i]!))
    im.push(new Float64Array(N + 1))
    re[i]![i + 1]! -= lre
    im[i]![i + 1] = -lim
  }
  let ld = 0
  for (let k = 1; k < N; k++) {
    // eliminate subdiagonal (k+1, k) using row k
    const arr = re[k - 1]![k]!
    const ari = im[k - 1]![k]!
    const brr = re[k]![k]!
    const bri = im[k]![k]!
    const am = Math.hypot(arr, ari)
    const bm = Math.hypot(brr, bri)
    if (bm > am) {
      // swap rows k, k+1 (partial pivot)
      const tr = re[k - 1]
      re[k - 1] = re[k]!
      re[k] = tr!
      const ti = im[k - 1]
      im[k - 1] = im[k]!
      im[k] = ti!
    }
    const prr = re[k - 1]![k]!
    const pri = im[k - 1]![k]!
    const pm2 = prr * prr + pri * pri
    if (pm2 === 0) return -Infinity
    ld += 0.5 * Math.log(pm2)
    const qrr = re[k]![k]!
    const qri = im[k]![k]!
    // factor f = q / p
    const fre = (qrr * prr + qri * pri) / pm2
    const fim = (qri * prr - qrr * pri) / pm2
    for (let col = k; col <= N; col++) {
      const rr = re[k - 1]![col]!
      const ri = im[k - 1]![col]!
      re[k]![col]! -= fre * rr - fim * ri
      im[k]![col]! -= fre * ri + fim * rr
    }
  }
  const drr = re[N - 1]![N]!
  const dri = im[N - 1]![N]!
  ld += 0.5 * Math.log(drr * drr + dri * dri)
  return ld
}

// scan along the imaginary axis: lambda = -i t (BBM: t = 2 gamma)
const ZG = [
  14.134725141734693, 21.022039638771555, 25.010857580145688, 30.424876125859513,
  32.935061587739189, 37.586178158825671, 40.918719012147495, 43.327073280914999,
]
console.log('scan |det(H - lambda I)| on lambda = -i t, t in [8, 95]:')
const dips: number[] = []
let prev2 = Infinity
let prev1 = Infinity
let prevT = 0
for (let t = 8; t <= 95; t += 0.05) {
  const ld = logDet(0, -t)
  if (prev1 < prev2 && prev1 < ld) dips.push(prevT)
  prev2 = prev1
  prev1 = ld
  prevT = t
}
console.log(`local minima of log|det| at t = ${dips.map((d) => d.toFixed(2)).join(', ')}`)
console.log(`BBM prediction 2*gamma_k = ${ZG.map((g) => (2 * g).toFixed(2)).join(', ')}`)

// refine each dip by complex Newton on d(logdet) to locate the true eigenvalue
console.log('refined eigenvalues near dips (complex Newton on det):')
for (const t0 of dips.slice(0, 12)) {
  let lre = 0
  let lim = -t0
  let ok = true
  for (let it = 0; it < 60; it++) {
    const d = 1e-7
    const f0 = logDet(lre, lim)
    // gradient of log|det| -> Newton on grad(log|det|)=0 via complex derivative of log det
    // d/dlambda log det = -tr((H-lambda)^{-1}) ~ approximated by CR from log|det|:
    const fx = logDet(lre + d, lim)
    const fy = logDet(lre, lim + d)
    const gx = (fx - f0) / d
    const gy = (fy - f0) / d
    // log det analytic in lambda: d(log|det|)/dx = Re(g), d/dy = -Im(g), g = d(logdet)/dlambda
    const gre = gx
    const gim = -gy
    // Newton step for a simple zero: delta = -1/g (since log det ~ log(lambda - ev))
    const g2 = gre * gre + gim * gim
    if (g2 < 1e-30) {
      ok = false
      break
    }
    const dre = -gre / g2
    const dim = gim / g2
    lre += dre
    lim += dim
    if (Math.hypot(dre, dim) < 1e-10) break
    if (Math.hypot(lre, lim) > 500) {
      ok = false
      break
    }
  }
  if (ok)
    console.log(
      `  t0=${t0.toFixed(2)} -> lambda = ${lre.toFixed(6)} ${lim < 0 ? '-' : '+'} ${Math.abs(lim).toFixed(6)}i   (gamma-equiv ${(Math.abs(lim) / 2).toFixed(4)}, reality defect |Re| = ${Math.abs(lre).toExponential(2)})`
    )
}
