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
import { ggxBlock } from '../shared/lighting/ggx.wgsl'
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
}

/**
 * Compose ground plane fragment shader with conditional features.
 *
 * @param config - Configuration for conditional compilation
 * @returns Object with wgsl string, modules, and features
 */
export function composeGroundPlaneFragmentShader(config: GroundPlaneShaderConfig = {}): {
  wgsl: string
  modules: string[]
  features: string[]
} {
  const { shadows: enableShadows = false } = config

  const defines: string[] = []
  const features: string[] = ['PBR Lighting', 'Multi-Light', 'Grid']
  if (enableShadows) {
    features.push('Shadow Maps')
  }

  const blocks = [
    { name: 'Defines', content: defines.join('\n') },
    {
      name: 'Vertex Output',
      content: vertexOutputStruct,
    },
    { name: 'Fragment Output', content: fragmentOutputStruct },
    { name: 'Constants', content: constantsBlock },
    { name: 'Shared Uniforms', content: uniformsBlock },
    { name: 'Ground Plane Uniforms', content: fragmentUniformsBlock },
    { name: 'GGX PBR', content: ggxBlock },
    { name: 'Multi-Light System', content: multiLightBlock },
    { name: 'Grid Uniforms', content: gridUniformsBlock },
    { name: 'Grid Functions', content: gridFunctionsBlock },
    { name: 'Main', content: generateMainBlock(enableShadows) },
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
