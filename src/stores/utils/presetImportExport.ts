/**
 * Preset import/export helpers
 *
 * Generic validation, UUID regeneration, and name deduplication for
 * importing preset arrays (styles and scenes). Extracted from
 * presetManagerStore to keep the store thin.
 *
 * @module stores/utils/presetImportExport
 */

import { logger } from '@/lib/logger'

import { isNonEmptyTrimmedString, makeUniqueImportedName } from './presetNormalization'

/** Required data keys for a valid style import. */
const STYLE_REQUIRED_KEYS = ['appearance', 'lighting', 'postProcessing', 'environment'] as const

/** Required data keys for a valid scene import. */
const SCENE_REQUIRED_KEYS = [
  'appearance',
  'lighting',
  'postProcessing',
  'environment',
  'geometry',
  'extended',
  'transform',
  'rotation',
  'animation',
  'camera',
  'ui',
] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Validate that a preset object has all required fields. */
function hasRequiredFields(item: unknown, requiredDataKeys: readonly string[]): boolean {
  if (!isRecord(item)) {
    return false
  }

  const data = item.data
  if (
    !item.id ||
    !isNonEmptyTrimmedString(item.name) ||
    item.timestamp === undefined ||
    item.timestamp === null ||
    !isRecord(data)
  ) {
    return false
  }

  return requiredDataKeys.every(
    (key) =>
      Object.prototype.hasOwnProperty.call(data, key) &&
      data[key] !== undefined &&
      data[key] !== null
  )
}

/**
 * Result of an import attempt.
 *
 * `TItem` defaults to `Record<string, unknown>` so the legacy callers
 * that import the union without a type argument keep working. Typed
 * callers should pass their concrete preset interface (e.g.
 * `ImportResult<SavedStyle>`) so downstream `state.savedStyles` spreads
 * are typed without a `as unknown as` cast.
 *
 * The function returns items shaped like
 * `{ ...rawItem, id, name, timestamp, data: sanitized }`. Callers must
 * pass a `TItem` that is compatible with that shape; the type system
 * does not statically prove field-name equivalence — that's the caller's
 * contract — but it does prevent a brand-new `as unknown as` per call site.
 */
export type ImportResult<TItem = Record<string, unknown>> =
  | { success: true; items: TItem[] }
  | { success: false; error: string }

/**
 * Parse, validate, deduplicate, and sanitize an imported preset array.
 *
 * @param jsonData - Raw JSON string
 * @param existingNames - Set of existing preset names (for deduplication)
 * @param requiredDataKeys - Keys that must be present in each preset's `data` object
 * @param sanitize - Function to sanitize a preset's data
 * @param entityLabel - Human-readable label for error messages ("styles" or "scenes")
 * @returns Import result with processed items or error message
 */
export function parseAndValidateImport<T, TItem = Record<string, unknown>>(
  jsonData: string,
  existingNames: Set<string>,
  requiredDataKeys: readonly string[],
  sanitize: (data: T) => T,
  entityLabel: string
): ImportResult<TItem> {
  let imported: unknown
  try {
    imported = JSON.parse(jsonData)
  } catch (e) {
    logger.error(`Failed to import ${entityLabel}`, e)
    return {
      success: false,
      error: `Failed to parse JSON data: ${e instanceof Error ? e.message : 'Unknown error'}`,
    }
  }

  if (!Array.isArray(imported)) {
    return {
      success: false,
      error: `Invalid format: expected an array of ${entityLabel}.`,
    }
  }

  const valid = imported.every((i) => hasRequiredFields(i, requiredDataKeys))
  if (!valid) {
    return {
      success: false,
      error: `The ${entityLabel} data is corrupted or incompatible. ${entityLabel.charAt(0).toUpperCase() + entityLabel.slice(1)} must contain all required data fields.`,
    }
  }

  const usedNames = new Set(existingNames)
  const processed = imported.map((item) => {
    const newId = crypto.randomUUID()
    const rawName = (item.name as string).trim()
    const newName = makeUniqueImportedName(rawName, usedNames)
    usedNames.add(newName)
    return {
      ...item,
      id: newId,
      name: newName,
      timestamp: Date.now(),
      data: sanitize(item.data as T),
    } as TItem
  })

  return { success: true, items: processed }
}

/** Required keys for style import validation. */
export const STYLE_IMPORT_KEYS = STYLE_REQUIRED_KEYS

/** Required keys for scene import validation. */
export const SCENE_IMPORT_KEYS = SCENE_REQUIRED_KEYS
