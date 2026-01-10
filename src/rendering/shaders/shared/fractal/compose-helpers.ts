/**
 * Shared helper functions for fractal shader composition
 *
 * Extracts common logic used by both Mandelbulb and Julia compose functions:
 * - Feature flag processing
 * - Define generation
 * - Block assembly
 */

import { ShaderConfig } from '../types';

/** Shader block with optional condition */
export interface ShaderBlock {
  name: string;
  content: string;
  condition?: boolean;
}

/** Result of feature flag processing */
export interface FeatureFlags {
  defines: string[];
  features: string[];
  useShadows: boolean;
  useTemporal: boolean;
  useAO: boolean;
  useSss: boolean;
  useFresnel: boolean;
}

/**
 * Process shader config to generate feature flags and defines.
 * Common logic shared by all fractal shaders.
 *
 * Note: Raymarching fractals (mandelbulb, julia, schroedinger, blackhole) are always
 * rendered as fully opaque (solid mode). Opacity mode configuration was removed.
 *
 * @param config - Shader configuration with feature toggles
 * @returns Feature flags object with defines array and boolean flags
 *
 * @example
 * const flags = processFeatureFlags({
 *   dimension: 3,
 *   shadows: true,
 *   temporal: false,
 *   ambientOcclusion: true,
 *   sss: true,
 * });
 * // flags.defines = ['#define USE_SHADOWS', '#define USE_AO', '#define USE_SSS']
 * // flags.features = ['Multi-Light', 'Shadows', 'Ambient Occlusion', 'SSS']
 * // flags.useShadows = true, flags.useTemporal = false, etc.
 */
export function processFeatureFlags(config: ShaderConfig): FeatureFlags {
  const {
    shadows: enableShadows,
    temporal: enableTemporal,
    ambientOcclusion: enableAO,
    overrides = [],
    sss: enableSss,
    fresnel: enableFresnel,
  } = config;

  const defines: string[] = [];
  const features: string[] = [];

  features.push('Multi-Light');

  const useShadows = enableShadows && !overrides.includes('Shadows');
  const useTemporal = enableTemporal && !overrides.includes('Temporal Reprojection');
  const useAO = enableAO && !overrides.includes('Ambient Occlusion');
  const useSss = !!enableSss && !overrides.includes('SSS');
  const useFresnel = !!enableFresnel && !overrides.includes('Fresnel');

  if (useShadows) {
    defines.push('#define USE_SHADOWS');
    features.push('Shadows');
  }
  if (useTemporal) {
    defines.push('#define USE_TEMPORAL');
    features.push('Temporal Reprojection');
  }
  if (useAO) {
    defines.push('#define USE_AO');
    features.push('Ambient Occlusion');
  }
  if (useSss) {
    defines.push('#define USE_SSS');
    features.push('SSS');
  }
  if (useFresnel) {
    defines.push('#define USE_FRESNEL');
    features.push('Fresnel');
  }

  return {
    defines,
    features,
    useShadows,
    useTemporal,
    useAO,
    useSss,
    useFresnel,
  };
}

/**
 * Assemble shader from blocks array.
 * Handles conditional blocks and overrides.
 *
 * @param blocks - Array of shader blocks with optional conditions
 * @param overrides - Module names to exclude content from (still listed in modules)
 * @returns Object with assembled GLSL string and module names list
 *
 * @example
 * const blocks = [
 *   { name: 'Precision', content: 'precision highp float;' },
 *   { name: 'Shadows', content: shadowsBlock, condition: config.shadows },
 *   { name: 'Fog', content: fogBlock, condition: false }, // Disabled
 * ];
 * const { glsl, modules } = assembleShaderBlocks(blocks, ['Shadows']);
 * // glsl = 'precision highp float;' (Shadows overridden, Fog disabled)
 * // modules = ['Precision', 'Shadows'] (Fog excluded due to condition: false)
 */
export function assembleShaderBlocks(
  blocks: ShaderBlock[],
  overrides: string[]
): { glsl: string; modules: string[] } {
  const modules: string[] = [];
  const glslParts: string[] = [];

  blocks.forEach(b => {
    if (b.condition === false) return; // Disabled in config

    modules.push(b.name);

    if (overrides.includes(b.name)) {
      // Overridden: Don't add content
    } else {
      glslParts.push(b.content);
    }
  });

  return { glsl: glslParts.join('\n'), modules };
}

/** Standard vertex inputs block for fractal shaders */
export const fractalVertexInputsBlock = `
// Inputs from vertex shader
in vec3 vPosition;
`;

// ============================================
// Mesh Shader Helpers (Polytope, TubeWireframe)
// ============================================

/** Configuration for mesh-based shaders (Polytope, TubeWireframe) */
export interface MeshShaderConfig {
  shadows?: boolean;
  sss?: boolean;
  fresnel?: boolean;
  overrides?: string[];
}

/** Result of mesh feature flag processing */
export interface MeshFeatureFlags {
  defines: string[];
  features: string[];
  useShadows: boolean;
  useSss: boolean;
  useFresnel: boolean;
}

/**
 * Process mesh shader config to generate feature flags and defines.
 * Common logic shared by Polytope and TubeWireframe shaders.
 *
 * @param config - Mesh shader configuration with feature toggles
 * @returns Feature flags object with defines array and boolean flags
 *
 * @example
 * const flags = processMeshFeatureFlags({
 *   shadows: true,
 *   sss: false,
 *   fresnel: true,
 * });
 * // flags.defines = ['#define USE_SHADOWS', '#define USE_FRESNEL']
 * // flags.features = ['Multi-Light', 'Shadow Maps', 'Fresnel']
 */
export function processMeshFeatureFlags(config: MeshShaderConfig): MeshFeatureFlags {
  const {
    shadows: enableShadows = true,
    sss: enableSss = true,
    fresnel: enableFresnel = true,
    overrides = [],
  } = config;

  const defines: string[] = [];
  const features: string[] = ['Multi-Light'];

  const useShadows = enableShadows && !overrides.includes('Shadow Maps');
  const useSss = enableSss && !overrides.includes('SSS');
  const useFresnel = enableFresnel && !overrides.includes('Fresnel');

  if (useShadows) {
    defines.push('#define USE_SHADOWS');
    features.push('Shadow Maps');
  }
  if (useSss) {
    defines.push('#define USE_SSS');
    features.push('SSS');
  }
  if (useFresnel) {
    defines.push('#define USE_FRESNEL');
    features.push('Fresnel');
  }

  return { defines, features, useShadows, useSss, useFresnel };
}
