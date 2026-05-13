/**
 * Skybox uniform struct layout validation.
 *
 * The TypeScript layouts in `skyboxLayout.ts` are the source of truth for
 * byte offsets used by `WebGPUSkyboxRenderer.ts` and `skyboxVertexData.ts`.
 * The WGSL structs in `shaders/skybox/core/uniforms.wgsl.ts` and
 * `shaders/skybox/vertex.wgsl.ts` are the source of truth for what the
 * shader reads. If these drift, the shader silently reads garbage from the
 * wrong slot and skybox rendering breaks across all 7 procedural modes.
 *
 * This test parses both WGSL struct texts and asserts that:
 * 1. Every WGSL field has a matching TypeScript field (same name, order).
 * 2. Every field's WGSL type maps to the same `WGSLFieldType` as the TS layout.
 * 3. Every field's computed byte offset matches.
 * 4. The total struct size fits within the bind-group entry size used at
 *    runtime (`SKYBOX_UNIFORMS_BIND_SIZE`, `SKYBOX_VERTEX_UNIFORMS_BIND_SIZE`).
 *
 * The WGSL parser also handles `mat4x4<f32>` and `mat3x3<f32>` matrix types
 * — these are modelled in the TS layout as `array<vec4f, N>` because WGSL
 * gives them identical alignment, stride, and size.
 */

import { describe, expect, it } from 'vitest'

import {
  SKYBOX_TOTAL_BUFFER_SIZE,
  SKYBOX_UNIFORMS_BIND_SIZE,
  SKYBOX_UNIFORMS_LAYOUT,
  SKYBOX_VERTEX_UNIFORMS_BIND_SIZE,
  SKYBOX_VERTEX_UNIFORMS_LAYOUT,
  SKYBOX_VERTEX_UNIFORMS_OFFSET,
} from '@/rendering/webgpu/renderers/skyboxLayout'
import { uniformStructBlock } from '@/rendering/webgpu/shaders/skybox/core/uniforms.wgsl'
import { vertexUniformsBlock } from '@/rendering/webgpu/shaders/skybox/vertex.wgsl'
import { computeStructLayout, type StructFieldDef } from '@/rendering/webgpu/utils/structLayout'
import { parseStructFields, typesEqual } from '@/tests/rendering/webgpu/utils/wgslStructParser'

// ---------------------------------------------------------------------------
// SkyboxUniforms tests
// ---------------------------------------------------------------------------

describe('SkyboxUniforms WGSL validation', () => {
  const wgslFields = parseStructFields(uniformStructBlock, 'SkyboxUniforms')
  const tsLayout = SKYBOX_UNIFORMS_LAYOUT

  it('parses a non-trivial number of fields from the WGSL struct', () => {
    // SkyboxUniforms has 60+ named fields once pads/hoist samples are counted.
    expect(wgslFields.length).toBeGreaterThan(40)
  })

  it('has the same number of fields as the WGSL struct', () => {
    expect(tsLayout.fields.length).toBe(wgslFields.length)
  })

  it('has identical field names in declaration order', () => {
    const tsNames = tsLayout.fields.map((f) => f.name)
    const wgslNames = wgslFields.map((f) => f.name)
    expect(tsNames).toEqual(wgslNames)
  })

  it('has identical field types for every field', () => {
    for (let i = 0; i < wgslFields.length; i++) {
      const ts = tsLayout.fields[i]!
      const wgsl = wgslFields[i]!
      expect(
        typesEqual(ts.type, wgsl.type),
        `Field "${ts.name}" type mismatch: TS=${JSON.stringify(ts.type)}, WGSL=${JSON.stringify(wgsl.type)}`
      ).toBe(true)
    }
  })

  it('computes identical byte offsets from WGSL-parsed fields', () => {
    const wgslDefs: StructFieldDef[] = wgslFields.map((f) => ({
      name: f.name,
      type: f.type,
    }))
    const wgslLayout = computeStructLayout(wgslDefs)

    for (let i = 0; i < wgslLayout.fields.length; i++) {
      const wgsl = wgslLayout.fields[i]!
      const ts = tsLayout.fields[i]!
      expect(wgsl.offset, `Offset mismatch for "${ts.name}"`).toBe(ts.offset)
    }
    expect(wgslLayout.totalSize).toBe(tsLayout.totalSize)
  })

  it('matches the runtime float-index slots used by skyboxVertexData.ts', () => {
    // Spot-check the float indices that the legacy raw-magic-number packing
    // code (now migrated) relied on. If any of these drift, every skybox
    // mode silently breaks because the shader reads from the wrong slot.
    const expectedIndex: Record<string, number> = {
      mode: 0,
      time: 1,
      intensity: 2,
      hue: 3,
      saturation: 4,
      scale: 5,
      complexity: 6,
      timeScale: 7,
      evolution: 8,
      distortion: 10,
      turbulence: 12,
      dualTone: 13,
      sunIntensity: 14,
      color1: 16,
      color2: 20,
      palA: 24,
      palB: 28,
      palC: 32,
      palD: 36,
      sunPosition: 40,
      auroraCurtainHeight: 44,
      auroraWaveFrequency: 45,
      horizonGradientContrast: 46,
      horizonSpotlightFocus: 47,
      oceanCausticIntensity: 48,
      oceanDepthGradient: 49,
      oceanBubbleDensity: 50,
      oceanSurfaceShimmer: 51,
      auroraTopColor: 52,
      crystallineShimmerColor: 56,
      nebulaDeepColor: 60,
      nebulaKnotColor: 64,
      oceanDeepPalette: 68,
      oceanMidPalette: 72,
      oceanSurfacePalette: 76,
      horizonFloorColor: 80,
      horizonHorizonColor: 84,
      horizonMidColor: 88,
      horizonTopColor: 92,
      horizonSweepColor: 96,
      twilightHorizonColor: 100,
      twilightSunColor: 104,
    }
    for (const [name, expected] of Object.entries(expectedIndex)) {
      expect(tsLayout.index[name as keyof typeof tsLayout.index], `float index for ${name}`).toBe(
        expected
      )
    }
  })

  it('exposes float indices as byteOffset / 4', () => {
    for (const f of tsLayout.fields) {
      expect(tsLayout.index[f.name as keyof typeof tsLayout.index]).toBe(f.offset / 4)
    }
  })

  it('total size fits within the bind-group entry size', () => {
    // The bind group entry exposes SKYBOX_UNIFORMS_BIND_SIZE bytes to the
    // shader; the actual struct must fit inside that window.
    expect(tsLayout.totalSize).toBeLessThanOrEqual(SKYBOX_UNIFORMS_BIND_SIZE)
  })
})

// ---------------------------------------------------------------------------
// VertexUniforms tests
// ---------------------------------------------------------------------------

describe('Skybox VertexUniforms WGSL validation', () => {
  const wgslFields = parseStructFields(vertexUniformsBlock, 'VertexUniforms')
  const tsLayout = SKYBOX_VERTEX_UNIFORMS_LAYOUT

  it('parses the four matrix fields from the WGSL struct', () => {
    expect(wgslFields.length).toBe(4)
    expect(wgslFields.map((f) => f.name)).toEqual([
      'modelMatrix',
      'modelViewMatrix',
      'projectionMatrix',
      'rotationMatrix',
    ])
  })

  it('has the same number of fields as the WGSL struct', () => {
    expect(tsLayout.fields.length).toBe(wgslFields.length)
  })

  it('has identical field types after mat→vec4-array normalisation', () => {
    for (let i = 0; i < wgslFields.length; i++) {
      const ts = tsLayout.fields[i]!
      const wgsl = wgslFields[i]!
      expect(
        typesEqual(ts.type, wgsl.type),
        `Field "${ts.name}" type mismatch: TS=${JSON.stringify(ts.type)}, WGSL=${JSON.stringify(wgsl.type)}`
      ).toBe(true)
    }
  })

  it('computes identical byte offsets from WGSL-parsed fields', () => {
    const wgslDefs: StructFieldDef[] = wgslFields.map((f) => ({
      name: f.name,
      type: f.type,
    }))
    const wgslLayout = computeStructLayout(wgslDefs)

    for (let i = 0; i < wgslLayout.fields.length; i++) {
      const wgsl = wgslLayout.fields[i]!
      const ts = tsLayout.fields[i]!
      expect(wgsl.offset, `Offset mismatch for "${ts.name}"`).toBe(ts.offset)
    }
    expect(wgslLayout.totalSize).toBe(tsLayout.totalSize)
  })

  it('matches the runtime float-index slots used by updateVertexUniforms', () => {
    // The migrated WebGPUSkyboxRenderer.updateVertexUniforms writes:
    //   modelMatrix      at index 0  (floats 0..15)
    //   modelViewMatrix  at index 16 (floats 16..31)
    //   projectionMatrix at index 32 (floats 32..47)
    //   rotationMatrix   at index 48 (floats 48..59)
    expect(tsLayout.index.modelMatrix).toBe(0)
    expect(tsLayout.index.modelViewMatrix).toBe(16)
    expect(tsLayout.index.projectionMatrix).toBe(32)
    expect(tsLayout.index.rotationMatrix).toBe(48)
  })

  it('total size fits within the bind-group entry size', () => {
    expect(tsLayout.totalSize).toBeLessThanOrEqual(SKYBOX_VERTEX_UNIFORMS_BIND_SIZE)
  })
})

// ---------------------------------------------------------------------------
// Buffer geometry sanity
// ---------------------------------------------------------------------------

describe('skybox uniform buffer geometry', () => {
  it('vertex slot offset matches the SkyboxUniforms slot size', () => {
    expect(SKYBOX_VERTEX_UNIFORMS_OFFSET).toBe(SKYBOX_UNIFORMS_BIND_SIZE)
  })

  it('total buffer size sums the two slot sizes', () => {
    expect(SKYBOX_TOTAL_BUFFER_SIZE).toBe(
      SKYBOX_UNIFORMS_BIND_SIZE + SKYBOX_VERTEX_UNIFORMS_BIND_SIZE
    )
  })
})
