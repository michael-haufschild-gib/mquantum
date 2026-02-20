/**
 * TDSE Wavefunction Initialization Compute Shader
 *
 * Initializes psiRe and psiIm storage buffers with a Gaussian wavepacket:
 *   psi(x) = A * exp(-|x - x0|^2 / (4*sigma^2)) * exp(i * k0 . x)
 *
 * For 'planeWave' mode, sigma is set very large (flat envelope).
 * For 'superposition' mode, two counter-propagating packets are summed.
 *
 * Requires tdseUniformsBlock + freeScalarNDIndexBlock to be prepended.
 *
 * @workgroup_size(64)
 * @module
 */

export const tdseInitBlock = /* wgsl */ `
@group(0) @binding(0) var<uniform> params: TDSEUniforms;
@group(0) @binding(1) var<storage, read_write> psiRe: array<f32>;
@group(0) @binding(2) var<storage, read_write> psiIm: array<f32>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let idx = gid.x;
  if (idx >= params.totalSites) {
    return;
  }

  // Convert linear index to N-D coordinates
  let coords = linearToND(idx, params.gridSize, params.latticeDim);

  // Compute physical position from lattice coordinates
  var r2: f32 = 0.0;    // |x - x0|^2
  var kdotx: f32 = 0.0; // k0 . x
  for (var d: u32 = 0u; d < params.latticeDim; d++) {
    let pos = (f32(coords[d]) - f32(params.gridSize[d]) * 0.5 + 0.5) * params.spacing[d];
    let dx = pos - params.packetCenter[d];
    r2 += dx * dx;
    kdotx += params.packetMomentum[d] * pos;
  }

  let sigma = params.packetWidth;
  let sigma2 = sigma * sigma;
  let envelope = params.packetAmplitude * exp(-r2 / (4.0 * sigma2));

  var reVal: f32 = 0.0;
  var imVal: f32 = 0.0;

  if (params.initCondition == 0u) {
    // gaussianPacket
    reVal = envelope * cos(kdotx);
    imVal = envelope * sin(kdotx);
  } else if (params.initCondition == 1u) {
    // planeWave (Gaussian with very large sigma — effectively flat)
    // The large sigma is set CPU-side via packetWidth, but we still
    // apply the Gaussian to get smooth boundary falloff
    reVal = envelope * cos(kdotx);
    imVal = envelope * sin(kdotx);
  } else {
    // superposition: two counter-propagating Gaussian packets
    let env1 = params.packetAmplitude * 0.7071 * exp(-r2 / (4.0 * sigma2));
    let phase1 = kdotx;

    // Second packet: shifted center, reversed momentum
    var r2b: f32 = 0.0;
    var kdotx2: f32 = 0.0;
    for (var d2: u32 = 0u; d2 < params.latticeDim; d2++) {
      let pos2 = (f32(coords[d2]) - f32(params.gridSize[d2]) * 0.5 + 0.5) * params.spacing[d2];
      let dx2 = pos2 + params.packetCenter[d2]; // mirrored center
      r2b += dx2 * dx2;
      kdotx2 += -params.packetMomentum[d2] * pos2; // reversed momentum
    }
    let env2 = params.packetAmplitude * 0.7071 * exp(-r2b / (4.0 * sigma2));

    reVal = env1 * cos(phase1) + env2 * cos(kdotx2);
    imVal = env1 * sin(phase1) + env2 * sin(kdotx2);
  }

  psiRe[idx] = reVal;
  psiIm[idx] = imVal;
}
`
