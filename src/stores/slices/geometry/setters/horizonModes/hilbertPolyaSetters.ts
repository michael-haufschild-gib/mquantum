/**
 * Hilbert–Pólya Spectrum setter factory.
 *
 * Mirrors the Riemann Zeta setter pattern: the mode is fully analytic (no
 * compute pass), so each setter writes through `setWithVersion` — the version
 * bump re-packs the uniform buffer, and the strategy re-launches the worker
 * volume job when a LUT-shaping field (zMax / yExtent) changes. Every
 * physics-affecting mutation marks `preset: 'custom'`.
 *
 * @module stores/slices/geometry/setters/horizonModes/hilbertPolyaSetters
 */

import type {
  HilbertPolyaConfig,
  HilbertPolyaPresetName,
} from '@/lib/geometry/extended/hilbertPolya'
import {
  HILBERT_POLYA_PRESETS,
  HILBERT_POLYA_RANGES,
  HILBERT_POLYA_SCENARIOS,
} from '@/lib/geometry/extended/hilbertPolya'
import { useGeometryStore } from '@/stores/scene/geometryStore'
import { useRotationStore } from '@/stores/scene/rotationStore'

import type { SetterContext } from '../sliceSetterUtils'

/** Actions exposed by the Hilbert–Pólya setter bundle. */
export interface HilbertPolyaSetters {
  setHilbertPolyaZMax: (zMax: number) => void
  setHilbertPolyaYExtent: (yExtent: number) => void
  setHilbertPolyaFilamentWidth: (width: number) => void
  setHilbertPolyaGlow: (glow: number) => void
  setHilbertPolyaFogGain: (gain: number) => void
  setHilbertPolyaPlaneMarker: (enabled: boolean) => void
  setHilbertPolyaPreset: (name: HilbertPolyaPresetName) => void
}

/** Apply a partial mutation to `schroedinger.hilbertPolya`. */
function applyPartial(ctx: SetterContext, partial: Partial<HilbertPolyaConfig>): void {
  ctx.setWithVersion((state) => ({
    schroedinger: {
      ...state.schroedinger,
      hilbertPolya: {
        ...state.schroedinger.hilbertPolya,
        ...partial,
      },
    },
  }))
}

function clamp(v: number, lo: number, hi: number): number {
  if (v < lo) return lo
  if (v > hi) return hi
  return v
}

/** Build one clamped numeric setter for a HilbertPolyaConfig scalar. */
function numericSetter(
  ctx: SetterContext,
  field: keyof typeof HILBERT_POLYA_RANGES
): (value: number) => void {
  const { min, max } = HILBERT_POLYA_RANGES[field]
  return (value: number) => {
    if (!ctx.isFinite(value)) {
      ctx.warnNonFinite(`hilbertPolya.${field}`, value)
      return
    }
    applyPartial(ctx, { [field]: clamp(value, min, max), preset: 'custom' })
  }
}

/**
 * Build the full Hilbert–Pólya setter bundle.
 *
 * @param ctx - Shared Zustand setter context
 * @returns Map of action name → setter
 */
export function createHilbertPolyaSetters(ctx: SetterContext): HilbertPolyaSetters {
  return {
    setHilbertPolyaZMax: numericSetter(ctx, 'zMax'),
    setHilbertPolyaYExtent: numericSetter(ctx, 'yExtent'),
    setHilbertPolyaFilamentWidth: numericSetter(ctx, 'filamentWidth'),
    setHilbertPolyaGlow: numericSetter(ctx, 'glow'),
    setHilbertPolyaFogGain: numericSetter(ctx, 'fogGain'),
    setHilbertPolyaPlaneMarker: (enabled) => {
      applyPartial(ctx, { planeMarker: enabled, preset: 'custom' })
    },
    setHilbertPolyaPreset: (name) => {
      if (name === 'custom') {
        applyPartial(ctx, { preset: 'custom' })
        return
      }
      const preset = HILBERT_POLYA_PRESETS[name]
      if (!preset) return
      applyPartial(ctx, { ...preset, preset: name })
      // Dimension guard: snap to the scenario's target dimension (3D scenarios → 3D,
      // the 4D scenario → 4D) and apply its initial W-tilt. Dimension first, because
      // rotationStore.setDimension resets rotation angles on a dimension change.
      const scenario = HILBERT_POLYA_SCENARIOS.find((s) => s.id === name)
      if (scenario) {
        useGeometryStore.getState().setDimension(scenario.dimension ?? 3)
        if (scenario.rotation) {
          const setRotation = useRotationStore.getState().setRotation
          for (const [plane, angle] of Object.entries(scenario.rotation)) setRotation(plane, angle)
        }
      }
    },
  }
}
