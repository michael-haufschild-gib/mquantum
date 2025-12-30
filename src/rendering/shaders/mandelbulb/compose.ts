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
import { powerBlock } from './power.glsl'
import { sdfHighDBlock } from './sdf/sdf-high-d.glsl'
import { sdf10dBlock } from './sdf/sdf10d.glsl'
import { sdf11dBlock } from './sdf/sdf11d.glsl'
import { sdf3dBlock } from './sdf/sdf3d.glsl'
import { sdf4dBlock } from './sdf/sdf4d.glsl'
import { sdf5dBlock } from './sdf/sdf5d.glsl'
import { sdf6dBlock } from './sdf/sdf6d.glsl'
import { sdf7dBlock } from './sdf/sdf7d.glsl'
import { sdf8dBlock } from './sdf/sdf8d.glsl'
import { sdf9dBlock } from './sdf/sdf9d.glsl'
import { mandelbulbUniformsBlock } from './uniforms.glsl'

/**
 * Compose Mandelbulb fragment shader with all features.
 * @param config - Shader configuration options
 * @returns Composed shader source code
 */
export function composeMandelbulbShader(config: ShaderConfig) {
  const {
    dimension,
    shadows: enableShadows,
    temporal: enableTemporal,
    ambientOcclusion: enableAO,
    sss: enableSss,
    overrides = [],
  } = config

  // Process feature flags using shared helper
  const flags = processFeatureFlags(config)

  // Select SDF block based on dimension
  let sdfBlock = sdfHighDBlock
  let sdfName = 'SDF High-D (Array)'

  if (dimension === 3) {
    sdfBlock = sdf3dBlock
    sdfName = 'SDF 3D'
  } else if (dimension === 4) {
    sdfBlock = sdf4dBlock
    sdfName = 'SDF 4D'
  } else if (dimension === 5) {
    sdfBlock = sdf5dBlock
    sdfName = 'SDF 5D'
  } else if (dimension === 6) {
    sdfBlock = sdf6dBlock
    sdfName = 'SDF 6D'
  } else if (dimension === 7) {
    sdfBlock = sdf7dBlock
    sdfName = 'SDF 7D'
  } else if (dimension === 8) {
    sdfBlock = sdf8dBlock
    sdfName = 'SDF 8D'
  } else if (dimension === 9) {
    sdfBlock = sdf9dBlock
    sdfName = 'SDF 9D (Unrolled)'
  } else if (dimension === 10) {
    sdfBlock = sdf10dBlock
    sdfName = 'SDF 10D (Unrolled)'
  } else if (dimension === 11) {
    sdfBlock = sdf11dBlock
    sdfName = 'SDF 11D (Unrolled)'
  }

  const blocks = [
    { name: 'Precision', content: precisionBlock },
    { name: 'Vertex Inputs', content: fractalVertexInputsBlock },
    { name: 'Defines', content: flags.defines.join('\n') },
    { name: 'Constants', content: constantsBlock },
    { name: 'Shared Uniforms', content: uniformsBlock },
    { name: 'Mandelbulb Uniforms', content: mandelbulbUniformsBlock },
    { name: 'Power Functions', content: powerBlock },
    { name: 'Color (HSL)', content: hslBlock },
    { name: 'Color (Cosine)', content: cosinePaletteBlock },
    { name: 'Color (Oklab)', content: oklabBlock },
    { name: 'Color Selector', content: selectorBlock },
    { name: 'Lighting (GGX)', content: ggxBlock },
    { name: 'IBL Uniforms', content: iblUniformsBlock },
    { name: 'PMREM Sampling', content: pmremSamplingBlock },
    { name: 'IBL Functions', content: iblBlock },
    { name: 'Lighting (SSS)', content: sssBlock, condition: enableSss },
    { name: sdfName, content: sdfBlock },
    { name: 'Dispatch', content: generateDispatch(dimension) },
    { name: 'Temporal Reprojection', content: temporalBlock, condition: enableTemporal },
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
