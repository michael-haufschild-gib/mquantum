/**
 * Carpet Slice Compute Shader
 *
 * Extracts a 1D line from the 3D density texture and writes it
 * as a single row in the 2D rolling carpet texture.
 *
 * Reads raw |ψ|² density from the 3D density texture. The source channel
 * depends on the quantum mode:
 * - Analytic modes (HO, hydrogen): density is always in .r
 * - Compute modes (TDSE, Dirac, FSF, QW): density is in .a (field-view-independent)
 *
 * The `readAlpha` uniform selects which channel to read.
 * For compute modes, the alpha channel has three encodings:
 *   .a in [0, 1] → raw |ψ|² density (normal case)
 *   .a < 0       → -potOverlay (showPotential mode)
 *   .a in [2, 3] → 2.0 + branchFraction (branching mode)
 *
 * When alpha is overloaded (branching or showPotential), we fall back to .r
 * which equals raw density when fieldView=density (the default for all presets).
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
  readAlpha: u32,
  _pad0: u32,
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
  // Analytic modes: density in .r (always density, no field-view concept)
  // Compute modes: density in .a when .a is in [0,1] (raw density).
  // When .a is overloaded (branching: [2,3], showPotential: <0), fall back to .r
  // which contains the display scalar (= raw density when fieldView=density).
  let aVal = sample.a;
  let aIsRawDensity = aVal >= 0.0 && aVal <= 1.0;
  let computeDensity = select(sample.r, aVal, aIsRawDensity);
  let rawDensity = select(sample.r, computeDensity, params.readAlpha == 1u);
  let value = select(rawDensity, log(rawDensity + 1e-10), params.useLogScale == 1u);

  textureStore(carpetTex, vec2u(i, params.writeRow), vec4f(value, 0.0, 0.0, 1.0));
}
`
