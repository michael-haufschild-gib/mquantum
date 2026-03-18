/** Diagnostic metadata for a compiled shader pair, used by the performance monitor. */
export interface ShaderDebugInfo {
  name: string
  vertexShaderLength: number
  fragmentShaderLength: number
  activeModules: string[]
  features: string[]
}
