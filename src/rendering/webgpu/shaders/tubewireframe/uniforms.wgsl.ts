/**
 * WGSL Tube Wireframe Uniforms Block
 *
 * Port of GLSL tubewireframe/uniforms.glsl to WGSL.
 * Defines uniform structures for tube wireframe rendering.
 *
 * @module rendering/webgpu/shaders/tubewireframe/uniforms.wgsl
 */

export const tubeWireframeUniformsBlock = /* wgsl */ `
// ============================================
// Tube Wireframe Uniforms
// ============================================

struct TubeWireframeUniforms {
  // N-D Transformation
  rotationMatrix4D: mat4x4f,
  dimension: i32,
  uniformScale: f32,
  projectionDistance: f32,
  depthNormFactor: f32,

  // Tube rendering
  radius: f32,
  _pad1: f32,
  _pad2: f32,
  _pad3: f32,

  // Material
  baseColor: vec3f,
  opacity: f32,

  // Extra rotation columns (7 * 4 = 28 floats for 5D-11D)
  // Stored as 7 vec4s for alignment
  extraRotCol0: vec4f,
  extraRotCol1: vec4f,
  extraRotCol2: vec4f,
  extraRotCol3: vec4f,
  extraRotCol4: vec4f,
  extraRotCol5: vec4f,
  extraRotCol6: vec4f,

  // Depth row sums (11 floats for projection)
  depthRowSums0_3: vec4f,
  depthRowSums4_7: vec4f,
  depthRowSums8_10: vec3f,
  _padDepth: f32,

  // PBR
  roughness: f32,
  metalness: f32,
  ambientIntensity: f32,
  emissiveIntensity: f32,

  // Specular (artist controls; matches WebGL uSpecularColor, uSpecularIntensity)
  specularColor: vec3f,
  specularIntensity: f32,

  // Rim SSS (subsurface scattering for backlight transmission)
  sssEnabled: u32,
  sssIntensity: f32,
  sssThickness: f32,
  sssJitter: f32,
  sssColor: vec3f,
  _padSss: f32,

  // Fresnel rim lighting
  fresnelEnabled: u32,
  fresnelIntensity: f32,
  _padFresnel: vec2f,
  rimColor: vec3f,
  _padRim: f32,
}
`
