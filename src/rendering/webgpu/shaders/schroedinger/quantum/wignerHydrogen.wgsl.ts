/**
 * WGSL Wigner Phase-Space Functions for Hydrogen Atom
 *
 * Implements the radial Wigner function via numerical 1D Fourier-cosine
 * quadrature of the reduced radial wavefunction u_nl(r) = r * R_nl(r).
 *
 * Physics:
 *   W_rad(r, p_r) = (2/pi) * integral_0^sMax
 *     u_nl(r+s) * u_nl(|r-s|) * sign_fix(r,s,l) * cos(2*p_r*s) ds
 *
 * where sign_fix = (-1)^{l+1} when r < s (parity of u_nl under r -> -r),
 * and u_nl(r) = r * R_nl(r) is the reduced radial wavefunction.
 *
 * Limitation — single eigenstate only:
 *   This implementation computes W(r, p_r) for a single hydrogen eigenstate
 *   (fixed n, l). Superposition Wigner functions (summing over multiple (n, l)
 *   eigenstates with cross-Wigner terms) are NOT supported because the
 *   cross-Wigner W_{n1l1, n2l2}(r, p_r) between hydrogen eigenstates has no
 *   closed-form expression and requires numerical double integration.
 *   The HO cross-Wigner uses analytical Laguerre identities; hydrogen has
 *   no such shortcut. This is a known feature gap, not a coding error.
 *
 * Requires: hydrogenRadial.wgsl.ts (for hydrogenRadial() function)
 *
 * @module rendering/webgpu/shaders/schroedinger/quantum/wignerHydrogen
 */

export const wignerHydrogenBlock = /* wgsl */ `
// ============================================
// Wigner Phase-Space: Hydrogen Radial
// ============================================

/**
 * Reduced radial wavefunction u_nl(r) = r * R_nl(r).
 *
 * Returns 0 for r <= 0 (unphysical region).
 */
fn hydrogenReducedRadial(n: i32, l: i32, r: f32, a0: f32) -> f32 {
  if (r <= 0.0) { return 0.0; }
  return r * hydrogenRadial(n, l, r, a0);
}

// PERF: u_nl(r) variant that consumes pre-hoisted (n,l,a0)-only quantities
// (norm, twoOverNa = 2/(n·a0Safe), lagK, alpha). The full hydrogenRadial path
// recomputes these on every call — at 2 calls × ≤256 quadrature steps × per-cell
// dispatch the hoist eliminates ~512 redundant norm/reciprocal computes per
// (r, p) cell (each carrying 1 sqrt + ≥1 divide + LUT loads).
fn wignerHydrogenU(
  l: i32,
  lagK: i32,
  alpha: f32,
  r: f32,
  twoOverNa: f32,
  norm: f32
) -> f32 {
  if (r <= 0.0) { return 0.0; }
  let rho = r * twoOverNa;

  // ρ^l via iterative multiply (matches hydrogenRadial — avoids pow's exp+log).
  var rhoL: f32 = 1.0;
  for (var il = 0; il < l; il = il + 1) {
    rhoL = rhoL * rho;
  }

  let L = laguerre(lagK, alpha, rho);
  let expPart = exp(-rho * 0.5);

  // u_nl(r) = r · R_nl(r) = r · norm · ρ^l · L · exp(-ρ/2)
  return r * norm * rhoL * L * expPart;
}

/**
 * Evaluate the radial Wigner function W(r, p_r) for a hydrogen eigenstate
 * via numerical midpoint quadrature of the Fourier-cosine transform.
 *
 * W(r, p_r) = (2/pi) * integral_0^sMax
 *   u_nl(r+s) * u_nl(|r-s|) * sign(r,s,l) * cos(2*p_r*s) ds
 *
 * sign(r,s,l) = 1 when r >= s, (-1)^{l+1} when r < s
 *
 * @param r    - Radial position (>= 0)
 * @param pr   - Radial momentum
 * @param n    - Principal quantum number
 * @param l    - Angular momentum quantum number
 * @param a0   - Bohr radius scale
 * @param nPts - Number of quadrature points
 * @return W(r, p_r) — quasi-probability value
 */
fn wignerHydrogenRadial(r: f32, pr: f32, n: i32, l: i32, a0: f32, nPts: i32) -> f32 {
  // Validate quantum numbers once — lets the inner u_nl helper skip the
  // per-call (n<1 || l<0 || l>=n) check that hydrogenRadial does internally.
  if (n < 1 || l < 0 || l >= n) { return 0.0; }

  // Cutoff sMax: wavefunction decays exponentially beyond ~ 2*n^2*a0.
  // Use a0Safe consistently so a non-positive a0 doesn't collapse the
  // integration domain to a non-positive ds further down.
  let nf = f32(n);
  let a0Safe = max(a0, 0.001);
  let sMax = 2.5 * nf * nf * a0Safe;

  // (n, l, a0)-only scalars hoisted once per (r, p) cell. Without this the
  // quadrature would recompute norm, twoOverNa, lagK and alpha on every call
  // to hydrogenReducedRadial → hydrogenRadial → hydrogenRadialNorm — i.e.
  // 2·effectiveNPts redundant evaluations per cell.
  let twoOverNa = 2.0 / (nf * a0Safe);
  let normNL = hydrogenRadialNorm(n, l, a0Safe);
  let lagK = n - l - 1;
  let alpha = f32(2 * l + 1);

  // Auto-scale quadrature for Nyquist satisfaction:
  // cos(2*pr*s) oscillates with period pi/|pr|.
  // Need ds < pi/(4*|pr|) ⟹ nPts > 4*|pr|*sMax/pi.
  // Cap at 256 samples: resolves up to about n≈5 for |pr|≤3
  // (e.g. n=5,|pr|=3 needs ~191 points). For n=7,|pr|=3 Nyquist
  // requires ~469, so higher n+pr combos are under-resolved and
  // exhibit aliasing, mainly in low-density tails of phase space.
  let nyquistPts = i32(ceil(4.0 * abs(pr) * sMax / PI));
  let effectiveNPts = max(1, min(max(nPts, nyquistPts), 256));

  // Midpoint quadrature
  let ds = sMax / f32(effectiveNPts);
  let signL = select(-1.0, 1.0, (l & 1) != 0); // (-1)^{l+1}: u_nl(-r) = (-1)^{l+1} u_nl(r)

  // Rotate-by-delta recurrence for cos(2*pr*s_i) where s_i = (i + 0.5) * ds.
  // Replaces 256 transcendental cos() calls with 2 muls + 1 sub + 1 add per iter
  // (the rotation of a unit complex on the arg axis). Accuracy drift over N steps
  // is ~O(N * eps) ~ 1e-5 for N=256 — imperceptible in a visualization quadrature.
  let phi0  = pr * ds;          // 2*pr*0.5*ds
  let dPhi  = 2.0 * pr * ds;
  let cosD  = cos(dPhi);
  let sinD  = sin(dPhi);
  var cosI  = cos(phi0);
  var sinI  = sin(phi0);

  // PERF: run s via an additive recurrence alongside the cos/sin rotation —
  // saves one f32 cast and one mul per iter. Accumulated drift is O(N*eps*ds),
  // on the same order as the rotation recurrence's already-accepted drift.
  var integral = 0.0;
  var s = 0.5 * ds;
  for (var i = 0; i < effectiveNPts; i++) {
    // u_nl(r + s) — uses pre-hoisted norm/twoOverNa to skip per-step norm rebuild.
    let uPlus = wignerHydrogenU(l, lagK, alpha, r + s, twoOverNa, normNL);

    // u_nl(|r - s|) with sign correction
    let rms = r - s;
    let absRms = abs(rms);
    let uMinus = wignerHydrogenU(l, lagK, alpha, absRms, twoOverNa, normNL);

    // Sign correction: (-1)^{l+1} when r < s because u_nl(r) ~ r^{l+1}
    // near origin, giving parity (-1)^{l+1} under reflection r -> -r
    let sign = select(1.0, signL, rms < 0.0);

    integral += uPlus * uMinus * sign * cosI;

    // Advance (cosI, sinI) -> (cosI+dPhi, sinI+dPhi) by 2x2 rotation.
    let newCos = cosI * cosD - sinI * sinD;
    let newSin = sinI * cosD + cosI * sinD;
    cosI = newCos;
    sinI = newSin;
    s += ds;
  }

  return (2.0 / PI) * integral * ds;
}
`
