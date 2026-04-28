/**
 * Pure-function tests for skybox CPU helpers (no GPU API, no shader).
 *
 * These functions pack uniforms read by the skybox WGSL shaders. Bugs here
 * silently break the on-screen background; the production code path runs once
 * per frame so a regression would surface as washed-out colors or stuck
 * animation rather than a hard error.
 */
import { describe, expect, it } from 'vitest'

import {
  computeSkyboxAnimationEffects,
  generateSkyboxCubeVertices,
  mapSkyboxModeToShader,
  modeToNumeric,
  packSkyboxCoreUniforms,
  packSkyboxModeSettings,
  packSkyboxPalette,
  packSkyboxPrecomputedPalettes,
  writeVec3,
} from '@/rendering/webgpu/renderers/skyboxVertexData'

describe('mapSkyboxModeToShader', () => {
  it('maps each procedural_* prefix to its shader identifier', () => {
    expect(mapSkyboxModeToShader('procedural_aurora')).toBe('aurora')
    expect(mapSkyboxModeToShader('procedural_nebula')).toBe('nebula')
    expect(mapSkyboxModeToShader('procedural_crystalline')).toBe('crystalline')
    expect(mapSkyboxModeToShader('procedural_horizon')).toBe('horizon')
    expect(mapSkyboxModeToShader('procedural_ocean')).toBe('ocean')
    expect(mapSkyboxModeToShader('procedural_twilight')).toBe('twilight')
  })

  it('passes through classic and falls back to classic for unknown', () => {
    expect(mapSkyboxModeToShader('classic')).toBe('classic')
    // The default branch protects against new SkyboxMode values being added
    // upstream without the mapper being updated — would silently render the
    // wrong shader otherwise.
    expect(mapSkyboxModeToShader('garbage' as never)).toBe('classic')
  })
})

describe('modeToNumeric', () => {
  it('encodes shader mode strings into the integer values the WGSL switch reads', () => {
    expect(modeToNumeric('classic')).toBe(0)
    expect(modeToNumeric('aurora')).toBe(1)
    expect(modeToNumeric('nebula')).toBe(2)
    expect(modeToNumeric('crystalline')).toBe(4)
    expect(modeToNumeric('horizon')).toBe(5)
    expect(modeToNumeric('ocean')).toBe(6)
    expect(modeToNumeric('twilight')).toBe(7)
  })

  it('returns 0 (classic) for any value the switch does not recognize', () => {
    // 3 is intentionally skipped between nebula(2) and crystalline(4) — the
    // packing layout used to include a removed "starfield" mode at slot 3 and
    // the WGSL switch still expects the gap. A regression that re-renumbered
    // would scramble every running scene.
    expect(modeToNumeric('starfield' as never)).toBe(0)
  })
})

describe('writeVec3', () => {
  it('writes 3 floats from src starting at the given offset', () => {
    const buf = new Float32Array(8)
    writeVec3(buf, 2, [1, 2, 3], 0, 0, 0)
    expect(Array.from(buf)).toEqual([0, 0, 1, 2, 3, 0, 0, 0])
  })

  it('substitutes per-component defaults when src is undefined', () => {
    const buf = new Float32Array(4)
    writeVec3(buf, 0, undefined, 7, 8, 9)
    expect(Array.from(buf.subarray(0, 3))).toEqual([7, 8, 9])
  })

  it('substitutes per-component defaults when individual entries are missing', () => {
    const buf = new Float32Array(4)
    // Sparse arrays can leak through optional palette coefficient configs;
    // the per-component fallback must apply per-slot, not just when the whole
    // array is absent.
    writeVec3(buf, 0, [1] as number[], 0.5, 0.6, 0.7)
    expect(buf[0]).toBe(1)
    expect(buf[1]).toBeCloseTo(0.6)
    expect(buf[2]).toBeCloseTo(0.7)
  })
})

/**
 * Named slot indices for the skybox uniform layout. Mirrors the layout
 * documented in `skyboxVertexData.ts` so a future packing-layout change
 * surfaces as a single-edit failure here instead of dozens of magic-number
 * mismatches scattered across these tests.
 */
const SKYBOX_SLOT = {
  // Core uniforms (16 floats, slots 0-15)
  shaderMode: 0,
  time: 1,
  intensity: 2,
  hue: 3,
  saturation: 4,
  scale: 5,
  complexity: 6,
  timeScale: 7,
  evolution: 8,
  pad9: 9,
  animDistortion: 10,
  turbulence: 12,
  dualToneContrast: 13,
  sunIntensity: 14,
  // Mode settings (slots 40-51)
  sunPositionX: 40,
  sunPositionY: 41,
  sunPositionZ: 42,
  auroraCurtainHeight: 44,
  auroraWaveFrequency: 45,
  horizonGradientContrast: 46,
  horizonSpotlightFocus: 47,
  oceanCausticIntensity: 48,
  oceanDepthGradient: 49,
  oceanBubbleDensity: 50,
  oceanSurfaceShimmer: 51,
  // Palette coefficient slots
  paletteA0: 16,
  paletteA1: 20,
  paletteB0: 24,
  paletteB1: 28,
  paletteC0: 32,
  paletteC1: 33,
  paletteC2: 34,
  paletteD0: 36,
  paletteD1: 37,
  paletteD2: 38,
  // Precomputed palette samples
  precomputedAurora0: 52,
  precomputedAurora1: 53,
  precomputedAurora2: 54,
  precomputedAuroraPad: 55,
  precomputedHorizonFloor0: 80,
} as const

describe('packSkyboxCoreUniforms', () => {
  it('writes shaderMode/time/intensity/hue + per-setting defaults at slots 0-14', () => {
    const buf = new Float32Array(16)
    packSkyboxCoreUniforms(buf, 'aurora', undefined, 1.5, 0.8, 0.4, 0.2)
    expect(buf[SKYBOX_SLOT.shaderMode]).toBe(1) // aurora numeric
    expect(buf[SKYBOX_SLOT.time]).toBeCloseTo(1.5)
    expect(buf[SKYBOX_SLOT.intensity]).toBeCloseTo(0.8)
    expect(buf[SKYBOX_SLOT.hue]).toBeCloseTo(0.4)
    expect(buf[SKYBOX_SLOT.saturation]).toBe(1.0)
    expect(buf[SKYBOX_SLOT.scale]).toBe(1.0)
    expect(buf[SKYBOX_SLOT.complexity]).toBe(0.5)
    expect(buf[SKYBOX_SLOT.timeScale]).toBeCloseTo(0.2, 6)
    expect(buf[SKYBOX_SLOT.evolution]).toBe(0.0)
    expect(buf[SKYBOX_SLOT.animDistortion]).toBeCloseTo(0.2, 6)
    expect(buf[SKYBOX_SLOT.turbulence]).toBeCloseTo(0.3, 6)
    expect(buf[SKYBOX_SLOT.dualToneContrast]).toBe(0.5)
    expect(buf[SKYBOX_SLOT.sunIntensity]).toBe(0.0)
    // Slot 9 is intentionally left zero — it's a packing pad.
    expect(buf[SKYBOX_SLOT.pad9]).toBe(0)
  })

  it('uses provided settings instead of defaults when present', () => {
    const buf = new Float32Array(16)
    packSkyboxCoreUniforms(
      buf,
      'classic',
      {
        saturation: 0.7,
        scale: 2.0,
        complexity: 0.9,
        timeScale: 0.05,
        evolution: 0.3,
        turbulence: 0.6,
        dualToneContrast: 0.8,
        sunIntensity: 0.4,
      } as never,
      0,
      1,
      0,
      0
    )
    expect(buf[SKYBOX_SLOT.saturation]).toBeCloseTo(0.7)
    expect(buf[SKYBOX_SLOT.scale]).toBe(2.0)
    expect(buf[SKYBOX_SLOT.complexity]).toBeCloseTo(0.9)
    expect(buf[SKYBOX_SLOT.timeScale]).toBeCloseTo(0.05)
    expect(buf[SKYBOX_SLOT.evolution]).toBeCloseTo(0.3)
    expect(buf[SKYBOX_SLOT.turbulence]).toBeCloseTo(0.6)
    expect(buf[SKYBOX_SLOT.dualToneContrast]).toBeCloseTo(0.8)
    expect(buf[SKYBOX_SLOT.sunIntensity]).toBeCloseTo(0.4)
  })
})

describe('packSkyboxModeSettings', () => {
  it('uses default sun position [10,10,10] and zero feature settings when settings absent', () => {
    const buf = new Float32Array(64)
    packSkyboxModeSettings(buf, undefined)
    expect(buf[SKYBOX_SLOT.sunPositionX]).toBe(10)
    expect(buf[SKYBOX_SLOT.sunPositionY]).toBe(10)
    expect(buf[SKYBOX_SLOT.sunPositionZ]).toBe(10)
    expect(buf[SKYBOX_SLOT.auroraCurtainHeight]).toBe(0.5)
    expect(buf[SKYBOX_SLOT.auroraWaveFrequency]).toBe(1.0)
    expect(buf[SKYBOX_SLOT.horizonGradientContrast]).toBe(0.5)
    expect(buf[SKYBOX_SLOT.horizonSpotlightFocus]).toBe(0.5)
    expect(buf[SKYBOX_SLOT.oceanCausticIntensity]).toBe(0.5)
    expect(buf[SKYBOX_SLOT.oceanDepthGradient]).toBe(0.5)
    expect(buf[SKYBOX_SLOT.oceanBubbleDensity]).toBeCloseTo(0.3)
    expect(buf[SKYBOX_SLOT.oceanSurfaceShimmer]).toBeCloseTo(0.4)
  })

  it('overrides defaults from nested mode settings', () => {
    const buf = new Float32Array(64)
    packSkyboxModeSettings(buf, {
      sunPosition: [3, 4, 5],
      aurora: { curtainHeight: 0.1, waveFrequency: 2.5 },
      horizonGradient: { gradientContrast: 0.9, spotlightFocus: 0.2 },
      ocean: {
        causticIntensity: 0.1,
        depthGradient: 0.7,
        bubbleDensity: 0.8,
        surfaceShimmer: 0.05,
      },
    } as never)
    expect(buf[SKYBOX_SLOT.sunPositionX]).toBe(3)
    expect(buf[SKYBOX_SLOT.auroraCurtainHeight]).toBeCloseTo(0.1)
    expect(buf[SKYBOX_SLOT.auroraWaveFrequency]).toBe(2.5)
    expect(buf[SKYBOX_SLOT.horizonGradientContrast]).toBeCloseTo(0.9)
    expect(buf[SKYBOX_SLOT.horizonSpotlightFocus]).toBeCloseTo(0.2)
    expect(buf[SKYBOX_SLOT.oceanCausticIntensity]).toBeCloseTo(0.1)
    expect(buf[SKYBOX_SLOT.oceanDepthGradient]).toBeCloseTo(0.7)
    expect(buf[SKYBOX_SLOT.oceanBubbleDensity]).toBeCloseTo(0.8)
    expect(buf[SKYBOX_SLOT.oceanSurfaceShimmer]).toBeCloseTo(0.05)
  })
})

describe('packSkyboxPalette', () => {
  it('falls back to default palette coefficients when none provided', () => {
    const buf = new Float32Array(40)
    packSkyboxPalette(buf, undefined)
    // a coeffs at slot 16 and slot 24
    expect(buf[SKYBOX_SLOT.paletteA0]).toBe(0.5)
    expect(buf[SKYBOX_SLOT.paletteB0]).toBe(0.5)
    // c coeffs at slot 32 default to (1,1,1)
    expect(buf[SKYBOX_SLOT.paletteC0]).toBe(1.0)
    expect(buf[SKYBOX_SLOT.paletteC1]).toBe(1.0)
    expect(buf[SKYBOX_SLOT.paletteC2]).toBe(1.0)
    // d coeffs at slot 36 default to (0, 0.33, 0.67)
    expect(buf[SKYBOX_SLOT.paletteD0]).toBe(0.0)
    expect(buf[SKYBOX_SLOT.paletteD1]).toBeCloseTo(0.33)
    expect(buf[SKYBOX_SLOT.paletteD2]).toBeCloseTo(0.67)
  })

  it('writes provided palette coefficients verbatim', () => {
    const buf = new Float32Array(40)
    packSkyboxPalette(buf, {
      a: [0.1, 0.2, 0.3],
      b: [0.4, 0.5, 0.6],
      c: [0.7, 0.8, 0.9],
      d: [0.11, 0.12, 0.13],
    })
    expect(buf[SKYBOX_SLOT.paletteA0]).toBeCloseTo(0.1)
    expect(buf[SKYBOX_SLOT.paletteA1]).toBeCloseTo(0.4)
    expect(buf[SKYBOX_SLOT.paletteB0]).toBeCloseTo(0.1)
    expect(buf[SKYBOX_SLOT.paletteB1]).toBeCloseTo(0.4)
    expect(buf[SKYBOX_SLOT.paletteC0]).toBeCloseTo(0.7)
    expect(buf[SKYBOX_SLOT.paletteD0]).toBeCloseTo(0.11)
  })
})

describe('packSkyboxPrecomputedPalettes', () => {
  it('writes precomputed palette samples at the documented slots', () => {
    const buf = new Float32Array(108)
    packSkyboxPrecomputedPalettes(buf, undefined, 0)
    // With t=0, tempPulse=0 and tempShift=0.5. Aurora sample at slot 52
    // should be cosinePalette(0.8) with default coefficients (a=0.5, b=0.5,
    // c=1, d=0.0/0.33/0.67). At t=0.8 each component is 0.5 + 0.5*cos(2π*(0.8 + d_i)).
    const expected0 = 0.5 + 0.5 * Math.cos(2 * Math.PI * (0.8 + 0))
    const expected1 = 0.5 + 0.5 * Math.cos(2 * Math.PI * (0.8 + 0.33))
    const expected2 = 0.5 + 0.5 * Math.cos(2 * Math.PI * (0.8 + 0.67))
    expect(buf[SKYBOX_SLOT.precomputedAurora0]).toBeCloseTo(expected0, 4)
    expect(buf[SKYBOX_SLOT.precomputedAurora1]).toBeCloseTo(expected1, 4)
    expect(buf[SKYBOX_SLOT.precomputedAurora2]).toBeCloseTo(expected2, 4)
    // Slot 55 is vec3 padding — must remain 0 from initialization.
    expect(buf[SKYBOX_SLOT.precomputedAuroraPad]).toBe(0)
  })

  it('shifts horizon samples by tempPulse derived from effectiveTime', () => {
    const buf = new Float32Array(108)
    // effectiveTime = π/0.12 makes sin(effectiveTime*0.12) = 0, so tempPulse
    // contribution from the first sin is zero. Use a value where tempPulse !=
    // 0 to drive a non-trivial horizon shift.
    packSkyboxPrecomputedPalettes(buf, undefined, 5)
    // floor sample at slot 80 evaluates cosinePalette(0.1 + tempPulse*0.1)
    const tempPulse = Math.sin(5 * 0.12) * 0.08 + Math.sin(5 * 0.07) * 0.04
    const t = 0.1 + tempPulse * 0.1
    const expected = 0.5 + 0.5 * Math.cos(2 * Math.PI * (t + 0))
    expect(buf[SKYBOX_SLOT.precomputedHorizonFloor0]).toBeCloseTo(expected, 4)
  })
})

describe('computeSkyboxAnimationEffects', () => {
  it('returns the inert default when not playing', () => {
    const r = computeSkyboxAnimationEffects(false, 'classic', 'cinematic', 1)
    expect(r).toEqual({ rotX: 0, rotY: 0, rotZ: 0, hue: 0, intensityMul: 1.0, distortion: 0 })
  })

  it('returns the inert default when storeMode is not classic', () => {
    // The animation effects only modulate the classic mode — procedural skies
    // already animate inside the shader.
    const r = computeSkyboxAnimationEffects(true, 'procedural_ocean', 'cinematic', 1)
    expect(r).toEqual({ rotX: 0, rotY: 0, rotZ: 0, hue: 0, intensityMul: 1.0, distortion: 0 })
  })

  it('returns the inert default when animationMode is none', () => {
    const r = computeSkyboxAnimationEffects(true, 'classic', 'none', 1)
    expect(r.rotX).toBe(0)
    expect(r.rotY).toBe(0)
    expect(r.distortion).toBe(0)
  })

  it('cinematic: drives rotY linearly and rotX/rotZ via small-amplitude trig', () => {
    const t = 4
    const r = computeSkyboxAnimationEffects(true, 'classic', 'cinematic', t)
    expect(r.rotY).toBeCloseTo(t * 0.1)
    expect(r.rotX).toBeCloseTo(Math.sin(t * 0.5) * 0.005)
    expect(r.rotZ).toBeCloseTo(Math.cos(t * 0.3) * 0.003)
  })

  it('heatwave: distortion oscillates above 1 with sin(t*0.5)*0.5', () => {
    const t = 0
    const r = computeSkyboxAnimationEffects(true, 'classic', 'heatwave', t)
    expect(r.distortion).toBeCloseTo(1.0)
    expect(r.rotY).toBe(0)
  })

  it('tumble: independent linear rotations on all 3 axes', () => {
    const t = 2
    const r = computeSkyboxAnimationEffects(true, 'classic', 'tumble', t)
    expect(r.rotX).toBeCloseTo(t * 0.05)
    expect(r.rotY).toBeCloseTo(t * 0.07)
    expect(r.rotZ).toBeCloseTo(t * 0.03)
  })

  it('ethereal: small hue drift + intensity flicker', () => {
    const t = 1
    const r = computeSkyboxAnimationEffects(true, 'classic', 'ethereal', t)
    expect(r.rotY).toBeCloseTo(t * 0.05)
    expect(r.hue).toBeCloseTo(Math.sin(t * 0.1) * 0.1)
    expect(r.intensityMul).toBeCloseTo(1.0 + Math.sin(t * 10) * 0.02)
  })

  it('nebula: hue cycles modulo 1 to keep wraparound smooth', () => {
    const t = 25 // (25 * 0.05) % 1 = 0.25
    const r = computeSkyboxAnimationEffects(true, 'classic', 'nebula', t)
    expect(r.hue).toBeCloseTo(0.25, 6)
    expect(r.intensityMul).toBeCloseTo(1.1)
  })

  it('unknown animationMode produces no rotations and unchanged intensity', () => {
    const r = computeSkyboxAnimationEffects(true, 'classic', 'unknown', 1)
    expect(r.rotX).toBe(0)
    expect(r.rotY).toBe(0)
    expect(r.intensityMul).toBe(1.0)
  })
})

describe('generateSkyboxCubeVertices', () => {
  it('produces 36 vertices × 3 components = 108 floats', () => {
    expect(generateSkyboxCubeVertices().length).toBe(108)
  })

  it('all components have magnitude == size (unit cube at origin)', () => {
    const buf = generateSkyboxCubeVertices(0.7)
    for (const v of buf) expect(Math.abs(v)).toBeCloseTo(0.7)
  })

  it('default size is 1', () => {
    const buf = generateSkyboxCubeVertices()
    for (const v of buf) expect(Math.abs(v)).toBe(1)
  })
})
