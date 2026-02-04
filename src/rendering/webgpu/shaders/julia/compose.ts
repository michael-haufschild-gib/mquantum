/**
 * Julia WGSL Shader Composer
 *
 * Assembles complete Julia fragment shader from modular blocks.
 * Port of GLSL compose.ts to WGSL.
 *
 * Supports two SDF evaluation modes:
 * 1. Direct evaluation (default): Per-pixel SDF computation
 * 2. Grid sampling (useComputeGrid): Sample from pre-computed 3D texture
 *
 * Grid sampling provides 5-10x performance improvement by replacing expensive
 * per-pixel fractal iteration with cheap texture lookups.
 *
 * @module rendering/webgpu/shaders/julia/compose
 */

import {
  assembleShaderBlocks,
  generateConsolidatedBindGroups,
  generateObjectBindGroup,
  generateTextureBindings,
  mrtOutputBlock,
  processFeatureFlags,
  raymarchVertexInputsBlock,
  type WGSLShaderConfig,
} from '../shared/compose-helpers'

// SDF Grid sampling blocks (for compute-accelerated mode)
import {
  generateSDFGridBindings,
  sdfGridConstantsBlock,
  sdfGridSamplingBlock,
  sdfGridDispatchBlock,
} from '../shared/sdfGridSampling.wgsl'

// Core blocks
import { constantsBlock } from '../shared/core/constants.wgsl'
import { uniformsBlock } from '../shared/core/uniforms.wgsl'

// Color blocks
import { cosinePaletteBlock } from '../shared/color/cosine-palette.wgsl'
import { hslBlock } from '../shared/color/hsl.wgsl'
import { oklabBlock } from '../shared/color/oklab.wgsl'
import { selectorBlock } from '../shared/color/selector.wgsl'

// Lighting blocks
import { ggxBlock } from '../shared/lighting/ggx.wgsl'
import { iblBlock, iblUniformsBlock, pmremSamplingBlock } from '../shared/lighting/ibl.wgsl'
import { multiLightBlock } from '../shared/lighting/multi-light.wgsl'
import { sssBlock } from '../shared/lighting/sss.wgsl'

// Raymarching blocks
import { raymarchCoreBlock } from '../shared/raymarch/core.wgsl'
import { normalBlock } from '../shared/raymarch/normal.wgsl'
import { sphereIntersectBlock } from '../shared/raymarch/sphere-intersect.wgsl'

// Feature blocks
import { aoBlock } from '../shared/features/ao.wgsl'
import { shadowsBlock } from '../shared/features/shadows.wgsl'
import { temporalBlock } from '../shared/features/temporal.wgsl'

// Julia-specific blocks
import { juliaUniformsBlock } from './uniforms.wgsl'
import { juliaPowerBlock } from './power.wgsl'
import { quaternionBlock } from './quaternion.wgsl'
import { sdf3dBlock } from './sdf3d.wgsl'
import { sdf4dBlock } from './sdf4d.wgsl'
import { sdf5dBlock } from './sdf5d.wgsl'
import { sdf6dBlock } from './sdf6d.wgsl'
import { sdf7dBlock } from './sdf7d.wgsl'
import { sdf8dBlock } from './sdf8d.wgsl'
import { sdf9dBlock } from './sdf9d.wgsl'
import { sdf10dBlock } from './sdf10d.wgsl'
import { sdf11dBlock } from './sdf11d.wgsl'
import { generateMainBlock } from './main.wgsl'

/**
 * SDF blocks by dimension.
 */
const sdfBlocks: Record<number, { block: string; name: string }> = {
  3: { block: sdf3dBlock, name: 'SDF Julia 3D' },
  4: { block: sdf4dBlock, name: 'SDF Julia 4D' },
  5: { block: sdf5dBlock, name: 'SDF Julia 5D' },
  6: { block: sdf6dBlock, name: 'SDF Julia 6D' },
  7: { block: sdf7dBlock, name: 'SDF Julia 7D' },
  8: { block: sdf8dBlock, name: 'SDF Julia 8D' },
  9: { block: sdf9dBlock, name: 'SDF Julia 9D' },
  10: { block: sdf10dBlock, name: 'SDF Julia 10D' },
  11: { block: sdf11dBlock, name: 'SDF Julia 11D' },
}

/**
 * Extended shader config for Julia with compute grid support.
 */
export interface JuliaShaderConfig extends WGSLShaderConfig {
  /**
   * Enable compute-accelerated SDF grid sampling.
   * When true, the shader samples from a pre-computed 3D texture
   * instead of evaluating the SDF per-pixel.
   *
   * This provides 5-10x performance improvement but requires:
   * 1. JuliaSDFGridPass to be initialized
   * 2. SDF texture/sampler bound to Group 2, bindings 2-3
   */
  useComputeGrid?: boolean
}

/**
 * Generate the SDF dispatch function for the given dimension.
 *
 * CRITICAL: Raymarching now happens in MODEL SPACE (matching WebGL).
 * The fragment shader transforms ray origin and direction to model space
 * via inverseModelMatrix BEFORE raymarching. This means:
 * - Position p is already in model space (canonical fractal coordinates)
 * - No additional scale transformation is needed here
 * - The SDF returns distances in model space
 * @param dimension
 */
function generateDispatch(dimension: number): string {
  // Generate dispatch for dimensions 3-11
  if (dimension >= 3 && dimension <= 11) {
    return /* wgsl */ `
// SDF Dispatch (Julia ${dimension}D) - position p is in MODEL SPACE
fn GetDist(p: vec3f) -> f32 {
  return sdfJulia${dimension}D_simple(
    p,
    julia.effectivePower,
    julia.effectiveBailout,
    i32(julia.iterations)
  );
}

fn GetDistWithOrbital(p: vec3f) -> vec2f {
  return sdfJulia${dimension}D(
    p,
    julia.effectivePower,
    julia.effectiveBailout,
    i32(julia.iterations)
  );
}
`
  }

  // Default fallback (shouldn't reach here)
  return /* wgsl */ `
// SDF Dispatch (Julia - fallback to 4D) - position p is in MODEL SPACE
fn GetDist(p: vec3f) -> f32 {
  return sdfJulia4D_simple(
    p,
    julia.effectivePower,
    julia.effectiveBailout,
    i32(julia.iterations)
  );
}

fn GetDistWithOrbital(p: vec3f) -> vec2f {
  return sdfJulia4D(
    p,
    julia.effectivePower,
    julia.effectiveBailout,
    i32(julia.iterations)
  );
}
`
}

/**
 * Compose complete Julia fragment shader.
 *
 * @param config Shader configuration including optional compute grid mode
 */
export function composeJuliaShader(config: JuliaShaderConfig): {
  wgsl: string
  modules: string[]
  features: ReturnType<typeof processFeatureFlags>['features']
} {
  const {
    dimension,
    shadows: enableShadows,
    temporal: enableTemporal,
    ambientOcclusion: enableAO,
    sss: enableSss,
    ibl: enableIBL = true,
    useComputeGrid = false,
    overrides = [],
  } = config

  // Process feature flags
  const flags = processFeatureFlags(config)

  // Add compute grid define if enabled
  if (useComputeGrid) {
    flags.defines.push('const USE_COMPUTE_GRID: bool = true;')
  } else {
    flags.defines.push('const USE_COMPUTE_GRID: bool = false;')
  }

  // Select SDF block based on dimension
  const sdfInfo = sdfBlocks[dimension] ?? {
    block: sdf4dBlock,
    name: 'SDF Julia 4D (fallback)',
  }

  // Build blocks array
  const blocks = [
    // Vertex inputs and outputs
    { name: 'Vertex Inputs', content: raymarchVertexInputsBlock },
    { name: 'MRT Output', content: mrtOutputBlock },

    // Feature defines
    { name: 'Defines', content: flags.defines.join('\n') },

    // Core
    { name: 'Constants', content: constantsBlock },
    { name: 'Shared Uniforms', content: uniformsBlock },

    // SDF Grid constants (needed for grid bounds even if not using grid)
    { name: 'SDF Grid Constants', content: sdfGridConstantsBlock, condition: useComputeGrid },

    // Bind groups - using consolidated layout to stay within 4-group limit
    // Group 0: Camera
    // Group 1: Lighting + Material + Quality
    // Group 2: Object (Julia + Basis + optional SDF Grid texture)
    // Group 3: IBL (if enabled)
    { name: 'Standard Bind Groups', content: generateConsolidatedBindGroups() },
    {
      name: 'Julia Uniforms',
      content:
        juliaUniformsBlock +
        '\n' +
        generateObjectBindGroup(2, 'JuliaUniforms', 'julia', 0) +
        '\n' +
        generateObjectBindGroup(2, 'BasisVectors', 'basis', 1),
    },

    // SDF Grid texture bindings - Group 2, bindings 2-3 (after julia+basis)
    {
      name: 'SDF Grid Bindings',
      content: generateSDFGridBindings(2), // Start at binding 2
      condition: useComputeGrid,
    },

    // IBL textures - Group 3: @binding(0)=uniforms, @binding(1)=texture, @binding(2)=sampler
    {
      name: 'IBL Textures',
      content:
        iblUniformsBlock +
        '\n' +
        generateObjectBindGroup(3, 'IBLUniforms', 'iblUniforms', 0) +
        '\n' +
        generateTextureBindings(3, [{ name: 'envMap' }], 1), // Start at binding 1
      condition: enableIBL,
    },

    // Utility functions (needed for both direct and grid modes for normal calculation)
    { name: 'Power Helpers', content: juliaPowerBlock, condition: !useComputeGrid },
    { name: 'Quaternion Math', content: quaternionBlock, condition: !useComputeGrid },

    // Color
    { name: 'Color (HSL)', content: hslBlock },
    { name: 'Color (Cosine)', content: cosinePaletteBlock },
    { name: 'Color (Oklab)', content: oklabBlock },
    { name: 'Color Selector', content: selectorBlock },

    // Lighting
    { name: 'Lighting (GGX)', content: ggxBlock },
    { name: 'PMREM Sampling', content: pmremSamplingBlock, condition: enableIBL },
    { name: 'IBL Functions', content: iblBlock, condition: enableIBL },
    { name: 'Multi-Light System', content: multiLightBlock },
    { name: 'Lighting (SSS)', content: sssBlock, condition: enableSss },

    // SDF - choose between direct evaluation or grid sampling
    // When using compute grid: include grid sampling utilities and grid dispatch
    // When not using compute grid: include direct SDF evaluation
    { name: sdfInfo.name, content: sdfInfo.block, condition: !useComputeGrid },
    { name: 'SDF Dispatch (Direct)', content: generateDispatch(dimension), condition: !useComputeGrid },

    // Grid sampling mode
    { name: 'SDF Grid Sampling', content: sdfGridSamplingBlock, condition: useComputeGrid },
    { name: 'SDF Dispatch (Grid)', content: sdfGridDispatchBlock, condition: useComputeGrid },

    // Raymarching
    { name: 'Sphere Intersection', content: sphereIntersectBlock },
    { name: 'Raymarching Core', content: raymarchCoreBlock },
    { name: 'Normal Calculation', content: normalBlock },

    // Features - only include when enabled (JIT composition)
    { name: 'Temporal Reprojection', content: temporalBlock, condition: enableTemporal },
    { name: 'Ambient Occlusion', content: aoBlock, condition: enableAO },
    { name: 'Shadows', content: shadowsBlock, condition: enableShadows },

    // Main shader - dynamically generated with only enabled features
    {
      name: 'Main',
      content: generateMainBlock({
        shadows: enableShadows,
        ao: enableAO,
        sss: enableSss,
        ibl: enableIBL,
      }),
    },
  ]

  // Assemble
  const { wgsl, modules } = assembleShaderBlocks(
    blocks,
    overrides.map((o) => ({ target: o.target, replacement: o.replacement }))
  )

  return { wgsl, modules, features: flags.features }
}

/**
 * Create vertex shader for Julia rendering.
 */
export function composeJuliaVertexShader(): string {
  return /* wgsl */ `
// Julia Vertex Shader
// Transforms vertices and computes ray direction for fragment shader

struct CameraUniforms {
  viewMatrix: mat4x4f,
  projectionMatrix: mat4x4f,
  viewProjectionMatrix: mat4x4f,
  inverseViewMatrix: mat4x4f,
  inverseProjectionMatrix: mat4x4f,
  modelMatrix: mat4x4f,          // LOCAL → WORLD transform
  inverseModelMatrix: mat4x4f,   // WORLD → LOCAL transform
  cameraPosition: vec3f,
  cameraNear: f32,
  cameraFar: f32,
  fov: f32,
  resolution: vec2f,
  aspectRatio: f32,
  time: f32,
  deltaTime: f32,
  frameNumber: u32,
}

@group(0) @binding(0) var<uniform> camera: CameraUniforms;

struct VertexInput {
  @location(0) position: vec3f,
  @location(1) normal: vec3f,
  @location(2) uv: vec2f,
}

struct VertexOutput {
  @builtin(position) clipPosition: vec4f,
  @location(0) vPosition: vec3f,
  @location(1) vNormal: vec3f,
  @location(2) vUv: vec2f,
  @location(3) vRayOrigin: vec3f,
  @location(4) vRayDir: vec3f,
}

@vertex
fn main(input: VertexInput) -> VertexOutput {
  var output: VertexOutput;

  // Transform local vertex position to WORLD space using modelMatrix
  // This matches WebGL: worldPosition = modelMatrix * vec4(position, 1.0)
  let worldPos = (camera.modelMatrix * vec4f(input.position, 1.0)).xyz;

  // Clip position in world space
  output.clipPosition = camera.viewProjectionMatrix * vec4f(worldPos, 1.0);

  // Pass world position to fragment shader (matching WebGL vPosition)
  output.vPosition = worldPos;
  output.vNormal = (camera.modelMatrix * vec4f(input.normal, 0.0)).xyz;
  output.vUv = input.uv;

  // Ray origin is camera position in WORLD space
  output.vRayOrigin = camera.cameraPosition;

  // Ray direction in WORLD space (from camera to world vertex)
  // This matches WebGL: worldRayDir = normalize(vPosition - uCameraPosition)
  output.vRayDir = normalize(worldPos - camera.cameraPosition);

  return output;
}
`
}
