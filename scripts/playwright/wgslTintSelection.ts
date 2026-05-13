import {
  enumerateAll,
  type EnumerateAllOptions,
  optionsFromEnv,
} from '@/tests/rendering/wgsl/enumerateAll'
import type {
  ShaderRecord,
  ShaderSurface,
} from '@/tests/rendering/wgsl/enumerateSchroedingerAnalytic'

/** Default per-surface order for the browser Tint validation tier. */
export const TINT_SURFACE_ORDER: readonly ShaderSurface[] = [
  'schroedinger-vertex',
  'schroedinger-analytic',
  'schroedinger-compute',
  'profiling-strip',
  'skybox',
  'ads',
  'wigner',
  'passes',
] as const

/** Parse WGSL_TINT_MAX with fail-fast semantics for CI typos. */
export function parseTintMax(raw: string | undefined, fallback = 500): number {
  if (raw === undefined || raw === '') return fallback
  const normalized = raw.trim()
  if (!/^\d+$/.test(normalized)) {
    throw new Error(`[wgsl-tint] WGSL_TINT_MAX must be a positive integer, got: ${raw}`)
  }
  const parsed = Number.parseInt(normalized, 10)
  if (parsed <= 0) {
    throw new Error(`[wgsl-tint] WGSL_TINT_MAX must be a positive integer, got: ${raw}`)
  }
  return parsed
}

/** Resolve environment controls shared by the Playwright Tint spec. */
export function tintOptionsFromEnv(
  env: Record<string, string | undefined> = process.env
): EnumerateAllOptions & { maxRecords: number } {
  const options = optionsFromEnv(env)
  const tintMax = parseTintMax(env.WGSL_TINT_MAX)
  return {
    ...options,
    maxRecords: Math.min(tintMax, options.maxUnique ?? tintMax),
  }
}

/** Select a deterministic, surface-balanced shader subset for browser Tint validation. */
export function selectTintRecords(
  options: EnumerateAllOptions & { maxRecords: number }
): ShaderRecord[] {
  const maxRecords = Math.floor(options.maxRecords)
  if (!Number.isFinite(maxRecords) || maxRecords <= 0) {
    throw new Error(
      `[wgsl-tint] maxRecords must be a positive finite number, got: ${options.maxRecords}`
    )
  }

  const surfaces = [...new Set(options.subsets ?? TINT_SURFACE_ORDER)]
  const active = surfaces.map((surface) => ({
    iterator: enumerateAll({
      subsets: [surface],
      onlyMode: options.onlyMode,
    })[Symbol.iterator](),
  }))
  const records: ShaderRecord[] = []
  const seen = new Set<string>()

  while (records.length < maxRecords && active.length > 0) {
    for (let i = 0; i < active.length && records.length < maxRecords; ) {
      const next = active[i]!.iterator.next()
      if (next.done) {
        active.splice(i, 1)
        continue
      }

      if (!seen.has(next.value.sha256)) {
        seen.add(next.value.sha256)
        records.push(next.value)
      }
      i++
    }
  }

  return records
}
