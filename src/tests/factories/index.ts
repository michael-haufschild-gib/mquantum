/**
 * Shared test factories for common test data construction.
 *
 * Centralizes config/state builders to eliminate duplication across test files
 * and make test intent clearer through semantic defaults.
 *
 * @module tests/factories
 */

import { vi } from 'vitest'

import type { SchroedingerQuantumMode } from '@/lib/geometry/extended/common'
import type { OpenQuantumConfig } from '@/lib/physics/openQuantum/types'
import { DEFAULT_OPEN_QUANTUM_CONFIG } from '@/lib/physics/openQuantum/types'
import type { WebGPURenderPass, WebGPURenderPassConfig } from '@/rendering/webgpu/core/types'

// ============================================================================
// Scene Pass Config
// ============================================================================

/** Scene pass configuration for test factory. */
export interface ScenePassConfig {
  objectType: 'schroedinger'
  dimension: number
  bloomEnabled: boolean
  antiAliasingMethod: 'none' | 'fxaa' | 'smaa'
  paperEnabled: boolean
  frameBlendingEnabled: boolean
  isosurface: boolean
  quantumMode: SchroedingerQuantumMode
  termCount: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8
  nodalEnabled: boolean
  phaseMaterialityEnabled: boolean
  interferenceEnabled: boolean
  uncertaintyBoundaryEnabled: boolean
  temporalReprojectionEnabled: boolean
  eigenfunctionCacheEnabled: boolean
  analyticalGradientEnabled: boolean
  fastEigenInterpolationEnabled: boolean
  representation: 'position' | 'momentum'
  openQuantumEnabled: boolean
  colorAlgorithm: string
  skyboxEnabled: boolean
  skyboxMode: string
  backgroundColor: string
}

/** Build a ScenePassConfig with sensible defaults. Override only what matters for the test. */
export function createScenePassConfig(overrides: Partial<ScenePassConfig> = {}): ScenePassConfig {
  return {
    objectType: 'schroedinger',
    dimension: 4,
    bloomEnabled: false,
    antiAliasingMethod: 'none',
    paperEnabled: false,
    frameBlendingEnabled: false,
    isosurface: false,
    quantumMode: 'harmonicOscillator',
    termCount: 1,
    nodalEnabled: false,
    phaseMaterialityEnabled: false,
    interferenceEnabled: false,
    uncertaintyBoundaryEnabled: false,
    temporalReprojectionEnabled: true,
    eigenfunctionCacheEnabled: true,
    analyticalGradientEnabled: true,
    fastEigenInterpolationEnabled: true,
    representation: 'position',
    openQuantumEnabled: false,
    colorAlgorithm: 'radialDistance',
    skyboxEnabled: false,
    skyboxMode: 'classic',
    backgroundColor: '#232323',
    ...overrides,
  }
}

// ============================================================================
// Render Graph Harness
// ============================================================================

/** Minimal render graph test harness that captures passes and resources. */
export function createGraphHarness() {
  const resources = new Map<string, Record<string, unknown>>()
  const passes: WebGPURenderPass[] = []

  const graph = {
    addResource: vi.fn((id: string, config: Record<string, unknown>) => {
      resources.set(id, config)
    }),
    addPass: vi.fn(async (pass: WebGPURenderPass) => {
      passes.push(pass)
    }),
  }

  return { graph, resources, passes }
}

/** Build a mock render pass from config. */
export function createMockPass(config: WebGPURenderPassConfig): WebGPURenderPass {
  return {
    id: config.id,
    config,
    initialize: vi.fn().mockResolvedValue(undefined),
    execute: vi.fn(),
    dispose: vi.fn(),
  }
}

// ============================================================================
// Open Quantum Config
// ============================================================================

/** Build an OpenQuantumConfig with sensible enabled defaults. */
export function createOpenQuantumConfig(
  overrides: Partial<OpenQuantumConfig> = {}
): OpenQuantumConfig {
  return {
    ...DEFAULT_OPEN_QUANTUM_CONFIG,
    enabled: true,
    ...overrides,
  }
}

// ============================================================================
// Light Config
// ============================================================================

/** Light configuration overrides for test factory. */
export interface LightOverrides {
  type?: 'point' | 'spot' | 'directional'
  intensity?: number
  color?: string
  position?: [number, number, number]
  rotation?: [number, number, number]
  coneAngle?: number
  penumbra?: number
  range?: number
  decay?: number
}

/** Build a light config for testing. */
export function createLightConfig(
  overrides: LightOverrides = {}
): LightOverrides & { type: string } {
  return {
    type: 'point',
    intensity: 1.0,
    color: '#FFFFFF',
    position: [0, 2, 0],
    rotation: [0, 0, 0],
    range: 10,
    decay: 1,
    ...overrides,
  }
}

// ============================================================================
// Shader Config
// ============================================================================

/** Shader configuration overrides for test factory. */
export interface ShaderConfigOverrides {
  dimension?: number
  quantumMode?: 'harmonicOscillator' | 'hydrogenND'
  termCount?: number
  colorAlgorithm?: number
  temporal?: boolean
  sss?: boolean
  nodal?: boolean
  uncertaintyBoundary?: boolean
  useEigenfunctionCache?: boolean
  useDensityGrid?: boolean
  densityGridSize?: number
}

/** Build a Schroedinger shader config with sensible defaults. */
export function createShaderConfig(overrides: ShaderConfigOverrides = {}) {
  return {
    dimension: 4,
    quantumMode: 'harmonicOscillator' as const,
    termCount: 1,
    colorAlgorithm: 4,
    temporal: false,
    sss: false,
    ...overrides,
  }
}
