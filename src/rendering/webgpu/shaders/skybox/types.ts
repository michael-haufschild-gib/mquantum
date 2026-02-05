/**
 * Skybox types for WebGPU shaders
 * Port of: src/rendering/shaders/skybox/types.ts
 */

export type SkyboxMode =
  | 'classic'
  | 'aurora'
  | 'nebula'
  | 'crystalline'
  | 'horizon'
  | 'ocean'
  | 'twilight'

export interface SkyboxEffects {
  sun: boolean
  vignette: boolean
}

export interface SkyboxShaderConfig {
  mode: SkyboxMode
  effects: SkyboxEffects
  overrides?: string[]
  /** When false, shader outputs single color target instead of MRT (color+normal+worldPos). Default true. */
  mrt?: boolean
}

/**
 * Bind group layout indices for skybox shaders
 */
export const SKYBOX_BIND_GROUPS = {
  UNIFORMS: 0,
  TEXTURES: 1,
} as const

/**
 * Binding indices within each bind group
 */
export const SKYBOX_BINDINGS = {
  // Group 0: Uniforms
  UNIFORM_BUFFER: 0,
  // Group 1: Textures
  CUBE_TEXTURE: 0,
  CUBE_SAMPLER: 1,
} as const
