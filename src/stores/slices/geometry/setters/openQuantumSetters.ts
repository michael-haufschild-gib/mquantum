/**
 * Open Quantum System setter factory.
 *
 * Extracts all `setOpenQuantum*`, `requestOpenQuantumStateReset`, and
 * `resetOpenQuantumToDefault` methods from the schroedingerSlice.
 *
 * @module stores/slices/geometry/setters/openQuantumSetters
 */

import { DEFAULT_OPEN_QUANTUM_CONFIG } from '@/lib/geometry/extended/types'
import type { SchroedingerSliceActions } from '../types'
import type { SetterContext } from './sliceSetterUtils'

type OpenQuantumActions = Pick<
  SchroedingerSliceActions,
  | 'setOpenQuantumEnabled'
  | 'setOpenQuantumDephasingRate'
  | 'setOpenQuantumRelaxationRate'
  | 'setOpenQuantumThermalUpRate'
  | 'setOpenQuantumDt'
  | 'setOpenQuantumSubsteps'
  | 'setOpenQuantumChannelEnabled'
  | 'setOpenQuantumVisualizationMode'
  | 'requestOpenQuantumStateReset'
  | 'resetOpenQuantumToDefault'
  | 'setOpenQuantumBathTemperature'
  | 'setOpenQuantumCouplingScale'
  | 'setOpenQuantumHydrogenBasisMaxN'
  | 'setOpenQuantumDephasingModel'
>

/**
 * Creates all Open Quantum System setter actions for the schroedingerSlice.
 * @param ctx - Shared setter context with set/get and validation helpers
 */
export function createOpenQuantumSetters(ctx: SetterContext): OpenQuantumActions {
  const { setWithVersion, isFinite, warnNonFinite } = ctx

  return {
    setOpenQuantumEnabled: (enabled) => {
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          openQuantum: { ...state.schroedinger.openQuantum, enabled },
        },
      }))
    },
    setOpenQuantumDephasingRate: (rate) => {
      if (!isFinite(rate)) {
        warnNonFinite('openQuantum.dephasingRate', rate)
        return
      }
      const clamped = Math.max(0, Math.min(5, rate))
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          openQuantum: { ...state.schroedinger.openQuantum, dephasingRate: clamped },
        },
      }))
    },
    setOpenQuantumRelaxationRate: (rate) => {
      if (!isFinite(rate)) {
        warnNonFinite('openQuantum.relaxationRate', rate)
        return
      }
      const clamped = Math.max(0, Math.min(5, rate))
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          openQuantum: { ...state.schroedinger.openQuantum, relaxationRate: clamped },
        },
      }))
    },
    setOpenQuantumThermalUpRate: (rate) => {
      if (!isFinite(rate)) {
        warnNonFinite('openQuantum.thermalUpRate', rate)
        return
      }
      const clamped = Math.max(0, Math.min(5, rate))
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          openQuantum: { ...state.schroedinger.openQuantum, thermalUpRate: clamped },
        },
      }))
    },
    setOpenQuantumDt: (dt) => {
      if (!isFinite(dt)) {
        warnNonFinite('openQuantum.dt', dt)
        return
      }
      const clamped = Math.max(0.001, Math.min(0.1, dt))
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          openQuantum: { ...state.schroedinger.openQuantum, dt: clamped },
        },
      }))
    },
    setOpenQuantumSubsteps: (n) => {
      if (!isFinite(n)) {
        warnNonFinite('openQuantum.substeps', n)
        return
      }
      const clamped = Math.max(1, Math.min(10, Math.floor(n)))
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          openQuantum: { ...state.schroedinger.openQuantum, substeps: clamped },
        },
      }))
    },
    setOpenQuantumChannelEnabled: (channel, enabled) => {
      const keyMap = {
        dephasing: 'dephasingEnabled',
        relaxation: 'relaxationEnabled',
        thermal: 'thermalEnabled',
      } as const
      const key = keyMap[channel]
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          openQuantum: { ...state.schroedinger.openQuantum, [key]: enabled },
        },
      }))
    },
    setOpenQuantumVisualizationMode: (mode) => {
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          openQuantum: { ...state.schroedinger.openQuantum, visualizationMode: mode },
        },
      }))
    },
    requestOpenQuantumStateReset: () => {
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          openQuantum: {
            ...state.schroedinger.openQuantum,
            resetToken: (state.schroedinger.openQuantum.resetToken ?? 0) + 1,
          },
        },
      }))
    },
    resetOpenQuantumToDefault: () => {
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          openQuantum: { ...DEFAULT_OPEN_QUANTUM_CONFIG },
        },
      }))
    },
    setOpenQuantumBathTemperature: (T) => {
      if (!isFinite(T)) {
        warnNonFinite('openQuantum.bathTemperature', T)
        return
      }
      const clamped = Math.max(0.1, Math.min(100000, T))
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          openQuantum: { ...state.schroedinger.openQuantum, bathTemperature: clamped },
        },
      }))
    },
    setOpenQuantumCouplingScale: (s) => {
      if (!isFinite(s)) {
        warnNonFinite('openQuantum.couplingScale', s)
        return
      }
      const clamped = Math.max(0.01, Math.min(100, s))
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          openQuantum: { ...state.schroedinger.openQuantum, couplingScale: clamped },
        },
      }))
    },
    setOpenQuantumHydrogenBasisMaxN: (n) => {
      if (!isFinite(n)) {
        warnNonFinite('openQuantum.hydrogenBasisMaxN', n)
        return
      }
      const clamped = Math.max(1, Math.min(3, Math.floor(n)))
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          openQuantum: { ...state.schroedinger.openQuantum, hydrogenBasisMaxN: clamped },
        },
      }))
    },
    setOpenQuantumDephasingModel: (model) => {
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          openQuantum: { ...state.schroedinger.openQuantum, dephasingModel: model },
        },
      }))
    },
  }
}
