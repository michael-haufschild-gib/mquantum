/**
 * Dirac Equation setter factory.
 *
 * Extracts all `setDirac*`, `applyDiracPreset`, `clearDiracNeedsReset`,
 * and `setDiracNeedsReset` methods from the schroedingerSlice.
 *
 * @module stores/slices/geometry/setters/diracSetters
 */

import type { DiracConfig } from '@/lib/geometry/extended/types'
import { maxStableDt } from '@/lib/physics/dirac/scales'

import type { SchroedingerSliceActions } from '../types'
import type { SetterContext } from './sliceSetterUtils'

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

/** Maximum total Dirac lattice sites — FFT needs power-of-2 per axis */
const DIRAC_MAX_TOTAL_SITES = 262144 // 64^3

const defaultDiracGridPerDim = (d: number): number => {
  const raw = Math.round(Math.pow(DIRAC_MAX_TOTAL_SITES, 1 / d))
  let pow2 = 2 ** Math.floor(Math.log2(Math.max(2, raw)))
  pow2 = Math.max(2, Math.min(128, pow2))
  while (pow2 > 2 && Math.pow(pow2, d) > DIRAC_MAX_TOTAL_SITES) {
    pow2 = pow2 / 2
  }
  return pow2
}

/**
 * Resize Dirac arrays to match a new latticeDim, preserving existing values
 * where possible and filling new dimensions with defaults.
 */
export const resizeDiracArrays = (prev: DiracConfig, newDim: number): Partial<DiracConfig> => {
  const gridDefault = defaultDiracGridPerDim(newDim)
  const gridSize = Array.from({ length: newDim }, () => gridDefault)
  const spacing = Array.from({ length: newDim }, (_, i) =>
    i < prev.spacing.length ? prev.spacing[i]! : 0.15
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
  const dtMax = maxStableDt(spacing, prev.speedOfLight)
  const newDt = Math.max(0.0001, Math.min(dtMax * 0.9, prev.dt))
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

  return {
    setDiracMass: (mass) => {
      if (!isFinite(mass)) return
      const clamped = Math.max(0.01, Math.min(10, mass))
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          dirac: { ...state.schroedinger.dirac, mass: clamped },
        },
      }))
    },
    setDiracSpeedOfLight: (c) => {
      if (!isFinite(c)) return
      const clamped = Math.max(0.01, Math.min(10, c))
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          dirac: { ...state.schroedinger.dirac, speedOfLight: clamped },
        },
      }))
    },
    setDiracHbar: (hbar) => {
      if (!isFinite(hbar)) return
      const clamped = Math.max(0.01, Math.min(10, hbar))
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          dirac: { ...state.schroedinger.dirac, hbar: clamped },
        },
      }))
    },
    setDiracDt: (dt) => {
      if (!isFinite(dt)) {
        warnNonFinite('dirac.dt', dt)
        return
      }
      setWithVersion((state) => {
        const { spacing, speedOfLight } = state.schroedinger.dirac
        const dtMax = maxStableDt(spacing, speedOfLight)
        const clamped = Math.max(0.0001, Math.min(dtMax * 0.9, dt))
        return {
          schroedinger: {
            ...state.schroedinger,
            dirac: { ...state.schroedinger.dirac, dt: clamped },
          },
        }
      })
    },
    setDiracStepsPerFrame: (steps) => {
      const clamped = Math.max(1, Math.min(16, Math.round(steps)))
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          dirac: { ...state.schroedinger.dirac, stepsPerFrame: clamped },
        },
      }))
    },
    setDiracPotentialType: (type) => {
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          dirac: { ...state.schroedinger.dirac, potentialType: type, needsReset: true },
        },
      }))
    },
    setDiracPotentialStrength: (strength) => {
      if (!isFinite(strength)) return
      const clamped = Math.max(-100, Math.min(100, strength))
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          dirac: { ...state.schroedinger.dirac, potentialStrength: clamped },
        },
      }))
    },
    setDiracPotentialWidth: (width) => {
      if (!isFinite(width)) return
      const clamped = Math.max(0.01, Math.min(10, width))
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          dirac: { ...state.schroedinger.dirac, potentialWidth: clamped },
        },
      }))
    },
    setDiracPotentialCenter: (center) => {
      if (!isFinite(center)) return
      const clamped = Math.max(-10, Math.min(10, center))
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          dirac: { ...state.schroedinger.dirac, potentialCenter: clamped },
        },
      }))
    },
    setDiracHarmonicOmega: (omega) => {
      if (!isFinite(omega)) return
      const clamped = Math.max(0.01, Math.min(10, omega))
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          dirac: { ...state.schroedinger.dirac, harmonicOmega: clamped },
        },
      }))
    },
    setDiracCoulombZ: (z) => {
      if (!isFinite(z)) return
      const clamped = Math.max(1, Math.min(137, Math.round(z)))
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          dirac: { ...state.schroedinger.dirac, coulombZ: clamped },
        },
      }))
    },
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
    setDiracFieldView: (view) => {
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          dirac: { ...state.schroedinger.dirac, fieldView: view },
        },
      }))
    },
    setDiracAutoScale: (autoScale) => {
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          dirac: { ...state.schroedinger.dirac, autoScale },
        },
      }))
    },
    setDiracShowPotential: (showPotential) => {
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          dirac: { ...state.schroedinger.dirac, showPotential },
        },
      }))
    },
    setDiracAbsorberEnabled: (enabled) => {
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          dirac: { ...state.schroedinger.dirac, absorberEnabled: enabled },
        },
      }))
    },
    setDiracAbsorberWidth: (width) => {
      if (!isFinite(width)) return
      const clamped = Math.max(0.05, Math.min(0.5, width))
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          dirac: { ...state.schroedinger.dirac, absorberWidth: clamped },
        },
      }))
    },
    setDiracPmlTargetReflection: (r) => {
      if (!isFinite(r)) {
        warnNonFinite('dirac.pmlTargetReflection', r)
        return
      }
      const clamped = Math.max(1e-12, Math.min(0.999, r))
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          dirac: { ...state.schroedinger.dirac, pmlTargetReflection: clamped },
        },
      }))
    },
    setDiracGridSize: (size) => {
      if (!hasOnlyFinite(size)) {
        warnNonFinite('dirac.gridSize', size)
        return
      }
      setWithVersion((state) => {
        const { latticeDim } = state.schroedinger.dirac
        const gridDefault = defaultDiracGridPerDim(latticeDim)
        const snapped = Array.from({ length: latticeDim }, (_, i) => {
          const s = i < size.length ? size[i]! : gridDefault
          const val = Math.max(2, Math.min(128, Math.round(s)))
          const log2 = Math.round(Math.log2(val))
          return Math.max(2, Math.min(gridDefault, 2 ** log2))
        })
        while (snapped.reduce((a, b) => a * b, 1) > DIRAC_MAX_TOTAL_SITES) {
          let maxIdx = 0
          for (let i = 1; i < snapped.length; i++) {
            if (snapped[i]! > snapped[maxIdx]!) maxIdx = i
          }
          if (snapped[maxIdx]! <= 2) break
          snapped[maxIdx] = snapped[maxIdx]! / 2
        }
        return {
          schroedinger: {
            ...state.schroedinger,
            dirac: { ...state.schroedinger.dirac, gridSize: snapped, needsReset: true },
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
        return {
          schroedinger: {
            ...state.schroedinger,
            dirac: { ...state.schroedinger.dirac, spacing: clamped, needsReset: true },
          },
        }
      })
    },
    setDiracPacketCenter: (dimIndex, value) => {
      if (!isFinite(value)) return
      setWithVersion((state) => {
        const arr = [...state.schroedinger.dirac.packetCenter]
        if (dimIndex >= 0 && dimIndex < arr.length) {
          arr[dimIndex] = value
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
        const arr = [...state.schroedinger.dirac.packetMomentum]
        if (dimIndex >= 0 && dimIndex < arr.length) {
          arr[dimIndex] = value
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
    setDiracParticleColor: (color) => {
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          dirac: { ...state.schroedinger.dirac, particleColor: color },
        },
      }))
    },
    setDiracAntiparticleColor: (color) => {
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          dirac: { ...state.schroedinger.dirac, antiparticleColor: color },
        },
      }))
    },
    setDiracDiagnosticsEnabled: (enabled) => {
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          dirac: { ...state.schroedinger.dirac, diagnosticsEnabled: enabled },
        },
      }))
    },
    setDiracDiagnosticsInterval: (interval) => {
      const clamped = Math.max(1, Math.min(60, Math.round(interval)))
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          dirac: { ...state.schroedinger.dirac, diagnosticsInterval: clamped },
        },
      }))
    },
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
      import('@/lib/physics/dirac/presets').then(({ DIRAC_SCENARIO_PRESETS }) => {
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

          const dtMax = maxStableDt(merged.spacing, merged.speedOfLight)
          merged.dt = Math.max(0.0001, Math.min(dtMax * 0.9, merged.dt))

          return {
            schroedinger: {
              ...state.schroedinger,
              dirac: merged,
            },
          }
        })
      })
    },
  }
}
