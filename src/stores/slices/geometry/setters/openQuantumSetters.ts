/**
 * Open Quantum System setter factory.
 *
 * Extracts all `setOpenQuantum*`, `requestOpenQuantumStateReset`, and
 * `resetOpenQuantumToDefault` methods from the schroedingerSlice.
 *
 * @module stores/slices/geometry/setters/openQuantumSetters
 */

import { DEFAULT_OPEN_QUANTUM_CONFIG } from '@/lib/physics/openQuantum/types'

import type { SchroedingerSliceActions } from '../types'
import {
  nestedClampedSetter,
  nestedIntSetter,
  nestedValueSetter,
  type SetterContext,
} from './sliceSetterUtils'

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
  const { setWithVersion } = ctx
  const D = 'openQuantum' as const

  return {
    setOpenQuantumEnabled: nestedValueSetter(ctx, D, 'enabled'),
    setOpenQuantumDephasingRate: nestedClampedSetter(ctx, D, 'dephasingRate', 0, 5),
    setOpenQuantumRelaxationRate: nestedClampedSetter(ctx, D, 'relaxationRate', 0, 5),
    setOpenQuantumThermalUpRate: nestedClampedSetter(ctx, D, 'thermalUpRate', 0, 5),
    setOpenQuantumDt: nestedClampedSetter(ctx, D, 'dt', 0.001, 0.1),
    setOpenQuantumSubsteps: nestedIntSetter(ctx, D, 'substeps', 1, 10, 'floor'),
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
    setOpenQuantumVisualizationMode: nestedValueSetter(ctx, D, 'visualizationMode'),
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
    setOpenQuantumBathTemperature: nestedClampedSetter(ctx, D, 'bathTemperature', 0.1, 100000),
    setOpenQuantumCouplingScale: nestedClampedSetter(ctx, D, 'couplingScale', 0.01, 100),
    setOpenQuantumHydrogenBasisMaxN: nestedIntSetter(ctx, D, 'hydrogenBasisMaxN', 1, 3, 'floor'),
    setOpenQuantumDephasingModel: nestedValueSetter(ctx, D, 'dephasingModel'),
  }
}
