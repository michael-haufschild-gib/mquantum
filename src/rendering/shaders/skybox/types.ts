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
}
