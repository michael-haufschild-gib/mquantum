/**
 * WGSL Shared Uniforms Block
 *
 * Common uniform structures used across all shaders.
 * Port of GLSL uniforms.glsl to WGSL.
 *
 * @module rendering/webgpu/shaders/shared/core/uniforms.wgsl
 */

export const uniformsBlock = /* wgsl */ `
// ============================================
// Camera Uniform Buffer
// ============================================

struct CameraUniforms {
  viewMatrix: mat4x4f,
  projectionMatrix: mat4x4f,
  viewProjectionMatrix: mat4x4f,
  inverseViewMatrix: mat4x4f,
  inverseProjectionMatrix: mat4x4f,
  // Model transform matrices (for raymarching coordinate space conversion)
  // CRITICAL: These enable proper WebGL-style raymarching in model space
  modelMatrix: mat4x4f,          // LOCAL → WORLD transform
  inverseModelMatrix: mat4x4f,   // WORLD → LOCAL transform (for raymarching)
  cameraPosition: vec3f,
  cameraNear: f32,
  cameraFar: f32,
  fov: f32,
  resolution: vec2f,
  aspectRatio: f32,
  time: f32,
  deltaTime: f32,
  frameNumber: u32,
  // Temporal accumulation support
  bayerOffset: vec2f,            // Bayer pattern offset [0,0], [1,1], [1,0], [0,1]
  _padding: vec2f,               // Padding for 16-byte alignment
}

// ============================================
// Light Structures
// ============================================

struct LightData {
  position: vec4f,      // xyz = position, w = type
  direction: vec4f,     // xyz = direction (for directional/spot), w = range
  color: vec4f,         // rgb = color, a = intensity
  params: vec4f,        // x = decay, y = spotCosInner, z = spotCosOuter, w = enabled (0/1)
}

struct LightingUniforms {
  lights: array<LightData, 8>,
  ambientColor: vec3f,
  ambientIntensity: f32,
  lightCount: i32,
  _padding: vec3f,
}

// ============================================
// Material Uniform Buffer
// ============================================

struct MaterialUniforms {
  // NOTE: This struct is host-shareable and follows WGSL alignment rules.
  // vec3f has 16-byte alignment, so some sequences introduce padding gaps.
  // The effective packed size is 160 bytes (40 floats) in uniform buffers.
  // See WebGPU renderers for the authoritative packing indices.

  // Core PBR
  baseColor: vec4f,
  metallic: f32,
  roughness: f32,
  reflectance: f32,
  ao: f32,
  // emissive.rgb + emissiveIntensity pack into one 16-byte slot
  emissive: vec3f,
  emissiveIntensity: f32,
  ior: f32,
  transmission: f32,
  thickness: f32,
  sssEnabled: u32,

  // Subsurface Scattering
  // (sssIntensity followed by vec3f introduces padding before sssColor)
  sssIntensity: f32,
  sssColor: vec3f,
  sssThickness: f32,
  sssJitter: f32,

  // Fresnel / Rim Lighting
  // (fresnelIntensity followed by vec3f can introduce padding before rimColor)
  fresnelEnabled: u32,
  fresnelIntensity: f32,
  rimColor: vec3f,
  _padding2: f32, // alignment

  // Specular (artist controls; matches WebGL PBRSource)
  // (specularIntensity followed by vec3f introduces padding before specularColor)
  specularIntensity: f32,
  specularColor: vec3f,
}

// ============================================
// N-Dimensional Transform Uniforms
// ============================================

struct NDTransformUniforms {
  // Basis vectors for 3D slice in D-space (max 11D)
  // Each vec4f holds first 4 components, extended arrays for higher dims
  basisX: array<vec4f, 3>,  // 11 floats + padding
  basisY: array<vec4f, 3>,
  basisZ: array<vec4f, 3>,

  // Origin in D-space
  origin: array<vec4f, 3>,

  // Current dimension
  dimension: i32,

  // Scale factor
  scale: f32,

  _padding: vec2f,
}

// ============================================
// Post-Processing Uniforms
// ============================================

struct PostProcessUniforms {
  // Bloom
  bloomStrength: f32,
  bloomRadius: f32,
  bloomThreshold: f32,
  bloomSmoothing: f32,

  // Tone mapping
  exposure: f32,
  gamma: f32,
  saturation: f32,
  contrast: f32,

  // Vignette
  vignetteIntensity: f32,
  vignetteRadius: f32,
  vignetteSoftness: f32,

  // FXAA
  fxaaQuality: f32,

  // Time
  time: f32,

  _padding: vec3f,
}

// ============================================
// Quality Uniforms
// ============================================

struct QualityUniforms {
  // SDF raymarching quality
  sdfMaxIterations: i32,
  sdfSurfaceDistance: f32,

  // Shadow quality (0=off, 1=low, 2=medium, 3=high)
  shadowQuality: i32,
  shadowSoftness: f32,

  // AO quality
  aoEnabled: i32,
  aoSamples: i32,
  aoRadius: f32,
  aoIntensity: f32,

  // Global quality multiplier (for fast mode)
  qualityMultiplier: f32,

  // Debug visualization mode (0=off, 1=iteration heatmap, 2=depth, 3=normals)
  debugMode: i32,
}

// ============================================
// Bind Group Layouts
// ============================================

// Group 0: Camera and time-varying uniforms (updated every frame)
// @group(0) @binding(0) var<uniform> camera: CameraUniforms;

// Group 1: Lighting uniforms (updated when lights change)
// @group(1) @binding(0) var<uniform> lighting: LightingUniforms;

// Group 2: Material uniforms (per-object)
// @group(2) @binding(0) var<uniform> material: MaterialUniforms;

// Group 3: Object-specific uniforms (Mandelbulb, Julia, etc.)
// Layout varies by object type
`

/**
 * Generate bind group layout code for a specific group.
 * @param group
 * @param binding
 * @param name
 * @param type
 */
export function generateBindGroupDeclaration(
  group: number,
  binding: number,
  name: string,
  type: string
): string {
  return /* wgsl */ `@group(${group}) @binding(${binding}) var<uniform> ${name}: ${type};`
}

/**
 * Generate texture binding declaration.
 * @param group
 * @param binding
 * @param name
 * @param textureType
 */
export function generateTextureDeclaration(
  group: number,
  binding: number,
  name: string,
  textureType:
    | 'texture_2d<f32>'
    | 'texture_cube<f32>'
    | 'texture_storage_2d<rgba16float, write>' = 'texture_2d<f32>'
): string {
  return /* wgsl */ `@group(${group}) @binding(${binding}) var ${name}: ${textureType};`
}

/**
 * Generate sampler binding declaration.
 * @param group
 * @param binding
 * @param name
 */
export function generateSamplerDeclaration(group: number, binding: number, name: string): string {
  return /* wgsl */ `@group(${group}) @binding(${binding}) var ${name}: sampler;`
}
