import { DEFAULT_SCHROEDINGER_CONFIG } from '@/lib/geometry/extended/types'
import { ADS_PRESET_MAP } from '@/lib/physics/antiDeSitter/presets'

function hasRecordKey<T extends object>(record: T, value: unknown): value is keyof T {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(record, value)
}

function clampFiniteNumber(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.max(min, Math.min(max, value))
}

function clampFiniteFloorInteger(
  value: unknown,
  fallback: number,
  min: number,
  max: number
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.max(min, Math.min(max, Math.floor(value)))
}

/**
 * Clamp loaded AdS/HKLL controls to the same finite ranges enforced by UI setters.
 *
 * @param normalized - Merged Schroedinger config record.
 * @returns Config with a sanitized nested `antiDeSitter` block.
 */
export function normalizeAntiDeSitterLoadedConfig(
  normalized: Record<string, unknown>
): Record<string, unknown> {
  const ads = normalized.antiDeSitter
  if (!ads || typeof ads !== 'object' || Array.isArray(ads)) return normalized

  const current = ads as Record<string, unknown>
  const defaults = DEFAULT_SCHROEDINGER_CONFIG.antiDeSitter
  const l = clampFiniteFloorInteger(current.l, defaults.l, 0, 3)
  const rawM = clampFiniteFloorInteger(current.m, defaults.m, -l, l)
  const m = rawM === 0 ? 0 : rawM
  const hkllEnabled =
    typeof current.hkllEnabled === 'boolean' ? current.hkllEnabled : defaults.hkllEnabled
  const btzEnabled =
    hkllEnabled === true
      ? false
      : typeof current.btzEnabled === 'boolean'
        ? current.btzEnabled
        : defaults.btzEnabled
  const branch =
    current.branch === 'standard' || current.branch === 'alternate'
      ? current.branch
      : defaults.branch
  const hkllBoundarySource =
    current.hkllBoundarySource === 'localized' || current.hkllBoundarySource === 'planeWave'
      ? current.hkllBoundarySource
      : defaults.hkllBoundarySource
  const preset =
    typeof current.preset === 'string' &&
    (current.preset === 'custom' || hasRecordKey(ADS_PRESET_MAP, current.preset))
      ? current.preset
      : defaults.preset

  return {
    ...normalized,
    antiDeSitter: {
      ...current,
      d: clampFiniteFloorInteger(current.d, defaults.d, 3, 7),
      n: clampFiniteFloorInteger(current.n, defaults.n, 0, 4),
      l,
      m,
      mL: clampFiniteNumber(current.mL, defaults.mL, -3, 3),
      branch,
      boundaryOverlay:
        typeof current.boundaryOverlay === 'boolean'
          ? current.boundaryOverlay
          : defaults.boundaryOverlay,
      preset,
      btzEnabled,
      btzHorizonRadius: clampFiniteNumber(
        current.btzHorizonRadius,
        defaults.btzHorizonRadius,
        0.05,
        2
      ),
      btzOmega: clampFiniteNumber(current.btzOmega, defaults.btzOmega, 0.1, 10),
      btzAngularM: clampFiniteFloorInteger(current.btzAngularM, defaults.btzAngularM, -5, 5),
      hkllEnabled,
      hkllBoundarySource,
      hkllSourceSigma: clampFiniteNumber(
        current.hkllSourceSigma,
        defaults.hkllSourceSigma,
        0.05,
        1.5
      ),
      hkllPlaneWaveM: clampFiniteFloorInteger(
        current.hkllPlaneWaveM,
        defaults.hkllPlaneWaveM,
        0,
        8
      ),
    },
  }
}
