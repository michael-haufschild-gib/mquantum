/**
 * EXPERIMENT 5 — the heat-resolution frontier, adversarially.
 *
 * Lemma L5 (rh_proof_quest log, Round 2): W1(m,σ) > 0 unconditionally for
 * σ² > G/2π + tail condition — because every zero ordinate within πσ² of m
 * contributes positively (phase |tδ/σ²| < π/2 forced by |δ| < 1/2), and the
 * exiled negativity beyond πσ² is crushed by e^{−π²σ²/2}.
 *
 * Adversary: move ONE true zero γ₀ off-line to 1/2 ± δ + iγ₀ (the explicit-
 * formula-admissible perturbation of exp4 PART D), choosing γ₀, δ ≤ 0.4999 and
 * the probe (m, σ) to make W1 as negative as possible. For each σ we report
 * the adversarial minimum over (γ₀, δ, m); the empirical sign frontier
 * σ_cross is where this minimum changes sign. L5 predicts the adversary
 * cannot win above the frontier; the detector mechanism predicts the
 * adversary always wins as σ → 0.
 *
 * Run: node --experimental-strip-types scripts/research/hilbertPolya/exp5_frontier.ts
 */

import { RIEMANN_ZEROS } from '../../../src/lib/physics/riemannZeta.ts'

/** W1(m,σ) zero-side with zero at γ₀ moved off-line by δ (PART D mechanism). */
function w1Doublet(m: number, sigma: number, gamma0: number, delta: number): number {
  const s2 = sigma * sigma
  let v = 0
  for (const g of RIEMANN_ZEROS) {
    for (const gs of [g, -g]) {
      const t = gs - m
      if (Math.abs(gs) === gamma0) {
        // off-line doublet: e^{(δ²−t²)/2σ²} cos(tδ/σ²)
        v += Math.exp((delta * delta - t * t) / (2 * s2)) * Math.cos((t * delta) / s2)
      } else {
        v += Math.exp((-t * t) / (2 * s2))
      }
    }
  }
  return v
}

/** Adversarial minimum of W1 at fixed σ: worst (γ₀, δ, m) within the window. */
function adversarialMin(
  sigma: number
): { min: number; gamma0: number; delta: number; m: number } {
  let best = { min: Infinity, gamma0: 0, delta: 0, m: 0 }
  // candidate zeros to displace: mid-window (avoid edge effects of the 100-zero table)
  const candidates = RIEMANN_ZEROS.filter((g) => g > 20 && g < 80)
  for (const gamma0 of candidates) {
    for (const delta of [0.1, 0.2, 0.3, 0.4, 0.4999]) {
      // negativity is engineered at |m−γ₀| ≈ πσ²/δ (first cos node) and beyond;
      // scan m around γ₀ out to the useful Gaussian reach
      const reach = Math.max((Math.PI * sigma * sigma) / delta + 4 * sigma, 6 * sigma)
      for (let dm = -reach; dm <= reach; dm += 0.05) {
        const m = gamma0 + dm
        if (m < 5) continue
        const v = w1Doublet(m, sigma, gamma0, delta)
        if (v < best.min) best = { min: v, gamma0, delta, m }
      }
    }
  }
  return best
}

console.log('σ      adversarial min W1      at γ₀      δ       m       verdict')
let crossed = false
for (const sigma of [2.0, 1.75, 1.5, 1.25, 1.1, 1.0, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4]) {
  const r = adversarialMin(sigma)
  const verdict = r.min > 0 ? 'L5 region (adversary loses)' : 'below frontier (detector wins)'
  if (r.min <= 0 && !crossed) {
    crossed = true
    console.log(`---- empirical frontier crossed between previous σ and ${sigma} ----`)
  }
  console.log(
    `${sigma.toFixed(2)}  ${r.min.toExponential(4).padStart(14)}   ${r.gamma0
      .toFixed(2)
      .padStart(7)}  ${r.delta.toFixed(4)}  ${r.m.toFixed(2).padStart(7)}  ${verdict}`
  )
}

// L5 prediction for the window: G = max gap in [20,80] among true zeros
let gMax = 0
const zs = RIEMANN_ZEROS.filter((g) => g > 15 && g < 85)
for (let i = 1; i < zs.length; i++) gMax = Math.max(gMax, zs[i]! - zs[i - 1]!)
console.log(`\nwindow max gap G = ${gMax.toFixed(2)}`)
for (const sigma of [1.5, 1.25, 1.1, 1.0, 0.9, 0.8]) {
  const s2 = sigma * sigma
  const lhs = Math.exp((-gMax * gMax) / (8 * s2)) * Math.cos(gMax / (4 * s2))
  const rhs =
    2 * Math.log(80) * sigma * Math.exp(1 / (8 * s2)) * Math.exp((-Math.PI * Math.PI * s2) / 2)
  console.log(
    `σ=${sigma.toFixed(2)}  anchor=${lhs.toExponential(3)}  tailbound=${rhs.toExponential(
      3
    )}  L5 ${lhs > rhs && s2 > gMax / (2 * Math.PI) ? 'HOLDS' : 'silent'}`
  )
}
