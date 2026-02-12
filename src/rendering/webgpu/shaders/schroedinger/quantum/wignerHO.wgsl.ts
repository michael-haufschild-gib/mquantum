/**
 * WGSL Wigner Phase-Space Functions for Harmonic Oscillator
 *
 * Implements diagonal and cross-Wigner functions for the quantum HO:
 *
 * Diagonal (Fock state n):
 *   W_n(x, p) = (-1)^n / pi * L_n(2*u^2) * exp(-u^2)
 *   u^2 = omega*x^2 + p^2/omega
 *
 * Cross-Wigner (m >= n):
 *   W_{m,n}(x, p) = (-1)^n / pi * sqrt(n!/m!) * (sqrt(2)*zeta)^(m-n)
 *                  * L_n^{m-n}(2*u^2) * exp(-u^2)
 *   zeta = sqrt(omega)*x + i*p/sqrt(omega)
 *
 * Marginal rule: cross terms only contribute when all quantum numbers
 * on non-selected dimensions match between the two terms.
 *
 * Time evolution: cross terms acquire phase exp(-i*(E_m - E_n)*t).
 *
 * Requires: laguerre.wgsl.ts (for laguerre() function)
 *
 * @module rendering/webgpu/shaders/schroedinger/quantum/wignerHO
 */

export const wignerHOBlock = /* wgsl */ `
// ============================================
// Wigner Phase-Space: Harmonic Oscillator
// ============================================

// Factorial lookup table for n = 0..7
// MAX_TERMS = 8, so quantum numbers per dim can reach ~7
const WIGNER_FACTORIAL: array<f32, 8> = array<f32, 8>(
  1.0, 1.0, 2.0, 6.0, 24.0, 120.0, 720.0, 5040.0
);

fn wignerFactorial(n: i32) -> f32 {
  return WIGNER_FACTORIAL[clamp(n, 0, 7)];
}

/**
 * Evaluate the diagonal Wigner function W_n(x, p) for a single Fock state.
 *
 * W_n(x, p) = (-1)^n / pi * L_n(2*u^2) * exp(-u^2)
 * where u^2 = omega*x^2 + p^2/omega
 */
fn wignerDiagonal(n: i32, x: f32, p: f32, omega: f32) -> f32 {
  let u2 = omega * x * x + p * p / omega;
  let sign = select(1.0, -1.0, (n & 1) != 0); // (-1)^n
  return sign / PI * laguerre(n, 0.0, 2.0 * u2) * exp(-u2);
}

/**
 * Evaluate the cross-Wigner function W_{m,n}(x, p) for m >= n.
 *
 * W_{m,n}(x, p) = (-1)^n / pi * sqrt(n!/m!) * (sqrt(2)*zeta)^(m-n)
 *               * L_n^{m-n}(2*u^2) * exp(-u^2)
 *
 * where zeta = sqrt(omega)*x + i*p/sqrt(omega) (complex)
 *
 * Returns a complex value (real, imag) because the cross-Wigner
 * has complex phase from (zeta)^(m-n).
 */
fn wignerCross(m: i32, n: i32, x: f32, p: f32, omega: f32) -> vec2f {
  // Ensure m >= n (caller's responsibility, but guard anyway)
  let mMax = max(m, n);
  let nMin = min(m, n);
  let delta = mMax - nMin;

  let u2 = omega * x * x + p * p / omega;
  let signN = select(1.0, -1.0, (nMin & 1) != 0); // (-1)^n

  // sqrt(n!/m!) coefficient
  let coeffNM = sqrt(wignerFactorial(nMin) / wignerFactorial(mMax));

  // Associated Laguerre L_n^{m-n}(2*u^2)
  let lagVal = laguerre(nMin, f32(delta), 2.0 * u2);

  // Complex zeta = sqrt(omega)*x + i*p/sqrt(omega)
  let sqrtOmega = sqrt(omega);
  let zetaRe = sqrtOmega * x;
  let zetaIm = p / sqrtOmega;

  // (sqrt(2) * zeta)^(m-n) via complex power
  // For efficiency, compute iteratively for small delta
  let scale = sqrt(2.0);
  var powRe = 1.0;
  var powIm = 0.0;
  let szetaRe = scale * zetaRe;
  let szetaIm = scale * zetaIm;
  for (var i = 0; i < delta; i++) {
    let newRe = powRe * szetaRe - powIm * szetaIm;
    let newIm = powRe * szetaIm + powIm * szetaRe;
    powRe = newRe;
    powIm = newIm;
  }

  // Assemble: (-1)^n / pi * sqrt(n!/m!) * (sqrt(2)*zeta)^(m-n) * L_n^{m-n}(2u2) * exp(-u2)
  let scalar = signN / PI * coeffNM * lagVal * exp(-u2);
  return vec2f(scalar * powRe, scalar * powIm);
}

/**
 * Check if two terms match on all dimensions except the selected one.
 * This is the marginal rule: cross terms only contribute when
 * quantum numbers agree on all non-selected dimensions.
 */
fn wignerTermsMatchExcept(termA: i32, termB: i32, dimIdx: i32, uniforms: SchroedingerUniforms) -> bool {
  for (var d = 0; d < ACTUAL_DIM; d++) {
    if (d == dimIdx) { continue; }
    if (getQuantumNumber(uniforms, termA, d) != getQuantumNumber(uniforms, termB, d)) {
      return false;
    }
  }
  return true;
}

/**
 * Evaluate the full marginal Wigner function for a HO superposition,
 * including diagonal terms and cross terms with time evolution.
 *
 * W(x, p, t) = sum_k |c_k|^2 * W_{n_k}(x, p)
 *            + 2 * sum_{j>k} Re( c_j* c_k * e^{-i(E_j-E_k)t} * W_{n_j,n_k}(x,p) )
 *
 * Only term pairs that agree on all non-selected dimensions contribute.
 */
fn evaluateWignerMarginalHO(x: f32, p: f32, dimIdx: i32, time: f32, uniforms: SchroedingerUniforms) -> f32 {
  let omega = getOmega(uniforms, dimIdx);
  let tc = uniforms.termCount;
  var W = 0.0;

  // Diagonal contributions: sum_k |c_k|^2 * W_{n_k}
  for (var k = 0; k < tc; k++) {
    let c = getCoeff(uniforms, k);
    let weight = c.x * c.x + c.y * c.y; // |c_k|^2
    let n = getQuantumNumber(uniforms, k, dimIdx);
    W += weight * wignerDiagonal(n, x, p, omega);
  }

  // Cross-term contributions (only when cross terms enabled)
  if (uniforms.wignerCrossTermsEnabled != 0u) {
    for (var j = 0; j < tc; j++) {
      for (var k = j + 1; k < tc; k++) {
        // Marginal rule: all non-selected dimensions must match
        if (!wignerTermsMatchExcept(j, k, dimIdx, uniforms)) { continue; }

        let nj = getQuantumNumber(uniforms, j, dimIdx);
        let nk = getQuantumNumber(uniforms, k, dimIdx);

        // Cross-Wigner: wignerCross always computes W_{max,min}.
        // When nj < nk we get W_{nk,nj} but need W_{nj,nk} = conj(W_{nk,nj}),
        // so negate the imaginary part.
        let Wcross = wignerCross(nj, nk, x, p, omega);
        let WcrossIm = select(Wcross.y, -Wcross.y, nj < nk);

        // Time-dependent phase: e^{-i*(E_j - E_k)*t}
        let Ej = getEnergy(uniforms, j);
        let Ek = getEnergy(uniforms, k);
        let dE = Ej - Ek;
        let phaseAngle = -dE * time;
        let timeCos = cos(phaseAngle);
        let timeSin = sin(phaseAngle);

        // Complex product: c_j* c_k * e^{-i*dE*t}
        let cj = getCoeff(uniforms, j);
        let ck = getCoeff(uniforms, k);
        // c_j* = (cj.x, -cj.y)
        let prodRe = cj.x * ck.x + cj.y * ck.y; // Re(c_j* c_k)
        let prodIm = cj.x * ck.y - cj.y * ck.x; // Im(c_j* c_k)

        // Multiply by time phase
        let phasedRe = prodRe * timeCos - prodIm * timeSin;
        let phasedIm = prodRe * timeSin + prodIm * timeCos;

        // 2 * Re( phased * Wcross )
        W += 2.0 * (phasedRe * Wcross.x - phasedIm * WcrossIm);
      }
    }
  }

  return W;
}
`
