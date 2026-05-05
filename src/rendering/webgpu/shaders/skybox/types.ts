/**
 * Skybox types for WebGPU shaders.
 */

/** Procedural skybox rendering mode that determines the atmosphere shader. */
export type SkyboxMode =
  | 'classic'
  | 'aurora'
  | 'nebula'
  | 'crystalline'
  | 'horizon'
  | 'ocean'
  | 'twilight'

/** Toggleable visual effects layered on top of the skybox base mode. */
export interface SkyboxEffects {
  sun: boolean
  vignette: boolean
}

/** Full configuration for composing a skybox WGSL shader from mode, effects, and overrides. */
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
