/**
 * WGSL Shader Composition Helpers
 *
 * Utilities for assembling modular WGSL shader blocks into complete shaders.
 * Port of GLSL compose-helpers to WGSL.
 *
 * @module rendering/webgpu/shaders/shared/compose-helpers
 */

/**
 * Shader block definition.
 */
export interface ShaderBlock {
  /** Name for debugging */
  name: string
  /** WGSL source code */
  content: string
  /** Optional condition to include this block */
  condition?: boolean
}

/**
 * Shader configuration options.
 */
export interface WGSLShaderConfig {
  /** Dimension (3-11) */
  dimension: number
  /** Enable soft shadows */
  shadows?: boolean
  /** Enable temporal reprojection */
  temporal?: boolean
  /** Enable ambient occlusion */
  ambientOcclusion?: boolean
  /** Enable subsurface scattering */
  sss?: boolean
  /** Enable IBL */
  ibl?: boolean
  /** Shadow quality (0-3) */
  shadowQuality?: number
  /** AO quality (0-2) */
  aoQuality?: number
  /** Custom overrides for shader blocks */
  overrides?: Array<{ target: string; replacement: string }>
}

/**
 * Feature flags derived from config.
 */
export interface FeatureFlags {
  defines: string[]
  features: {
    shadows: boolean
    temporal: boolean
    ao: boolean
    sss: boolean
    ibl: boolean
  }
}

/**
 * Process configuration into feature flags.
 */
export function processFeatureFlags(config: WGSLShaderConfig): FeatureFlags {
  const {
    dimension,
    shadows = false,
    temporal = false,
    ambientOcclusion = false,
    sss = false,
    ibl = true,
    shadowQuality = 1,
    aoQuality = 1,
  } = config

  const defines: string[] = [
    `const DIMENSION: i32 = ${dimension};`,
    `const SHADOW_ENABLED: bool = ${shadows};`,
    `const SHADOW_QUALITY: i32 = ${shadowQuality};`,
    `const TEMPORAL_ENABLED: bool = ${temporal};`,
    `const AO_ENABLED: bool = ${ambientOcclusion};`,
    `const AO_QUALITY: i32 = ${aoQuality};`,
    `const SSS_ENABLED: bool = ${sss};`,
    `const IBL_ENABLED: bool = ${ibl};`,
  ]

  return {
    defines,
    features: {
      shadows,
      temporal,
      ao: ambientOcclusion,
      sss,
      ibl,
    },
  }
}

/**
 * Assemble shader blocks into complete WGSL source.
 */
export function assembleShaderBlocks(
  blocks: ShaderBlock[],
  overrides: Array<{ target: string; replacement: string }> = []
): { wgsl: string; modules: string[] } {
  const modules: string[] = []
  const parts: string[] = []

  // Header
  parts.push('// Auto-generated WGSL shader')
  parts.push('// Generated at: ' + new Date().toISOString())
  parts.push('')

  for (const block of blocks) {
    // Skip if condition is explicitly false
    if (block.condition === false) {
      continue
    }

    modules.push(block.name)

    // Check for override
    const override = overrides.find((o) => o.target === block.name)
    const content = override ? override.replacement : block.content

    parts.push(`// ====== ${block.name} ======`)
    parts.push(content)
    parts.push('')
  }

  return { wgsl: parts.join('\n'), modules }
}

/**
 * Standard vertex inputs for fullscreen quad shaders.
 */
export const fullscreenVertexInputsBlock = /* wgsl */ `
// Vertex inputs
struct VertexInput {
  @location(0) position: vec2f,
  @location(1) uv: vec2f,
}

// Vertex output / Fragment input
struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) vUv: vec2f,
}

@vertex
fn vertexMain(input: VertexInput) -> VertexOutput {
  var output: VertexOutput;
  output.position = vec4f(input.position, 0.0, 1.0);
  output.vUv = input.uv;
  return output;
}
`

/**
 * Standard vertex inputs for raymarching shaders (rendered on a cube/sphere).
 */
export const raymarchVertexInputsBlock = /* wgsl */ `
// Vertex inputs
struct VertexInput {
  @location(0) position: vec3f,
  @location(1) normal: vec3f,
  @location(2) uv: vec2f,
}

// Vertex output / Fragment input
struct VertexOutput {
  @builtin(position) clipPosition: vec4f,
  @location(0) vPosition: vec3f,      // World position
  @location(1) vNormal: vec3f,        // World normal (for bounding volume)
  @location(2) vUv: vec2f,
  @location(3) vRayOrigin: vec3f,     // Ray origin (camera position)
  @location(4) vRayDir: vec3f,        // Ray direction
}
`

/**
 * Standard fragment output for MRT (Multiple Render Targets).
 */
export const mrtOutputBlock = /* wgsl */ `
// MRT output structure
struct FragmentOutput {
  @location(0) color: vec4f,      // Color buffer (RGB = color, A = alpha)
  @location(1) normal: vec4f,     // Normal buffer (RGB = normal, A = metallic)
}
`

/**
 * Standard fragment output for single target.
 */
export const singleOutputBlock = /* wgsl */ `
// Single output
struct FragmentOutput {
  @location(0) color: vec4f,
}
`

/**
 * Generate bind group declarations for standard uniforms.
 */
export function generateStandardBindGroups(): string {
  return /* wgsl */ `
// Group 0: Camera and frame uniforms
@group(0) @binding(0) var<uniform> camera: CameraUniforms;

// Group 1: Lighting uniforms
@group(1) @binding(0) var<uniform> lighting: LightingUniforms;

// Group 2: Material uniforms
@group(2) @binding(0) var<uniform> material: MaterialUniforms;

// Group 3: Quality uniforms
@group(3) @binding(0) var<uniform> quality: QualityUniforms;
`
}

/**
 * Generate bind group for object-specific uniforms.
 */
export function generateObjectBindGroup(
  group: number,
  uniformType: string,
  uniformName: string
): string {
  return /* wgsl */ `
@group(${group}) @binding(0) var<uniform> ${uniformName}: ${uniformType};
`
}

/**
 * Generate texture and sampler bindings.
 */
export function generateTextureBindings(
  group: number,
  textures: Array<{ name: string; type?: string }>
): string {
  const lines: string[] = []
  let binding = 0

  for (const tex of textures) {
    const texType = tex.type ?? 'texture_2d<f32>'
    lines.push(`@group(${group}) @binding(${binding}) var ${tex.name}: ${texType};`)
    binding++
    lines.push(`@group(${group}) @binding(${binding}) var ${tex.name}Sampler: sampler;`)
    binding++
  }

  return lines.join('\n')
}
