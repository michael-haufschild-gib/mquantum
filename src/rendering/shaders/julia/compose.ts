import { cosinePaletteBlock } from '../shared/color/cosine-palette.glsl'
import { hslBlock } from '../shared/color/hsl.glsl'
import { oklabBlock } from '../shared/color/oklab.glsl'
import { selectorBlock } from '../shared/color/selector.glsl'
import { constantsBlock } from '../shared/core/constants.glsl'
import { precisionBlock } from '../shared/core/precision.glsl'
import { uniformsBlock } from '../shared/core/uniforms.glsl'
import { aoBlock } from '../shared/features/ao.glsl'
import { shadowsBlock } from '../shared/features/shadows.glsl'
import { temporalBlock } from '../shared/features/temporal.glsl'
import {
  assembleShaderBlocks,
  fractalVertexInputsBlock,
  processFeatureFlags,
} from '../shared/fractal/compose-helpers'
import { ggxBlock } from '../shared/lighting/ggx.glsl'
import { iblBlock, iblUniformsBlock, pmremSamplingBlock } from '../shared/lighting/ibl.glsl'
import { multiLightBlock } from '../shared/lighting/multi-light.glsl'
import { sssBlock } from '../shared/lighting/sss.glsl'
import { raymarchCoreBlock } from '../shared/raymarch/core.glsl'
import { normalBlock } from '../shared/raymarch/normal.glsl'
import { sphereIntersectBlock } from '../shared/raymarch/sphere-intersect.glsl'

import { ShaderConfig } from '../shared/types'
import { generateDispatch } from './dispatch.glsl'
import { mainBlock } from './main.glsl'
import { juliaPowerBlock } from './power.glsl'
import { quaternionBlock } from './quaternion.glsl'
import { sdf3dBlock } from './sdf/sdf3d.glsl'
import { sdf4dBlock } from './sdf/sdf4d.glsl'
import { sdf5dBlock } from './sdf/sdf5d.glsl'
import { sdf6dBlock } from './sdf/sdf6d.glsl'
import { sdf7dBlock } from './sdf/sdf7d.glsl'
import { sdf8dBlock } from './sdf/sdf8d.glsl'
import { sdf9dBlock } from './sdf/sdf9d.glsl'
import { sdf10dBlock } from './sdf/sdf10d.glsl'
import { sdf11dBlock } from './sdf/sdf11d.glsl'
import { juliaUniformsBlock } from './uniforms.glsl'

/**
 * Map dimension to SDF block.
 * Each dimension has an optimized, fully unrolled SDF implementation.
 */
const sdfBlocksByDimension: Record<number, string> = {
  3: sdf3dBlock,
  4: sdf4dBlock,
  5: sdf5dBlock,
  6: sdf6dBlock,
  7: sdf7dBlock,
  8: sdf8dBlock,
  9: sdf9dBlock,
  10: sdf10dBlock,
  11: sdf11dBlock,
}

/**
 * Compose Julia fragment shader with all features.
 * Uses compile-time dimension dispatch for optimal performance.
 *
 * @param config - Shader configuration options
 * @returns Composed shader source code with dimension-specific SDF
 */
export function composeJuliaShader(config: ShaderConfig) {
  const {
    dimension = 4,
    shadows: enableShadows,
    temporal: enableTemporal,
    ambientOcclusion: enableAO,
    sss: enableSss,
    overrides = [],
  } = config

  // Clamp dimension to valid range
  const dim = Math.max(3, Math.min(11, dimension))

  // Process feature flags using shared helper
  const flags = processFeatureFlags(config)

  // Generate compile-time dimension-specific dispatch
  const dispatchCode = generateDispatch(dim)

  // Get the optimized SDF for this dimension
  const sdfBlock = sdfBlocksByDimension[dim] || sdf4dBlock

  const blocks = [
    { name: 'Precision', content: precisionBlock },
    { name: 'Vertex Inputs', content: fractalVertexInputsBlock },
    { name: 'Defines', content: flags.defines.join('\n') },
    { name: 'Constants', content: constantsBlock },
    { name: 'Shared Uniforms', content: uniformsBlock },
    { name: 'Julia Uniforms', content: juliaUniformsBlock },
    { name: 'Power Helpers', content: juliaPowerBlock },
    { name: 'Quaternion Math', content: quaternionBlock },
    { name: 'Color (HSL)', content: hslBlock },
    { name: 'Color (Cosine)', content: cosinePaletteBlock },
    { name: 'Color (Oklab)', content: oklabBlock },
    { name: 'Color Selector', content: selectorBlock },
    { name: 'Lighting (GGX)', content: ggxBlock },
    { name: 'IBL Uniforms', content: iblUniformsBlock },
    { name: 'PMREM Sampling', content: pmremSamplingBlock },
    { name: 'IBL Functions', content: iblBlock },
    { name: 'Lighting (SSS)', content: sssBlock, condition: enableSss },
    // Include only the SDF for this dimension (compile-time selection)
    { name: `SDF Julia ${dim}D`, content: sdfBlock },
    { name: 'Dispatch', content: dispatchCode },
    { name: 'Temporal Features', content: temporalBlock, condition: enableTemporal },
    { name: 'Sphere Intersection', content: sphereIntersectBlock },
    { name: 'Raymarching Core', content: raymarchCoreBlock },
    { name: 'Normal Calculation', content: normalBlock },
    { name: 'Ambient Occlusion', content: aoBlock, condition: enableAO },
    { name: 'Shadows', content: shadowsBlock, condition: enableShadows },
    { name: 'Multi-Light System', content: multiLightBlock },
    { name: 'Main', content: mainBlock },
  ]

  const { glsl, modules } = assembleShaderBlocks(blocks, overrides)

  return { glsl, modules, features: flags.features }
}
