/**
 * Phase 1c: ProfilingStrip enumerator.
 *
 * `profilingStrip` is a 6-boolean compile-time specialization used by the A/B
 * benchmark harness to measure GPU cost of individual shader components
 * (gradient, lighting, empty-skip, adaptive-step, half-samples, compositing).
 * At runtime the flags come from `globalThis.__PROFILING_STRIP__`; here we
 * inject them directly into the shader config.
 *
 * These 64 combos are enumerated on top of ONE representative config rather
 * than the full analytic space — multiplying by 64 across every analytic
 * variant would explode combinatorics with marginal additional coverage.
 * The representative config exercises the volumetric + density-grid path
 * that all six strip flags actually touch.
 *
 * @module tests/rendering/wgsl/enumerateProfilingStrip
 */

import { createHash } from 'node:crypto'

import {
  applyModeOverrides,
  buildShaderConfig,
} from '@/rendering/webgpu/renderers/rendererConfigUtils'
import type { SchrodingerRendererConfig } from '@/rendering/webgpu/renderers/schrodingerRendererTypes'
import {
  composeSchroedingerShader,
  type SchroedingerWGSLShaderConfig,
} from '@/rendering/webgpu/shaders/schroedinger/compose'

import type { ShaderRecord } from './enumerateSchroedingerAnalytic'

type ProfilingStrip = NonNullable<SchroedingerWGSLShaderConfig['profilingStrip']>

const STRIP_KEYS: readonly (keyof ProfilingStrip)[] = [
  'gradient',
  'lighting',
  'emptySkip',
  'adaptiveStep',
  'halfSamples',
  'compositing',
]

/** Representative config — 3D HO volumetric with density grid (exercises all 6 strip paths). */
const REPRESENTATIVE_CONFIG: SchrodingerRendererConfig = {
  dimension: 3,
  quantumMode: 'harmonicOscillator',
  representation: 'position',
  isosurface: false,
  temporal: false,
  colorAlgorithm: 4,
}

/**
 * Yield one `ShaderRecord` per `profilingStrip` mask in [0, 64), all on the
 * same representative renderer config.
 */
export function* enumerateProfilingStrip(): Generator<ShaderRecord> {
  const rc = applyModeOverrides(REPRESENTATIVE_CONFIG)
  const baseShaderConfig = buildShaderConfig(rc)

  for (let mask = 0; mask < 1 << STRIP_KEYS.length; mask++) {
    const strip: ProfilingStrip = {}
    const parts: string[] = []
    for (let bit = 0; bit < STRIP_KEYS.length; bit++) {
      const on = ((mask >> bit) & 1) === 1
      strip[STRIP_KEYS[bit]!] = on
      parts.push(`${STRIP_KEYS[bit]!}${on ? '1' : '0'}`)
    }
    const sc: SchroedingerWGSLShaderConfig = { ...baseShaderConfig, profilingStrip: strip }
    const { wgsl } = composeSchroedingerShader(sc)
    const sha256 = createHash('sha256').update(wgsl).digest('hex')

    yield {
      label: `profiling-strip_${parts.join('_')}`,
      wgsl,
      sha256,
      cacheKey: `profiling-strip:${mask}`,
      surface: 'profiling-strip',
    }
  }
}
