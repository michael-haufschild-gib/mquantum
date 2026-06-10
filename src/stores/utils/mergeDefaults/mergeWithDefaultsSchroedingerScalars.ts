import {
  sanitizeSchroedingerBooleanScalars,
  sanitizeSchroedingerNumericScalars,
} from '@/lib/geometry/extended/schroedinger/configSanitization'
import { DEFAULT_SCHROEDINGER_CONFIG } from '@/lib/geometry/extended/types'

/**
 * Clamp numeric Schroedinger controls that scene loading can otherwise inject
 * as non-finite values while still matching the expected primitive type.
 *
 * @param normalized - Merged Schroedinger config record
 * @returns Config with top-level numeric controls normalized to setter ranges
 */
export function normalizeSchroedingerNumericScalars(
  normalized: Record<string, unknown>
): Record<string, unknown> {
  return sanitizeSchroedingerBooleanScalars(
    sanitizeSchroedingerNumericScalars(normalized, DEFAULT_SCHROEDINGER_CONFIG),
    DEFAULT_SCHROEDINGER_CONFIG
  )
}
