/**
 * Carpet Slice Compute Shader
 *
 * Extracts a 1D line from the 3D density texture and writes it
 * as a single row in the 2D rolling carpet texture.
 *
 * The density texture channels:
 * - .r = |ψ|² (linear density)
 * - .g = log(|ψ|² + ε) (log density)
 *
 * @module rendering/webgpu/shaders/schroedinger/compute/carpetSlice
 */

export const carpetSliceShader = /* wgsl */ `
struct CarpetSliceParams {
  sliceAxis: u32,
  writeRow: u32,
  slicePosY: f32,
  slicePosZ: f32,
  useLogScale: u32,
  gridSize: u32,
  _pad0: u32,
  _pad1: u32,
}

@group(0) @binding(0) var<uniform> params: CarpetSliceParams;
@group(0) @binding(1) var densityTex: texture_3d<f32>;
@group(0) @binding(2) var carpetTex: texture_storage_2d<r32float, write>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= params.gridSize) { return; }

  let perpY = u32(params.slicePosY * f32(params.gridSize - 1u));
  let perpZ = u32(params.slicePosZ * f32(params.gridSize - 1u));

  var coord: vec3u;
  if (params.sliceAxis == 0u) {
    coord = vec3u(i, perpY, perpZ);
  } else if (params.sliceAxis == 1u) {
    coord = vec3u(perpY, i, perpZ);
  } else {
    coord = vec3u(perpY, perpZ, i);
  }

  let sample = textureLoad(densityTex, coord, 0);
  let value = select(sample.r, sample.g, params.useLogScale == 1u);

  textureStore(carpetTex, vec2u(i, params.writeRow), vec4f(value, 0.0, 0.0, 1.0));
}
`
