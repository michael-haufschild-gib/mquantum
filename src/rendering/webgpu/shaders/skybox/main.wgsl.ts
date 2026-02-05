/**
 * Skybox main entry point for WGSL
 * Port of: src/rendering/shaders/skybox/main.glsl.ts
 */
import { SkyboxEffects, SkyboxMode } from './types'

/**
 * Generate the main fragment function for the skybox shader
 * @param mode - The skybox mode (classic, aurora, etc.)
 * @param effects - Which post-processing effects are enabled
 * @returns WGSL main function code
 */
export function generateMain(mode: SkyboxMode, effects: SkyboxEffects, options?: { mrt?: boolean }): string {
  const useMRT = options?.mrt !== false
  let modeCall = ''
  switch (mode) {
    case 'classic':
      modeCall = 'color = getClassic(dir, time);'
      break
    case 'aurora':
      modeCall = 'color = getAurora(dir, time) * uniforms.intensity;'
      break
    case 'nebula':
      modeCall = 'color = getNebula(dir, time) * uniforms.intensity;'
      break
    case 'crystalline':
      modeCall = 'color = getCrystalline(dir, time) * uniforms.intensity;'
      break
    case 'horizon':
      modeCall = 'color = getHorizonGradient(dir, time) * uniforms.intensity;'
      break
    case 'ocean':
      modeCall = 'color = getDeepOcean(dir, time) * uniforms.intensity;'
      break
    case 'twilight':
      modeCall = 'color = getTwilight(dir, time) * uniforms.intensity;'
      break
  }

  const effectCalls: string[] = []
  if (effects.sun) effectCalls.push('color = applySun(color, dir);')
  if (effects.vignette) effectCalls.push('color = applyVignette(color, input.screenUV);')

  const outputBlock = useMRT
    ? `  // Output to MRT - write to all 3 locations
  var output: FragmentOutput;
  output.color = vec4<f32>(color, 1.0);
  output.normal = vec4<f32>(0.5, 0.5, 1.0, 0.0);  // Neutral skybox normal (facing camera)
  output.worldPosition = vec4<f32>(0.0);  // Skybox has no world position
  return output;`
    : `  // Single color output
  var output: FragmentOutput;
  output.color = vec4<f32>(color, 1.0);
  return output;`

  return `
// --- Main Fragment Entry Point ---
@fragment
fn main(input: VertexOutput) -> FragmentOutput {
  var dir = normalize(input.worldDirection);
  let time = uniforms.time * uniforms.timeScale;

  // 1. Distortion (Heatwave/Turbulence global)
  if (uniforms.distortion > 0.0) {
    let dNoise = sin(dir.y * 20.0 + time * 5.0) * 0.01 * uniforms.distortion;
    dir.x += dNoise;
    dir.z += dNoise;
    dir = normalize(dir);
  }

  var color = vec3<f32>(0.0);

  // 2. Mode Execution
  ${modeCall}

  // 3. Post-Process Effects
  ${effectCalls.join('\n  ')}

${outputBlock}
}
`
}

/**
 * Generate the vertex shader main function
 * @param effects - Which effects are enabled (determines which varyings are needed)
 * @param effects.vignette
 * @returns WGSL vertex shader main function
 */
export function generateVertexMain(effects: { vignette: boolean }): string {
  const outputAssignments = [
    'output.position = clipPos;',
    '// Force to background (z = w)',
    'output.position.z = output.position.w;',
    '',
    'output.worldDirection = rotationMatrix * normalize(worldPos);',
  ]

  if (effects.vignette) {
    outputAssignments.push('')
    outputAssignments.push('// Screen UV for post effects')
    outputAssignments.push('output.screenUV = clipPos.xy / clipPos.w * 0.5 + 0.5;')
  }

  return `
// --- Main Vertex Entry Point ---
@vertex
fn main(input: VertexInput) -> VertexOutput {
  var output: VertexOutput;

  // Standard Skybox Rotation
  let worldPos4 = modelMatrix * vec4<f32>(input.position, 1.0);
  let worldPos = worldPos4.xyz;

  let clipPos = projectionMatrix * modelViewMatrix * vec4<f32>(input.position, 1.0);

  ${outputAssignments.join('\n  ')}

  return output;
}
`
}
