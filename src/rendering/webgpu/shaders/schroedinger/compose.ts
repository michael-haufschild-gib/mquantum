/**
 * Schrödinger WGSL Shader Composer
 *
 * Assembles complete Schrödinger fragment shader from modular blocks.
 * Port of GLSL compose.ts to WGSL.
 *
 * @module rendering/webgpu/shaders/schroedinger/compose
 */

import {
  assembleShaderBlocks,
  generateObjectBindGroup,
  generateStandardBindGroups,
  type WGSLShaderConfig,
} from '../shared/compose-helpers'

// Core blocks
import { constantsBlock } from '../shared/core/constants.wgsl'
import { uniformsBlock } from '../shared/core/uniforms.wgsl'

// Color blocks
import { cosinePaletteBlock } from '../shared/color/cosine-palette.wgsl'
import { hslBlock } from '../shared/color/hsl.wgsl'
import { selectorBlock } from '../shared/color/selector.wgsl'

// Schroedinger-specific blocks
import { schroedingerUniformsBlock } from './uniforms.wgsl'
import { mainBlock, mainBlockIsosurface } from './main.wgsl'

/** Quantum physics mode for Schrödinger visualization */
export type QuantumModeForShader = 'harmonicOscillator' | 'hydrogenOrbital' | 'hydrogenND'

/**
 * Schrödinger shader configuration options.
 */
export interface SchroedingerWGSLShaderConfig extends WGSLShaderConfig {
  /** Use isosurface mode instead of volumetric */
  isosurface?: boolean
  /** Use temporal accumulation */
  temporalAccumulation?: boolean
  /** Quantum mode */
  quantumMode?: QuantumModeForShader
  /** Number of HO superposition terms (1-8) */
  termCount?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8
}

/**
 * Compose complete Schrödinger fragment shader.
 */
export function composeSchroedingerShader(config: SchroedingerWGSLShaderConfig): {
  wgsl: string
  modules: string[]
  features: string[]
} {
  const {
    dimension,
    isosurface = false,
    quantumMode = 'harmonicOscillator',
    overrides = [],
  } = config

  const defines: string[] = []
  const features: string[] = []

  // Add dimension define
  defines.push(`const DIMENSION: i32 = ${dimension};`)
  features.push(`${dimension}D Quantum`)

  // Add quantum mode define
  if (quantumMode === 'hydrogenOrbital') {
    defines.push('const HYDROGEN_MODE: bool = true;')
    features.push('Hydrogen Orbital')
  } else if (quantumMode === 'hydrogenND') {
    defines.push('const HYDROGEN_ND_MODE: bool = true;')
    features.push('Hydrogen ND')
  } else {
    defines.push('const HO_MODE: bool = true;')
    features.push('Harmonic Oscillator')
  }

  if (isosurface) {
    features.push('Isosurface Mode')
  } else {
    features.push('Volumetric Mode')
  }

  // Select main block based on mode
  const selectedMainBlock = isosurface ? mainBlockIsosurface : mainBlock

  // Build blocks array
  const blocks = [
    // Vertex inputs
    {
      name: 'Vertex Inputs',
      content: /* wgsl */ `
struct VertexOutput {
  @builtin(position) clipPosition: vec4f,
  @location(0) vPosition: vec3f,
}
`,
    },

    // Defines
    { name: 'Defines', content: defines.join('\n') },

    // Core
    { name: 'Constants', content: constantsBlock },
    { name: 'Shared Uniforms', content: uniformsBlock },

    // Bind groups
    { name: 'Standard Bind Groups', content: generateStandardBindGroups() },
    {
      name: 'Schrödinger Uniforms',
      content:
        schroedingerUniformsBlock +
        '\n' +
        generateObjectBindGroup(4, 'SchroedingerUniforms', 'schroedinger') +
        '\n' +
        generateObjectBindGroup(4, 'BasisVectors', 'basis'),
    },

    // Color
    { name: 'Color (HSL)', content: hslBlock },
    { name: 'Color (Cosine)', content: cosinePaletteBlock },
    { name: 'Color Selector', content: selectorBlock },

    // Main shader
    { name: 'Main', content: selectedMainBlock },
  ]

  // Assemble
  const { wgsl, modules } = assembleShaderBlocks(
    blocks,
    overrides.map((o) => ({ target: o.target, replacement: o.replacement }))
  )

  return { wgsl, modules, features }
}

/**
 * Create vertex shader for Schrödinger rendering.
 */
export function composeSchroedingerVertexShader(): string {
  return /* wgsl */ `
// Schrödinger Vertex Shader
// Transforms vertices for volume raymarching

struct CameraUniforms {
  viewMatrix: mat4x4f,
  projectionMatrix: mat4x4f,
  viewProjectionMatrix: mat4x4f,
  inverseViewMatrix: mat4x4f,
  inverseProjectionMatrix: mat4x4f,
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
}

struct VertexOutput {
  @builtin(position) clipPosition: vec4f,
  @location(0) vPosition: vec3f,
}

@vertex
fn main(input: VertexInput) -> VertexOutput {
  var output: VertexOutput;

  // World position (model matrix assumed identity)
  let worldPos = input.position;
  output.vPosition = worldPos;

  // Clip position
  output.clipPosition = camera.viewProjectionMatrix * vec4f(worldPos, 1.0);

  return output;
}
`
}
