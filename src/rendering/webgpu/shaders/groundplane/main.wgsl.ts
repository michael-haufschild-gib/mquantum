/**
 * Ground Plane Fragment Shader Main Block (WGSL)
 * Port of: src/rendering/shaders/groundplane/main.glsl.ts
 *
 * Uses GGX PBR lighting consistent with other custom shaders.
 * Supports multi-light system.
 */

export const fragmentUniformsBlock = `
// --- Ground Plane Fragment Uniforms ---
struct GroundPlaneUniforms {
  color: vec3<f32>,
  opacity: f32,
  metallic: f32,
  roughness: f32,
  specularIntensity: f32,
  _pad: f32,
  specularColor: vec3<f32>,
  _pad2: f32,
  cameraPosition: vec3<f32>,
  _pad3: f32,
}

@group(1) @binding(0) var<uniform> groundPlaneUniforms: GroundPlaneUniforms;

// Shared lighting uniforms
@group(2) @binding(0) var<uniform> lighting: LightingUniforms;
`

export const fragmentOutputStruct = `
// --- Fragment Output (MRT) ---
struct FragmentOutput {
  @location(0) color: vec4<f32>,
  @location(1) normal: vec4<f32>,
}
`

/**
 * Generate the main block with configurable features.
 * Conditional compilation at the TypeScript level avoids
 * invalid WGSL preprocessor directives.
 *
 * @param enableShadows - Whether to include shadow sampling code
 * @param enableIBL - Whether to include IBL (environment reflections)
 * @returns WGSL main block string
 */
export function generateMainBlock(enableShadows: boolean, enableIBL: boolean = false): string {
  // NOTE: Shadows are not wired for ground plane yet. Keep signature for compatibility.
  void enableShadows

  const iblLine = enableIBL
    ? `
  // IBL: environment reflections (matches WebGL computeIBL)
  Lo += computeIBL(N, V, F0, roughness, metallic, albedo, envMap, envMapSampler, iblUniforms);`
    : ''

  return `
// --- Main Fragment Entry Point ---
@fragment
fn main(input: VertexOutput) -> FragmentOutput {
  let N = normalize(input.normal);
  let V = normalize(input.viewDirection);

  // Clamp roughness to prevent numerical issues
  let roughness = max(groundPlaneUniforms.roughness, 0.04);
  let metallic = groundPlaneUniforms.metallic;
  let albedo = groundPlaneUniforms.color;

  // F0 with metallic mixing (industry-standard PBR)
  let F0 = computeF0(albedo, metallic, 0.04);

  // Multi-light GGX lighting (matches other WebGPU renderers)
  var Lo = computeMultiLighting(
    input.worldPosition,
    N,
    V,
    albedo,
    roughness,
    metallic,
    F0,
    groundPlaneUniforms.specularColor,
    groundPlaneUniforms.specularIntensity,
    false,
    lighting
  );
${iblLine}

  var color = Lo;

  // Apply procedural grid overlay using LOCAL coordinates
  // input.localPosition.xy is the vertex position before model rotation
  // This ensures consistent grid for all wall orientations
  color = applyGrid(color, input.localPosition.xy, input.worldPosition, groundPlaneUniforms.cameraPosition);

  // Output (MRT: color + normal buffer for SSAO/SSR)
  var output: FragmentOutput;
  output.color = vec4<f32>(color, groundPlaneUniforms.opacity);
  output.normal = vec4<f32>(N * 0.5 + 0.5, metallic);
  return output;
}
`
}

// Legacy export for backward compatibility (defaults to shadows enabled, no IBL)
export const mainBlock = generateMainBlock(true, false)
