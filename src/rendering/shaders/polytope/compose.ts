import { cosinePaletteBlock } from '../shared/color/cosine-palette.glsl'
import { hslBlock } from '../shared/color/hsl.glsl'
import { oklabBlock } from '../shared/color/oklab.glsl'
import { selectorBlock } from '../shared/color/selector.glsl'
import { constantsBlock } from '../shared/core/constants.glsl'
import { precisionBlock } from '../shared/core/precision.glsl'
import { uniformsBlock } from '../shared/core/uniforms.glsl'
import {
  shadowMapsFunctionsBlock,
  shadowMapsUniformsBlock,
} from '../shared/features/shadowMaps.glsl'
import {
  assembleShaderBlocks,
  processMeshFeatureFlags,
  type MeshShaderConfig,
} from '../shared/fractal/compose-helpers'
import { ggxBlock } from '../shared/lighting/ggx.glsl'
import { iblBlock, iblUniformsBlock, pmremSamplingBlock } from '../shared/lighting/ibl.glsl'
import { multiLightBlock } from '../shared/lighting/multi-light.glsl'
import { sssBlock } from '../shared/lighting/sss.glsl'

import { transformNDBlock } from './transform-nd.glsl'
import { transformNDSimpleBlock } from './transform-nd-simple.glsl'

/**
 * Configuration for Polytope shader compilation.
 * Extends MeshShaderConfig with polytope-specific options.
 * Each feature flag controls whether that feature's code is compiled into the shader.
 * Disabled features are completely absent from the compiled shader, not just branched.
 */
export type PolytopeShaderConfig = MeshShaderConfig

/**
 * Compose face vertex shader for Polytope rendering.
 *
 * Computes face normal from all 3 triangle vertices after nD transformation.
 * This ensures correct normals even when nD projection flips face winding.
 * Uses packed attributes to stay within WebGL 16 attribute limit.
 * @returns Composed vertex shader source code
 */
export function composeFaceVertexShader(): string {
  return [
    `precision highp float;
    precision highp int;`,
    transformNDBlock,
    `
    // Outputs to fragment shader
    out vec3 vWorldPosition;
    out vec3 vViewDir;
    // Face normal computed from transformed triangle vertices (flat = first vertex wins)
    flat out vec3 vFaceNormal;
    // Face depth for color algorithms - flat interpolation means first vertex wins
    flat out float vFaceDepth;

    void main() {
      // Transform all 3 vertices of this triangle through the nD pipeline
      vec3 v0_projected = transformND();           // This vertex
      vec3 v1_projected = transformNeighbor1();    // Neighbor 1
      vec3 v2_projected = transformNeighbor2();    // Neighbor 2

      // Sum of extra dimensions for dimension-aware bias (packed attributes)
      float extraSum = aExtraDims0_3.x + aExtraDims0_3.y + aExtraDims0_3.z + aExtraDims0_3.w
                     + aExtraDims4_6.x + aExtraDims4_6.y + aExtraDims4_6.z;

      // Compute face normal from the 3 transformed vertices
      vec3 faceNormal = computeFaceNormal(v0_projected, v1_projected, v2_projected);

      vec4 worldPos = modelMatrix * vec4(v0_projected, 1.0);
      gl_Position = projectionMatrix * viewMatrix * worldPos;

      // Transform normal to world space (use normal matrix for correct scaling)
      // For uniform scaling, modelMatrix rotation is sufficient
      vFaceNormal = normalize(mat3(modelMatrix) * faceNormal);

      // Pass world position for lighting calculations
      vWorldPosition = worldPos.xyz;
      // Guard against camera at world position (zero-length view direction)
      vec3 viewDiff = cameraPosition - worldPos.xyz;
      float viewLen = length(viewDiff);
      vViewDir = viewLen > 0.0001 ? viewDiff / viewLen : vec3(0.0, 0.0, 1.0);

      // Compute face depth from higher dimension coordinates
      // With flat interpolation, provoking vertex (last vertex) sets the value
      // Map to roughly 0-1 range (coordinates typically in -1 to 1)
      vFaceDepth = clamp(extraSum * 0.15 + 0.5, 0.0, 1.0);
    }
    `,
  ].join('\n')
}

/**
 * Compose edge vertex shader for Polytope wireframe rendering.
 * Uses packed aExtraDims0_3 (vec4) and aExtraDims4_6 (vec3) attributes.
 * @returns GLSL vertex shader code string for edge rendering
 */
export function composeEdgeVertexShader(): string {
  return [
    transformNDBlock,
    `
    void main() {
      vec3 projected = transformND();
      gl_Position = projectionMatrix * modelViewMatrix * vec4(projected, 1.0);
    }
    `,
  ].join('\n')
}

/**
 * Compose face vertex shader for screen-space normal mode.
 *
 * This is a lightweight version that:
 * - Only transforms THIS vertex (no neighbor vertices)
 * - Does NOT apply modulation (breathing animation disabled)
 * - Normal is computed in fragment shader via dFdx/dFdy derivatives
 *
 * Uses 3 attribute slots instead of 9 (67% reduction).
 * Used when dimension >= SCREEN_SPACE_NORMAL_MIN_DIMENSION.
 *
 * @returns Composed vertex shader source code for screen-space normal mode
 * @see composeFaceVertexShader for the full version with geometry-based normals
 */
export function composeFaceVertexShaderScreenSpace(): string {
  return [
    `precision highp float;
    precision highp int;`,
    transformNDSimpleBlock,
    `
    // Outputs to fragment shader
    out vec3 vWorldPosition;
    out vec3 vViewDir;
    // NO vFaceNormal - computed in fragment shader via dFdx/dFdy
    // Face depth for color algorithms - flat interpolation means first vertex wins
    flat out float vFaceDepth;

    void main() {
      // Transform only THIS vertex through the nD pipeline
      // NO neighbor transforms - normal computed in fragment shader
      vec3 projected = transformND();

      // Sum of extra dimensions for dimension-aware bias (packed attributes)
      float extraSum = aExtraDims0_3.x + aExtraDims0_3.y + aExtraDims0_3.z + aExtraDims0_3.w
                     + aExtraDims4_6.x + aExtraDims4_6.y + aExtraDims4_6.z;

      // NO modulation - use projected position directly
      // Modulation is disabled in screen-space normal mode for stable derivatives
      vec4 worldPos = modelMatrix * vec4(projected, 1.0);
      gl_Position = projectionMatrix * viewMatrix * worldPos;

      // Pass world position for lighting calculations and dFdx/dFdy normal computation
      vWorldPosition = worldPos.xyz;

      // Guard against camera at world position (zero-length view direction)
      vec3 viewDiff = cameraPosition - worldPos.xyz;
      float viewLen = length(viewDiff);
      vViewDir = viewLen > 0.0001 ? viewDiff / viewLen : vec3(0.0, 0.0, 1.0);

      // Compute face depth from higher dimension coordinates
      // Map to roughly 0-1 range (coordinates typically in -1 to 1)
      vFaceDepth = clamp(extraSum * 0.15 + 0.5, 0.0, 1.0);
    }
    `,
  ].join('\n')
}

/**
 * Compose face fragment shader with conditional features.
 *
 * Features are conditionally compiled - disabled features are completely
 * absent from the compiled shader, not just branched at runtime.
 *
 * @param config - Configuration for conditional compilation
 * @returns Object with glsl string, module names, and feature names
 */
export function composeFaceFragmentShader(config: PolytopeShaderConfig = {}): {
  glsl: string
  modules: string[]
  features: string[]
} {
  const { shadows: enableShadows = true, overrides = [] } = config

  // Process feature flags using shared helper
  const flags = processMeshFeatureFlags(config)

  // Build blocks array with conditional inclusion
  const blocks = [
    { name: 'Precision', content: precisionBlock },
    { name: 'Defines', content: flags.defines.join('\n') },
    {
      name: 'Polytope Uniforms',
      content: `
    // Color uniforms
    uniform float uOpacity;

    // SSS uniforms (always declared, code conditionally compiled)
    uniform bool uSssEnabled;
    uniform float uSssIntensity;
    uniform vec3 uSssColor;
    uniform float uSssThickness;
    uniform float uSssJitter;

    // GGX PBR roughness
    uniform float uRoughness;

    // Inputs from vertex shader
    in vec3 vWorldPosition;
    in vec3 vViewDir;
    // Face normal computed in vertex shader after nD transformation (flat = first vertex wins)
    flat in vec3 vFaceNormal;
    // Face depth with flat interpolation - first vertex of each triangle wins
    flat in float vFaceDepth;
    `,
    },
    { name: 'Constants', content: constantsBlock },
    { name: 'Shared Uniforms', content: uniformsBlock },
    { name: 'Color (HSL)', content: hslBlock },
    { name: 'Color (Cosine)', content: cosinePaletteBlock },
    { name: 'Color (Oklab)', content: oklabBlock },
    { name: 'Color Selector', content: selectorBlock },
    { name: 'Multi-Light System', content: multiLightBlock },
    { name: 'Lighting (SSS)', content: sssBlock, condition: flags.useSss },
    { name: 'Lighting (GGX)', content: ggxBlock },
    { name: 'IBL Uniforms', content: iblUniformsBlock },
    { name: 'PMREM Sampling', content: pmremSamplingBlock },
    { name: 'IBL Functions', content: iblBlock },
    { name: 'Shadow Maps Uniforms', content: shadowMapsUniformsBlock, condition: enableShadows },
    { name: 'Shadow Maps Functions', content: shadowMapsFunctionsBlock, condition: enableShadows },
    { name: 'Main', content: polytopeMainBlock },
  ]

  // Assemble shader from blocks using shared helper
  const { glsl, modules } = assembleShaderBlocks(blocks, overrides)

  return { glsl, modules, features: flags.features }
}

/**
 * Main block for Polytope fragment shader.
 * Uses pre-computed face normal from vertex shader (flat interpolation).
 * This ensures correct normals even when nD projection flips face winding.
 */
const polytopeMainBlock = `
void main() {
  // Use pre-computed face normal from vertex shader (flat interpolation = first vertex wins)
  // This normal was computed after nD transformation, so it's geometrically correct
  vec3 normal = normalize(vFaceNormal);

  // Guard against zero-length view direction
  float vViewLen = length(vViewDir);
  vec3 viewDir = vViewLen > 0.0001 ? vViewDir / vViewLen : vec3(0.0, 0.0, 1.0);

  // Two-sided lighting: flip normal to face viewer for back faces
  // Use gl_FrontFacing for consistent orientation with face culling
  vec3 faceNormal = gl_FrontFacing ? normal : -normal;

  // Clamp roughness to prevent division by zero in GGX (mirror-like minimum)
  float roughness = max(uRoughness, 0.04);

  // Get base color from algorithm using face depth as t value
  vec3 baseHSL = rgb2hsl(uColor);
  vec3 baseColor = getColorByAlgorithm(vFaceDepth, normal, baseHSL, vWorldPosition);

  // F0: mix dielectric base (0.04) with albedo for metals
  // Computed once before light loop - same for all lights and IBL
  vec3 F0 = mix(vec3(0.04), baseColor, uMetallic);

  // Multi-light calculation
  vec3 col;
  if (uNumLights > 0) {
    // Ambient light (energy-conserved: metals don't scatter diffuse light)
    // max() guards against uMetallic > 1.0 which would cause negative diffuse
    col = baseColor * max(1.0 - uMetallic, 0.0) * uAmbientColor * uAmbientIntensity * uAmbientEnabled;
    float totalNdotL = 0.0;

    for (int i = 0; i < MAX_LIGHTS; i++) {
      if (i >= uNumLights) break;
      if (!uLightsEnabled[i]) continue;

      vec3 l = getLightDirection(i, vWorldPosition);
      float attenuation = uLightIntensities[i];

      int lightType = uLightTypes[i];
      if (lightType == LIGHT_TYPE_POINT || lightType == LIGHT_TYPE_SPOT) {
        float distance = length(uLightPositions[i] - vWorldPosition);
        attenuation *= getDistanceAttenuation(i, distance);
      }

      if (lightType == LIGHT_TYPE_SPOT) {
        vec3 ltfDiff = vWorldPosition - uLightPositions[i];
        float ltfLen = length(ltfDiff);
        vec3 lightToFrag = ltfLen > 0.0001 ? ltfDiff / ltfLen : vec3(0.0, -1.0, 0.0);
        attenuation *= getSpotAttenuation(i, lightToFrag);
      }

      if (attenuation < 0.001) continue;

      // Shadow map sampling for mesh-based objects
#ifdef USE_SHADOWS
      float shadow = uShadowEnabled ? getShadow(i, vWorldPosition) : 1.0;
#else
      float shadow = 1.0;
#endif

      // Two-sided lighting: use abs() so both sides of faces receive diffuse light
      float NdotL = abs(dot(normal, l));

      // GGX Specular (PBR) - use faceNormal for two-sided lighting
      vec3 H = normalize(l + viewDir);
      vec3 F = fresnelSchlick(max(dot(H, viewDir), 0.0), F0);

      // Energy conservation: kS is specular reflectance, kD is diffuse
      vec3 kS = F;
      vec3 kD = (vec3(1.0) - kS) * (1.0 - uMetallic);

      // Diffuse (energy-conserved, Lambertian BRDF = albedo/PI)
      col += kD * baseColor / PI * uLightColors[i] * NdotL * attenuation * shadow;

      // Specular (with artist-controlled color tint)
      vec3 specular = computePBRSpecular(faceNormal, viewDir, l, roughness, F0);
      col += specular * uSpecularColor * uLightColors[i] * NdotL * uSpecularIntensity * attenuation * shadow;

      // Rim SSS (backlight transmission)
#ifdef USE_SSS
      if (uSssEnabled && uSssIntensity > 0.0) {
        vec3 sss = computeSSS(l, viewDir, normal, 0.5, uSssThickness * 4.0, 0.0, uSssJitter, gl_FragCoord.xy);
        col += sss * uSssColor * uLightColors[i] * uSssIntensity * attenuation;
      }
#endif

      totalNdotL = max(totalNdotL, NdotL * attenuation);
    }

    // Fresnel rim lighting
    // PERF: Use multiplications instead of pow(x, 3.0)
#ifdef USE_FRESNEL
    if (uFresnelEnabled && uFresnelIntensity > 0.0) {
      float NdotV = abs(dot(normal, viewDir));
      float t = 1.0 - NdotV;
      float rim = t * t * t * uFresnelIntensity * 2.0;
      rim *= (0.3 + 0.7 * totalNdotL);
      col += uRimColor * rim;
    }
#endif

    // IBL (environment reflections)
    col += computeIBL(normal, viewDir, F0, roughness, uMetallic, baseColor);

  } else {
    // No lighting - just ambient (energy-conserved: metals don't scatter diffuse light)
    // max() guards against uMetallic > 1.0 which would cause negative diffuse
    col = baseColor * max(1.0 - uMetallic, 0.0) * uAmbientColor * uAmbientIntensity * uAmbientEnabled;

    // IBL still applies without direct lights (uses F0 computed above)
    col += computeIBL(normal, viewDir, F0, roughness, uMetallic, baseColor);
  }

  // Output to MRT
  vec3 viewNormalRaw = (uViewMatrix * vec4(normal, 0.0)).xyz;
  float vnLen = length(viewNormalRaw);
  vec3 viewNormal = vnLen > 0.0001 ? viewNormalRaw / vnLen : vec3(0.0, 0.0, 1.0);
  gColor = vec4(col, uOpacity);
  gNormal = vec4(viewNormal * 0.5 + 0.5, uMetallic);
  // CRITICAL: Always write to gPosition to prevent GL_INVALID_OPERATION when
  // rendering to MRT targets with 3 attachments. Unused outputs are silently
  // ignored when rendering to 2-attachment targets.
  // See: docs/bugfixing/log/2025-12-21-schroedinger-temporal-gl-invalid-operation.md
  gPosition = vec4(vWorldPosition, 1.0);
}
`

/**
 * Edge fragment shader with MRT outputs.
 * Must output to gColor (location 0), gNormal (location 1), and gPosition (location 2)
 * to be compatible with MRT render targets (2 or 3 attachments).
 * @returns GLSL fragment shader code string for edge rendering
 */
export function composeEdgeFragmentShader(): string {
  return `
    precision highp float;

    // MRT outputs - must output to all 3 locations for compatibility with 3-attachment targets
    // Extra outputs are silently ignored when rendering to 2-attachment targets.
    // See: docs/bugfixing/log/2025-12-21-schroedinger-temporal-gl-invalid-operation.md
    layout(location = 0) out vec4 gColor;
    layout(location = 1) out vec4 gNormal;
    layout(location = 2) out vec4 gPosition;

    uniform vec3 uColor;
    uniform float uOpacity;

    void main() {
      // Color output for thin line edges
      gColor = vec4(uColor, uOpacity);
      // Neutral view-space normal (facing camera) encoded to 0-1, no metallic
      // This ensures edges work with post-processing that reads the normal buffer
      gNormal = vec4(0.5, 0.5, 1.0, 0.0);
      // Dummy position output for MRT compatibility (edges don't need world position)
      gPosition = vec4(0.0);
    }
  `
}

/**
 * Compose face fragment shader with screen-space normal computation.
 *
 * Uses dFdx/dFdy derivatives to compute face normals from interpolated world positions.
 * This is faster than geometry-based normals (67% fewer transforms) but may have
 * minor 1-2 pixel edge artifacts at face boundaries.
 *
 * Features are conditionally compiled - disabled features are completely
 * absent from the compiled shader, not just branched at runtime.
 *
 * @param config - Configuration for conditional compilation
 * @returns Object with glsl string, module names, and feature names
 * @see composeFaceFragmentShader for the version with vertex-computed normals
 */
export function composeFaceFragmentShaderScreenSpace(config: PolytopeShaderConfig = {}): {
  glsl: string
  modules: string[]
  features: string[]
} {
  const { shadows: enableShadows = true, overrides = [] } = config

  // Process feature flags using shared helper
  const flags = processMeshFeatureFlags(config)

  // Build blocks array with conditional inclusion
  // Uses screen-space uniforms (no vFaceNormal input)
  const blocks = [
    { name: 'Precision', content: precisionBlock },
    { name: 'Defines', content: flags.defines.join('\n') },
    {
      name: 'Polytope Uniforms (Screen-Space)',
      content: `
    // Color uniforms
    uniform float uOpacity;

    // SSS uniforms (always declared, code conditionally compiled)
    uniform bool uSssEnabled;
    uniform float uSssIntensity;
    uniform vec3 uSssColor;
    uniform float uSssThickness;
    uniform float uSssJitter;

    // GGX PBR roughness
    uniform float uRoughness;

    // Inputs from vertex shader
    in vec3 vWorldPosition;
    in vec3 vViewDir;
    // NO vFaceNormal - computed here via dFdx/dFdy
    // Face depth with flat interpolation - first vertex of each triangle wins
    flat in float vFaceDepth;
    `,
    },
    { name: 'Constants', content: constantsBlock },
    { name: 'Shared Uniforms', content: uniformsBlock },
    { name: 'Color (HSL)', content: hslBlock },
    { name: 'Color (Cosine)', content: cosinePaletteBlock },
    { name: 'Color (Oklab)', content: oklabBlock },
    { name: 'Color Selector', content: selectorBlock },
    { name: 'Multi-Light System', content: multiLightBlock },
    { name: 'Lighting (SSS)', content: sssBlock, condition: flags.useSss },
    { name: 'Lighting (GGX)', content: ggxBlock },
    { name: 'IBL Uniforms', content: iblUniformsBlock },
    { name: 'PMREM Sampling', content: pmremSamplingBlock },
    { name: 'IBL Functions', content: iblBlock },
    { name: 'Shadow Maps Uniforms', content: shadowMapsUniformsBlock, condition: enableShadows },
    { name: 'Shadow Maps Functions', content: shadowMapsFunctionsBlock, condition: enableShadows },
    { name: 'Main (Screen-Space Normals)', content: polytopeMainBlockScreenSpace },
  ]

  // Assemble shader from blocks using shared helper
  const { glsl, modules } = assembleShaderBlocks(blocks, overrides)

  return { glsl, modules, features: flags.features }
}

/**
 * Main block for Polytope fragment shader with screen-space normal computation.
 *
 * Computes face normal from screen-space derivatives (dFdx/dFdy) of world position.
 * For flat triangles, this produces mathematically identical normals to geometry-based
 * computation, but at a fraction of the vertex shader cost.
 *
 * Trade-off: May have 1-2 pixel artifacts at triangle edges where the GPU's 2x2 pixel
 * quad spans multiple triangles. This is imperceptible for high-dimensional polytopes
 * with many small faces.
 */
const polytopeMainBlockScreenSpace = `
void main() {
  // Compute face normal from screen-space derivatives of world position
  // For flat triangles, dFdx/dFdy of linearly interpolated position gives exact face normal
  vec3 dPdx = dFdx(vWorldPosition);
  vec3 dPdy = dFdy(vWorldPosition);
  vec3 rawNormal = cross(dPdx, dPdy);
  float normalLen = length(rawNormal);
  // Guard against degenerate triangles (zero-area)
  // NOTE: Use tiny epsilon (1e-10) because dFdx/dFdy return per-pixel rates,
  // so cross product magnitude is naturally small (proportional to 1/pixels²)
  vec3 normal = normalLen > 1e-10 ? rawNormal / normalLen : vec3(0.0, 0.0, 1.0);

  // Guard against zero-length view direction
  float vViewLen = length(vViewDir);
  vec3 viewDir = vViewLen > 0.0001 ? vViewDir / vViewLen : vec3(0.0, 0.0, 1.0);

  // Two-sided lighting: flip normal to face viewer for back faces
  // Use gl_FrontFacing for consistent orientation with face culling
  vec3 faceNormal = gl_FrontFacing ? normal : -normal;

  // Clamp roughness to prevent division by zero in GGX (mirror-like minimum)
  float roughness = max(uRoughness, 0.04);

  // Get base color from algorithm using face depth as t value
  vec3 baseHSL = rgb2hsl(uColor);
  vec3 baseColor = getColorByAlgorithm(vFaceDepth, normal, baseHSL, vWorldPosition);

  // F0: mix dielectric base (0.04) with albedo for metals
  // Computed once before light loop - same for all lights and IBL
  vec3 F0 = mix(vec3(0.04), baseColor, uMetallic);

  // Multi-light calculation
  vec3 col;
  if (uNumLights > 0) {
    // Ambient light (energy-conserved: metals don't scatter diffuse light)
    // max() guards against uMetallic > 1.0 which would cause negative diffuse
    col = baseColor * max(1.0 - uMetallic, 0.0) * uAmbientColor * uAmbientIntensity * uAmbientEnabled;
    float totalNdotL = 0.0;

    for (int i = 0; i < MAX_LIGHTS; i++) {
      if (i >= uNumLights) break;
      if (!uLightsEnabled[i]) continue;

      vec3 l = getLightDirection(i, vWorldPosition);
      float attenuation = uLightIntensities[i];

      int lightType = uLightTypes[i];
      if (lightType == LIGHT_TYPE_POINT || lightType == LIGHT_TYPE_SPOT) {
        float distance = length(uLightPositions[i] - vWorldPosition);
        attenuation *= getDistanceAttenuation(i, distance);
      }

      if (lightType == LIGHT_TYPE_SPOT) {
        vec3 ltfDiff = vWorldPosition - uLightPositions[i];
        float ltfLen = length(ltfDiff);
        vec3 lightToFrag = ltfLen > 0.0001 ? ltfDiff / ltfLen : vec3(0.0, -1.0, 0.0);
        attenuation *= getSpotAttenuation(i, lightToFrag);
      }

      if (attenuation < 0.001) continue;

      // Shadow map sampling for mesh-based objects
#ifdef USE_SHADOWS
      float shadow = uShadowEnabled ? getShadow(i, vWorldPosition) : 1.0;
#else
      float shadow = 1.0;
#endif

      // Two-sided lighting: use abs() so both sides of faces receive diffuse light
      float NdotL = abs(dot(normal, l));

      // GGX Specular (PBR) - use faceNormal for two-sided lighting
      vec3 H = normalize(l + viewDir);
      vec3 F = fresnelSchlick(max(dot(H, viewDir), 0.0), F0);

      // Energy conservation: kS is specular reflectance, kD is diffuse
      vec3 kS = F;
      vec3 kD = (vec3(1.0) - kS) * (1.0 - uMetallic);

      // Diffuse (energy-conserved, Lambertian BRDF = albedo/PI)
      col += kD * baseColor / PI * uLightColors[i] * NdotL * attenuation * shadow;

      // Specular (with artist-controlled color tint)
      vec3 specular = computePBRSpecular(faceNormal, viewDir, l, roughness, F0);
      col += specular * uSpecularColor * uLightColors[i] * NdotL * uSpecularIntensity * attenuation * shadow;

      // Rim SSS (backlight transmission)
#ifdef USE_SSS
      if (uSssEnabled && uSssIntensity > 0.0) {
        vec3 sss = computeSSS(l, viewDir, normal, 0.5, uSssThickness * 4.0, 0.0, uSssJitter, gl_FragCoord.xy);
        col += sss * uSssColor * uLightColors[i] * uSssIntensity * attenuation;
      }
#endif

      totalNdotL = max(totalNdotL, NdotL * attenuation);
    }

    // Fresnel rim lighting
    // PERF: Use multiplications instead of pow(x, 3.0)
#ifdef USE_FRESNEL
    if (uFresnelEnabled && uFresnelIntensity > 0.0) {
      float NdotV = abs(dot(normal, viewDir));
      float t = 1.0 - NdotV;
      float rim = t * t * t * uFresnelIntensity * 2.0;
      rim *= (0.3 + 0.7 * totalNdotL);
      col += uRimColor * rim;
    }
#endif

    // IBL (environment reflections)
    col += computeIBL(normal, viewDir, F0, roughness, uMetallic, baseColor);

  } else {
    // No lighting - just ambient (energy-conserved: metals don't scatter diffuse light)
    // max() guards against uMetallic > 1.0 which would cause negative diffuse
    col = baseColor * max(1.0 - uMetallic, 0.0) * uAmbientColor * uAmbientIntensity * uAmbientEnabled;

    // IBL still applies without direct lights (uses F0 computed above)
    col += computeIBL(normal, viewDir, F0, roughness, uMetallic, baseColor);
  }

  // Output to MRT
  vec3 viewNormalRaw = (uViewMatrix * vec4(normal, 0.0)).xyz;
  float vnLen = length(viewNormalRaw);
  vec3 viewNormal = vnLen > 0.0001 ? viewNormalRaw / vnLen : vec3(0.0, 0.0, 1.0);
  gColor = vec4(col, uOpacity);
  gNormal = vec4(viewNormal * 0.5 + 0.5, uMetallic);
  // CRITICAL: Always write to gPosition to prevent GL_INVALID_OPERATION when
  // rendering to MRT targets with 3 attachments. Unused outputs are silently
  // ignored when rendering to 2-attachment targets.
  gPosition = vec4(vWorldPosition, 1.0);
}
`
