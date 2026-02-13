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
  // Cutoff sMax: wavefunction decays exponentially beyond ~ 2*n^2*a0
  let nf = f32(n);
  let sMax = 2.5 * nf * nf * a0;

  // Auto-scale quadrature for Nyquist satisfaction:
  // cos(2*pr*s) oscillates with period pi/|pr|.
  // Need ds < pi/(4*|pr|) ⟹ nPts > 4*|pr|*sMax/pi.
  // Clamp to GPU-safe maximum of 128 loop iterations.
  let nyquistPts = i32(ceil(4.0 * abs(pr) * sMax / PI));
  let effectiveNPts = min(max(nPts, nyquistPts), 128);

  // Midpoint quadrature
  let ds = sMax / f32(effectiveNPts);
  let signL = select(-1.0, 1.0, (l & 1) != 0); // (-1)^{l+1}: u_nl(-r) = (-1)^{l+1} u_nl(r)

  var integral = 0.0;
  for (var i = 0; i < effectiveNPts; i++) {
    let s = (f32(i) + 0.5) * ds;

    // u_nl(r + s)
    let uPlus = hydrogenReducedRadial(n, l, r + s, a0);

    // u_nl(|r - s|) with sign correction
    let rms = r - s;
    let absRms = abs(rms);
    let uMinus = hydrogenReducedRadial(n, l, absRms, a0);

    // Sign correction: (-1)^{l+1} when r < s because u_nl(r) ~ r^{l+1}
    // near origin, giving parity (-1)^{l+1} under reflection r -> -r
    let sign = select(1.0, signL, rms < 0.0);

    integral += uPlus * uMinus * sign * cos(2.0 * pr * s);
  }

  return (2.0 / PI) * integral * ds;
}
`
