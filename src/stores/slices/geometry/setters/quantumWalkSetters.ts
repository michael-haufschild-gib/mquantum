/**
 * Quantum walk setter factory for schroedingerSlice.
 *
 * @module stores/slices/geometry/setters/quantumWalkSetters
 */

import {
  DEFAULT_QUANTUM_WALK_CONFIG,
  resizeQuantumWalkArrays,
} from '@/lib/geometry/extended/quantumWalk'
import { useGeometryStore } from '@/stores/scene/geometryStore'
import { loadPresetModule } from '@/stores/utils/dynamicPresetImport'

import type { SetterContext } from './sliceSetterUtils'

/** Actions exposed by the quantum-walk setter bundle. */
export interface QuantumWalkSetters {
  applyQuantumWalkPreset: (presetId: string) => Promise<void>
  resetQuantumWalk: () => void
  setQwAutoScale: (autoScale: boolean) => void
  setQwAbsorberEnabled: (enabled: boolean) => void
  setQwAbsorberWidth: (width: number) => void
  setQwPmlTargetReflection: (r: number) => void
  setQwSlicePosition: (dimIndex: number, value: number) => void
}

/** Create all quantum-walk-related setters. */
export function createQuantumWalkSetters(ctx: SetterContext): QuantumWalkSetters {
  const { setWithVersion, set } = ctx

  return {
    applyQuantumWalkPreset: (presetId) => {
      return loadPresetModule(
        () => import('@/lib/physics/quantumWalk/presets'),
        'schroedingerSlice',
        `quantum-walk presets for '${presetId}'`,
        ({ QUANTUM_WALK_PRESETS }) => {
          const preset = QUANTUM_WALK_PRESETS.find((p) => p.id === presetId)
          if (!preset) return
          setWithVersion((state) => {
            const globalDim = useGeometryStore.getState().dimension
            const base = {
              ...DEFAULT_QUANTUM_WALK_CONFIG,
              ...preset.overrides,
              slicePositions: state.schroedinger.quantumWalk.slicePositions,
              steps: 0,
              needsReset: true,
            }
            const resized = resizeQuantumWalkArrays(base, globalDim)
            const appliedQuantumWalk = { ...base, ...resized, needsReset: true }
            const parentAbsorber =
              preset.overrides.absorberEnabled !== undefined
                ? {
                    absorberEnabled: preset.overrides.absorberEnabled,
                    absorberWidth:
                      preset.overrides.absorberWidth ?? appliedQuantumWalk.absorberWidth,
                  }
                : {}
            return {
              schroedinger: {
                ...state.schroedinger,
                ...parentAbsorber,
                quantumWalk: appliedQuantumWalk,
              },
            }
          })
        }
      )
    },

    resetQuantumWalk: () => {
      set((state) => {
        const qw = state.schroedinger.quantumWalk
        const initialPosition = qw.gridSize.map((s) => Math.floor(s / 2))
        return {
          schroedinger: {
            ...state.schroedinger,
            quantumWalk: { ...qw, steps: 0, initialPosition, needsReset: true },
          },
        }
      })
    },

    setQwAutoScale: (autoScale) => {
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          quantumWalk: { ...state.schroedinger.quantumWalk, autoScale },
        },
      }))
    },

    setQwAbsorberEnabled: (enabled) => {
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          quantumWalk: { ...state.schroedinger.quantumWalk, absorberEnabled: enabled },
        },
      }))
    },

    setQwAbsorberWidth: (width) => {
      if (!isFinite(width)) return
      const clamped = Math.max(0.05, Math.min(0.5, width))
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          quantumWalk: { ...state.schroedinger.quantumWalk, absorberWidth: clamped },
        },
      }))
    },

    setQwPmlTargetReflection: (r) => {
      if (!isFinite(r)) return
      const clamped = Math.max(1e-12, Math.min(0.999, r))
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          quantumWalk: { ...state.schroedinger.quantumWalk, pmlTargetReflection: clamped },
        },
      }))
    },

    setQwSlicePosition: (dimIndex: number, value: number) => {
      if (!isFinite(value)) return
      setWithVersion((state) => {
        const qw = state.schroedinger.quantumWalk
        const slicePositions = [...qw.slicePositions]
        if (dimIndex >= 0 && dimIndex < slicePositions.length) {
          const halfExtent =
            (qw.gridSize[dimIndex + 3] ?? 1) * (qw.spacing[dimIndex + 3] ?? 0.1) * 0.5
          slicePositions[dimIndex] = Math.max(-halfExtent, Math.min(halfExtent, value))
        }
        return {
          schroedinger: {
            ...state.schroedinger,
            quantumWalk: { ...qw, slicePositions },
          },
        }
      })
    },
  }
}
