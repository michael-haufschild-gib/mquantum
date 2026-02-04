/**
 * Skybox vertex shader for WGSL
 * Port of vertex portion from compose.ts
 */
import { SkyboxEffects } from './types'

/**
 * Vertex input struct
 */
export const vertexInputStruct = `
// --- Vertex Input ---
struct VertexInput {
  @location(0) position: vec3<f32>,
}
`

/**
 * Vertex shader uniforms
 */
export const vertexUniformsBlock = `
// --- Vertex Uniforms ---
struct VertexUniforms {
  modelMatrix: mat4x4<f32>,
  modelViewMatrix: mat4x4<f32>,
  projectionMatrix: mat4x4<f32>,
  rotationMatrix: mat3x3<f32>,
}

@group(0) @binding(1) var<uniform> vertexUniforms: VertexUniforms;

// Aliases for compatibility
fn getModelMatrix() -> mat4x4<f32> { return vertexUniforms.modelMatrix; }
fn getModelViewMatrix() -> mat4x4<f32> { return vertexUniforms.modelViewMatrix; }
fn getProjectionMatrix() -> mat4x4<f32> { return vertexUniforms.projectionMatrix; }
fn getRotationMatrix() -> mat3x3<f32> { return vertexUniforms.rotationMatrix; }
`

/**
 * Generate vertex output struct based on enabled effects
 * @param effects
 */
export function generateVertexOutputStruct(effects: SkyboxEffects): string {
  const fields = [
    '@builtin(position) position: vec4<f32>,',
    '@location(0) worldDirection: vec3<f32>,',
  ]

  if (effects.vignette) {
    fields.push('@location(1) screenUV: vec2<f32>,')
  }

  return `
// --- Vertex Output ---
struct VertexOutput {
  ${fields.join('\n  ')}
}
`
}

/**
 * Generate the complete vertex shader
 * @param effects
 */
export function composeSkyboxVertexShader(effects: SkyboxEffects): string {
  const outputAssignments = [
    'output.position = clipPos;',
    '// Force to background (z = w)',
    'output.position.z = output.position.w;',
    '',
    'output.worldDirection = vertexUniforms.rotationMatrix * normalize(worldPos);',
  ]

  if (effects.vignette) {
    outputAssignments.push('')
    outputAssignments.push('// Screen UV for post effects')
    outputAssignments.push('output.screenUV = clipPos.xy / clipPos.w * 0.5 + 0.5;')
  }

  return `
/**
 * Skybox Vertex Shader (WGSL)
 *
 * Handles skybox sphere rendering with rotation support.
 */

${vertexInputStruct}

${generateVertexOutputStruct(effects)}

${vertexUniformsBlock}

@vertex
fn main(input: VertexInput) -> VertexOutput {
  var output: VertexOutput;

  // Standard Skybox Rotation
  let worldPos4 = vertexUniforms.modelMatrix * vec4<f32>(input.position, 1.0);
  let worldPos = worldPos4.xyz;

  let clipPos = vertexUniforms.projectionMatrix * vertexUniforms.modelViewMatrix * vec4<f32>(input.position, 1.0);

  ${outputAssignments.join('\n  ')}

  return output;
}
`
}
