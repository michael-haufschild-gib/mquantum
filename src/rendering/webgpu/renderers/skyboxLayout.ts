/**
 * Skybox uniform struct layouts — single source of truth for byte offsets.
 *
 * Field definitions mirror the WGSL `SkyboxUniforms` struct in
 * `shaders/skybox/core/uniforms.wgsl.ts` and the WGSL `VertexUniforms` struct
 * in `shaders/skybox/vertex.wgsl.ts` exactly. The layout engine computes byte
 * offsets using WGSL alignment rules, eliminating hand-computed magic numbers
 * from the packing code in `WebGPUSkyboxRenderer.ts` and `skyboxVertexData.ts`.
 *
 * The `mat4x4<f32>` and `mat3x3<f32>` matrix types are modelled as
 * `array<vec4f, N>` because WGSL gives them identical alignment, stride, and
 * size: a `mat4x4<f32>` is four 16-byte vec4 columns, and a `mat3x3<f32>` is
 * three vec3 columns each padded to 16-byte stride. The TypeScript layout
 * engine has no native mat type; the equivalent vec4 array reproduces the
 * exact byte layout.
 *
 * Validated at test time by parsing both WGSL struct template literals and
 * comparing field names, types, and computed offsets.
 *
 * @module rendering/webgpu/renderers/skyboxLayout
 */

import { arr, computeStructLayout, type StructFieldDef } from '../utils/structLayout'

/**
 * Field definitions for the SkyboxUniforms WGSL struct.
 *
 * Order and types must match `shaders/skybox/core/uniforms.wgsl.ts` exactly.
 * Fields starting with `_` are reserved (padding or removed features).
 */
const SKYBOX_UNIFORMS_FIELDS = [
  // --- Core scalars (offset 0..63) ---
  { name: 'mode', type: 'f32' },
  { name: 'time', type: 'f32' },
  { name: 'intensity', type: 'f32' },
  { name: 'hue', type: 'f32' },

  { name: 'saturation', type: 'f32' },
  { name: 'scale', type: 'f32' },
  { name: 'complexity', type: 'f32' },
  { name: 'timeScale', type: 'f32' },

  { name: 'evolution', type: 'f32' },
  { name: '_padSync', type: 'f32' },
  { name: 'distortion', type: 'f32' },
  { name: 'vignette', type: 'f32' },

  { name: 'turbulence', type: 'f32' },
  { name: 'dualTone', type: 'f32' },
  { name: 'sunIntensity', type: 'f32' },
  { name: '_pad0', type: 'f32' },

  // --- Color1 / Color2 (offset 64..95) ---
  { name: 'color1', type: 'vec3f' },
  { name: '_pad1', type: 'f32' },
  { name: 'color2', type: 'vec3f' },
  { name: '_pad2', type: 'f32' },

  // --- Cosine palette coefficients (offset 96..159) ---
  { name: 'palA', type: 'vec3f' },
  { name: '_pad3', type: 'f32' },
  { name: 'palB', type: 'vec3f' },
  { name: '_pad4', type: 'f32' },
  { name: 'palC', type: 'vec3f' },
  { name: '_pad5', type: 'f32' },
  { name: 'palD', type: 'vec3f' },
  { name: '_pad6', type: 'f32' },

  // --- Sun position (offset 160..175) ---
  { name: 'sunPosition', type: 'vec3f' },
  { name: '_pad7', type: 'f32' },

  // --- Aurora-specific (offset 176..183) ---
  { name: 'auroraCurtainHeight', type: 'f32' },
  { name: 'auroraWaveFrequency', type: 'f32' },

  // --- Horizon-specific (offset 184..191) ---
  { name: 'horizonGradientContrast', type: 'f32' },
  { name: 'horizonSpotlightFocus', type: 'f32' },

  // --- Ocean-specific (offset 192..207) ---
  { name: 'oceanCausticIntensity', type: 'f32' },
  { name: 'oceanDepthGradient', type: 'f32' },
  { name: 'oceanBubbleDensity', type: 'f32' },
  { name: 'oceanSurfaceShimmer', type: 'f32' },

  // --- CPU-precomputed dispatch-uniform palette samples (offset 208..431) ---
  // Each sample is a vec3f followed by a 4-byte pad to keep vec3 alignment at 16.
  { name: 'auroraTopColor', type: 'vec3f' },
  { name: '_padHoist0', type: 'f32' },
  { name: 'crystallineShimmerColor', type: 'vec3f' },
  { name: '_padHoist1', type: 'f32' },
  { name: 'nebulaDeepColor', type: 'vec3f' },
  { name: '_padHoist2', type: 'f32' },
  { name: 'nebulaKnotColor', type: 'vec3f' },
  { name: '_padHoist3', type: 'f32' },
  { name: 'oceanDeepPalette', type: 'vec3f' },
  { name: '_padHoist4', type: 'f32' },
  { name: 'oceanMidPalette', type: 'vec3f' },
  { name: '_padHoist5', type: 'f32' },
  { name: 'oceanSurfacePalette', type: 'vec3f' },
  { name: '_padHoist6', type: 'f32' },
  { name: 'horizonFloorColor', type: 'vec3f' },
  { name: '_padHoist7', type: 'f32' },
  { name: 'horizonHorizonColor', type: 'vec3f' },
  { name: '_padHoist8', type: 'f32' },
  { name: 'horizonMidColor', type: 'vec3f' },
  { name: '_padHoist9', type: 'f32' },
  { name: 'horizonTopColor', type: 'vec3f' },
  { name: '_padHoist10', type: 'f32' },
  { name: 'horizonSweepColor', type: 'vec3f' },
  { name: '_padHoist11', type: 'f32' },
  { name: 'twilightHorizonColor', type: 'vec3f' },
  { name: '_padHoist12', type: 'f32' },
  { name: 'twilightSunColor', type: 'vec3f' },
  { name: '_padHoist13', type: 'f32' },
] as const satisfies readonly StructFieldDef[]

/**
 * Field definitions for the skybox VertexUniforms WGSL struct.
 *
 * Order and types must match `shaders/skybox/vertex.wgsl.ts` exactly.
 * Matrix types are modelled as `array<vec4f, N>` (see module docstring).
 */
const SKYBOX_VERTEX_UNIFORMS_FIELDS = [
  // --- Transformation matrices ---
  { name: 'modelMatrix', type: arr('vec4f', 4) },
  { name: 'modelViewMatrix', type: arr('vec4f', 4) },
  { name: 'projectionMatrix', type: arr('vec4f', 4) },
  { name: 'rotationMatrix', type: arr('vec4f', 3) },
] as const satisfies readonly StructFieldDef[]

/** Computed struct layout for SkyboxUniforms. */
export const SKYBOX_UNIFORMS_LAYOUT = computeStructLayout(SKYBOX_UNIFORMS_FIELDS)

/** Computed struct layout for the skybox VertexUniforms. */
export const SKYBOX_VERTEX_UNIFORMS_LAYOUT = computeStructLayout(SKYBOX_VERTEX_UNIFORMS_FIELDS)

/**
 * Bind-group entry size for the SkyboxUniforms slot.
 *
 * Held at 512 bytes for backward compatibility with the historical
 * allocation pattern. The actual struct only requires
 * `SKYBOX_UNIFORMS_LAYOUT.totalSize` bytes; the trailing region is unused.
 * Keeping the historical size avoids any subtle bind-group-size visibility
 * change at the WGSL level.
 */
export const SKYBOX_UNIFORMS_BIND_SIZE = 512

/** Bind-group entry size for the skybox VertexUniforms slot. */
export const SKYBOX_VERTEX_UNIFORMS_BIND_SIZE = 256

/** Byte offset at which the VertexUniforms slot begins inside the shared GPU buffer. */
export const SKYBOX_VERTEX_UNIFORMS_OFFSET = SKYBOX_UNIFORMS_BIND_SIZE

/** Total skybox uniform GPU buffer size (fragment + vertex slots). */
export const SKYBOX_TOTAL_BUFFER_SIZE = SKYBOX_UNIFORMS_BIND_SIZE + SKYBOX_VERTEX_UNIFORMS_BIND_SIZE
