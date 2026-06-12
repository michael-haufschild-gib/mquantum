/**
 * EXPERIMENT 8 — double-double Jensen margins beyond the float64 frontier.
 *
 * F179 measured: min-over-n hyperbolicity margin of J^{d,n} = 0.94-0.99 x
 * Hermite(d) for d = 3..9; float64 dies at d ~ 10 (root noise eps^{1/d}).
 * This instrument rebuilds the whole chain in double-double (~32 digits):
 * dd-exp Polya kernel, dd-Simpson moments, complex-dd Durand-Kerner.
 * Question: does Hermite extremality persist at d = 10, 12, 16, 20?
 *
 * Run: node --experimental-strip-types scripts/research/hilbertPolya/exp8_dd_jensen.ts
 */

type DD = [number, number]

const SP = 134217729

function qts(a: number, b: number): DD {
  const s = a + b
  return [s, b - (s - a)]
}
function ts(a: number, b: number): DD {
  const s = a + b
  const bb = s - a
  return [s, a - (s - bb) + (b - bb)]
}
function tp(a: number, b: number): DD {
  const ta = SP * a
  const ah = ta - (ta - a)
  const al = a - ah
  const tb = SP * b
  const bh = tb - (tb - b)
  const bl = b - bh
  const p = a * b
  return [p, ah * bh - p + ah * bl + al * bh + al * bl]
}
function dadd(x: DD, y: DD): DD {
  const [s, e0] = ts(x[0], y[0])
  return qts(s, e0 + x[1] + y[1])
}
function dneg(x: DD): DD {
  return [-x[0], -x[1]]
}
function dsub(x: DD, y: DD): DD {
  return dadd(x, dneg(y))
}
function dmul(x: DD, y: DD): DD {
  const [p, e0] = tp(x[0], y[0])
  return qts(p, e0 + x[0] * y[1] + x[1] * y[0])
}
function dmulf(x: DD, f: number): DD {
  const [p, e0] = tp(x[0], f)
  return qts(p, e0 + x[1] * f)
}
function ddiv(x: DD, y: DD): DD {
  const q1 = x[0] / y[0]
  let r = dadd(x, dneg(dmulf(y, q1)))
  const q2 = r[0] / y[0]
  r = dadd(r, dneg(dmulf(y, q2)))
  const q3 = r[0] / y[0]
  const [s, e] = qts(q1, q2)
  return dadd([s, e], [q3, 0])
}
const LN2: DD = [0.6931471805599453, 2.3190468138462996e-17]
const PI: DD = [3.141592653589793, 1.2246467991473532e-16]
function dexp(x: DD): DD {
  if (x[0] < -700) return [0, 0]
  const m = Math.round(x[0] / Math.LN2)
  const r = dadd(x, dneg(dmulf(LN2, m)))
  let t: DD = [1, 0]
  let term: DD = [1, 0]
  for (let i = 1; i <= 28; i++) {
    term = ddiv(dmul(term, r), [i, 0])
    t = dadd(t, term)
    if (Math.abs(term[0]) < 1e-35 * Math.abs(t[0])) break
  }
  const sc = Math.pow(2, m)
  return [t[0] * sc, t[1] * sc]
}

// complex dd: [reh, rel, imh, iml]
type CDD = [number, number, number, number]
function cadd(a: CDD, b: CDD): CDD {
  const re = dadd([a[0], a[1]], [b[0], b[1]])
  const im = dadd([a[2], a[3]], [b[2], b[3]])
  return [re[0], re[1], im[0], im[1]]
}
function csub(a: CDD, b: CDD): CDD {
  const re = dsub([a[0], a[1]], [b[0], b[1]])
  const im = dsub([a[2], a[3]], [b[2], b[3]])
  return [re[0], re[1], im[0], im[1]]
}
function cmul(a: CDD, b: CDD): CDD {
  const re = dsub(dmul([a[0], a[1]], [b[0], b[1]]), dmul([a[2], a[3]], [b[2], b[3]]))
  const im = dadd(dmul([a[0], a[1]], [b[2], b[3]]), dmul([a[2], a[3]], [b[0], b[1]]))
  return [re[0], re[1], im[0], im[1]]
}
function cdiv(a: CDD, b: CDD): CDD {
  const den = dadd(dmul([b[0], b[1]], [b[0], b[1]]), dmul([b[2], b[3]], [b[2], b[3]]))
  const re = ddiv(dadd(dmul([a[0], a[1]], [b[0], b[1]]), dmul([a[2], a[3]], [b[2], b[3]])), den)
  const im = ddiv(dsub(dmul([a[2], a[3]], [b[0], b[1]]), dmul([a[0], a[1]], [b[2], b[3]])), den)
  return [re[0], re[1], im[0], im[1]]
}

// gates for dd-exp
const e1 = dexp([1, 0])
console.log(
  `GATE dd-exp(1) = ${e1[0]} + ${e1[1]}  (e hi 2.718281828459045, lo 1.4456468917292502e-16)`
)

// ---- Polya kernel on the grid, in dd ----
const H = 4e-4
const TOP = 5.2
const NS = Math.round(TOP / H)
const PI2 = dmul(PI, PI)
const PHI: DD[] = new Array(NS + 1)
const U2: DD[] = new Array(NS + 1)
const t0 = Date.now()
for (let i = 0; i <= NS; i++) {
  const u = tp(i, H) // exact i*H in dd
  U2[i] = dmul(u, u)
  const A = dexp(dmulf(u, 0.5))
  const A2 = dmul(A, A)
  const A4 = dmul(A2, A2)
  const A5 = dmul(A4, A)
  const A9 = dmul(A4, A5)
  let acc: DD = [0, 0]
  for (let n = 1; n <= 8; n++) {
    const arg = dmulf(A4, Math.PI * n * n) // pi n^2 e^{2u}; float pi n^2 ok to 1e-16, refine:
    const argDD = dmul(dmulf(PI, n * n), A4)
    if (argDD[0] > 1500) break
    const ex = dexp(dneg(argDD))
    if (ex[0] === 0) break
    const c1 = dmulf(PI2, 4 * n ** 4)
    const c2 = dmulf(PI, 6 * n * n)
    const term = dsub(dmul(c1, A9), dmul(c2, A5))
    acc = dadd(acc, dmul(term, ex))
    void arg
  }
  PHI[i] = acc
}
console.error(`[exp8] kernel grid ${((Date.now() - t0) / 1000).toFixed(1)}s`)

// Xi(0) gate: Simpson over full grid
{
  let s: DD = [0, 0]
  for (let i = 0; i <= NS; i++) {
    const w = i === 0 || i === NS ? 1 : i % 2 === 1 ? 4 : 2
    s = dadd(s, dmulf(PHI[i]!, w))
  }
  s = dmulf(s, (2 * H) / 3)
  console.log(`GATE Xi(0) = ${s[0].toFixed(15)} (known 0.497120778188314)`)
}

// ---- moments for the needed k set ----
const DSET = [8, 10, 12, 16, 20]
const NSET = [0, 1, 2, 4, 8, 16, 32, 64, 128, 256]
const kneed = new Set<number>()
for (const d of DSET) for (const n of NSET) for (let j = 0; j <= d; j++) kneed.add(n + j)
const MOM = new Map<number, DD>()
const t1 = Date.now()
for (const k of [...kneed].sort((a, b) => a - b)) {
  // float prescan for the relevance window
  let exPeak = -Infinity
  const exArr = new Float64Array(NS + 1).fill(-Infinity)
  for (let i = 1; i <= NS; i++) {
    if (PHI[i]![0] === 0) continue
    const u = i * H
    const ex = 2 * k * Math.log(u) + Math.log(Math.abs(PHI[i]![0]))
    exArr[i] = ex
    if (ex > exPeak) exPeak = ex
  }
  let s: DD = k === 0 ? dmulf(PHI[0]!, 1) : [0, 0] // i=0 endpoint contributes only at k=0
  for (let i = 1; i <= NS; i++) {
    if (exArr[i]! < exPeak - 220) continue
    const w = i === NS ? 1 : i % 2 === 1 ? 4 : 2
    // u^{2k} by square-multiply on U2
    let pw: DD = [1, 0]
    let base = U2[i]!
    let kk = k
    while (kk > 0) {
      if (kk & 1) pw = dmul(pw, base)
      base = dmul(base, base)
      kk >>= 1
    }
    s = dadd(s, dmulf(dmul(PHI[i]!, pw), w))
  }
  MOM.set(k, dmulf(s, (2 * H) / 3))
}
console.error(`[exp8] ${kneed.size} moments ${((Date.now() - t1) / 1000).toFixed(1)}s`)

// gamma ratio gam_{n+j}/gam_n in dd: (M_{n+j}/M_n) * prod_{i=1}^{j}(n+i) / prod_{i=1}^{2j}(2n+i)
function gamRatio(n: number, j: number): DD {
  let r = ddiv(MOM.get(n + j)!, MOM.get(n)!)
  for (let i = 1; i <= j; i++) r = dmulf(r, n + i)
  for (let i = 1; i <= 2 * j; i++) r = ddiv(r, [2 * n + i, 0])
  return r
}

// Durand-Kerner in complex dd
function ddRoots(c: DD[]): { re: number[]; relIm: number; conv: boolean } {
  const d = c.length - 1
  const zs: CDD[] = []
  for (let i = 0; i < d; i++) {
    const th = (2 * Math.PI * i) / d + 0.4
    zs.push([Math.cos(th) * 1.3, 0, Math.sin(th) * 1.3, 0])
  }
  const cc: CDD[] = c.map((x) => [x[0], x[1], 0, 0])
  const ev = (z: CDD): CDD => {
    let r: CDD = cc[d]!
    for (let k = d - 1; k >= 0; k--) r = cadd(cmul(r, z), cc[k]!)
    return r
  }
  let conv = false
  for (let it = 0; it < 2500; it++) {
    let moved = 0
    for (let i = 0; i < d; i++) {
      let den: CDD = cc[d]!
      for (let j = 0; j < d; j++) if (j !== i) den = cmul(den, csub(zs[i]!, zs[j]!))
      const delta = cdiv(ev(zs[i]!), den)
      zs[i] = csub(zs[i]!, delta)
      moved = Math.max(moved, Math.hypot(delta[0], delta[2]))
    }
    if (moved < 1e-29) {
      conv = true
      break
    }
  }
  const scale = Math.max(...zs.map((z) => Math.hypot(z[0], z[2])))
  const relIm = Math.max(...zs.map((z) => Math.abs(z[2]))) / scale
  return { re: zs.map((z) => z[0]).sort((a, b) => a - b), relIm, conv }
}

// Hermite reference margins (float64 Jacobi, sign-fix)
function hermiteMargin(d: number): number {
  const m = new Float64Array(d * d)
  for (let i = 0; i < d - 1; i++) {
    m[i * d + i + 1] = Math.sqrt((i + 1) / 2)
    m[(i + 1) * d + i] = Math.sqrt((i + 1) / 2)
  }
  for (let sw = 0; sw < 300; sw++) {
    let off = 0
    for (let i = 0; i < d; i++) for (let j = i + 1; j < d; j++) off += m[i * d + j]! ** 2
    if (off < 1e-24) break
    for (let p = 0; p < d; p++) {
      for (let q = p + 1; q < d; q++) {
        const apq = m[p * d + q]!
        if (Math.abs(apq) < 1e-16) continue
        const th = (m[q * d + q]! - m[p * d + p]!) / (2 * apq)
        const t = th === 0 ? 1 : Math.sign(th) / (Math.abs(th) + Math.sqrt(th * th + 1))
        const c2 = 1 / Math.sqrt(t * t + 1)
        const s2 = t * c2
        for (let k = 0; k < d; k++) {
          const akp = m[k * d + p]!
          const akq = m[k * d + q]!
          m[k * d + p] = c2 * akp - s2 * akq
          m[k * d + q] = s2 * akp + c2 * akq
        }
        for (let k = 0; k < d; k++) {
          const apk = m[p * d + k]!
          const aqk = m[q * d + k]!
          m[p * d + k] = c2 * apk - s2 * aqk
          m[q * d + k] = s2 * apk + c2 * aqk
        }
      }
    }
  }
  const ev: number[] = []
  for (let i = 0; i < d; i++) ev.push(m[i * d + i]!)
  ev.sort((a, b) => a - b)
  let mg = Infinity
  for (let i = 1; i < d; i++) mg = Math.min(mg, ev[i]! - ev[i - 1]!)
  return mg / (ev[d - 1]! - ev[0]!)
}

const binom = (n: number, k: number): number => {
  let r = 1
  for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1)
  return r
}

console.log('d | min margin | at n | worst relIm | allconv | Hermite ref | min/Hermite | dd noise')
const t2 = Date.now()
for (const d of DSET) {
  let mmin = Infinity
  let mat = -1
  let wIm = 0
  let allok = true
  for (const n of NSET) {
    // coefficients c_j = C(d,j) * gamRatio(n,j) * e^{j*lam}, lam balances ends
    const ratios: DD[] = []
    for (let j = 0; j <= d; j++) ratios.push(gamRatio(n, j))
    const lam = -Math.log(Math.abs(ratios[d]![0])) / d - Math.log(binom(d, d)) / d
    const c: DD[] = []
    for (let j = 0; j <= d; j++) {
      const sc = dexp([j * lam, 0])
      c.push(dmulf(dmul(ratios[j]!, sc), binom(d, j)))
    }
    const r = ddRoots(c)
    if (!r.conv) allok = false
    wIm = Math.max(wIm, r.relIm)
    let mg = Infinity
    for (let i = 1; i < d; i++) mg = Math.min(mg, r.re[i]! - r.re[i - 1]!)
    const marg = mg / (r.re[d - 1]! - r.re[0]!)
    if (marg < mmin) {
      mmin = marg
      mat = n
    }
  }
  const href = hermiteMargin(d)
  console.log(
    `${String(d).padStart(2)} | ${mmin.toFixed(5)} | ${String(mat).padStart(3)} | ${wIm.toExponential(1)} | ${allok} | ${href.toFixed(5)} | ${(mmin / href).toFixed(3)} | ${Math.pow(1e-32, 1 / d).toExponential(1)}`
  )
}
console.error(`[exp8] margins ${((Date.now() - t2) / 1000).toFixed(1)}s`)
