/**
 * Dirac Equation setter factory.
 *
 * Extracts all `setDirac*`, `applyDiracPreset`, `clearDiracNeedsReset`,
 * and `setDiracNeedsReset` methods from the schroedingerSlice.
 *
 * @module stores/slices/geometry/setters/diracSetters
 */

import type { DiracConfig } from '@/lib/geometry/extended/types'
import { logger } from '@/lib/logger'
import { reduceGridToFit } from '@/lib/math/ndArray'
import { maxStableDt } from '@/lib/physics/dirac/scales'

import type { SchroedingerSliceActions } from '../types'
import {
  defaultDiracGridPerDim,
  DIRAC_MAX_TOTAL_SITES,
  nestedClampedSetter,
  nestedIntSetter,
  nestedValueSetter,
  type SetterContext,
} from './sliceSetterUtils'

type DiracActions = Pick<
  SchroedingerSliceActions,
  | 'setDiracMass'
  | 'setDiracSpeedOfLight'
  | 'setDiracHbar'
  | 'setDiracDt'
  | 'setDiracStepsPerFrame'
  | 'setDiracPotentialType'
  | 'setDiracPotentialStrength'
  | 'setDiracPotentialWidth'
  | 'setDiracPotentialCenter'
  | 'setDiracHarmonicOmega'
  | 'setDiracCoulombZ'
  | 'setDiracInitialCondition'
  | 'setDiracPacketWidth'
  | 'setDiracPositiveEnergyFraction'
  | 'setDiracFieldView'
  | 'setDiracAutoScale'
  | 'setDiracShowPotential'
  | 'setDiracAbsorberEnabled'
  | 'setDiracAbsorberWidth'
  | 'setDiracPmlTargetReflection'
  | 'setDiracGridSize'
  | 'setDiracSpacing'
  | 'setDiracPacketCenter'
  | 'setDiracPacketMomentum'
  | 'setDiracSpinDirection'
  | 'setDiracParticleColor'
  | 'setDiracAntiparticleColor'
  | 'setDiracDiagnosticsEnabled'
  | 'setDiracDiagnosticsInterval'
  | 'setDiracNeedsReset'
  | 'clearDiracNeedsReset'
  | 'setDiracSlicePosition'
  | 'applyDiracPreset'
>

/**
 * WebGPU minStorageBufferOffsetAlignment is 256 bytes.
 * Dirac pack/unpack bind groups view spinor components at offset
 * `c * totalSites * 4`. To satisfy alignment: totalSites * 4 >= 256,
 * so totalSites >= 64. This gives the minimum per-dimension grid size.
 */
const MIN_ALIGNED_TOTAL_SITES = 64

/**
 * Minimum Dirac timestep. Any desired dt below this is raised — anything
 * smaller is unproductive for visualization (thousands of steps per frame
 * without visible evolution) and risks float underflow in the integrator.
 */
const MIN_DIRAC_DT = 0.0001

/**
 * CFL safety margin applied to `maxStableDt`. The lattice Dirac leapfrog is
 * marginally stable at the exact CFL limit, so we shrink it by 10% to give
 * the integrator a small amount of headroom against numerical noise.
 */
const DIRAC_DT_CFL_SAFETY = 0.9

/**
 * Clamp a desired Dirac timestep against the lattice CFL limit. Every call
 * site that writes `dirac.dt` flows through this helper so the floor
 * (`MIN_DIRAC_DT`), the CFL margin (`DIRAC_DT_CFL_SAFETY`), and the order
 * of operations stay in lock-step. Previously the same four-term expression
 * was duplicated at five sites, which meant any future change to the CFL
 * margin would have to be mirrored in every copy.
 *
 * @param spacing - Per-dimension lattice spacing
 * @param speedOfLight - Effective c for the lattice (sets the CFL ceiling)
 * @param desiredDt - Candidate dt from user input, preset, or current state
 */
function clampDiracDt(spacing: number[], speedOfLight: number, desiredDt: number): number {
  const dtMax = maxStableDt(spacing, speedOfLight)
  return Math.max(MIN_DIRAC_DT, Math.min(dtMax * DIRAC_DT_CFL_SAFETY, desiredDt))
}

/**
 * Minimum per-dimension grid size for Dirac that satisfies WebGPU
 * buffer offset alignment (256 bytes). Returns a power of 2.
 */
export const minDiracGridPerDim = (dim: number): number => {
  const raw = Math.ceil(Math.pow(MIN_ALIGNED_TOTAL_SITES, 1 / dim))
  return Math.max(2, 2 ** Math.ceil(Math.log2(raw)))
}

/**
 * Resize Dirac arrays to match a new latticeDim, preserving existing values
 * where possible and filling new dimensions with defaults.
 */
export const resizeDiracArrays = (prev: DiracConfig, newDim: number): Partial<DiracConfig> => {
  const gridDefault = defaultDiracGridPerDim(newDim)
  const gridSize = Array.from({ length: newDim }, () => gridDefault)
  const dim0Spacing = prev.spacing.length > 0 ? prev.spacing[0]! : 0.15
  const spacing = Array.from({ length: newDim }, (_, i) =>
    i < prev.spacing.length ? prev.spacing[i]! : dim0Spacing
  )
  const halfExtent = (d: number) => gridSize[d]! * spacing[d]! * 0.5
  const packetCenter = Array.from({ length: newDim }, (_, i) => {
    const raw = i < prev.packetCenter.length ? prev.packetCenter[i]! : 0
    const limit = halfExtent(i) * 0.9
    return Math.max(-limit, Math.min(limit, raw))
  })
  const packetMomentum = Array.from({ length: newDim }, (_, i) => {
    const raw = i < prev.packetMomentum.length ? prev.packetMomentum[i]! : 0
    const kMax = Math.PI / spacing[i]!
    return Math.max(-kMax, Math.min(kMax, raw))
  })
  const minHalfExtent = Math.min(...gridSize.map((g, i) => g * spacing[i]! * 0.5))
  const maxSigma = minHalfExtent * 0.4
  const newPacketWidth = Math.min(maxSigma, prev.packetWidth)
  const slicePositions = Array.from({ length: Math.max(0, newDim - 3) }, (_, i) =>
    i < prev.slicePositions.length ? prev.slicePositions[i]! : 0
  )
  const newDt = clampDiracDt(spacing, prev.speedOfLight, prev.dt)
  return {
    latticeDim: newDim,
    gridSize,
    spacing,
    packetCenter,
    packetMomentum,
    slicePositions,
    dt: newDt,
    packetWidth: newPacketWidth,
  }
}

/**
 * Creates all Dirac equation setter actions for the schroedingerSlice.
 * @param ctx - Shared setter context with set/get and validation helpers
 */
export function createDiracSetters(ctx: SetterContext): DiracActions {
  const { setWithVersion, set, isFinite, warnNonFinite, hasOnlyFinite } = ctx
  const D = 'dirac' as const

  return {
    setDiracMass: nestedClampedSetter(ctx, D, 'mass', 0.01, 10),
    // Increasing c shrinks the Dirac CFL limit (dtMax = min(Δx)/(c·√N)) so
    // we must re-clamp dt against the new ceiling, otherwise the user can
    // raise c with a stale dt and silently push the lattice past stability.
    setDiracSpeedOfLight: (speedOfLight) => {
      if (!isFinite(speedOfLight)) {
        warnNonFinite('dirac.speedOfLight', speedOfLight)
        return
      }
      const clamped = Math.max(0.01, Math.min(10, speedOfLight))
      setWithVersion((state) => {
        const prev = state.schroedinger.dirac
        const dt = clampDiracDt(prev.spacing, clamped, prev.dt)
        return {
          schroedinger: {
            ...state.schroedinger,
            dirac: { ...prev, speedOfLight: clamped, dt },
          },
        }
      })
    },
    setDiracHbar: nestedClampedSetter(ctx, D, 'hbar', 0.01, 10),
    setDiracDt: (dt) => {
      if (!isFinite(dt)) {
        warnNonFinite('dirac.dt', dt)
        return
      }
      setWithVersion((state) => {
        const { spacing, speedOfLight } = state.schroedinger.dirac
        const clamped = clampDiracDt(spacing, speedOfLight, dt)
        return {
          schroedinger: {
            ...state.schroedinger,
            dirac: { ...state.schroedinger.dirac, dt: clamped },
          },
        }
      })
    },
    setDiracStepsPerFrame: nestedIntSetter(ctx, D, 'stepsPerFrame', 1, 16),
    setDiracPotentialType: (type) => {
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          dirac: { ...state.schroedinger.dirac, potentialType: type, needsReset: true },
        },
      }))
    },
    setDiracPotentialStrength: nestedClampedSetter(ctx, D, 'potentialStrength', -100, 100),
    setDiracPotentialWidth: nestedClampedSetter(ctx, D, 'potentialWidth', 0.01, 10),
    setDiracPotentialCenter: nestedClampedSetter(ctx, D, 'potentialCenter', -10, 10),
    setDiracHarmonicOmega: nestedClampedSetter(ctx, D, 'harmonicOmega', 0.01, 10),
    setDiracCoulombZ: nestedIntSetter(ctx, D, 'coulombZ', 1, 137),
    setDiracInitialCondition: (condition) => {
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          dirac: { ...state.schroedinger.dirac, initialCondition: condition, needsReset: true },
        },
      }))
    },
    setDiracPacketWidth: (width) => {
      if (!isFinite(width)) return
      const clamped = Math.max(0.05, Math.min(5, width))
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          dirac: { ...state.schroedinger.dirac, packetWidth: clamped, needsReset: true },
        },
      }))
    },
    setDiracPositiveEnergyFraction: (fraction) => {
      if (!isFinite(fraction)) return
      const clamped = Math.max(0, Math.min(1, fraction))
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          dirac: { ...state.schroedinger.dirac, positiveEnergyFraction: clamped, needsReset: true },
        },
      }))
    },
    setDiracFieldView: nestedValueSetter(ctx, D, 'fieldView'),
    setDiracAutoScale: nestedValueSetter(ctx, D, 'autoScale'),
    setDiracShowPotential: nestedValueSetter(ctx, D, 'showPotential'),
    setDiracAbsorberEnabled: (enabled: boolean) => {
      ctx.setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          absorberEnabled: enabled,
          [D]: { ...state.schroedinger[D], absorberEnabled: enabled },
        },
      }))
    },
    setDiracAbsorberWidth: (value: number) => {
      if (!ctx.isFinite(value)) {
        ctx.warnNonFinite(`${D}.absorberWidth`, value)
        return
      }
      const clamped = Math.max(0.05, Math.min(0.5, value))
      ctx.setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          absorberWidth: clamped,
          [D]: { ...state.schroedinger[D], absorberWidth: clamped },
        },
      }))
    },
    setDiracPmlTargetReflection: nestedClampedSetter(ctx, D, 'pmlTargetReflection', 1e-12, 0.999),
    setDiracGridSize: (size) => {
      if (!hasOnlyFinite(size)) {
        warnNonFinite('dirac.gridSize', size)
        return
      }
      setWithVersion((state) => {
        const { latticeDim } = state.schroedinger.dirac
        const gridDefault = defaultDiracGridPerDim(latticeDim)
        const minGrid = minDiracGridPerDim(latticeDim)
        const snapped = Array.from({ length: latticeDim }, (_, i) => {
          const s = i < size.length ? size[i]! : gridDefault
          const val = Math.max(minGrid, Math.min(128, Math.round(s)))
          const log2 = Math.round(Math.log2(val))
          return Math.max(minGrid, Math.min(gridDefault, 2 ** log2))
        })
        reduceGridToFit(snapped, DIRAC_MAX_TOTAL_SITES, minGrid)
        // Re-clamp packet arrays with new grid extents
        const prevDirac = state.schroedinger.dirac
        const newSpacing = prevDirac.spacing
        const packetCenter = prevDirac.packetCenter.map((v, d) => {
          const halfExtent = (snapped[d] ?? 32) * (newSpacing[d] ?? 0.15) * 0.5
          const limit = halfExtent * 0.9
          return Math.max(-limit, Math.min(limit, v))
        })
        return {
          schroedinger: {
            ...state.schroedinger,
            dirac: { ...prevDirac, gridSize: snapped, packetCenter, needsReset: true },
          },
        }
      })
    },
    setDiracSpacing: (spacing) => {
      if (!hasOnlyFinite(spacing)) {
        warnNonFinite('dirac.spacing', spacing)
        return
      }
      setWithVersion((state) => {
        const { latticeDim } = state.schroedinger.dirac
        const clamped = Array.from({ length: latticeDim }, (_, i) => {
          const s = i < spacing.length ? spacing[i]! : 0.15
          return Math.max(0.01, Math.min(1.0, s))
        })
        // Re-clamp packet arrays with new spacing
        const prevDirac = state.schroedinger.dirac
        const packetCenter = prevDirac.packetCenter.map((v, d) => {
          const halfExtent = (prevDirac.gridSize[d] ?? 32) * (clamped[d] ?? 0.15) * 0.5
          const limit = halfExtent * 0.9
          return Math.max(-limit, Math.min(limit, v))
        })
        const packetMomentum = prevDirac.packetMomentum.map((v, d) => {
          const kMax = Math.PI / (clamped[d] ?? 0.15)
          return Math.max(-kMax, Math.min(kMax, v))
        })
        // Decreasing min(spacing) shrinks the Dirac CFL ceiling, so re-clamp
        // dt to keep the lattice stable after the user tightens the grid.
        const dt = clampDiracDt(clamped, prevDirac.speedOfLight, prevDirac.dt)
        return {
          schroedinger: {
            ...state.schroedinger,
            dirac: {
              ...prevDirac,
              spacing: clamped,
              packetCenter,
              packetMomentum,
              dt,
              needsReset: true,
            },
          },
        }
      })
    },
    setDiracPacketCenter: (dimIndex, value) => {
      if (!isFinite(value)) return
      setWithVersion((state) => {
        const { gridSize, spacing } = state.schroedinger.dirac
        const arr = [...state.schroedinger.dirac.packetCenter]
        if (dimIndex >= 0 && dimIndex < arr.length) {
          const halfExtent = (gridSize[dimIndex] ?? 32) * (spacing[dimIndex] ?? 0.15) * 0.5
          const limit = halfExtent * 0.9
          arr[dimIndex] = Math.max(-limit, Math.min(limit, value))
        }
        return {
          schroedinger: {
            ...state.schroedinger,
            dirac: { ...state.schroedinger.dirac, packetCenter: arr, needsReset: true },
          },
        }
      })
    },
    setDiracPacketMomentum: (dimIndex, value) => {
      if (!isFinite(value)) return
      setWithVersion((state) => {
        const { spacing } = state.schroedinger.dirac
        const arr = [...state.schroedinger.dirac.packetMomentum]
        if (dimIndex >= 0 && dimIndex < arr.length) {
          const kMax = Math.PI / (spacing[dimIndex] ?? 0.15)
          arr[dimIndex] = Math.max(-kMax, Math.min(kMax, value))
        }
        return {
          schroedinger: {
            ...state.schroedinger,
            dirac: { ...state.schroedinger.dirac, packetMomentum: arr, needsReset: true },
          },
        }
      })
    },
    setDiracSpinDirection: (dimIndex, value) => {
      if (!isFinite(value)) return
      setWithVersion((state) => {
        const arr = [...state.schroedinger.dirac.spinDirection]
        if (dimIndex >= 0 && dimIndex < arr.length) {
          arr[dimIndex] = value
        }
        return {
          schroedinger: {
            ...state.schroedinger,
            dirac: { ...state.schroedinger.dirac, spinDirection: arr, needsReset: true },
          },
        }
      })
    },
    setDiracParticleColor: nestedValueSetter(ctx, D, 'particleColor'),
    setDiracAntiparticleColor: nestedValueSetter(ctx, D, 'antiparticleColor'),
    setDiracDiagnosticsEnabled: nestedValueSetter(ctx, D, 'diagnosticsEnabled'),
    setDiracDiagnosticsInterval: nestedIntSetter(ctx, D, 'diagnosticsInterval', 1, 60),
    setDiracNeedsReset: () => {
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          dirac: { ...state.schroedinger.dirac, needsReset: true },
        },
      }))
    },
    clearDiracNeedsReset: () => {
      set((state) => ({
        schroedinger: {
          ...state.schroedinger,
          dirac: { ...state.schroedinger.dirac, needsReset: false },
        },
      }))
    },
    setDiracSlicePosition: (dimIndex, value) => {
      if (!isFinite(value)) return
      setWithVersion((state) => {
        const arr = [...state.schroedinger.dirac.slicePositions]
        if (dimIndex >= 0 && dimIndex < arr.length) {
          arr[dimIndex] = value
        }
        return {
          schroedinger: {
            ...state.schroedinger,
            dirac: { ...state.schroedinger.dirac, slicePositions: arr },
          },
        }
      })
    },
    applyDiracPreset: (presetId) => {
      void import('@/lib/physics/dirac/presets')
        .then(({ DIRAC_SCENARIO_PRESETS }) => {
          const preset = DIRAC_SCENARIO_PRESETS.find((p) => p.id === presetId)
          if (!preset) return
          setWithVersion((state) => {
            const prev = state.schroedinger.dirac
            const dim = prev.latticeDim

            const { latticeDim: _ld, gridSize: _gs, ...safeOverrides } = preset.overrides
            const merged = { ...prev, ...safeOverrides, needsReset: true }

            if (safeOverrides.spacing) {
              const srcSpacing = safeOverrides.spacing
              merged.spacing = Array.from({ length: dim }, (_, i) =>
                i < srcSpacing.length ? srcSpacing[i]! : srcSpacing[0]!
              )
            }

            const gs = merged.gridSize
            const sp = merged.spacing
            if (safeOverrides.packetCenter) {
              const src = safeOverrides.packetCenter
              merged.packetCenter = Array.from({ length: dim }, (_, i) => {
                const raw = i < src.length ? src[i]! : 0
                const limit = (gs[i] ?? 4) * (sp[i] ?? 0.15) * 0.5 * 0.9
                return Math.max(-limit, Math.min(limit, raw))
              })
            }
            if (safeOverrides.packetMomentum) {
              const src = safeOverrides.packetMomentum
              merged.packetMomentum = Array.from({ length: dim }, (_, i) => {
                const raw = i < src.length ? src[i]! : 0
                const kMax = Math.PI / (sp[i] ?? 0.15)
                return Math.max(-kMax, Math.min(kMax, raw))
              })
            }

            const minHalfExt = Math.min(...gs.map((g, i) => g * (sp[i] ?? 0.15) * 0.5))
            merged.packetWidth = Math.min(minHalfExt * 0.4, merged.packetWidth)

            merged.dt = clampDiracDt(merged.spacing, merged.speedOfLight, merged.dt)

            const parentAbsorber =
              preset.overrides.absorberEnabled !== undefined
                ? {
                    absorberEnabled: preset.overrides.absorberEnabled,
                    absorberWidth: preset.overrides.absorberWidth ?? merged.absorberWidth,
                  }
                : {}
            return {
              schroedinger: {
                ...state.schroedinger,
                ...parentAbsorber,
                dirac: merged,
              },
            }
          })

          // Sync the color algorithm to match the preset's fieldView.
          // Each Dirac fieldView has a preferred color algorithm (e.g.
          // particleAntiparticleSplit → particleAntiparticle, totalDensity → blackbody).
          // Without this sync, switching from a split-view preset to a single-channel
          // preset leaves the stale 'particleAntiparticle' algorithm active, and
          // DiracStrategy forces the fieldView back to split.
          if (preset.overrides.fieldView) {
            void import('@/rendering/shaders/palette/types')
              .then(({ DIRAC_FIELD_VIEW_TO_COLOR_ALGO }) => {
                const expectedView = preset.overrides.fieldView!
                // Guard: if a newer preset arrived while this chunk loaded,
                // the fieldView in the store won't match — skip the stale write.
                if (ctx.get().schroedinger.dirac.fieldView !== expectedView) return
                const algo = DIRAC_FIELD_VIEW_TO_COLOR_ALGO[expectedView]
                if (algo) {
                  void import('@/stores/appearanceStore').then(({ useAppearanceStore }) => {
                    useAppearanceStore.getState().setColorAlgorithm(algo)
                  })
                }
              })
              .catch((error) => {
                logger.warn(
                  `[diracSetters] Failed to load color algo map for '${presetId}':`,
                  error
                )
              })
          }
        })
        .catch((error) => {
          // Preset chunk failed to load (network error, chunk mismatch).
          // Without a catch, the unhandled rejection would surface as a
          // noisy console error with no context. Log and leave state as-is
          // so the user keeps whatever config they had before the switch.
          logger.warn(`[diracSetters] Failed to load Dirac presets for '${presetId}':`, error)
        })
    },
  }
}
