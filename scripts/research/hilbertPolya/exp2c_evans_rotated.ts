/**
 * EXPERIMENT 2c — Evans spectroscopy on a rotated contour.
 *
 * exp2b hit the archimedean wall: E(z) ∝ Λ(1/2+iz) ~ e^{−πz/2}, beneath f64
 * cancellation noise past z ≈ 23. Cure: analytic continuation of the contour
 * u → u + iθ, θ = π/2 − δ. The function ω(e^w) = t e^t/(1+e^t)², t = e^w, is
 * analytic in 0 ≤ Im w ≤ θ < π/2 (its poles t = iπ(2k+1) all have arg t = π/2),
 * so  E(z) = e^{izθ·} … = e^{−θz}·Ẽ(z) with
 *     Ẽ(z) = ∫ e^{(u+iθ)/2} ω(e^{u+iθ}) e^{izu} du
 * an O(1)-conditioned oscillatory integral. Zeros of Ẽ = zeros of E.
 * Arithmetic input remains ONLY the function ω (equivalently the damping μ).
 *
 * Run: node --experimental-strip-types scripts/research/hilbertPolya/exp2c_evans_rotated.ts
 */

import { RIEMANN_ZEROS } from '../../../src/lib/physics/riemannZeta.ts'

const THETA = Math.PI / 2 - 0.15
const U_MIN = -26
const U_MAX = 7
const DU = 0.0008
const N = Math.round((U_MAX - U_MIN) / DU) + 1

// Precompute the complex envelope env(u) = e^{w/2} ω(e^w), w = u + iθ.
const envRe = new Float64Array(N)
const envIm = new Float64Array(N)
const us = new Float64Array(N)
for (let i = 0; i < N; i++) {
  const u = U_MIN + i * DU
  us[i] = u
  // t = e^w = e^u (cosθ + i sinθ)
  const eu = Math.exp(u)
  const tRe = eu * Math.cos(THETA)
  const tIm = eu * Math.sin(THETA)
  // e^t
  const expT = Math.exp(tRe)
  const etRe = expT * Math.cos(tIm)
  const etIm = expT * Math.sin(tIm)
  // 1 + e^t
  const dRe = 1 + etRe
  const dIm = etIm
  // (1+e^t)²
  const d2Re = dRe * dRe - dIm * dIm
  const d2Im = 2 * dRe * dIm
  // t·e^t
  const teRe = tRe * etRe - tIm * etIm
  const teIm = tRe * etIm + tIm * etRe
  // ω = t e^t / (1+e^t)²
  const den = d2Re * d2Re + d2Im * d2Im
  const wRe = (teRe * d2Re + teIm * d2Im) / den
  const wIm = (teIm * d2Re - teRe * d2Im) / den
  // e^{w/2} = e^{u/2}(cos(θ/2) + i sin(θ/2))
  const half = Math.exp(u / 2)
  const hRe = half * Math.cos(THETA / 2)
  const hIm = half * Math.sin(THETA / 2)
  const trapW = (i === 0 || i === N - 1 ? 0.5 : 1) * DU
  envRe[i] = (hRe * wRe - hIm * wIm) * trapW
  envIm[i] = (hRe * wIm + hIm * wRe) * trapW
}

/** Ẽ(z) for complex z = x+iy, with the u-independent factor e^{θx+…} dropped. */
function evansT(x: number, y: number): { re: number; im: number } {
  // e^{izu} with z = x+iy: amplitude e^{−yu}, phase xu.
  let re = 0
  let im = 0
  for (let i = 0; i < N; i++) {
    const amp = Math.exp(-y * us[i]!)
    const ph = x * us[i]!
    const cr = Math.cos(ph) * amp
    const ci = Math.sin(ph) * amp
    re += envRe[i]! * cr - envIm[i]! * ci
    im += envRe[i]! * ci + envIm[i]! * cr
  }
  return { re, im }
}

const absET = (x: number, y: number): number => {
  const e = evansT(x, y)
  return Math.hypot(e.re, e.im)
}

// ---- 1. Real-axis scan over the full 100-zero window ----
const Z_LO = 5
const Z_HI = 240
console.log(`Rotated-contour Evans scan z ∈ [${Z_LO}, ${Z_HI}], θ = π/2 − 0.15 …`)
const found: number[] = []
const STEP = 0.02
let prev2 = absET(Z_LO - 2 * STEP, 0)
let prev = absET(Z_LO - STEP, 0)
for (let x = Z_LO; x <= Z_HI; x += STEP) {
  const cur = absET(x, 0)
  if (prev < prev2 && prev < cur) {
    let a = x - 2 * STEP
    let b = x
    for (let it = 0; it < 45; it++) {
      const m1 = a + (b - a) / 3
      const m2 = b - (b - a) / 3
      if (absET(m1, 0) < absET(m2, 0)) b = m2
      else a = m1
    }
    const zMin = 0.5 * (a + b)
    const vMin = absET(zMin, 0)
    const ref = absET(zMin + 0.6, 0) + absET(zMin - 0.6, 0)
    if (vMin < 0.05 * ref) found.push(zMin)
  }
  prev2 = prev
  prev = cur
}

console.log(
  `dips found: ${found.length} (true zeros in window: ${RIEMANN_ZEROS.filter((t) => t >= Z_LO && t <= Z_HI).length})`
)
console.log('\n  n |  Evans dip γ̂_n |   γ_n (true) |      Δ')
let maxErr = 0
let nCmp = 0
for (let i = 0; i < Math.min(found.length, RIEMANN_ZEROS.length); i++) {
  const d = found[i]! - RIEMANN_ZEROS[i]!
  maxErr = Math.max(maxErr, Math.abs(d))
  nCmp++
  if (i < 12 || i >= Math.min(found.length, RIEMANN_ZEROS.length) - 4) {
    console.log(
      `${String(i + 1).padStart(4)} | ${found[i]!.toFixed(6).padStart(15)} | ${RIEMANN_ZEROS[
        i
      ]!.toFixed(6).padStart(12)} | ${d.toExponential(2).padStart(10)}`
    )
  } else if (i === 12) {
    console.log('   … |        …        |       …      |     …')
  }
}
console.log(`compared ${nCmp} dips: max |Δ| = ${maxErr.toExponential(2)}`)

// ---- 2. Off-axis search (numerical RH check in the scan window) ----
console.log('\nOff-axis deep-minima count per Im(z) line (x ∈ [10, 120]):')
for (const y of [-0.35, -0.2, -0.1, 0.1, 0.2, 0.35]) {
  let count = 0
  let p2 = absET(9.96, y)
  let p1 = absET(9.98, y)
  for (let x = 10; x <= 120; x += 0.02) {
    const cur = absET(x, y)
    if (p1 < p2 && p1 < cur) {
      const ref = absET(x - 0.02 + 0.6, y) + absET(x - 0.02 - 0.6, y)
      if (p1 < 0.05 * ref) count++
    }
    p2 = p1
    p1 = cur
  }
  console.log(`  Im(z) = ${y.toFixed(2).padStart(6)}:  ${count}`)
}

// ---- 3. Eta-prefactor branch at Im(z) = −1/2 ----
console.log('\nEta branch at Im(z) = −1/2 (expected x = 9.06472·k):')
for (let k = 1; k <= 8; k++) {
  const x0 = (2 * Math.PI * k) / Math.LN2
  let best = x0
  let bestV = Infinity
  for (let x = x0 - 0.4; x <= x0 + 0.4; x += 0.002) {
    const v = absET(x, -0.5)
    if (v < bestV) {
      bestV = v
      best = x
    }
  }
  const ref = absET(x0 + 2, -0.5)
  console.log(
    `  k=${k}: predicted ${x0.toFixed(5)}, found ${best.toFixed(5)} (rel depth ${(bestV / ref).toExponential(1)})`
  )
}
