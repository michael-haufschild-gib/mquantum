import { SkyboxEffects } from '../types'

/**
 * Generate varyings block for skybox fragment shader.
 * Only declares varyings that are actually used to avoid Firefox warning:
 * "Output of vertex shader not read by fragment shader"
 *
 * @param effects - Which effects are enabled (determines which varyings are needed)
 * @returns GLSL varyings declarations
 */
export function generateVaryingsBlock(effects: SkyboxEffects): string {
  const varyings = ['in vec3 vWorldDirection;'] // Always needed for direction-based rendering

  // vScreenUV only needed for vignette effect
  if (effects.vignette) {
    varyings.push('in vec2 vScreenUV;')
  }

  // Note: vWorldPosition removed - was never used in fragment shader

  return `
// --- Varyings ---
${varyings.join('\n')}
`
}
