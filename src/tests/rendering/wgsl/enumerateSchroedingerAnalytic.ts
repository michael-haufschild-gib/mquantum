/**
 * Phase 1a: Schrödinger analytic-mode WGSL enumerator.
 *
 * Walks the full user-facing knob space for the three analytic quantum modes
 * (harmonicOscillator, hydrogenND, hydrogenNDCoupled), feeds each config
 * through the real `applyModeOverrides` -> `buildShaderConfig` pipeline, and
 * composes the shader via `composeSchroedingerShader`.
 *
 * Dedup key is `computePipelineCacheKey(shaderConfig, rendererConfig)` — the
 * renderer's own invariant "two configs producing the same key MUST produce
 * identical shader code" lets us skip composition for already-seen keys. This
 * turns ~80M raw combinations into ~N unique composed shaders (typically 5-30k).
 *
 * AdS is a compute mode (per `QUANTUM_TYPE_REGISTRY`) and is enumerated in
 * Phase 1b alongside FSF / TDSE / BEC / Dirac / QuantumWalk / WdW, even though
 * it still composes through `composeSchroedingerShader` internally. See
 * `docs/physics/wgsl-pass-audit.md` for the category split.
 *
 * `profilingStrip` is sourced from `globalThis.__PROFILING_STRIP__` at
 * compose time, not from the renderer config — enumerated separately in
 * Phase 1c.
 *
 * @module tests/rendering/wgsl/enumerateSchroedingerAnalytic
 */

import { createHash } from 'node:crypto'

import { getQuantumTypeEntry } from '@/lib/geometry/registry'
import {
  applyModeOverrides,
  buildShaderConfig,
  computePipelineCacheKey,
} from '@/rendering/webgpu/renderers/rendererConfigUtils'
import type { SchrodingerRendererConfig } from '@/rendering/webgpu/renderers/schrodingerRendererTypes'
import { composeSchroedingerShader } from '@/rendering/webgpu/shaders/schroedinger/compose'

/** Enumerator surface identifiers. Must stay in sync with `enumerateAll.SurfaceName`. */
export type ShaderSurface =
  | 'schroedinger-analytic'
  | 'schroedinger-compute'
  | 'profiling-strip'
  | 'skybox'
  | 'ads'
  | 'wigner'
  | 'passes'

/** A single composed WGSL shader with metadata used by the validator + triage. */
export interface ShaderRecord {
  /** Human-readable label identifying the config that produced this shader. */
  label: string
  /** Assembled WGSL source. */
  wgsl: string
  /** sha256 of `wgsl` (lowercase hex). Dedup key for cross-enumerator merges. */
  sha256: string
  /** `computePipelineCacheKey` value — intra-enumerator dedup. */
  cacheKey: string
  /** Enumerator name, for grouping failures by surface. */
  surface: ShaderSurface
}

type AnalyticMode = 'harmonicOscillator' | 'hydrogenND' | 'hydrogenNDCoupled'

const ANALYTIC_MODES: readonly AnalyticMode[] = [
  'harmonicOscillator',
  'hydrogenND',
  'hydrogenNDCoupled',
] as const

/** Color algorithm indices declared in `COLOR_ALG_NAMES`. */
const COLOR_ALGORITHMS: readonly number[] = Array.from({ length: 29 }, (_, i) => i)

const REPRESENTATIONS: readonly SchrodingerRendererConfig['representation'][] = [
  'position',
  'momentum',
  'wigner',
] as const

/** HO-only superposition term counts, plus `undefined` (non-unrolled path). */
const TERM_COUNTS: readonly (SchrodingerRendererConfig['termCount'] | undefined)[] = [
  undefined,
  1,
  2,
  3,
  4,
  5,
  6,
  7,
  8,
]

function dimensionRangeFor(mode: AnalyticMode): readonly number[] {
  const entry = getQuantumTypeEntry(mode)
  if (!entry) throw new Error(`quantum-type registry missing entry for ${mode}`)
  const { min, max } = entry.dimensions
  const out: number[] = []
  for (let d = min; d <= max; d++) out.push(d)
  return out
}

interface EnumerateOptions {
  /** Cap the number of unique shaders emitted (for smoke runs). */
  maxUnique?: number
  /** Restrict to a single quantum mode. */
  onlyMode?: AnalyticMode
}

/**
 * Walk the analytic Schrödinger shader space and yield one record per unique
 * `computePipelineCacheKey` value.
 *
 * Booleans walked: isosurface, temporal, nodalEnabled, phaseMaterialityEnabled,
 * interferenceEnabled, uncertaintyBoundaryEnabled, eigenfunctionCacheEnabled,
 * openQuantumEnabled, crossSectionEnabled, probabilityCurrentEnabled.
 * Enums walked: quantumMode (3), representation (3), colorAlgorithm (29),
 * dimension (per-mode min..max), termCount (HO only, 9 values).
 */
export function* enumerateSchroedingerAnalytic(
  opts: EnumerateOptions = {}
): Generator<ShaderRecord> {
  const { maxUnique = Infinity, onlyMode } = opts
  const seen = new Set<string>()

  const modes = onlyMode ? [onlyMode] : ANALYTIC_MODES

  for (const mode of modes) {
    const dimensions = dimensionRangeFor(mode)
    const termCounts: readonly (SchrodingerRendererConfig['termCount'] | undefined)[] =
      mode === 'harmonicOscillator' ? TERM_COUNTS : [undefined]

    for (const dimension of dimensions) {
      for (const representation of REPRESENTATIONS) {
        for (const isosurface of [false, true]) {
          for (const temporal of [false, true]) {
            for (const eigenfunctionCacheEnabled of [false, true]) {
              for (const openQuantumEnabled of [false, true]) {
                for (const nodalEnabled of [false, true]) {
                  for (const phaseMaterialityEnabled of [false, true]) {
                    for (const interferenceEnabled of [false, true]) {
                      for (const uncertaintyBoundaryEnabled of [false, true]) {
                        for (const crossSectionEnabled of [false, true]) {
                          for (const probabilityCurrentEnabled of [false, true]) {
                            for (const colorAlgorithm of COLOR_ALGORITHMS) {
                              for (const termCount of termCounts) {
                                if (seen.size >= maxUnique) return

                                const rcInput: SchrodingerRendererConfig = {
                                  dimension,
                                  quantumMode: mode,
                                  representation,
                                  isosurface,
                                  temporal,
                                  eigenfunctionCacheEnabled,
                                  openQuantumEnabled,
                                  nodalEnabled,
                                  phaseMaterialityEnabled,
                                  interferenceEnabled,
                                  uncertaintyBoundaryEnabled,
                                  crossSectionEnabled,
                                  probabilityCurrentEnabled,
                                  colorAlgorithm,
                                  termCount,
                                }
                                const rc = applyModeOverrides(rcInput)
                                const sc = buildShaderConfig(rc)
                                const cacheKey = computePipelineCacheKey(sc, rc)
                                if (seen.has(cacheKey)) continue
                                seen.add(cacheKey)

                                const { wgsl } = composeSchroedingerShader(sc)
                                const sha256 = createHash('sha256').update(wgsl).digest('hex')

                                const label = [
                                  `schroedinger-analytic`,
                                  mode,
                                  `d${dimension}`,
                                  representation,
                                  isosurface ? 'iso' : 'vol',
                                  temporal ? 'temporal' : 'frame',
                                  `alg${colorAlgorithm}`,
                                  termCount === undefined ? 'tc-any' : `tc${termCount}`,
                                  eigenfunctionCacheEnabled ? 'cache' : 'nocache',
                                  openQuantumEnabled ? 'oq' : 'pure',
                                  `b${Number(nodalEnabled)}${Number(phaseMaterialityEnabled)}${Number(interferenceEnabled)}${Number(uncertaintyBoundaryEnabled)}${Number(crossSectionEnabled)}${Number(probabilityCurrentEnabled)}`,
                                ].join('_')

                                yield {
                                  label,
                                  wgsl,
                                  sha256,
                                  cacheKey,
                                  surface: 'schroedinger-analytic',
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}
