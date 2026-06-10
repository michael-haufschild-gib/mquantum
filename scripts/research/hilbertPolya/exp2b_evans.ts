/**
 * EXPERIMENT 2b — Evans-function spectroscopy of the Riemann operator.
 *
 * The eigenvalue problem for A = −i(∂_u + μ(e^u)) with the Dirichlet
 * functional ∫ e^{u/2} G(u) du = 0 quantizes via the shooting determinant
 * (Evans function):
 *     E(z) = ∫ e^{u/2} G_z(u) du,   G_z' = (iz − μ(e^u)) G_z .
 * The ONLY arithmetic input is the damping profile μ(t) = t·tanh(t/2) − 1.
 * If the Hilbert–Pólya structure is real, |E(z)| must dip to zero at the
 * Riemann ordinates γ_n on the REAL z-axis — and nowhere off it (that is RH
 * in the operator's own variables, for the scanned window).
 *
 * Run: node --experimental-strip-types scripts/research/hilbertPolya/exp2b_evans.ts
 */

import { RIEMANN_ZEROS } from '../../../src/lib/physics/riemannZeta.ts'

const U_MIN = -28
const U_MAX = 5.5
const DU = 0.001
const N = Math.round((U_MAX - U_MIN) / DU) + 1

// Precompute M(u) = ∫₀^u μ(e^v)dv by trapezoid (independent of z), and the
// real envelope env(u) = exp(u/2 − M(u)).
const mu = (t: number): number => t * Math.tanh(t / 2) - 1
const us = new Float64Array(N)
const env = new Float64Array(N)
{
  const m = new Float64Array(N)
  const i0 = Math.round(-U_MIN / DU) // index of u = 0
  m[i0] = 0
  for (let i = i0 + 1; i < N; i++) {
    const a = U_MIN + (i - 1) * DU
    m[i] = m[i - 1]! + 0.5 * DU * (mu(Math.exp(a)) + mu(Math.exp(a + DU)))
  }
  for (let i = i0 - 1; i >= 0; i--) {
    const a = U_MIN + i * DU
    m[i] = m[i + 1]! - 0.5 * DU * (mu(Math.exp(a)) + mu(Math.exp(a + DU)))
  }
  for (let i = 0; i < N; i++) {
    const u = U_MIN + i * DU
    us[i] = u
    env[i] = Math.exp(0.5 * u - m[i]!)
  }
}

/** E(z) for complex z = x + iy by direct quadrature of env·e^{izu}. */
function evans(x: number, y: number): { re: number; im: number } {
  let re = 0
  let im = 0
  for (let i = 0; i < N; i++) {
    const w = i === 0 || i === N - 1 ? 0.5 : 1
    const amp = env[i]! * Math.exp(-y * us[i]!) * w
    const ph = x * us[i]!
    re += amp * Math.cos(ph)
    im += amp * Math.sin(ph)
  }
  return { re: re * DU, im: im * DU }
}

const absE = (x: number, y: number): number => {
  const e = evans(x, y)
  return Math.hypot(e.re, e.im)
}

// ---- 1. Real-axis scan: locate dips, compare to true zeros ----
console.log('Real-axis Evans scan z ∈ [2, 105] …')
const found: number[] = []
let prev = absE(2, 0)
let prev2 = absE(1.95, 0)
const STEP = 0.02
for (let x = 2 + STEP; x <= 105; x += STEP) {
  const cur = absE(x, 0)
  if (prev < prev2 && prev < cur) {
    // local minimum at x-STEP: refine by golden-ish trisection
    let a = x - 2 * STEP
    let b = x
    for (let it = 0; it < 40; it++) {
      const m1 = a + (b - a) / 3
      const m2 = b - (b - a) / 3
      if (absE(m1, 0) < absE(m2, 0)) b = m2
      else a = m1
    }
    const zMin = 0.5 * (a + b)
    const vMin = absE(zMin, 0)
    // Reject shallow minima (not actual zeros): compare to neighborhood level.
    const ref = absE(zMin + 0.5, 0) + absE(zMin - 0.5, 0)
    if (vMin < 0.02 * ref) found.push(zMin)
  }
  prev2 = prev
  prev = cur
}
console.log('\n  n |  Evans dip γ̂_n |   γ_n (true) |      Δ')
let maxAbsErr = 0
for (let i = 0; i < Math.min(found.length, RIEMANN_ZEROS.length, 28); i++) {
  const d = found[i]! - RIEMANN_ZEROS[i]!
  maxAbsErr = Math.max(maxAbsErr, Math.abs(d))
  console.log(
    `${String(i + 1).padStart(4)} | ${found[i]!.toFixed(6).padStart(15)} | ${RIEMANN_ZEROS[
      i
    ]!.toFixed(6).padStart(12)} | ${d.toExponential(2).padStart(10)}`
  )
}
console.log(
  `dips found: ${found.length}; max |Δ| over compared range: ${maxAbsErr.toExponential(2)}`
)

// ---- 2. Complex-plane map: are there zeros OFF the real axis? ----
// For each y-line, count deep local minima in x ∈ [10, 60].
console.log('\nOff-axis zero search: deep minima per Im(z) line (x ∈ [10, 60])')
for (const y of [-0.4, -0.2, -0.1, 0, 0.1, 0.2, 0.4]) {
  let count = 0
  let p2 = absE(9.96, y)
  let p1 = absE(9.98, y)
  for (let x = 10; x <= 60; x += 0.02) {
    const cur = absE(x, y)
    if (p1 < p2 && p1 < cur) {
      const ref = absE(x - 0.02 + 0.5, y) + absE(x - 0.02 - 0.5, y)
      if (p1 < 0.02 * ref) count++
    }
    p2 = p1
    p1 = cur
  }
  console.log(`  Im(z) = ${y.toFixed(1).padStart(5)}:  ${count} deep minima`)
}

// ---- 3. The eta-prefactor branch: zeros expected at z = ±2πk/log2 − i/2 ----
console.log('\nEta-prefactor branch check at Im(z) = −1/2 (expected at x = 9.0647·k):')
for (let k = 1; k <= 4; k++) {
  const x0 = (2 * Math.PI * k) / Math.LN2
  let best = x0
  let bestV = Infinity
  for (let x = x0 - 0.5; x <= x0 + 0.5; x += 0.005) {
    const v = absE(x, -0.5)
    if (v < bestV) {
      bestV = v
      best = x
    }
  }
  const ref = absE(x0 + 2, -0.5)
  console.log(
    `  k=${k}: predicted ${x0.toFixed(4)}, found minimum at ${best.toFixed(4)} (depth ${(
      bestV / ref
    ).toExponential(1)} rel.)`
  )
}
