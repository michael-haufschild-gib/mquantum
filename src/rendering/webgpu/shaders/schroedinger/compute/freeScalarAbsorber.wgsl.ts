/**
 * Free Scalar Field PML Absorber Compute Shader
 *
 * Applies PML cubic polynomial damping to both field components (φ, π).
 * The damping is applied to `(φ − φ_target)` rather than `φ` directly so
 * configurations with a non-trivial vacuum (e.g. the Mexican-Hat kink
 * `φ = v·tanh(x/w)` whose asymptotes sit at ±v at the PML boundary) are
 * not slowly dragged toward 0 by the absorber:
 *   φ(x) := φ_target + (φ(x) − φ_target) · exp(−σ(x) · dt)
 *   π(x) *= exp(−σ(x) · dt)
 *
 * `params.absorberEnabled` picks the target:
 *   - `1u` → `φ_target = 0` (free KG vacuum, pre-existing behaviour)
 *   - `2u` → `φ_target = sign(x_axis0 − packetCenter[0]) · selfInteractionVev`
 *     (kink / domain-wall vacuum branch selected by position along axis 0)
 *
 * Unlike the Schrödinger/Pauli/Dirac modes where PML is merged into
 * the potential half-step, the Free Scalar Field uses a leapfrog scheme
 * with no potential half-step. The absorber runs as a separate dispatch
 * after each full leapfrog step.
 *
 * σ(x) uses cubic polynomial grading with σ_max auto-computed from
 * the target reflection coefficient on the CPU.
 *
 * Requires freeScalarNDIndexBlock + pmlProfileBlock to be prepended.
 * The uniform struct (FreeScalarUniforms) is declared inline since the
 * Free Scalar mode doesn't have a separate uniforms block file.
 *
 * @workgroup_size(64)
 * @module
 */

export const freeScalarAbsorberBlock = /* wgsl */ `
// See freeScalarInit.wgsl for why this binding is 'storage, read'.
@group(0) @binding(0) var<storage, read> params: FreeScalarUniforms;
@group(0) @binding(1) var<storage, read_write> phi: array<f32>;
@group(0) @binding(2) var<storage, read_write> pi: array<f32>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let idx = gid.x;
  if (idx >= params.totalSites) {
    return;
  }

  // 3D fast path: decompose coords without linearToND (avoids 2 integer divides)
  var coords: array<u32, 12>;
  if (params.latticeDim == 3u) {
    let s0 = params.strides[0];
    let s1 = params.strides[1];
    coords[0] = idx / s0;
    let r0 = idx - coords[0] * s0;
    coords[1] = r0 / s1;
    coords[2] = r0 - coords[1] * s1;
  } else {
    coords = linearToND(idx, params.strides, params.gridSize, params.latticeDim);
  }

  let sigma = computePMLSigma(coords, params.gridSize, params.latticeDim,
                              params.absorberWidth, params.absorberStrength, 0u);

  if (sigma > 0.0) {
    let dampFactor = exp(-sigma * params.dt);
    var phiTarget: f32 = 0.0;
    // Kink-aware target: damp toward the local vacuum branch (plus/minus
    // v) instead of toward 0. Position along axis 0 picks the branch —
    // matches the kink's asymptotic tanh sign and preserves the domain
    // wall shape. Mode 1u (ordinary PML) leaves phiTarget = 0 so the
    // expression reduces to the pre-fix phi *= dampFactor bit-identically.
    if (params.absorberEnabled == 2u) {
      let halfExtent0 = f32(params.gridSize[0]) * params.spacing[0] * 0.5;
      let x0 = f32(coords[0]) * params.spacing[0] - halfExtent0;
      let dx0 = x0 - params.packetCenter[0];
      phiTarget = select(-1.0, 1.0, dx0 >= 0.0) * params.selfInteractionVev;
    }
    phi[idx] = phiTarget + (phi[idx] - phiTarget) * dampFactor;
    pi[idx] *= dampFactor;
  }
}
`
