/**
 * Skybox shader composition for WGSL
 * Port of: src/rendering/shaders/skybox/compose.ts
 */
import { cosinePaletteBlock } from '../shared/color/cosine-palette.wgsl'

import { constantsBlock } from './core/constants.wgsl'
import { uniformStructBlock, uniformBindingsBlock } from './core/uniforms.wgsl'
import { generateVertexOutputStruct, fragmentOutputStruct, fragmentOutputStructSingle } from './core/varyings.wgsl'

import { colorBlock } from './utils/color.wgsl'
import { noiseBlock } from './utils/noise.wgsl'
import { rotationBlock } from './utils/rotation.wgsl'

import { auroraBlock } from './modes/aurora.wgsl'
import { classicBlock } from './modes/classic.wgsl'
import { crystallineBlock } from './modes/crystalline.wgsl'
import { horizonBlock } from './modes/horizon.wgsl'
import { nebulaBlock } from './modes/nebula.wgsl'
import { oceanBlock } from './modes/ocean.wgsl'
import { twilightBlock } from './modes/twilight.wgsl'

import { sunBlock } from './effects/sun.wgsl'
import { vignetteBlock } from './effects/vignette.wgsl'

import { generateMain } from './main.wgsl'
import { composeSkyboxVertexShader } from './vertex.wgsl'
import { SkyboxShaderConfig } from './types'

/**
 * Compose Skybox fragment shader with specified mode and effects.
 * @param config - Skybox shader configuration options
 * @returns Composed WGSL shader source code and metadata
 */
export function composeSkyboxFragmentShader(config: SkyboxShaderConfig): {
  wgsl: string
  modules: string[]
  features: string[]
} {
  const { mode, effects, overrides = [], mrt = true } = config

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
  // Aurora, Nebula, Crystalline, Horizon, Ocean, Twilight use noise/fbm/hash
  // Classic doesn't use noise utils
  const needsNoise = mode !== 'classic'

  // Generate varyings dynamically based on which effects are enabled
  const varyingsBlock = generateVertexOutputStruct({ sun: useSun, vignette: useVignette })

  const blocks = [
    { name: 'Constants', content: constantsBlock },
    { name: 'Uniform Struct', content: uniformStructBlock },
    { name: 'Uniform Bindings', content: uniformBindingsBlock },
    { name: 'Varyings', content: varyingsBlock },
    { name: 'Fragment Output', content: mrt ? fragmentOutputStruct : fragmentOutputStructSingle },
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
      }, { mrt }),
    },
  ]

  const modules: string[] = []
  const wgslParts: string[] = []

  blocks.forEach((b) => {
    if (b.condition === false) return

    modules.push(b.name)

    if (overrides.includes(b.name)) {
      // Overridden - skip
    } else {
      wgslParts.push(b.content)
    }
  })

  return { wgsl: wgslParts.join('\n'), modules, features }
}

export { composeSkyboxVertexShader }
