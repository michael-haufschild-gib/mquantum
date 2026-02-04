/**
 * Skybox varyings for WGSL
 * Port of: src/rendering/shaders/skybox/core/varyings.glsl.ts
 *
 * In WGSL, varyings are passed through struct outputs from vertex shader
 * and struct inputs to fragment shader.
 */
import { SkyboxEffects } from '../types'

/**
 * Vertex output / Fragment input struct
 * Only includes fields that are actually used to avoid warnings
 * @param effects
 */
export function generateVertexOutputStruct(effects: SkyboxEffects): string {
  const fields = [
    '@builtin(position) position: vec4<f32>,',
    '@location(0) worldDirection: vec3<f32>,', // Always needed for direction-based rendering
  ]

  // vScreenUV only needed for vignette effect
  if (effects.vignette) {
    fields.push('@location(1) screenUV: vec2<f32>,')
  }

  return `
// --- Vertex Output / Fragment Input ---
struct VertexOutput {
  ${fields.join('\n  ')}
}
`
}

/**
 * Fragment output struct
 * In WebGPU we need to declare outputs explicitly
 */
export const fragmentOutputStruct = `
// --- Fragment Output ---
struct FragmentOutput {
  @location(0) color: vec4<f32>,
  @location(1) normal: vec4<f32>,
  @location(2) worldPosition: vec4<f32>,
}
`
