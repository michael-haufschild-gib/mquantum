/**
 * Ground Plane Shader Composition (WGSL)
 * Port of: src/rendering/shaders/groundplane/compose.ts
 *
 * Assembles fragment shader for ground plane surfaces.
 * Uses the same GGX PBR implementation as other custom shaders
 * to ensure visual consistency across the scene.
 */

import { constantsBlock } from '../shared/core/constants.wgsl'
import { uniformsBlock } from '../shared/core/uniforms.wgsl'
import { generateObjectBindGroup, generateTextureBindings } from '../shared/compose-helpers'
import { ggxBlock } from '../shared/lighting/ggx.wgsl'
import { iblBlock, iblUniformsBlock, pmremSamplingBlock } from '../shared/lighting/ibl.wgsl'
import { multiLightBlock } from '../shared/lighting/multi-light.wgsl'

import { gridFunctionsBlock, gridUniformsBlock } from './grid.wgsl'
import { fragmentOutputStruct, fragmentUniformsBlock, generateMainBlock } from './main.wgsl'
import { vertexBlock, vertexOutputStruct } from './vertex.wgsl'

/**
 * Configuration for ground plane shader compilation
 */
export interface GroundPlaneShaderConfig {
  /**
   * Enable shadow map sampling (default: false).
   *
   * NOTE: Shadow maps are not wired for the WebGPU ground plane yet.
   * This flag is reserved for future use.
   */
  shadows?: boolean

  /**
   * Enable image-based lighting / environment reflections (default: false).
   */
  ibl?: boolean
}

/**
 * Compose ground plane fragment shader with conditional features.
 *
 * Bind group layout:
 *   Group 0: Vertex uniforms (dynamic offset)
 *   Group 1: Material (binding 0) + Grid (binding 1)
 *   Group 2: Lighting
 *   Group 3: IBL (uniform + env map texture + sampler) — conditional
 *
 * @param config - Configuration for conditional compilation
 * @returns Object with wgsl string, modules, and features
 */
export function composeGroundPlaneFragmentShader(config: GroundPlaneShaderConfig = {}): {
  wgsl: string
  modules: string[]
  features: string[]
} {
  const { shadows: enableShadows = false, ibl: enableIBL = false } = config

  const defines: string[] = []
  const features: string[] = ['PBR Lighting', 'Multi-Light', 'Grid']
  if (enableShadows) {
    features.push('Shadow Maps')
  }
  if (enableIBL) {
    features.push('IBL')
  }

  const blocks: Array<{ name: string; content: string; condition?: boolean }> = [
    { name: 'Defines', content: defines.join('\n') },
    { name: 'Vertex Output', content: vertexOutputStruct },
    { name: 'Fragment Output', content: fragmentOutputStruct },
    { name: 'Constants', content: constantsBlock },
    { name: 'Shared Uniforms', content: uniformsBlock },
    { name: 'Ground Plane Uniforms', content: fragmentUniformsBlock },
    { name: 'GGX PBR', content: ggxBlock },
    { name: 'Multi-Light System', content: multiLightBlock },
    { name: 'Grid Uniforms', content: gridUniformsBlock },
    { name: 'Grid Functions', content: gridFunctionsBlock },
    // IBL blocks (conditional on enableIBL)
    {
      name: 'IBL Textures',
      content:
        iblUniformsBlock +
        '\n' +
        generateObjectBindGroup(3, 'IBLUniforms', 'iblUniforms', 0) +
        '\n' +
        generateTextureBindings(3, [{ name: 'envMap' }], 1),
      condition: enableIBL,
    },
    { name: 'PMREM Sampling', content: pmremSamplingBlock, condition: enableIBL },
    { name: 'IBL Functions', content: iblBlock, condition: enableIBL },
    // Main block (must come last)
    { name: 'Main', content: generateMainBlock(enableShadows, enableIBL) },
  ]

  const modules: string[] = []
  const wgslParts: string[] = []

  blocks.forEach((b) => {
    if ('condition' in b && b.condition === false) return
    modules.push(b.name)
    wgslParts.push(b.content)
  })

  return { wgsl: wgslParts.join('\n'), modules, features }
}

/**
 * Compose ground plane vertex shader.
 *
 * @returns Vertex shader WGSL string
 */
export function composeGroundPlaneVertexShader(): string {
  return vertexBlock
}
