import { cosinePaletteBlock } from '../shared/color/cosine-palette.glsl'

import { constantsBlock } from './core/constants.glsl'
import { skyboxPrecisionBlock } from './core/precision.glsl'
import { uniformsBlock } from './core/uniforms.glsl'
import { generateVaryingsBlock } from './core/varyings.glsl'

import { colorBlock } from './utils/color.glsl'
import { noiseBlock } from './utils/noise.glsl'
import { rotationBlock } from './utils/rotation.glsl'

import { auroraBlock } from './modes/aurora.glsl'
import { classicBlock } from './modes/classic.glsl'
import { crystallineBlock } from './modes/crystalline.glsl'
import { horizonBlock } from './modes/horizon.glsl'
import { nebulaBlock } from './modes/nebula.glsl'
import { oceanBlock } from './modes/ocean.glsl'
import { twilightBlock } from './modes/twilight.glsl'

import { sunBlock } from './effects/sun.glsl'
import { vignetteBlock } from './effects/vignette.glsl'

import { generateMain } from './main.glsl'
import { SkyboxShaderConfig } from './types'

/**
 * Compose Skybox fragment shader with specified mode and effects.
 * @param config - Skybox shader configuration options
 * @returns Composed shader source code
 */
export function composeSkyboxFragmentShader(config: SkyboxShaderConfig) {
  const { mode, effects, overrides = [] } = config

  const features = [`Mode: ${mode}`]

  // Apply overrides to effects
  const useSun = effects.sun && !overrides.includes('Sun Glow')
  const useVignette = effects.vignette && !overrides.includes('Vignette')

  if (useSun) features.push('Sun Glow')
  if (useVignette) features.push('Vignette')

  // Select Mode Block
  let modeBlock = classicBlock
  switch (mode) {
    case 'aurora':
      modeBlock = auroraBlock
      break
    case 'nebula':
      modeBlock = nebulaBlock
      break
    case 'crystalline':
      modeBlock = crystallineBlock
      break
    case 'horizon':
      modeBlock = horizonBlock
      break
    case 'ocean':
      modeBlock = oceanBlock
      break
    case 'twilight':
      modeBlock = twilightBlock
      break
  }

  // Check if noise utils are needed
  // Aurora, Nebula, Void, Crystalline, Twilight, Starfield use noise/fbm/hash
  // Horizon uses noise. Ocean uses noise.
  // Classic doesn't use noise utils?
  // Let's check classicBlock.
  // It uses textureLod. No noise calls.
  // So noiseBlock can be conditional.
  const needsNoise = mode !== 'classic'

  // Generate varyings dynamically based on which effects are enabled
  // This avoids Firefox warning "Output of vertex shader not read by fragment shader"
  const varyingsBlock = generateVaryingsBlock({ sun: useSun, vignette: useVignette })

  const blocks = [
    { name: 'Precision', content: skyboxPrecisionBlock },
    { name: 'Varyings', content: varyingsBlock },
    { name: 'Constants', content: constantsBlock },
    { name: 'Uniforms', content: uniformsBlock },
    { name: 'Color Utils', content: colorBlock },
    { name: 'Cosine Palette', content: cosinePaletteBlock },
    { name: 'Rotation Utils', content: rotationBlock },
    { name: 'Noise Utils', content: noiseBlock, condition: needsNoise },
    { name: `Mode: ${mode}`, content: modeBlock },
    { name: 'Sun Effect', content: sunBlock, condition: useSun },
    { name: 'Vignette Effect', content: vignetteBlock, condition: useVignette },
    {
      name: 'Main',
      content: generateMain(mode, {
        sun: useSun,
        vignette: useVignette,
      }),
    },
  ]

  const modules: string[] = []
  const glslParts: string[] = []

  blocks.forEach((b) => {
    if (b.condition === false) return

    modules.push(b.name)

    if (overrides.includes(b.name)) {
      // Overridden
    } else {
      glslParts.push(b.content)
    }
  })

  return { glsl: glslParts.join('\n'), modules, features }
}

/**
 * Compose skybox vertex shader with rotation support.
 *
 * Only outputs varyings that are actually used by the fragment shader to avoid
 * Firefox warning: "Output of vertex shader not read by fragment shader"
 *
 * @param effects - Which effects are enabled (determines which varyings are needed)
 * @returns GLSL vertex shader code string for skybox rendering
 */
export function composeSkyboxVertexShader(effects: { vignette: boolean }) {
  // Build varyings list based on enabled effects
  const varyings = ['out vec3 vWorldDirection;'] // Always needed
  if (effects.vignette) {
    varyings.push('out vec2 vScreenUV;')
  }
  // Note: vWorldPosition removed - was never used in fragment shader

  // Build main body
  const mainBody = [
    '// Standard Skybox Rotation',
    'vec4 worldPos4 = modelMatrix * vec4(position, 1.0);',
    'vec3 worldPos = worldPos4.xyz;',
    '',
    'vWorldDirection = uRotation * normalize(worldPos);',
    '',
    'vec4 clipPos = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
    'gl_Position = clipPos;',
    '',
    '// Force to background (z = w)',
    'gl_Position.z = gl_Position.w;',
  ]

  // Only compute vScreenUV if vignette is enabled
  if (effects.vignette) {
    mainBody.push('')
    mainBody.push('// Screen UV for post effects')
    mainBody.push('vScreenUV = clipPos.xy / clipPos.w * 0.5 + 0.5;')
  }

  return `
/**
 * Skybox Vertex Shader
 *
 * Handles skybox cube rendering with rotation support.
 *
 * WebGL2 / GLSL ES 3.00
 */
precision highp float;

uniform mat3 uRotation;

${varyings.join('\n')}

void main() {
  ${mainBody.join('\n  ')}
}
`
}
