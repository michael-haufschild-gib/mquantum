/**
 * Quantum Walk Absorber Compute Shader
 *
 * Applies amplitude damping near lattice boundaries after each walk step.
 * For discrete-time walks there is no dt; damping is applied per step:
 *   c_j(x) *= exp(-σ(x))
 *
 * Uses cubic polynomial grading (p=3) via the shared computePMLSigma()
 * function. σ_max is computed on the CPU from the target reflection
 * coefficient with dt=1 (discrete step).
 *
 * Requires freeScalarNDIndexBlock + pmlProfileBlock to be prepended.
 *
 * @workgroup_size(64)
 * @module
 */

export const qwAbsorberUniformsBlock = /* wgsl */ `
struct QWAbsorberUniforms {
  totalSites: u32,
  latticeDim: u32,
  absorberEnabled: u32,
  absorberStrength: f32,
  gridSize: array<u32, 12>,
  strides: array<u32, 12>,
  absorberWidth: f32,
  _pad0: u32,
  _pad1: u32,
  _pad2: u32,
}
`

/** Byte size of QWAbsorberUniforms (16 + 48 + 48 + 16 = 128). */
export const QW_ABSORBER_UNIFORMS_SIZE = 128

export const quantumWalkAbsorberBlock = /* wgsl */ `
@group(0) @binding(0) var<uniform> params: QWAbsorberUniforms;
@group(0) @binding(1) var<storage, read_write> coinState: array<f32>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let idx = gid.x;
  if (idx >= params.totalSites) {
    return;
  }
  if (params.absorberEnabled == 0u) {
    return;
  }

  let coords = linearToND(idx, params.strides, params.gridSize, params.latticeDim);
  let sigma = computePMLSigma(coords, params.gridSize, params.latticeDim,
                              params.absorberWidth, params.absorberStrength);

  if (sigma > 0.0) {
    // Per-step damping (no dt for discrete walk)
    let dampFactor = exp(-sigma);
    let numCoinStates = 2u * params.latticeDim;
    let base = idx * numCoinStates * 2u;
    for (var j: u32 = 0u; j < numCoinStates; j++) {
      coinState[base + j * 2u] *= dampFactor;       // re
      coinState[base + j * 2u + 1u] *= dampFactor;  // im
    }
  }
}
`
