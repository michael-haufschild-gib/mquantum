/**
 * Phase 1e: unified enumerator entry point.
 *
 * Composes all available sub-enumerators into a single stream. Supports
 * subsetting via env vars for smoke runs:
 *
 * - `WGSL_SUBSET` comma list ∈ {schroedinger-vertex, schroedinger-analytic,
 *   schroedinger-compute, profiling-strip, skybox, ads, wigner, passes, all}.
 *   Default `all`. Unknown values throw.
 * - `WGSL_MODE` restrict analytic walker to a single quantumMode
 *   (harmonicOscillator | hydrogenND | hydrogenNDCoupled). Unknown values throw.
 * - `WGSL_MAX` positive integer cap on total unique shaders emitted. Malformed
 *   or non-positive values throw.
 *
 * Dedup across enumerators is by sha256 — two enumerators producing the
 * same WGSL (rare but possible for minimal shaders) yield only one record.
 *
 * `overrides` parameter variants on `SchroedingerWGSLShaderConfig` are
 * explicitly out of scope (caller-specific substitutions, unenumerable).
 *
 * @module tests/rendering/wgsl/enumerateAll
 */

/* global process -- Node-only: the enumerator reads env vars for subset gating. */

import {
  enumerateAds,
  enumerateDensityGridEigenCache,
  enumerateSkybox,
  enumerateWigner,
} from './enumerateAuxiliary'
import { enumerateProfilingStrip } from './enumerateProfilingStrip'
import type { ShaderRecord, ShaderSurface } from './enumerateSchroedingerAnalytic'
import { enumerateSchroedingerAnalytic } from './enumerateSchroedingerAnalytic'
import { enumerateSchroedingerCompute } from './enumerateSchroedingerCompute'
import { enumerateSchroedingerVertex } from './enumerateSchroedingerVertex'

/** Public alias for `ShaderSurface` used by `enumerateAll` callers. */
export type SurfaceName = ShaderSurface

/** Options accepted by `enumerateAll` and `optionsFromEnv`. */
export interface EnumerateAllOptions {
  /** Subset of enumerators to run. Default runs every registered surface. */
  subsets?: readonly SurfaceName[]
  /** Restrict analytic walker to one mode. */
  onlyMode?: 'harmonicOscillator' | 'hydrogenND' | 'hydrogenNDCoupled'
  /** Cap total unique shaders emitted. */
  maxUnique?: number
}

const VALID_SURFACES: ReadonlySet<SurfaceName> = new Set([
  'schroedinger-vertex',
  'schroedinger-analytic',
  'schroedinger-compute',
  'profiling-strip',
  'skybox',
  'ads',
  'wigner',
  'passes',
])

const VALID_MODES: ReadonlySet<NonNullable<EnumerateAllOptions['onlyMode']>> = new Set([
  'harmonicOscillator',
  'hydrogenND',
  'hydrogenNDCoupled',
])

/**
 * Parse env-var controls into options. Centralized so the vitest test and
 * any on-demand script use identical semantics. Throws on typos so a
 * mistyped `WGSL_SUBSET=skbox` doesn't silently enumerate nothing and
 * report a green run.
 */
export function optionsFromEnv(
  env: Record<string, string | undefined> = process.env
): EnumerateAllOptions {
  const opts: EnumerateAllOptions = {}
  if (env.WGSL_SUBSET && env.WGSL_SUBSET !== 'all') {
    const subsets = env.WGSL_SUBSET.split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    const invalid = subsets.filter((s) => !VALID_SURFACES.has(s as SurfaceName))
    if (invalid.length > 0) {
      throw new Error(
        `[enumerateAll] WGSL_SUBSET contains unknown surface(s): ${invalid.join(', ')}. ` +
          `Allowed: ${[...VALID_SURFACES].join(', ')}`
      )
    }
    opts.subsets = subsets as SurfaceName[]
  }
  if (env.WGSL_MODE) {
    if (!VALID_MODES.has(env.WGSL_MODE as NonNullable<EnumerateAllOptions['onlyMode']>)) {
      throw new Error(
        `[enumerateAll] WGSL_MODE is unknown: ${env.WGSL_MODE}. ` +
          `Allowed: ${[...VALID_MODES].join(', ')}`
      )
    }
    opts.onlyMode = env.WGSL_MODE as EnumerateAllOptions['onlyMode']
  }
  if (env.WGSL_MAX) {
    const rawMax = env.WGSL_MAX.trim()
    if (!/^\d+$/.test(rawMax)) {
      throw new Error(`[enumerateAll] WGSL_MAX must be a positive integer, got: ${env.WGSL_MAX}`)
    }
    const maxUnique = Number.parseInt(rawMax, 10)
    if (maxUnique <= 0) {
      throw new Error(`[enumerateAll] WGSL_MAX must be a positive integer, got: ${env.WGSL_MAX}`)
    }
    opts.maxUnique = maxUnique
  }
  return opts
}

/**
 * Yield every shader record from enabled enumerators. Dedups across surfaces
 * by `sha256`; first-seen record wins (so its `surface` label sticks).
 */
export function* enumerateAll(opts: EnumerateAllOptions = {}): Generator<ShaderRecord> {
  const { subsets, onlyMode, maxUnique = Infinity } = opts

  const isEnabled = (surface: SurfaceName): boolean =>
    subsets === undefined || subsets.includes(surface)

  const seen = new Set<string>()
  let yielded = 0

  const gen = function* (): Generator<ShaderRecord> {
    if (isEnabled('schroedinger-vertex')) {
      yield* enumerateSchroedingerVertex()
    }
    if (isEnabled('schroedinger-analytic')) {
      yield* enumerateSchroedingerAnalytic({ onlyMode, maxUnique })
    }
    if (isEnabled('schroedinger-compute')) {
      yield* enumerateSchroedingerCompute()
    }
    if (isEnabled('profiling-strip')) {
      yield* enumerateProfilingStrip()
    }
    if (isEnabled('skybox')) {
      yield* enumerateSkybox()
    }
    if (isEnabled('ads')) {
      yield* enumerateAds()
    }
    if (isEnabled('wigner')) {
      yield* enumerateWigner()
    }
    if (isEnabled('passes')) {
      yield* enumerateDensityGridEigenCache()
    }
  }

  for (const rec of gen()) {
    if (yielded >= maxUnique) return
    if (seen.has(rec.sha256)) continue
    seen.add(rec.sha256)
    yielded++
    yield rec
  }
}
