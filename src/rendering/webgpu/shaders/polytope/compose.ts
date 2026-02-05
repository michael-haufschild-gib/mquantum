/**
 * Polytope WGSL Shader Composer
 *
 * Assembles complete Polytope vertex and fragment shaders.
 * Port of GLSL compose.ts to WGSL.
 *
 * @module rendering/webgpu/shaders/polytope/compose
 */

import {
  assembleShaderBlocks,
  generateConsolidatedBindGroups,
  generateObjectBindGroup,
  generateTextureBindings,
  type WGSLShaderConfig,
} from '../shared/compose-helpers'

// Core blocks
import { constantsBlock } from '../shared/core/constants.wgsl'
import { uniformsBlock } from '../shared/core/uniforms.wgsl'

// Color blocks
import { cosinePaletteBlock } from '../shared/color/cosine-palette.wgsl'
import { hslBlock } from '../shared/color/hsl.wgsl'
import { selectorBlock } from '../shared/color/selector.wgsl'

// Lighting blocks
import { ggxBlock } from '../shared/lighting/ggx.wgsl'
import { iblBlock, iblUniformsBlock, pmremSamplingBlock } from '../shared/lighting/ibl.wgsl'
import { multiLightBlock } from '../shared/lighting/multi-light.wgsl'
import { sssBlock } from '../shared/lighting/sss.wgsl'

// Polytope-specific blocks
import { transformNDBlock } from './transform-nd.wgsl'

/**
 * Polytope shader configuration.
 */
export interface PolytopeWGSLShaderConfig extends WGSLShaderConfig {
  /** Render mode: 'face' or 'edge' */
  mode?: 'face' | 'edge'
  /** Use flat shading */
  flatShading?: boolean
  /**
   * Use geometry-based normals computed in vertex shader.
   * When true: Normals are computed from neighbor vertex data (requires 30 floats/vertex).
   * When false: Normals are computed in fragment shader using dFdx/dFdy (10 floats/vertex).
   * Matches WebGL SCREEN_SPACE_NORMAL_MIN_DIMENSION threshold (dimension < 5).
   */
  useGeometryNormals?: boolean
  /**
   * Use compute shader pre-pass for transforms and normals.
   * When true: Vertex shader reads pre-computed 3D positions and normals from storage buffers.
   * This provides ~2x performance improvement by eliminating per-vertex N-D transforms.
   * Requires PolytopeTransformComputePass and PolytopeNormalComputePass to be executed before rendering.
   */
  useComputeShaders?: boolean
}

/**
 * Polytope uniforms block.
 */
export const polytopeUniformsBlock = /* wgsl */ `
// ============================================
// Polytope Uniforms
// Matches WebGL ND_TRANSFORM_GLSL uniforms
// ============================================

struct PolytopeUniforms {
  // N-D Transformation (matches TubeWireframe layout)
  rotationMatrix4D: mat4x4f,
  dimension: i32,
  uniformScale: f32,
  projectionDistance: f32,
  depthNormFactor: f32,

  // Material
  baseColor: vec3f,
  opacity: f32,

  edgeColor: vec3f,
  edgeWidth: f32,

  // Shading
  roughness: f32,
  metalness: f32,
  ambientIntensity: f32,
  emissiveIntensity: f32,

  // Specular (artist controls; matches WebGL uSpecularColor, uSpecularIntensity)
  specularColor: vec3f,
  specularIntensity: f32,

  // Extra rotation columns (7 * 4 = 28 floats for 5D-11D)
  // Stored as 7 vec4s for alignment
  extraRotCol0: vec4f,
  extraRotCol1: vec4f,
  extraRotCol2: vec4f,
  extraRotCol3: vec4f,
  extraRotCol4: vec4f,
  extraRotCol5: vec4f,
  extraRotCol6: vec4f,

  // Depth row sums (11 floats for projection)
  depthRowSums0_3: vec4f,
  depthRowSums4_7: vec4f,
  depthRowSums8_10: vec3f,
  _padDepth: f32,

  // Color Algorithm System (matches WebGL palette uniforms)
  // colorAlgorithm: 0=mono, 1=analogous, 2=cosine, 3=normal, 4=distance, 5=lch, etc.
  colorAlgorithm: i32,
  distPower: f32,
  distCycles: f32,
  distOffset: f32,

  // Cosine palette coefficients (Inigo Quilez technique)
  // color = a + b * cos(2π * (c * t + d))
  cosineA: vec4f,  // xyz = RGB, w unused
  cosineB: vec4f,
  cosineC: vec4f,
  cosineD: vec4f,

  // LCH perceptual color space parameters
  lchLightness: f32,
  lchChroma: f32,
  _padEnd: vec2f,
}
`

/**
 * Compose face vertex shader.
 * Supports two normal computation modes:
 * - Geometry-based (useGeometryNormals=true): Normals computed from neighbor vertices in vertex shader.
 *   Requires 30 floats/vertex buffer layout (thisVertex + neighbor1 + neighbor2).
 * - Screen-space (useGeometryNormals=false): Normals computed in fragment shader via dFdx/dFdy.
 *   Uses 10 floats/vertex buffer layout.
 * @param config
 */
export function composeFaceVertexShader(config: PolytopeWGSLShaderConfig): string {
  const { useGeometryNormals = false } = config

  // Vertex input struct - extended for geometry-based normals
  const vertexInputStruct = useGeometryNormals
    ? /* wgsl */ `
struct VertexInput {
  @location(0) position: vec3f,
  @location(1) extraDims0_3: vec4f,  // Extra dimensions 4-7 (dim indices 3-6)
  @location(2) extraDims4_6: vec3f,  // Extra dimensions 8-10 (dim indices 7-9)
  // Neighbor 1 - for geometry-based normal computation
  @location(3) neighbor1Pos: vec3f,
  @location(4) neighbor1Extra0_3: vec4f,
  @location(5) neighbor1Extra4_6: vec3f,
  // Neighbor 2 - for geometry-based normal computation
  @location(6) neighbor2Pos: vec3f,
  @location(7) neighbor2Extra0_3: vec4f,
  @location(8) neighbor2Extra4_6: vec3f,
}`
    : /* wgsl */ `
struct VertexInput {
  @location(0) position: vec3f,
  @location(1) extraDims0_3: vec4f,  // Extra dimensions 4-7 (dim indices 3-6)
  @location(2) extraDims4_6: vec3f,  // Extra dimensions 8-10 (dim indices 7-9)
}`

  // Vertex output struct - includes normal for geometry-based mode
  const vertexOutputStruct = useGeometryNormals
    ? /* wgsl */ `
struct VertexOutput {
  @builtin(position) clipPosition: vec4f,
  @location(0) worldPosition: vec3f,
  @location(1) viewDir: vec3f,
  @location(2) @interpolate(flat) faceDepth: f32,  // Color algorithm input from extra dims
  @location(3) @interpolate(flat) normal: vec3f,   // Geometry-based normal from vertex shader
}`
    : /* wgsl */ `
struct VertexOutput {
  @builtin(position) clipPosition: vec4f,
  @location(0) worldPosition: vec3f,
  @location(1) viewDir: vec3f,
  @location(2) @interpolate(flat) faceDepth: f32,  // Color algorithm input from extra dims
}`

  // Normal computation code - only for geometry-based mode
  const normalComputation = useGeometryNormals
    ? /* wgsl */ `
  // Transform neighbor vertices for normal computation (matches WebGL geometry-based normals)
  let neighbor1_3d = transformND(
    input.neighbor1Pos,
    input.neighbor1Extra0_3,
    input.neighbor1Extra4_6,
    polytope.rotationMatrix4D,
    polytope.dimension,
    polytope.uniformScale,
    polytope.projectionDistance,
    polytope.depthNormFactor,
    extraRotCols,
    depthRowSums
  );

  let neighbor2_3d = transformND(
    input.neighbor2Pos,
    input.neighbor2Extra0_3,
    input.neighbor2Extra4_6,
    polytope.rotationMatrix4D,
    polytope.dimension,
    polytope.uniformScale,
    polytope.projectionDistance,
    polytope.depthNormFactor,
    extraRotCols,
    depthRowSums
  );

  // Compute face normal from the 3 triangle vertices after N-D transformation
  // Matches WebGL computeFaceNormal() in transform-nd.glsl.ts
  let edge1 = neighbor1_3d - pos3d;
  let edge2 = neighbor2_3d - pos3d;
  let faceNormal = cross(edge1, edge2);
  let normalLen = length(faceNormal);
  // Guard against degenerate triangles, then transform to world space
  // Matches WebGL: normalize(mat3(modelMatrix) * faceNormal)
  let localNormal = select(vec3f(0.0, 0.0, 1.0), faceNormal / normalLen, normalLen > 0.0001);
  output.normal = normalize((camera.modelMatrix * vec4f(localNormal, 0.0)).xyz);`
    : /* wgsl */ `
  // Normal computed in fragment shader using screen-space derivatives (dFdx/dFdy)`

  return /* wgsl */ `
// Polytope Face Vertex Shader
// Port of WebGL ND_TRANSFORM_GLSL
// Normal mode: ${useGeometryNormals ? 'geometry-based (vertex shader)' : 'screen-space (fragment shader)'}

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

${polytopeUniformsBlock}

@group(0) @binding(0) var<uniform> camera: CameraUniforms;
@group(2) @binding(0) var<uniform> polytope: PolytopeUniforms;

${vertexInputStruct}

${vertexOutputStruct}

${transformNDBlock}

@vertex
fn main(input: VertexInput) -> VertexOutput {
  var output: VertexOutput;

  // Build extra rotation columns array from uniforms
  var extraRotCols: array<vec4f, 7>;
  extraRotCols[0] = polytope.extraRotCol0;
  extraRotCols[1] = polytope.extraRotCol1;
  extraRotCols[2] = polytope.extraRotCol2;
  extraRotCols[3] = polytope.extraRotCol3;
  extraRotCols[4] = polytope.extraRotCol4;
  extraRotCols[5] = polytope.extraRotCol5;
  extraRotCols[6] = polytope.extraRotCol6;

  // Build depth row sums array from uniforms
  var depthRowSums: array<f32, 11>;
  depthRowSums[0] = polytope.depthRowSums0_3.x;
  depthRowSums[1] = polytope.depthRowSums0_3.y;
  depthRowSums[2] = polytope.depthRowSums0_3.z;
  depthRowSums[3] = polytope.depthRowSums0_3.w;
  depthRowSums[4] = polytope.depthRowSums4_7.x;
  depthRowSums[5] = polytope.depthRowSums4_7.y;
  depthRowSums[6] = polytope.depthRowSums4_7.z;
  depthRowSums[7] = polytope.depthRowSums4_7.w;
  depthRowSums[8] = polytope.depthRowSums8_10.x;
  depthRowSums[9] = polytope.depthRowSums8_10.y;
  depthRowSums[10] = polytope.depthRowSums8_10.z;

  // Compute face depth from extra dimensions (matches WebGL vFaceDepth)
  // Sum of extra dimensions, mapped to 0-1 range
  let extraSum = input.extraDims0_3.x + input.extraDims0_3.y + input.extraDims0_3.z + input.extraDims0_3.w
               + input.extraDims4_6.x + input.extraDims4_6.y + input.extraDims4_6.z;
  output.faceDepth = clamp(extraSum * 0.15 + 0.5, 0.0, 1.0);

  // Transform from N-D to 3D using rotation + perspective projection
  let pos3d = transformND(
    input.position,
    input.extraDims0_3,
    input.extraDims4_6,
    polytope.rotationMatrix4D,
    polytope.dimension,
    polytope.uniformScale,
    polytope.projectionDistance,
    polytope.depthNormFactor,
    extraRotCols,
    depthRowSums
  );

  // Transform to world space (matches WebGL: modelMatrix * vec4(v0_projected, 1.0))
  let worldPos = (camera.modelMatrix * vec4f(pos3d, 1.0)).xyz;
  output.worldPosition = worldPos;

  // Clip position (proj * view * worldPos)
  output.clipPosition = camera.viewProjectionMatrix * vec4f(worldPos, 1.0);

  // View direction
  output.viewDir = normalize(camera.cameraPosition - worldPos);
${normalComputation}

  return output;
}
`
}

/**
 * Compose face fragment shader.
 * @param config
 */
export function composeFaceFragmentShader(config: PolytopeWGSLShaderConfig): {
  wgsl: string
  modules: string[]
  features: string[]
} {
  // IBL defaults to false - requires env map texture to be wired up in renderer
  // Shadows default to false - requires shadow map textures to be wired up in renderer
  const { dimension, ibl: enableIBL = false, shadows: enableShadows = false, useGeometryNormals = false } = config

  const defines: string[] = []
  const features: string[] = []

  defines.push(`const DIMENSION: i32 = ${dimension};`)
  defines.push(`const IBL_ENABLED: bool = ${enableIBL};`)
  defines.push(`const SHADOW_ENABLED: bool = ${enableShadows};`)
  defines.push(`const USE_GEOMETRY_NORMALS: bool = ${useGeometryNormals};`)
  features.push('Polytope Faces')
  features.push('PBR Lighting')
  if (enableIBL) {
    features.push('IBL')
  }
  if (enableShadows) {
    features.push('Shadow Maps')
  }
  if (useGeometryNormals) {
    features.push('Geometry Normals')
  } else {
    features.push('Screen-Space Normals')
  }

  // Fragment input struct - extended for geometry-based normals
  const fragmentInputStruct = useGeometryNormals
    ? /* wgsl */ `
struct FragmentInput {
  @builtin(position) position: vec4f,
  @location(0) worldPosition: vec3f,
  @location(1) viewDir: vec3f,
  @builtin(front_facing) frontFacing: bool,
  @location(2) @interpolate(flat) faceDepth: f32,  // Color algorithm input from extra dims
  @location(3) @interpolate(flat) normal: vec3f,   // Geometry-based normal from vertex shader
}
`
    : /* wgsl */ `
struct FragmentInput {
  @builtin(position) position: vec4f,
  @location(0) worldPosition: vec3f,
  @location(1) viewDir: vec3f,
  @builtin(front_facing) frontFacing: bool,
  @location(2) @interpolate(flat) faceDepth: f32,  // Color algorithm input from extra dims
}
`

  const blocks = [
    { name: 'Defines', content: defines.join('\n') },
    { name: 'Constants', content: constantsBlock },
    { name: 'Shared Uniforms', content: uniformsBlock },
    // Bind groups - using consolidated layout to stay within 4-group limit
    // Group 0: Camera
    // Group 1: Lighting + Material + Quality
    // Group 2: Polytope
    // Group 3: IBL (if enabled)
    { name: 'Standard Bind Groups', content: generateConsolidatedBindGroups() },
    {
      name: 'Polytope Uniforms',
      content:
        polytopeUniformsBlock +
        '\n' +
        generateObjectBindGroup(2, 'PolytopeUniforms', 'polytope'),
    },
    // IBL textures - Group 3: @binding(0)=uniforms, @binding(1)=texture, @binding(2)=sampler
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
    { name: 'Color (HSL)', content: hslBlock },
    { name: 'Color (Cosine)', content: cosinePaletteBlock },
    { name: 'Color Selector', content: selectorBlock },
    { name: 'GGX PBR', content: ggxBlock },
    { name: 'PMREM Sampling', content: pmremSamplingBlock, condition: enableIBL },
    { name: 'IBL Functions', content: iblBlock, condition: enableIBL },
    { name: 'Multi-Light', content: multiLightBlock },
    { name: 'SSS', content: sssBlock },
    {
      name: 'Fragment Input',
      content: fragmentInputStruct,
    },
    {
      name: 'Color Algorithm',
      content: /* wgsl */ `
// Apply distribution curve to input value (matches WebGL applyDistribution)
fn applyDistribution(t: f32, power: f32, cycles: f32, offset: f32) -> f32 {
  let clamped = clamp(t, 0.0, 1.0);
  let curved = pow(clamped, power);
  let cycled = fract(curved * cycles + offset);
  return cycled;
}

// Cosine palette (Inigo Quilez technique)
fn cosinePaletteColor(t: f32, a: vec3f, b: vec3f, c: vec3f, d: vec3f) -> vec3f {
  return a + b * cos(TAU * (c * t + d));
}

// Get color based on algorithm selection (matches WebGL getColorByAlgorithm)
fn getAlgorithmColor(t: f32, baseColor: vec3f, normal: vec3f, worldPos: vec3f) -> vec3f {
  let algorithm = polytope.colorAlgorithm;

  // Apply distribution curve
  let dt = applyDistribution(t, polytope.distPower, polytope.distCycles, polytope.distOffset);

  switch (algorithm) {
    // 0 = monochromatic: vary lightness only
    case 0: {
      let baseHSL = rgb2hsl(baseColor);
      return hsl2rgb(baseHSL.x, 0.6, 0.3 + dt * 0.5);
    }
    // 1 = analogous: vary hue ±30°
    case 1: {
      let baseHSL = rgb2hsl(baseColor);
      let hue = fract(baseHSL.x + (dt - 0.5) * 0.167);
      return hsl2rgb(hue, 0.7, 0.5);
    }
    // 2 = cosine gradient
    case 2: {
      return cosinePaletteColor(
        dt,
        polytope.cosineA.xyz,
        polytope.cosineB.xyz,
        polytope.cosineC.xyz,
        polytope.cosineD.xyz
      );
    }
    // 3 = normal-based (using cosine palette)
    case 3: {
      let normalT = normal.y * 0.5 + 0.5;
      return cosinePaletteColor(
        normalT,
        polytope.cosineA.xyz,
        polytope.cosineB.xyz,
        polytope.cosineC.xyz,
        polytope.cosineD.xyz
      );
    }
    // 4 = distance (radial from center)
    case 4: {
      return cosinePaletteColor(
        dt,
        polytope.cosineA.xyz,
        polytope.cosineB.xyz,
        polytope.cosineC.xyz,
        polytope.cosineD.xyz
      );
    }
    // 5 = LCH perceptual (simplified)
    case 5: {
      let L = polytope.lchLightness;
      let C = polytope.lchChroma;
      let h = dt;
      // Approximate LCH to RGB via HSL
      return hsl2rgb(h, C * 2.0, L);
    }
    // 6 = multi-source: weighted blend of depth, orbitTrap, normal
    case 6: {
      let orbitTrap = length(worldPos) * 0.5;
      let normalContrib = normal.y * 0.5 + 0.5;
      let blended = dt * 0.5 + orbitTrap * 0.3 + normalContrib * 0.2;
      return cosinePaletteColor(
        blended,
        polytope.cosineA.xyz,
        polytope.cosineB.xyz,
        polytope.cosineC.xyz,
        polytope.cosineD.xyz
      );
    }
    // 7 = radial
    case 7: {
      let radialT = length(worldPos.xz) / 2.0;
      return cosinePaletteColor(
        radialT,
        polytope.cosineA.xyz,
        polytope.cosineB.xyz,
        polytope.cosineC.xyz,
        polytope.cosineD.xyz
      );
    }
    // 8 = phase (angular)
    case 8: {
      let angle = atan2(worldPos.z, worldPos.x) / TAU + 0.5;
      return cosinePaletteColor(
        angle,
        polytope.cosineA.xyz,
        polytope.cosineB.xyz,
        polytope.cosineC.xyz,
        polytope.cosineD.xyz
      );
    }
    // 9 = mixed (phase + distance)
    case 9: {
      let angle = atan2(worldPos.z, worldPos.x) / TAU + 0.5;
      let mixed = angle * 0.6 + dt * 0.4;
      return cosinePaletteColor(
        mixed,
        polytope.cosineA.xyz,
        polytope.cosineB.xyz,
        polytope.cosineC.xyz,
        polytope.cosineD.xyz
      );
    }
    // 10 = blackbody (heat)
    case 10: {
      // Approximate blackbody: black -> red -> orange -> white
      let r = clamp(dt * 3.0, 0.0, 1.0);
      let g = clamp(dt * 3.0 - 1.0, 0.0, 1.0);
      let b = clamp(dt * 3.0 - 2.0, 0.0, 1.0);
      return vec3f(r, g, b);
    }
    // 13 = dimension (N-D axis coloring)
    case 13: {
      let axisColor = abs(normal);
      return mix(baseColor, axisColor, 0.5 + dt * 0.5);
    }
    // Default: use base color
    default: {
      return baseColor;
    }
  }
}
`,
    },
    {
      name: 'Main',
      content: generatePolytopeMainBlock({ ibl: enableIBL, shadows: enableShadows, useGeometryNormals }),
    },
  ]

  const { wgsl, modules } = assembleShaderBlocks(blocks, [])

  return { wgsl, modules, features }
}

/**
 * Generate polytope main block with conditional IBL and normal mode.
 * This is the WGSL equivalent of GLSL's #ifdef - we exclude the code entirely.
 * @param config
 * @param config.ibl
 * @param config.shadows
 * @param config.useGeometryNormals
 */
function generatePolytopeMainBlock(config: {
  ibl?: boolean
  shadows?: boolean
  useGeometryNormals?: boolean
}): string {
  const { ibl = false, shadows = false, useGeometryNormals = false } = config

  // IBL section - only include if enabled
  const iblSection = ibl
    ? `
  // ===== IBL (Image-Based Lighting) =====
  if (IBL_ENABLED && iblUniforms.iblQuality > 0) {
    finalColor += computeIBL(
      faceNormal, V, F0,
      roughness, metallic, algorithmColor,
      envMap, envMapSampler,
      iblUniforms
    );
  }
`
    : ''

  // Shadow section - compute per-light shadow factors
  // When shadow maps are wired in the renderer, replace the all-1.0 factors with real shadow sampling
  const shadowSection = shadows
    ? `
  // ===== SHADOW FACTORS =====
  // Per-light shadow factors (1.0 = fully lit, 0.0 = fully shadowed)
  // TODO: Wire shadow map textures and compute real shadow factors
  var shadowFactors: array<f32, 8>;
  for (var si = 0; si < 8; si++) {
    shadowFactors[si] = 1.0;
  }
`
    : ''

  // Shadow-aware vs standard lighting call
  const shadowCall = shadows
    ? `computeMultiLightingShadowed(
    input.worldPosition,
    faceNormal,
    V,
    algorithmColor,
    roughness,
    metallic,
    F0,
    polytope.specularColor,
    polytope.specularIntensity,
    true,
    lighting,
    shadowFactors
  )`
    : `computeMultiLighting(
    input.worldPosition,
    faceNormal,
    V,
    algorithmColor,
    roughness,
    metallic,
    F0,
    polytope.specularColor,
    polytope.specularIntensity,
    true,
    lighting
  )`

  // Normal computation - either from vertex shader (geometry) or fragment derivatives (screen-space)
  const normalComputation = useGeometryNormals
    ? /* wgsl */ `
  // Use geometry-based normal from vertex shader (matches WebGL geometry-based normals for dim < 5)
  var N = normalize(input.normal);`
    : /* wgsl */ `
  // Compute screen-space normal using derivatives (matches WebGL dFdx/dFdy approach for dim >= 5)
  let dPdx = dpdx(input.worldPosition);
  let dPdy = dpdy(input.worldPosition);
  var N = normalize(cross(dPdx, dPdy));`

  return /* wgsl */ `
@fragment
fn fragmentMain(input: FragmentInput) -> @location(0) vec4f {
${normalComputation}

  // Two-sided lighting: flip normal to face viewer for back faces (matches WebGL gl_FrontFacing)
  let faceNormal = select(-N, N, input.frontFacing);
  let V = normalize(input.viewDir);

  // Clamp roughness (prevent division issues with very smooth surfaces)
  let roughness = max(polytope.roughness, 0.04);
  let metallic = polytope.metalness;

  // Get base color from algorithm using faceDepth (matches WebGL)
  let algorithmColor = getAlgorithmColor(input.faceDepth, polytope.baseColor, N, input.worldPosition);

  // Compute F0 (base reflectivity) - metals use albedo, dielectrics use 0.04
  let F0 = computeF0(algorithmColor, metallic, 0.04);

${shadowSection}
  // ===== MULTI-LIGHT PBR LIGHTING =====
  var finalColor = ${shadowCall};
${iblSection}
  // ===== SUBSURFACE SCATTERING =====
  // Matches WebGL: per-light SSS contribution, gated behind sssEnabled
  // WebGL params: distortion=0.5, power=sssThickness*4.0, thickness=0.0, jitter=sssJitter
  if (material.sssEnabled != 0u && material.sssIntensity > 0.0) {
    let sssParams = vec4f(0.5, material.sssThickness * 4.0, 0.0, material.sssJitter);
    let sssResult = computeMultiLightSSS(
      input.worldPosition, V, faceNormal, sssParams, input.position.xy, lighting
    );
    finalColor += sssResult * material.sssColor * material.sssIntensity;
  }

  // ===== FRESNEL RIM LIGHTING =====
  // Matches WebGL: gated behind fresnelEnabled, uses rimColor, modulated by totalNdotL
  if (material.fresnelEnabled != 0u && material.fresnelIntensity > 0.0) {
    let NdotV = max(dot(faceNormal, V), 0.0);
    let totalNdotL = computeTotalNdotL(input.worldPosition, faceNormal, true, lighting);
    let t = 1.0 - NdotV;
    let rim = t * t * t * material.fresnelIntensity * 2.0;
    let rimModulated = rim * (0.3 + 0.7 * totalNdotL);
    finalColor += material.rimColor * rimModulated;
  }

  return vec4f(finalColor, polytope.opacity);
}
`
}

/**
 * Compose edge vertex shader.
 * @param _config
 */
export function composeEdgeVertexShader(_config: PolytopeWGSLShaderConfig): string {
  return /* wgsl */ `
// Polytope Edge Vertex Shader
// Port of WebGL ND_TRANSFORM_GLSL

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

${polytopeUniformsBlock}

@group(0) @binding(0) var<uniform> camera: CameraUniforms;
@group(2) @binding(0) var<uniform> polytope: PolytopeUniforms;

struct VertexInput {
  @location(0) position: vec3f,
  @location(1) extraDims0_3: vec4f,
  @location(2) extraDims4_6: vec3f,
}

struct VertexOutput {
  @builtin(position) clipPosition: vec4f,
  @location(0) worldPosition: vec3f,
}

${transformNDBlock}

@vertex
fn main(input: VertexInput) -> VertexOutput {
  var output: VertexOutput;

  // Build extra rotation columns array from uniforms
  var extraRotCols: array<vec4f, 7>;
  extraRotCols[0] = polytope.extraRotCol0;
  extraRotCols[1] = polytope.extraRotCol1;
  extraRotCols[2] = polytope.extraRotCol2;
  extraRotCols[3] = polytope.extraRotCol3;
  extraRotCols[4] = polytope.extraRotCol4;
  extraRotCols[5] = polytope.extraRotCol5;
  extraRotCols[6] = polytope.extraRotCol6;

  // Build depth row sums array from uniforms
  var depthRowSums: array<f32, 11>;
  depthRowSums[0] = polytope.depthRowSums0_3.x;
  depthRowSums[1] = polytope.depthRowSums0_3.y;
  depthRowSums[2] = polytope.depthRowSums0_3.z;
  depthRowSums[3] = polytope.depthRowSums0_3.w;
  depthRowSums[4] = polytope.depthRowSums4_7.x;
  depthRowSums[5] = polytope.depthRowSums4_7.y;
  depthRowSums[6] = polytope.depthRowSums4_7.z;
  depthRowSums[7] = polytope.depthRowSums4_7.w;
  depthRowSums[8] = polytope.depthRowSums8_10.x;
  depthRowSums[9] = polytope.depthRowSums8_10.y;
  depthRowSums[10] = polytope.depthRowSums8_10.z;

  // Transform from N-D to 3D using rotation + perspective projection
  let pos3d = transformND(
    input.position,
    input.extraDims0_3,
    input.extraDims4_6,
    polytope.rotationMatrix4D,
    polytope.dimension,
    polytope.uniformScale,
    polytope.projectionDistance,
    polytope.depthNormFactor,
    extraRotCols,
    depthRowSums
  );

  let worldPos = (camera.modelMatrix * vec4f(pos3d, 1.0)).xyz;
  output.worldPosition = worldPos;
  output.clipPosition = camera.viewProjectionMatrix * vec4f(worldPos, 1.0);

  return output;
}
`
}

/**
 * Compose edge fragment shader.
 * @param _config
 */
export function composeEdgeFragmentShader(_config: PolytopeWGSLShaderConfig): {
  wgsl: string
  modules: string[]
  features: string[]
} {
  const wgsl = /* wgsl */ `
// Polytope Edge Fragment Shader

${polytopeUniformsBlock}

@group(2) @binding(0) var<uniform> polytope: PolytopeUniforms;

struct FragmentInput {
  @location(0) worldPosition: vec3f,
}

@fragment
fn fragmentMain(input: FragmentInput) -> @location(0) vec4f {
  return vec4f(polytope.edgeColor, 1.0);
}
`

  return { wgsl, modules: ['Edge Fragment'], features: ['Polytope Edges'] }
}

// ============================================================================
// Compute-Accelerated Shaders
// These shaders read pre-computed data from PolytopeTransformComputePass and
// PolytopeNormalComputePass instead of computing transforms in the vertex shader.
// ============================================================================

/**
 * Compose face vertex shader for compute-accelerated mode.
 *
 * This simplified vertex shader reads:
 * - Pre-computed 3D positions and face depths from PolytopeTransformComputePass output buffer
 * - Pre-computed face normals from PolytopeNormalComputePass output buffer
 *
 * The vertex buffer format is simplified:
 * - Input: Just vertex index (for indexing into storage buffers)
 * - Storage buffers provide: transformed position, depth, and face normal
 *
 * Benefits:
 * - No N-D transform computation in vertex shader
 * - No neighbor vertex data needed (67% memory reduction)
 * - Consistent normal quality across all dimensions
 * - ~2x faster than geometry-normal mode for high dimensions
 *
 * @param config - Shader configuration
 */
export function composeFaceVertexShaderCompute(config: PolytopeWGSLShaderConfig): string {
  const { dimension = 3 } = config

  return /* wgsl */ `
// Polytope Face Vertex Shader (Compute-Accelerated)
// Reads pre-computed transforms from storage buffers instead of computing per-vertex.
// Dimension: ${dimension}D

// ============================================
// Structures
// ============================================

struct CameraUniforms {
  viewMatrix: mat4x4f,
  projectionMatrix: mat4x4f,
  viewProjectionMatrix: mat4x4f,
  inverseViewMatrix: mat4x4f,
  inverseProjectionMatrix: mat4x4f,
  modelMatrix: mat4x4f,
  inverseModelMatrix: mat4x4f,
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

// Pre-computed vertex from PolytopeTransformComputePass
struct TransformedVertex {
  position: vec3f,
  depth: f32,
}

// Pre-computed face normal from PolytopeNormalComputePass
struct FaceNormal {
  normal: vec3f,
  _pad: f32,
}

struct VertexOutput {
  @builtin(position) clipPosition: vec4f,
  @location(0) worldPosition: vec3f,
  @location(1) viewDir: vec3f,
  @location(2) @interpolate(flat) faceDepth: f32,
  @location(3) @interpolate(flat) normal: vec3f,
}

// ============================================
// Bind Groups
// ============================================

// Group 0: Camera
@group(0) @binding(0) var<uniform> camera: CameraUniforms;

// Group 2: Polytope uniforms (only needed for material properties in fragment shader)
// Skip group 2 binding in vertex shader - fragment shader handles it

// Group 3: Compute buffers (pre-computed transforms and normals)
@group(3) @binding(0) var<storage, read> transformedVertices: array<TransformedVertex>;
@group(3) @binding(1) var<storage, read> faceNormals: array<FaceNormal>;

// ============================================
// Vertex Shader
// ============================================

@vertex
fn main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
  var output: VertexOutput;

  // Read pre-computed vertex data from storage buffer
  let vertex = transformedVertices[vertexIndex];

  // Transform to world space (matches WebGL: modelMatrix * vec4(pos, 1.0))
  let worldPos = (camera.modelMatrix * vec4f(vertex.position, 1.0)).xyz;
  output.worldPosition = worldPos;

  // Face depth from compute pass (used for color algorithms)
  output.faceDepth = vertex.depth;

  // Clip position via view-projection transform
  output.clipPosition = camera.viewProjectionMatrix * vec4f(worldPos, 1.0);

  // View direction for lighting
  output.viewDir = normalize(camera.cameraPosition - worldPos);

  // Look up pre-computed face normal, transform to world space
  let faceIndex = vertexIndex / 3u;
  output.normal = normalize((camera.modelMatrix * vec4f(faceNormals[faceIndex].normal, 0.0)).xyz);

  return output;
}
`
}

/**
 * Compose edge vertex shader for compute-accelerated mode.
 *
 * Reads pre-computed 3D positions from PolytopeTransformComputePass.
 * Edges don't need normals.
 *
 * @param config - Shader configuration
 */
export function composeEdgeVertexShaderCompute(config: PolytopeWGSLShaderConfig): string {
  const { dimension = 3 } = config

  return /* wgsl */ `
// Polytope Edge Vertex Shader (Compute-Accelerated)
// Reads pre-computed transforms from storage buffers.
// Dimension: ${dimension}D

// ============================================
// Structures
// ============================================

struct CameraUniforms {
  viewMatrix: mat4x4f,
  projectionMatrix: mat4x4f,
  viewProjectionMatrix: mat4x4f,
  inverseViewMatrix: mat4x4f,
  inverseProjectionMatrix: mat4x4f,
  modelMatrix: mat4x4f,
  inverseModelMatrix: mat4x4f,
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

// Pre-computed vertex from PolytopeTransformComputePass
struct TransformedVertex {
  position: vec3f,
  depth: f32,
}

struct VertexOutput {
  @builtin(position) clipPosition: vec4f,
  @location(0) worldPosition: vec3f,
}

// ============================================
// Bind Groups
// ============================================

// Group 0: Camera
@group(0) @binding(0) var<uniform> camera: CameraUniforms;

// Group 3: Compute buffers (pre-computed transforms)
@group(3) @binding(0) var<storage, read> transformedVertices: array<TransformedVertex>;

// ============================================
// Vertex Shader
// ============================================

@vertex
fn main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
  var output: VertexOutput;

  // Read pre-computed vertex data from storage buffer
  let vertex = transformedVertices[vertexIndex];

  // Transform to world space
  let worldPos = (camera.modelMatrix * vec4f(vertex.position, 1.0)).xyz;
  output.worldPosition = worldPos;

  // Clip position via view-projection transform
  output.clipPosition = camera.viewProjectionMatrix * vec4f(worldPos, 1.0);

  return output;
}
`
}
