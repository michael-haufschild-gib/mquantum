import {
  DEFAULT_PAULI_CONFIG,
  type PauliConfig,
} from '@/lib/geometry/extended/types'
import { StateCreator } from 'zustand'
import { ExtendedObjectSlice, PauliSpinorSlice } from './types'

export const createPauliSpinorSlice: StateCreator<
  ExtendedObjectSlice,
  [],
  [],
  PauliSpinorSlice
> = (set, get) => {
  const isFinite = (value: number): boolean => Number.isFinite(value)

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

  return {
    pauliSpinor: { ...DEFAULT_PAULI_CONFIG },

    // === Physics ===
    setPauliDt: (dt) => setPauliClamped('dt', dt, 0.0001, 0.1),
    setPauliStepsPerFrame: (steps) => {
      setPauliField('stepsPerFrame', Math.max(1, Math.min(16, Math.round(steps))))
    },
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
    setPauliRotatingFrequency: (frequency) => setPauliClamped('rotatingFrequency', frequency, 0.01, 50),

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
        pauliSpinor: { ...state.pauliSpinor, packetWidth: Math.max(0.05, Math.min(5, width)), needsReset: true },
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
      const clamped = size.map((s) => {
        const n = Math.round(s)
        // Round to nearest power of 2 for FFT
        const pow2 = Math.pow(2, Math.round(Math.log2(Math.max(8, Math.min(256, n)))))
        return pow2
      })
      setWithVersion((state) => ({
        pauliSpinor: { ...state.pauliSpinor, gridSize: clamped, needsReset: true },
      }))
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
    setPauliAbsorberEnabled: (enabled) => setPauliField('absorberEnabled', enabled),
    setPauliAbsorberWidth: (width) => setPauliClamped('absorberWidth', width, 0.01, 0.5),
    setPauliAbsorberStrength: (strength) => setPauliClamped('absorberStrength', strength, 0.1, 50),

    // === Diagnostics ===
    setPauliDiagnosticsEnabled: (enabled) => setPauliField('diagnosticsEnabled', enabled),
    setPauliDiagnosticsInterval: (interval) => {
      setPauliField('diagnosticsInterval', Math.max(1, Math.min(100, Math.round(interval))))
    },

    // === Slice Animation ===
    setPauliSliceAnimationEnabled: (enabled) => setPauliField('sliceAnimationEnabled', enabled),
    setPauliSliceSpeed: (speed) => setPauliClamped('sliceSpeed', speed, 0.01, 0.1),
    setPauliSliceAmplitude: (amplitude) => setPauliClamped('sliceAmplitude', amplitude, 0.1, 1.0),

    // === Lifecycle ===
    setPauliNeedsReset: () => setPauliField('needsReset', true),
    clearPauliNeedsReset: () => setPauliField('needsReset', false),
    resetPauliField: () => {
      setWithVersion(() => ({
        pauliSpinor: { ...DEFAULT_PAULI_CONFIG, needsReset: true },
      }))
    },
    setPauliConfig: (config) => {
      setWithVersion((state) => ({
        pauliSpinor: { ...state.pauliSpinor, ...config },
      }))
    },
    initializePauliForDimension: (dimension) => {
      setWithVersion((state) => {
        const dim = Math.max(2, Math.min(11, dimension))
        const gridSize = Array.from({ length: dim }, () => dim <= 3 ? 64 : dim <= 5 ? 32 : 16)
        const spacing = Array.from({ length: dim }, () => 0.15)
        const packetCenter = Array.from({ length: 11 }, () => 0)
        const packetMomentum = Array.from({ length: 11 }, () => 0)
        return {
          pauliSpinor: {
            ...state.pauliSpinor,
            latticeDim: dim,
            gridSize,
            spacing,
            packetCenter,
            packetMomentum,
            needsReset: true,
          },
        }
      })
    },
    getPauliConfig: () => get().pauliSpinor,
  }
}
