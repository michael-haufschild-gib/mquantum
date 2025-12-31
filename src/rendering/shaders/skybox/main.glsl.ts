import { SkyboxEffects, SkyboxMode } from './types'

/**
 * Generate the main() function for the skybox shader
 * @param mode - The skybox mode (classic, aurora, etc.)
 * @param effects - Which post-processing effects are enabled
 * @returns GLSL main function code
 */
export function generateMain(mode: SkyboxMode, effects: SkyboxEffects): string {
  let modeCall = ''
  switch (mode) {
    case 'classic':
      modeCall = 'color = getClassic(dir, time);'
      break
    case 'aurora':
      modeCall = 'color = getAurora(dir, time) * uIntensity;'
      break
    case 'nebula':
      modeCall = 'color = getNebula(dir, time) * uIntensity;'
      break
    case 'crystalline':
      modeCall = 'color = getCrystalline(dir, time) * uIntensity;'
      break
    case 'horizon':
      modeCall = 'color = getHorizonGradient(dir, time) * uIntensity;'
      break
    case 'ocean':
      modeCall = 'color = getDeepOcean(dir, time) * uIntensity;'
      break
    case 'twilight':
      modeCall = 'color = getTwilight(dir, time) * uIntensity;'
      break
  }

  const effectCalls = []
  if (effects.atmosphere) effectCalls.push('color = applyHorizon(color, dir);')
  if (effects.sun) effectCalls.push('color = applySun(color, dir);')
  if (effects.vignette) effectCalls.push('color = applyVignette(color, vScreenUV);')
  if (effects.grain) effectCalls.push('color = applyGrain(color, vScreenUV, uTime);')
  if (effects.aberration && mode !== 'classic')
    effectCalls.push('color = applyAberration(color, vScreenUV);')

  return `
void main() {
    vec3 dir = normalize(vWorldDirection);
    float time = uTime * uTimeScale;

    // 1. Distortion (Heatwave/Turbulence global)
    if (uDistortion > 0.0) {
        float dNoise = sin(dir.y * 20.0 + time * 5.0) * 0.01 * uDistortion;
        dir.x += dNoise;
        dir.z += dNoise;
        dir = normalize(dir);
    }

    vec3 color = vec3(0.0);

    // 2. Mode Execution
    ${modeCall}

    // 3. Post-Process Delight Features
    ${effectCalls.join('\n    ')}

    // Output to MRT - must write to all 3 locations for compatibility
    // Extra outputs are safely ignored when rendering to single-attachment targets
    gColor = vec4(color, 1.0);
    gNormal = vec4(0.5, 0.5, 1.0, 0.0);  // Neutral skybox normal (facing camera)
    gPosition = vec4(0.0);  // Skybox has no world position
}
`
}
