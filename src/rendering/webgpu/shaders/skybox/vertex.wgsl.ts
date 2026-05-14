/**
 * Skybox vertex shader for WGSL
 * Port of vertex portion from compose.ts
 */
import { generateVertexOutputStruct } from './core/varyings.wgsl'
import type { SkyboxEffects } from './types'

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
`

/**
 * Generate the complete vertex shader
 * @param effects
 */
export function composeSkyboxVertexShader(effects: SkyboxEffects): string {
  const outputAssignments = [
    'output.position = clipPos;',
    '// Force to background: reverse-Z far plane = 0',
    'output.position.z = 0.0;',
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
  let posLocal = vec4<f32>(input.position, 1.0);
  let worldPos = (vertexUniforms.modelMatrix * posLocal).xyz;

  // Parenthesize so the compiler lowers this as two mat4×vec4 (32 fmas)
  // instead of one mat4×mat4 + mat4×vec4 (80 fmas) per vertex.
  let clipPos = vertexUniforms.projectionMatrix * (vertexUniforms.modelViewMatrix * posLocal);

  ${outputAssignments.join('\n  ')}

  return output;
}
`
}
