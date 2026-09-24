import { StateCreator } from 'zustand'

import { MAX_DIMENSION, MIN_DIMENSION } from '@/constants/dimension'
import { minDiracGridPerDim } from '@/lib/geometry/extended/dirac'
import {
  createDefaultPauliConfig,
  DEFAULT_PAULI_CONFIG,
  type PauliConfig,
} from '@/lib/geometry/extended/pauli'
import { reduceGridToFit } from '@/lib/math/ndArray'

import { TDSE_MAX_TOTAL_SITES } from './setters/sliceSetterUtils'
import { ExtendedObjectSlice, PauliSpinorSlice } from './types'

export const createPauliSpinorSlice: StateCreator<ExtendedObjectSlice, [], [], PauliSpinorSlice> = (
  set,
  get
) => {
  const isFinite = (value: number): boolean => Number.isFinite(value)

  const clampPauliDimension = (dimension: number): number => {
    if (!Number.isFinite(dimension)) return DEFAULT_PAULI_CONFIG.latticeDim
    return Math.max(MIN_DIMENSION, Math.min(MAX_DIMENSION, Math.floor(dimension)))
  }

  /** Wrapped setter that auto-increments pauliSpinorVersion on state changes. */
  const setWithVersion: typeof set = (updater) => {
    set((state) => {
      const update = typeof updater === 'function' ? updater(state) : updater
      if ('pauliSpinor' in update) {
        return { ...update, pauliSpinorVersion: state.pauliSpinorVersion + 1 }
      }
      return update
    })
  }

  /** Helper: update a single PauliConfig field. */
  const setPauliField = <K extends keyof PauliConfig>(key: K, value: PauliConfig[K]) => {
    setWithVersion((state) => ({
      pauliSpinor: { ...state.pauliSpinor, [key]: value },
    }))
  }

  /** Helper: update a PauliConfig field with clamping. */
  const setPauliClamped = (key: keyof PauliConfig, value: number, min: number, max: number) => {
    if (!isFinite(value)) return
    setPauliField(key, Math.max(min, Math.min(max, value)) as never)
  }

  /** Helper: write a PML field to both the Pauli config and the shared schroedinger override. */
  const setPauliSharedPml = <K extends 'absorberEnabled' | 'absorberWidth' | 'pmlTargetReflection'>(
    key: K,
    value: PauliConfig[K]
  ) => {
    setWithVersion((state) => ({
      pauliSpinor: { ...state.pauliSpinor, [key]: value },
      schroedinger: { ...state.schroedinger, [key]: value },
      schroedingerVersion: state.schroedingerVersion + 1,
    }))
  }

  const setPauliIntClamped = (key: keyof PauliConfig, value: number, min: number, max: number) => {
    if (!isFinite(value)) return
    setPauliField(key, Math.max(min, Math.min(max, Math.round(value))) as never)
  }

  return {
    pauliSpinor: createDefaultPauliConfig(),

    // === Physics ===
    setPauliDt: (dt) => setPauliClamped('dt', dt, 0.0001, 0.1),
    setPauliStepsPerFrame: (steps) => setPauliIntClamped('stepsPerFrame', steps, 1, 16),
    setPauliHbar: (hbar) => setPauliClamped('hbar', hbar, 0.01, 10),
    setPauliMass: (mass) => setPauliClamped('mass', mass, 0.01, 10),

    // === Magnetic Field ===
    setPauliFieldType: (type) => {
      setWithVersion((state) => ({
        pauliSpinor: { ...state.pauliSpinor, fieldType: type, needsReset: true },
      }))
    },
    setPauliFieldStrength: (strength) => setPauliClamped('fieldStrength', strength, 0, 50),
    setPauliFieldDirection: (direction) => {
      if (!isFinite(direction[0]) || !isFinite(direction[1])) return
      setPauliField('fieldDirection', direction)
    },
    setPauliGradientStrength: (strength) => setPauliClamped('gradientStrength', strength, 0, 20),
    setPauliRotatingFrequency: (frequency) =>
      setPauliClamped('rotatingFrequency', frequency, 0.01, 50),

    // === Initial Spin State ===
    setPauliInitialSpinDirection: (direction) => {
      if (!isFinite(direction[0]) || !isFinite(direction[1])) return
      setWithVersion((state) => ({
        pauliSpinor: { ...state.pauliSpinor, initialSpinDirection: direction, needsReset: true },
      }))
    },

    // === Initial Wavepacket ===
    setPauliInitialCondition: (condition) => {
      setWithVersion((state) => ({
        pauliSpinor: { ...state.pauliSpinor, initialCondition: condition, needsReset: true },
      }))
    },
    setPauliPacketCenter: (dimIndex, value) => {
      if (!isFinite(value)) return
      setWithVersion((state) => {
        const center = [...state.pauliSpinor.packetCenter]
        center[dimIndex] = Math.max(-10, Math.min(10, value))
        return { pauliSpinor: { ...state.pauliSpinor, packetCenter: center, needsReset: true } }
      })
    },
    setPauliPacketWidth: (width) => {
      if (!isFinite(width)) return
      setWithVersion((state) => ({
        pauliSpinor: {
          ...state.pauliSpinor,
          packetWidth: Math.max(0.05, Math.min(5, width)),
          needsReset: true,
        },
      }))
    },
    setPauliPacketMomentum: (dimIndex, value) => {
      if (!isFinite(value)) return
      setWithVersion((state) => {
        const momentum = [...state.pauliSpinor.packetMomentum]
        momentum[dimIndex] = Math.max(-20, Math.min(20, value))
        return { pauliSpinor: { ...state.pauliSpinor, packetMomentum: momentum, needsReset: true } }
      })
    },

    // === Scalar Potential ===
    setPauliPotentialType: (type) => {
      setWithVersion((state) => ({
        pauliSpinor: { ...state.pauliSpinor, potentialType: type, needsReset: true },
      }))
    },
    setPauliHarmonicOmega: (omega) => setPauliClamped('harmonicOmega', omega, 0.01, 10),
    setPauliWellDepth: (depth) => setPauliClamped('wellDepth', depth, 0, 100),
    setPauliWellWidth: (width) => setPauliClamped('wellWidth', width, 0.01, 10),
    setPauliShowPotential: (show) => setPauliField('showPotential', show),

    // === Visualization ===
    setPauliFieldView: (view) => setPauliField('fieldView', view),
    setPauliSpinUpColor: (color) => setPauliField('spinUpColor', color),
    setPauliSpinDownColor: (color) => setPauliField('spinDownColor', color),
    setPauliAutoScale: (autoScale) => setPauliField('autoScale', autoScale),

    // === Grid ===
    setPauliGridSize: (size) => {
      if (!size.every(isFinite)) return
      // Same contract as setTdseGridSize / setDiracGridSize: a power of two per
      // axis inside the shared-memory FFT range [2, 128], then fit the site
      // budget the grid selector advertises. The old [8, 256] admitted a 256
      // axis the FFT kernel cannot represent, and its floor of 8 silently
      // rounded the selector's 2 / 4 options back up to 8 (no effect at 5–6D).
      // The per-dimension floor keeps ≥ 64 sites: the spin-down component is
      // bound at byte offset totalSites·8, which must be 256-byte aligned
      // (same constraint and helper as Dirac's per-component slices).
      setWithVersion((state) => {
        const minGrid = minDiracGridPerDim(state.pauliSpinor.latticeDim)
        const snapped = size.map((s) => {
          const n = Math.max(minGrid, Math.min(128, Math.round(s)))
          return Math.max(minGrid, Math.min(128, 2 ** Math.round(Math.log2(n))))
        })
        const gridSize = reduceGridToFit(snapped, TDSE_MAX_TOTAL_SITES, minGrid)
        return { pauliSpinor: { ...state.pauliSpinor, gridSize, needsReset: true } }
      })
    },
    setPauliSpacing: (spacing) => {
      if (!spacing.every(isFinite)) return
      const clamped = spacing.map((s) => Math.max(0.01, Math.min(1.0, s)))
      setWithVersion((state) => ({
        pauliSpinor: { ...state.pauliSpinor, spacing: clamped, needsReset: true },
      }))
    },
    setPauliSlicePosition: (dimIndex, value) => {
      if (!isFinite(value)) return
      setWithVersion((state) => {
        const positions = [...state.pauliSpinor.slicePositions]
        positions[dimIndex] = Math.max(-1, Math.min(1, value))
        return { pauliSpinor: { ...state.pauliSpinor, slicePositions: positions } }
      })
    },

    // === Absorber ===
    // The renderer resolves PML settings as `schroedinger.* ?? pauliSpinor.*`
    // (applySharedPml), and the shared fields always hold a value, so a
    // per-mode-only write was a silent no-op. Mirror into the shared fields
    // like the TDSE / Dirac per-mode setters do.
    setPauliAbsorberEnabled: (enabled) => setPauliSharedPml('absorberEnabled', enabled),
    setPauliAbsorberWidth: (width) => {
      if (!isFinite(width)) return
      setPauliSharedPml('absorberWidth', Math.max(0.05, Math.min(0.5, width)))
    },
    setPauliPmlTargetReflection: (r) => {
      if (!isFinite(r)) return
      setPauliSharedPml('pmlTargetReflection', Math.max(1e-12, Math.min(0.999, r)))
    },

    // === Diagnostics ===
    setPauliDiagnosticsEnabled: (enabled) => setPauliField('diagnosticsEnabled', enabled),
    setPauliDiagnosticsInterval: (interval) =>
      setPauliIntClamped('diagnosticsInterval', interval, 1, 100),

    // === Slice Animation ===
    setPauliSliceAnimationEnabled: (enabled) => setPauliField('sliceAnimationEnabled', enabled),
    setPauliSliceSpeed: (speed) => setPauliClamped('sliceSpeed', speed, 0.01, 0.1),
    setPauliSliceAmplitude: (amplitude) => setPauliClamped('sliceAmplitude', amplitude, 0.1, 1.0),

    // === Lifecycle ===
    resetPauliField: () => {
      setWithVersion((state) => ({
        pauliSpinor: { ...state.pauliSpinor, needsReset: true },
      }))
    },
    setPauliConfig: (config) => {
      setWithVersion((state) => ({
        pauliSpinor: { ...state.pauliSpinor, ...config },
      }))
    },
    initializePauliForDimension: (dimension) => {
      setWithVersion((state) => {
        const dim = clampPauliDimension(dimension)
        const gridSize = Array.from({ length: dim }, () =>
          dim <= 3 ? 64 : dim <= 4 ? 32 : dim <= 7 ? 8 : 4
        )
        const spacing = Array.from({ length: dim }, () => 0.15)
        const packetCenter = Array.from({ length: MAX_DIMENSION }, () => 0)
        const packetMomentum = Array.from({ length: MAX_DIMENSION }, () => 0)
        // Resize slicePositions to match the number of extra dims (dim - 3).
        // Preserve any existing values at the matching 0-indexed extra-dim slots.
        const prevSlice = state.pauliSpinor.slicePositions
        const slicePositions = Array.from({ length: Math.max(0, dim - 3) }, (_, i) =>
          i < prevSlice.length ? (prevSlice[i] ?? 0) : 0
        )
        return {
          pauliSpinor: {
            ...state.pauliSpinor,
            latticeDim: dim,
            gridSize,
            spacing,
            packetCenter,
            packetMomentum,
            slicePositions,
            needsReset: true,
          },
        }
      })
    },
    getPauliConfig: () => get().pauliSpinor,
  }
}
