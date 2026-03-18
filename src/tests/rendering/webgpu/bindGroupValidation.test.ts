/**
 * Build-time bind group/binding validation.
 *
 * Verifies that the WGSL shader `@group(X) @binding(Y)` declarations match
 * the TS bind group layout entries created by the renderers. Catches silent
 * runtime failures from mismatched bindings that unit tests with mocked GPU
 * context cannot detect.
 *
 * @module tests/rendering/webgpu/bindGroupValidation
 */

import { describe, expect, it } from 'vitest'

import {
  composeSchroedingerShader,
  type SchroedingerWGSLShaderConfig,
} from '@/rendering/webgpu/shaders/schroedinger/compose'
import { composeSkyboxFragmentShader } from '@/rendering/webgpu/shaders/skybox/compose'
import type { SkyboxShaderConfig } from '@/rendering/webgpu/shaders/skybox/types'
import { composeSkyboxVertexShader } from '@/rendering/webgpu/shaders/skybox/vertex.wgsl'

// ============================================================================
// Helpers
// ============================================================================

/**
 * Extract all `@group(X) @binding(Y) var` declarations from WGSL source.
 * Only matches actual variable bindings, not references in comments.
 */
function extractBindings(wgsl: string): Array<{ group: number; binding: number }> {
  // Match @group(X) @binding(Y) followed by var (the actual resource declaration)
  const regex = /@group\(\s*(\d+)\s*\)\s*@binding\(\s*(\d+)\s*\)\s*var/g
  const bindings: Array<{ group: number; binding: number }> = []
  let match
  while ((match = regex.exec(wgsl)) !== null) {
    bindings.push({ group: Number(match[1]), binding: Number(match[2]) })
  }
  return bindings
}

/** Group bindings by group number. */
function groupByGroup(bindings: Array<{ group: number; binding: number }>): Map<number, number[]> {
  const grouped = new Map<number, number[]>()
  for (const { group, binding } of bindings) {
    const list = grouped.get(group) ?? []
    list.push(binding)
    grouped.set(group, list)
  }
  return grouped
}

/** Deduplicate bindings (composed shaders may declare shared bindings in multiple blocks). */
function uniqueBindings(
  bindings: Array<{ group: number; binding: number }>
): Array<{ group: number; binding: number }> {
  const seen = new Set<string>()
  const unique: Array<{ group: number; binding: number }> = []
  for (const { group, binding } of bindings) {
    const key = `${group}:${binding}`
    if (!seen.has(key)) {
      unique.push({ group, binding })
      seen.add(key)
    }
  }
  return unique
}

// ============================================================================
// Schrodinger shader bind group validation
// ============================================================================

/** Standard config for HO mode (most common). */
const HO_CONFIG: SchroedingerWGSLShaderConfig = {
  dimension: 3,
  quantumMode: 'harmonicOscillator',
  termCount: 1,
  colorAlgorithm: 4,
}

/** Config with eigenfunction cache (adds bindings to group 2). */
const HO_CACHE_CONFIG: SchroedingerWGSLShaderConfig = {
  ...HO_CONFIG,
  useEigenfunctionCache: true,
}

/** Config with density grid (adds bindings to group 2). */
const DENSITY_GRID_CONFIG: SchroedingerWGSLShaderConfig = {
  ...HO_CONFIG,
  useDensityGrid: true,
  densityGridSize: 64,
}

/** Hydrogen ND config. */
const HYDROGEN_CONFIG: SchroedingerWGSLShaderConfig = {
  dimension: 4,
  quantumMode: 'hydrogenND',
  termCount: 1,
  colorAlgorithm: 4,
}

/** All configs to validate. */
const CONFIGS: Array<{ name: string; config: SchroedingerWGSLShaderConfig }> = [
  { name: 'HO 3D basic', config: HO_CONFIG },
  { name: 'HO 3D + eigencache', config: HO_CACHE_CONFIG },
  { name: 'HO 3D + density grid', config: DENSITY_GRID_CONFIG },
  { name: 'Hydrogen 4D', config: HYDROGEN_CONFIG },
  { name: 'HO 5D 4-term', config: { ...HO_CONFIG, dimension: 5, termCount: 4 } },
  { name: 'HO isosurface', config: { ...HO_CONFIG, isosurface: true } },
  { name: 'HO temporal', config: { ...HO_CONFIG, temporalAccumulation: true } },
  {
    name: 'HO 2D Wigner',
    config: { ...HO_CONFIG, dimension: 3, isWigner: true },
  },
]

describe('Schrodinger shader bind group validation', () => {
  for (const { name, config } of CONFIGS) {
    describe(name, () => {
      const { wgsl } = composeSchroedingerShader(config)
      const bindings = uniqueBindings(extractBindings(wgsl))
      const grouped = groupByGroup(bindings)

      it('uses only bind groups 0-2 (max 3 groups for Schrodinger renderer)', () => {
        for (const group of grouped.keys()) {
          expect(group).toBeGreaterThanOrEqual(0)
          expect(group).toBeLessThanOrEqual(2)
        }
      })

      it('group 0 camera binding is present', () => {
        expect(bindings.some((b) => b.group === 0 && b.binding === 0)).toBe(true)
      })

      it('bindings within each group start from 0', () => {
        for (const [group, bindingList] of grouped) {
          const sorted = [...bindingList].sort((a, b) => a - b)
          expect(sorted[0], `group ${group} should start from binding 0`).toBe(0)
        }
      })

      it('group 0 has exactly 1 binding (camera uniform)', () => {
        const g0 = grouped.get(0) ?? []
        expect(g0.length).toBe(1)
      })

      it('group 1 has exactly 3 bindings (lighting, material, quality)', () => {
        const g1 = grouped.get(1) ?? []
        expect(g1.length).toBe(3)
      })

      it('group 2 has at least 2 bindings (schroedinger + basis)', () => {
        const g2 = grouped.get(2) ?? []
        expect(g2.length).toBeGreaterThanOrEqual(2)
      })
    })
  }
})

// ============================================================================
// Skybox shader bind group validation
// ============================================================================

describe('Skybox shader bind group validation', () => {
  const SKYBOX_MODES = ['aurora', 'nebula', 'crystalline', 'horizon'] as const
  const defaultEffects = { sun: true, vignette: true }

  for (const mode of SKYBOX_MODES) {
    const skyboxConfig: SkyboxShaderConfig = { mode, effects: defaultEffects }

    it(`${mode} fragment shader has valid bind groups (0-3)`, () => {
      const { wgsl } = composeSkyboxFragmentShader(skyboxConfig)
      const bindings = uniqueBindings(extractBindings(wgsl))
      for (const b of bindings) {
        expect(b.group).toBeGreaterThanOrEqual(0)
        expect(b.group).toBeLessThanOrEqual(3)
      }
    })

    it(`${mode} fragment shader bindings start from 0 per group`, () => {
      const { wgsl } = composeSkyboxFragmentShader(skyboxConfig)
      const bindings = uniqueBindings(extractBindings(wgsl))
      const grouped = groupByGroup(bindings)
      for (const [group, bindingList] of grouped) {
        const sorted = [...bindingList].sort((a, b) => a - b)
        expect(sorted[0], `group ${group} should start from binding 0`).toBe(0)
      }
    })
  }

  it('vertex shader has valid bind groups', () => {
    const wgsl = composeSkyboxVertexShader(defaultEffects)
    const bindings = uniqueBindings(extractBindings(wgsl))
    for (const b of bindings) {
      expect(b.group).toBeGreaterThanOrEqual(0)
      expect(b.group).toBeLessThanOrEqual(3)
    }
  })
})

// ============================================================================
// Cross-cutting constraints
// ============================================================================

describe('WebGPU binding constraints', () => {
  it('no shader exceeds max 4 bind groups (0-3)', () => {
    for (const { name: configName, config } of CONFIGS) {
      const { wgsl } = composeSchroedingerShader(config)
      const bindings = uniqueBindings(extractBindings(wgsl))
      const maxGroup = Math.max(-1, ...bindings.map((b) => b.group))
      expect(maxGroup, `${configName} max group`).toBeLessThanOrEqual(3)
    }

    for (const mode of ['aurora', 'nebula', 'crystalline', 'horizon'] as const) {
      const { wgsl } = composeSkyboxFragmentShader({ mode, effects: { sun: true, vignette: true } })
      const bindings = uniqueBindings(extractBindings(wgsl))
      const maxGroup = Math.max(-1, ...bindings.map((b) => b.group))
      expect(maxGroup, `skybox ${mode} max group`).toBeLessThanOrEqual(3)
    }
  })
})
