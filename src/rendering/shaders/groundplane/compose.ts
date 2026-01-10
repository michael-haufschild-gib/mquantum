/**
 * Ground Plane Shader Composition
 *
 * Assembles fragment shader for ground plane surfaces.
 * Uses the same GGX PBR implementation as other custom shaders
 * to ensure visual consistency across the scene.
 */

import { constantsBlock } from '../shared/core/constants.glsl'
import { precisionBlock } from '../shared/core/precision.glsl'
import { uniformsBlock } from '../shared/core/uniforms.glsl'
import {
  shadowMapsFunctionsBlock,
  shadowMapsUniformsBlock,
} from '../shared/features/shadowMaps.glsl'
import { ggxBlock } from '../shared/lighting/ggx.glsl'
import { iblBlock, iblUniformsBlock, pmremSamplingBlock } from '../shared/lighting/ibl.glsl'
import { multiLightBlock } from '../shared/lighting/multi-light.glsl'

import { gridFunctionsBlock, gridUniformsBlock } from './grid.glsl'
import { mainBlock } from './main.glsl'
import { vertexBlock } from './vertex.glsl'

/**
 * Configuration for ground plane shader compilation
 */
export interface GroundPlaneShaderConfig {
  /** Enable shadow map sampling (default: true) */
  shadows?: boolean
}

/**
 * Compose ground plane fragment shader with conditional features.
 *
 * @param config - Configuration for conditional compilation
 * @returns Object with glsl string, modules, and features
 */
export function composeGroundPlaneFragmentShader(config: GroundPlaneShaderConfig = {}): {
  glsl: string
  modules: string[]
  features: string[]
} {
  const { shadows: enableShadows = true } = config

  const defines: string[] = []
  const features: string[] = ['PBR Lighting', 'Multi-Light', 'IBL']

  if (enableShadows) {
    defines.push('#define USE_SHADOWS')
    features.push('Shadow Maps')
  }

  const blocks = [
    { name: 'Precision', content: precisionBlock },
    { name: 'Defines', content: defines.join('\n') },
    {
      name: 'Vertex Inputs',
      content: `
// Inputs from vertex shader
in vec3 vWorldPosition;
in vec3 vLocalPosition;  // Local position before transformation (for grid)
in vec3 vNormal;
in vec3 vViewDirection;
// Note: vUv removed - was never used in fragment shader

// Ground plane specific uniforms (others come from shared uniformsBlock)
// Note: uColor, uMetallic, uSpecularIntensity, uSpecularColor are in uniformsBlock
uniform float uOpacity;
uniform float uRoughness;
`,
    },
    { name: 'Constants', content: constantsBlock },
    { name: 'Shared Uniforms', content: uniformsBlock },
    { name: 'GGX PBR', content: ggxBlock },
    { name: 'Multi-Light System', content: multiLightBlock },
    { name: 'IBL Uniforms', content: iblUniformsBlock },
    { name: 'PMREM Sampling', content: pmremSamplingBlock },
    { name: 'IBL Functions', content: iblBlock },
    { name: 'Shadow Maps Uniforms', content: shadowMapsUniformsBlock, condition: enableShadows },
    { name: 'Shadow Maps Functions', content: shadowMapsFunctionsBlock, condition: enableShadows },
    { name: 'Grid Uniforms', content: gridUniformsBlock },
    { name: 'Grid Functions', content: gridFunctionsBlock },
    { name: 'Main', content: mainBlock },
  ]

  const modules: string[] = []
  const glslParts: string[] = []

  blocks.forEach((b) => {
    if ('condition' in b && b.condition === false) return
    modules.push(b.name)
    glslParts.push(b.content)
  })

  return { glsl: glslParts.join('\n'), modules, features }
}

/**
 * Compose ground plane vertex shader.
 *
 * @returns Vertex shader GLSL string
 */
export function composeGroundPlaneVertexShader(): string {
  return vertexBlock
}
