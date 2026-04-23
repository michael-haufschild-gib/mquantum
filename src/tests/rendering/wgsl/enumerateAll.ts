/**
 * Phase 1e: unified enumerator entry point.
 *
 * Composes all available sub-enumerators into a single stream. Supports
 * subsetting via env vars for smoke runs:
 *
 * - `WGSL_SUBSET` comma list ∈ {schroedinger-analytic, schroedinger-compute,
 *   profiling-strip, skybox, ads, wigner, passes, all}. Default `all`.
 * - `WGSL_MODE` restrict analytic walker to a single quantumMode
 *   (harmonicOscillator | hydrogenND | hydrogenNDCoupled).
 * - `WGSL_MAX` numeric cap on total unique shaders emitted.
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

/**
 * Parse env-var controls into options. Centralized so the vitest test and
 * any on-demand script use identical semantics.
 */
export function optionsFromEnv(
  env: Record<string, string | undefined> = process.env
): EnumerateAllOptions {
  const opts: EnumerateAllOptions = {}
  if (env.WGSL_SUBSET && env.WGSL_SUBSET !== 'all') {
    opts.subsets = env.WGSL_SUBSET.split(',').map((s) => s.trim()) as SurfaceName[]
  }
  if (env.WGSL_MODE) {
    opts.onlyMode = env.WGSL_MODE as EnumerateAllOptions['onlyMode']
  }
  if (env.WGSL_MAX) {
    const n = Number(env.WGSL_MAX)
    if (Number.isFinite(n) && n > 0) opts.maxUnique = n
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
    if (isEnabled('schroedinger-analytic')) {
      yield* enumerateSchroedingerVertex()
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
