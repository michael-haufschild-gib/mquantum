/**
 * BEC — Horizon-Localized Pair-Injection Compute Shader
 *
 * Perturbs the condensate wavefunction ψ with a phase kick δφ(x) concentrated
 * at the analog black-hole horizon, seeding the stochastic phonon bath that
 * produces analog Hawking radiation in the BEC (Unruh 1981; Lahav et al. 2010).
 *
 * Dispatch cadence: this kernel is dispatched **once per frame, after the
 * full Strang evolution for that frame completes** (see `runHawkingFrame` in
 * `TDSEComputePassHawking.ts`). It is NOT inserted between Strang substeps —
 * the pair-injection phase kick is a per-frame stochastic perturbation, and
 * `params.hawkingStepIndex` advances exactly once per frame.
 *
 * For each lattice site:
 *   1. Compute v_s = (ℏ/m) · Im(ψ*∇ψ)/|ψ|² via central differences.
 *   2. Compute c_s = √(g|ψ|²/m), Mach M = |v_s|/c_s.
 *   3. Gaussian horizon weight w(M) = exp(−((M−1)/0.25)²) concentrates the
 *      perturbation to voxels within one FWHM of M=1.
 *   4. Deterministic noise η ∈ (−1, 1) from splitmix32(siteIdx, seed, stepIdx).
 *   5. Rotate ψ by δφ = rate · w · η: ψ ← ψ · exp(i δφ).
 *
 * Identity at w=0 or rate=0 — never breaks norm catastrophically (small-angle
 * phase kick). Kept off by default (`hawkingPairInjection` flag) so the
 * preset still works without perturbation.
 *
 * Requires tdseUniformsBlock + freeScalarNDIndexBlock to be prepended.
 *
 * @workgroup_size(64)
 * @module
 */

export const becHawkingInjectBlock = /* wgsl */ `
@group(0) @binding(0) var<uniform> params: TDSEUniforms;
@group(0) @binding(1) var<storage, read_write> psiRe: array<f32>;
@group(0) @binding(2) var<storage, read_write> psiIm: array<f32>;

fn splitmix32_inj(x: u32) -> u32 {
  var z: u32 = x + 0x9e3779b9u;
  z = (z ^ (z >> 16u)) * 0x85ebca6bu;
  z = (z ^ (z >> 13u)) * 0xc2b2ae35u;
  z = z ^ (z >> 16u);
  return z;
}

fn hawkingNoise01(siteIdx: u32, seed: u32, stepIdx: u32) -> f32 {
  let a = splitmix32_inj(siteIdx ^ 0x9e3779b1u);
  let b = splitmix32_inj(a ^ splitmix32_inj(seed));
  let c = splitmix32_inj(b ^ splitmix32_inj(stepIdx + 0x632be59bu));
  // Map to (−1, +1) with 24-bit precision, mirroring the CPU path in
  // sonicHorizon.ts/hawkingNoise so diagnostics agree with GPU behaviour.
  return (f32(c & 0xffffffu) / 8388607.0) - 1.0;
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let idx = gid.x;
  if (idx >= params.totalSites) { return; }
  if (params.hawkingPairInjection == 0u) { return; }

  // Recover N-D coords for boundary guard.
  let coords = linearToND(idx, params.strides, params.gridSize, params.latticeDim);

  let re = psiRe[idx];
  let im = psiIm[idx];
  let density = re * re + im * im;
  if (density < 1e-12) { return; }

  // v_s via central differences, identical pattern to write-grid machNumber
  // and superfluidVelocity branches. Skip the injection for boundary voxels
  // (central difference undefined) — the horizon is interior by construction.
  let hbarOverM = params.hbar / max(params.mass, 1e-6);
  var vsMagSq: f32 = 0.0;
  for (var d: u32 = 0u; d < params.latticeDim; d++) {
    if (params.gridSize[d] <= 1u) { continue; }
    let coord = coords[d];
    let Nd = params.gridSize[d];
    if (coord == 0u || coord == Nd - 1u) { return; }
    let stride = params.strides[d];
    let fwdIdx = idx + stride;
    let bwdIdx = idx - stride;
    let invDx = 0.5 / params.spacing[d];
    let dRe = (psiRe[fwdIdx] - psiRe[bwdIdx]) * invDx;
    let dIm = (psiIm[fwdIdx] - psiIm[bwdIdx]) * invDx;
    let jd = hbarOverM * (re * dIm - im * dRe);
    let vsd = jd / max(density, 1e-20);
    vsMagSq += vsd * vsd;
  }

  let gAbs = max(abs(params.interactionStrength), 1e-10);
  let csSq = max(gAbs * density / max(params.mass, 1e-6), 1e-12);
  let mach = sqrt(vsMagSq) / sqrt(csSq);

  // Gaussian horizon weight (σ = 0.25 in Mach units) — matches CPU default
  // in sonicHorizon.ts/horizonWeight so CPU diagnostics and GPU injection
  // concentrate on the same voxels.
  let zWeight = (mach - 1.0) / 0.25;
  let w = exp(-zWeight * zWeight);
  let eta = hawkingNoise01(idx, params.hawkingSeed, params.hawkingStepIndex);
  let dPhi = params.hawkingInjectRate * w * eta;
  // Small-angle rotation of ψ by δφ. Avoids norm drift beyond O(dPhi²) rounding.
  let c = cos(dPhi);
  let s = sin(dPhi);
  psiRe[idx] = re * c - im * s;
  psiIm[idx] = re * s + im * c;
}
`
