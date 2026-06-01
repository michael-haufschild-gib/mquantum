import { resolveBecMass } from '@/lib/physics/bec/waterfallParams'

/** Sanitize loaded BEC config fields that bypass runtime setters. */
export function normalizeBecLoadedConfig(
  normalized: Record<string, unknown>
): Record<string, unknown> {
  const bec = normalized.bec
  if (!bec || typeof bec !== 'object' || Array.isArray(bec)) return normalized

  const rec = bec as Record<string, unknown>
  const mass = typeof rec.mass === 'number' ? rec.mass : undefined
  const normalizedMass = resolveBecMass({ mass })
  if (rec.mass === normalizedMass) return normalized

  return {
    ...normalized,
    bec: {
      ...rec,
      mass: normalizedMass,
    },
  }
}
