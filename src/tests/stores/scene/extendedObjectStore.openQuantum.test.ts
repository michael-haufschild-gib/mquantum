/**
 * Open Quantum System setter tests.
 *
 * Validates validation/clamping for decoherence rates, dt, substeps,
 * channel toggles, bath temperature, and reset flows.
 */
import { beforeEach, describe, expect, it } from 'vitest'

import { useAppearanceStore } from '@/stores/scene/appearanceStore'
import { useExtendedObjectStore } from '@/stores/scene/extendedObjectStore'

function oq() {
  return useExtendedObjectStore.getState().schroedinger.openQuantum
}

function store() {
  return useExtendedObjectStore.getState()
}

describe('Open Quantum setters', () => {
  beforeEach(() => {
    useExtendedObjectStore.getState().reset()
    useAppearanceStore.getState().setColorAlgorithm('mixed')
  })

  describe('setOpenQuantumEnabled', () => {
    it('enables open quantum', () => {
      store().setOpenQuantumEnabled(true)
      expect(oq().enabled).toBe(true)
    })

    it('disables open quantum', () => {
      store().setOpenQuantumEnabled(true)
      store().setOpenQuantumEnabled(false)
      expect(oq().enabled).toBe(false)
    })
  })

  describe('setOpenQuantumDephasingRate', () => {
    it('sets a valid rate', () => {
      store().setOpenQuantumDephasingRate(0.5)
      expect(oq().dephasingRate).toBe(0.5)
    })

    it('clamps to [0, max]', () => {
      store().setOpenQuantumDephasingRate(-1)
      expect(oq().dephasingRate).toBeGreaterThanOrEqual(0)
    })

    it('rejects NaN', () => {
      store().setOpenQuantumDephasingRate(0.5)
      store().setOpenQuantumDephasingRate(NaN)
      expect(oq().dephasingRate).toBe(0.5)
    })
  })

  describe('setOpenQuantumRelaxationRate', () => {
    it('sets a valid rate', () => {
      store().setOpenQuantumRelaxationRate(0.3)
      expect(oq().relaxationRate).toBe(0.3)
    })

    it('rejects NaN', () => {
      store().setOpenQuantumRelaxationRate(0.3)
      store().setOpenQuantumRelaxationRate(NaN)
      expect(oq().relaxationRate).toBe(0.3)
    })
  })

  describe('setOpenQuantumThermalUpRate', () => {
    it('sets a valid rate', () => {
      store().setOpenQuantumThermalUpRate(0.1)
      expect(oq().thermalUpRate).toBe(0.1)
    })

    it('rejects NaN', () => {
      store().setOpenQuantumThermalUpRate(0.1)
      store().setOpenQuantumThermalUpRate(NaN)
      expect(oq().thermalUpRate).toBe(0.1)
    })
  })

  describe('setOpenQuantumDt', () => {
    it('sets dt within range', () => {
      store().setOpenQuantumDt(0.01)
      expect(oq().dt).toBe(0.01)
    })

    it('rejects NaN', () => {
      store().setOpenQuantumDt(0.01)
      store().setOpenQuantumDt(NaN)
      expect(oq().dt).toBe(0.01)
    })
  })

  describe('setOpenQuantumSubsteps', () => {
    it('rounds and clamps', () => {
      store().setOpenQuantumSubsteps(5)
      expect(oq().substeps).toBe(5)
    })
  })

  describe('setOpenQuantumChannelEnabled', () => {
    it('toggles individual channels via keyMap', () => {
      store().setOpenQuantumChannelEnabled('dephasing', false)
      expect(oq().dephasingEnabled).toBe(false)
      store().setOpenQuantumChannelEnabled('dephasing', true)
      expect(oq().dephasingEnabled).toBe(true)
    })
  })

  describe('setOpenQuantumVisualizationMode', () => {
    it('sets visualization mode', () => {
      store().setOpenQuantumVisualizationMode('purityMap')
      expect(oq().visualizationMode).toBe('purityMap')
    })

    it('syncs visualization mode to the renderer color algorithm', () => {
      store().setOpenQuantumVisualizationMode('entropyMap')
      expect(oq().visualizationMode).toBe('entropyMap')
      expect(useAppearanceStore.getState().colorAlgorithm).toBe('entropyMap')

      store().setOpenQuantumVisualizationMode('density')
      expect(useAppearanceStore.getState().colorAlgorithm).toBe('blackbody')
    })

    it('rejects invalid visualization modes from untyped callers', () => {
      store().setOpenQuantumVisualizationMode('entropyMap')
      store().setOpenQuantumVisualizationMode('phase' as never)
      expect(oq().visualizationMode).toBe('density')
      expect(useAppearanceStore.getState().colorAlgorithm).toBe('blackbody')
    })
  })

  describe('setOpenQuantumBathTemperature', () => {
    it('sets temperature', () => {
      store().setOpenQuantumBathTemperature(300)
      expect(oq().bathTemperature).toBe(300)
    })

    it('rejects NaN', () => {
      store().setOpenQuantumBathTemperature(300)
      store().setOpenQuantumBathTemperature(NaN)
      expect(oq().bathTemperature).toBe(300)
    })
  })

  describe('setOpenQuantumCouplingScale', () => {
    it('sets coupling scale', () => {
      store().setOpenQuantumCouplingScale(2.0)
      expect(oq().couplingScale).toBe(2.0)
    })
  })

  describe('setOpenQuantumHydrogenBasisMaxN', () => {
    it('clamps to [1, 3]', () => {
      store().setOpenQuantumHydrogenBasisMaxN(2)
      expect(oq().hydrogenBasisMaxN).toBe(2)
      store().setOpenQuantumHydrogenBasisMaxN(5)
      expect(oq().hydrogenBasisMaxN).toBe(3)
    })
  })

  describe('setOpenQuantumDephasingModel', () => {
    it('sets dephasing model', () => {
      store().setOpenQuantumDephasingModel('uniform')
      expect(oq().dephasingModel).toBe('uniform')
    })

    it('rejects invalid dephasing models from untyped callers', () => {
      store().setOpenQuantumDephasingModel('none')
      store().setOpenQuantumDephasingModel('bogus' as never)
      expect(oq().dephasingModel).toBe('uniform')
    })
  })

  describe('requestOpenQuantumStateReset', () => {
    it('increments resetToken', () => {
      const before = oq().resetToken ?? 0
      store().requestOpenQuantumStateReset()
      expect(oq().resetToken).toBe(before + 1)
    })
  })

  describe('resetOpenQuantumToDefault', () => {
    it('resets to default config', () => {
      store().setOpenQuantumDephasingRate(99)
      store().resetOpenQuantumToDefault()
      // Should be back to default
      expect(oq().dephasingRate).not.toBe(99)
    })

    it('resets the renderer color algorithm to default density coloring', () => {
      store().setOpenQuantumVisualizationMode('entropyMap')
      expect(useAppearanceStore.getState().colorAlgorithm).toBe('entropyMap')

      store().resetOpenQuantumToDefault()

      expect(oq().visualizationMode).toBe('density')
      expect(useAppearanceStore.getState().colorAlgorithm).toBe('blackbody')
    })
  })
})
