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
  /** Enable temporal reprojection */
  temporal?: boolean
  /** Enable nodal visualization modules */
  nodal?: boolean
  /** Enable uncertainty-boundary modules */
  uncertaintyBoundary?: boolean
  /** Compile-time color algorithm hint */
  colorAlgorithm?: number
  /** Custom overrides for shader blocks */
  overrides?: Array<{ target: string; replacement: string }>
}

/** Valid compile-time HO specialization term count. */
export type ShaderTermCount = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8

/** Density-grid storage texture formats supported by the shader composer. */
export type DensityGridStorageFormat = 'r16float' | 'rgba16float'

/** Bounds for compile-time integer shader dimensions. */
interface ShaderDimensionOptions {
  min?: number
  max?: number
  fallback?: number
}

/**
 * Convert runtime dimension input into a finite integer WGSL specialization value.
 * @param dimension - Runtime dimension candidate.
 * @param options - Dimension bounds and fallback.
 * @returns Integer dimension clamped to the configured range.
 */
export function sanitizeShaderDimension(
  dimension: number,
  options: ShaderDimensionOptions = {}
): number {
  const min = options.min ?? 2
  const max = options.max ?? 11
  const fallback = options.fallback ?? min
  const finiteDimension = Number.isFinite(dimension) ? dimension : fallback
  return Math.max(min, Math.min(max, Math.floor(finiteDimension)))
}

/**
 * Convert runtime HO term-count input into a valid unrolled specialization.
 * @param termCount - Runtime term-count candidate.
 * @returns Clamped term count, or undefined when specialization should be disabled.
 */
export function sanitizeShaderTermCount(termCount: unknown): ShaderTermCount | undefined {
  if (typeof termCount !== 'number' || !Number.isFinite(termCount)) return undefined
  const wholeTermCount = Math.floor(termCount)
  if (wholeTermCount < 1) return undefined
  return Math.min(wholeTermCount, 8) as ShaderTermCount
}

/**
 * Restrict density-grid storage format to composer-supported WGSL texture formats.
 * @param storageFormat - Runtime storage format candidate.
 * @param fallback - Safe format used when input is invalid.
 * @returns Supported storage texture format.
 */
export function sanitizeDensityGridStorageFormat(
  storageFormat: unknown,
  fallback: DensityGridStorageFormat = 'r16float'
): DensityGridStorageFormat {
  return storageFormat === 'r16float' || storageFormat === 'rgba16float' ? storageFormat : fallback
}

/**
 * Assemble shader blocks into complete WGSL source.
 * @param blocks
 * @param overrides
 */
export function assembleShaderBlocks(
  blocks: ShaderBlock[],
  overrides: Array<{ target: string; replacement: string }> = []
): { wgsl: string; modules: string[] } {
  const modules: string[] = []
  const parts: string[] = []

  // Header
  parts.push('// Auto-generated WGSL shader')
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
 * Standard fragment output for single target.
 */
export const singleOutputBlock = /* wgsl */ `
// Single output
struct FragmentOutput {
  @location(0) color: vec4f,
}
`

/**
 * Generate consolidated bind group declarations for standard uniforms.
 * Uses only 2 groups (0-1) to stay within 4-group limit.
 * Group 0: Camera
 * Group 1: Lighting + Material (combined)
 */
export function generateConsolidatedBindGroups(): string {
  return /* wgsl */ `
// Group 0: Camera and frame uniforms
@group(0) @binding(0) var<uniform> camera: CameraUniforms;

// Group 1: Combined rendering uniforms (Lighting + Material)
@group(1) @binding(0) var<uniform> lighting: LightingUniforms;
@group(1) @binding(1) var<uniform> material: MaterialUniforms;
`
}

/**
 * Generate bind group for object-specific uniforms.
 * @param group - The bind group index
 * @param uniformType - The WGSL struct type
 * @param uniformName - The variable name
 * @param binding - The binding index within the group (default: 0)
 */
export function generateObjectBindGroup(
  group: number,
  uniformType: string,
  uniformName: string,
  binding: number = 0
): string {
  return /* wgsl */ `
@group(${group}) @binding(${binding}) var<uniform> ${uniformName}: ${uniformType};
`
}

/**
 * Generate texture and sampler bindings.
 * @param group - The bind group index
 * @param textures - Array of texture definitions
 * @param startBinding - Starting binding index (default: 0)
 */
export function generateTextureBindings(
  group: number,
  textures: Array<{ name: string; type?: string }>,
  startBinding: number = 0
): string {
  const lines: string[] = []
  let binding = startBinding

  for (const tex of textures) {
    const texType = tex.type ?? 'texture_2d<f32>'
    lines.push(`@group(${group}) @binding(${binding}) var ${tex.name}: ${texType};`)
    binding++
    lines.push(`@group(${group}) @binding(${binding}) var ${tex.name}Sampler: sampler;`)
    binding++
  }

  return lines.join('\n')
}
