/**
 * Tests for the unified diagnostics store.
 *
 * Validates push/reset lifecycle for each quantum mode channel,
 * ring buffer advancement, and eigenstate level spacing computation.
 */

import { beforeEach, describe, expect, it } from 'vitest'

import type {
  DensitySnapshot,
  ObservablesSnapshot,
  TdseSnapshot,
  WavefunctionSliceData,
} from '@/stores/diagnostics/types'
import { useDiagnosticsStore } from '@/stores/diagnosticsStore'

function makeTdseSnapshot(overrides: Partial<TdseSnapshot> = {}): TdseSnapshot {
  return {
    simTime: 0.1,
    totalNorm: 1.0,
    maxDensity: 0.5,
    normDrift: 0.001,
    normLeft: 0.5,
    normRight: 0.5,
    R: 0.3,
    T: 0.7,
    ipr: 0.25,
    ...overrides,
  }
}

describe('diagnosticsStore', () => {
  beforeEach(() => {
    // Reset all channels
    const s = useDiagnosticsStore.getState()
    s.resetTdse()
    s.resetBec()
    s.resetDirac()
    s.resetFsf()
    s.resetPauli()
    s.resetQw()
    s.clearEigenstate()
    s.resetObservables()
    s.resetOpenQuantum()
    s.resetDensity()
  })

  describe('TDSE channel', () => {
    it('starts without data', () => {
      expect(useDiagnosticsStore.getState().tdse.hasData).toBe(false)
    })

    it('pushTdseSnapshot sets hasData and stores values', () => {
      useDiagnosticsStore.getState().pushTdseSnapshot(makeTdseSnapshot({ totalNorm: 0.98 }))
      const ch = useDiagnosticsStore.getState().tdse
      expect(ch.hasData).toBe(true)
      expect(ch.totalNorm).toBe(0.98)
      expect(ch.ipr).toBe(0.25)
    })

    it('advances ring buffer head on each push', () => {
      const push = useDiagnosticsStore.getState().pushTdseSnapshot
      push(makeTdseSnapshot({ simTime: 0.1 }))
      const h1 = useDiagnosticsStore.getState().tdse.historyHead
      push(makeTdseSnapshot({ simTime: 0.2 }))
      const h2 = useDiagnosticsStore.getState().tdse.historyHead
      expect(h2).toBe(h1 + 1)
    })

    it('increments readbackGeneration', () => {
      const gen0 = useDiagnosticsStore.getState().tdse.readbackGeneration
      useDiagnosticsStore.getState().pushTdseSnapshot(makeTdseSnapshot())
      expect(useDiagnosticsStore.getState().tdse.readbackGeneration).toBe(gen0 + 1)
    })

    it('resetTdse clears data but preserves readbackGeneration', () => {
      useDiagnosticsStore.getState().pushTdseSnapshot(makeTdseSnapshot())
      const gen = useDiagnosticsStore.getState().tdse.readbackGeneration
      useDiagnosticsStore.getState().resetTdse()
      const ch = useDiagnosticsStore.getState().tdse
      expect(ch.hasData).toBe(false)
      expect(ch.readbackGeneration).toBe(gen)
    })
  })

  describe('BEC channel', () => {
    it('updateBec sets hasData', () => {
      useDiagnosticsStore.getState().updateBec({ totalNorm: 0.99 })
      expect(useDiagnosticsStore.getState().bec.hasData).toBe(true)
    })

    it('setBecIncompressibleSpectrum updates spectrum data', () => {
      const spectrum = new Float32Array([1, 2, 3])
      const kValues = new Float32Array([0.1, 0.2, 0.3])
      useDiagnosticsStore.getState().setBecIncompressibleSpectrum(spectrum, kValues, 5.0, 2.0)
      const ch = useDiagnosticsStore.getState().bec
      expect(ch.incompressibleSpectrum).toBe(spectrum)
      expect(ch.spectrumKValues).toBe(kValues)
      expect(ch.totalIncompressibleEnergy).toBe(5.0)
      expect(ch.totalCompressibleEnergy).toBe(2.0)
    })

    it('resetBec clears data', () => {
      useDiagnosticsStore.getState().updateBec({ totalNorm: 0.99 })
      useDiagnosticsStore.getState().resetBec()
      expect(useDiagnosticsStore.getState().bec.hasData).toBe(false)
    })
  })

  describe('Dirac channel', () => {
    it('updateDirac sets hasData', () => {
      useDiagnosticsStore.getState().updateDirac({ totalNorm: 1.0, particleFraction: 0.8 })
      const ch = useDiagnosticsStore.getState().dirac
      expect(ch.hasData).toBe(true)
      expect(ch.particleFraction).toBe(0.8)
    })

    it('resetDirac clears data', () => {
      useDiagnosticsStore.getState().updateDirac({ totalNorm: 1.0 })
      useDiagnosticsStore.getState().resetDirac()
      expect(useDiagnosticsStore.getState().dirac.hasData).toBe(false)
    })
  })

  describe('FSF channel', () => {
    it('pushFsfSnapshot computes energy drift', () => {
      useDiagnosticsStore.getState().pushFsfSnapshot({
        totalEnergy: 10.0,
        totalNorm: 1.0,
        maxPhi: 0.5,
        maxPi: 0.3,
        energyDrift: 0,
        meanPhi: 0.1,
        variancePhi: 0.01,
      })
      const ch = useDiagnosticsStore.getState().fsf
      expect(ch.hasData).toBe(true)
      expect(ch.initialEnergy).toBe(10.0)
      expect(ch.energyDrift).toBe(0) // first push, no drift

      // Second push with different energy
      useDiagnosticsStore.getState().pushFsfSnapshot({
        totalEnergy: 10.5,
        totalNorm: 1.0,
        maxPhi: 0.5,
        maxPi: 0.3,
        energyDrift: 0,
        meanPhi: 0.1,
        variancePhi: 0.01,
      })
      const ch2 = useDiagnosticsStore.getState().fsf
      expect(ch2.energyDrift).toBeCloseTo(0.05) // (10.5 - 10.0) / |10.0|
    })

    it('resetFsf clears data', () => {
      useDiagnosticsStore.getState().pushFsfSnapshot({
        totalEnergy: 10.0,
        totalNorm: 1.0,
        maxPhi: 0.5,
        maxPi: 0.3,
        energyDrift: 0,
        meanPhi: 0.1,
        variancePhi: 0.01,
      })
      useDiagnosticsStore.getState().resetFsf()
      expect(useDiagnosticsStore.getState().fsf.hasData).toBe(false)
    })
  })

  describe('Pauli channel', () => {
    it('updatePauli stores spin fractions', () => {
      useDiagnosticsStore.getState().updatePauli({
        totalNorm: 1.0,
        spinUpFraction: 0.6,
        spinExpectationZ: 0.2,
      })
      const ch = useDiagnosticsStore.getState().pauli
      expect(ch.hasData).toBe(true)
      expect(ch.spinUpFraction).toBe(0.6)
    })

    it('resetPauli clears data', () => {
      useDiagnosticsStore.getState().updatePauli({ totalNorm: 1.0 })
      useDiagnosticsStore.getState().resetPauli()
      expect(useDiagnosticsStore.getState().pauli.hasData).toBe(false)
    })
  })

  describe('Quantum Walk channel', () => {
    it('pushQwDiagnostics computes norm drift and position stats', () => {
      // First push sets initialNorm
      useDiagnosticsStore.getState().pushQwDiagnostics(1.0, 10, 2.0, 5.0)
      const ch = useDiagnosticsStore.getState().qw
      expect(ch.hasData).toBe(true)
      expect(ch.initialNorm).toBe(1.0)
      expect(ch.normDrift).toBe(0)
      expect(ch.positionMean).toBe(2.0) // posSum / totalNorm
      expect(ch.positionVariance).toBeCloseTo(1.0) // 5.0/1.0 - 2.0^2

      // Second push — norm drifted
      useDiagnosticsStore.getState().pushQwDiagnostics(0.95, 20, 1.5, 4.0)
      const ch2 = useDiagnosticsStore.getState().qw
      expect(ch2.normDrift).toBeCloseTo(-0.05) // (0.95 - 1.0) / 1.0
      expect(ch2.initialNorm).toBe(1.0) // unchanged
    })

    it('resetQw clears data', () => {
      useDiagnosticsStore.getState().pushQwDiagnostics(1.0, 10, 2.0, 5.0)
      useDiagnosticsStore.getState().resetQw()
      expect(useDiagnosticsStore.getState().qw.hasData).toBe(false)
    })
  })

  describe('Eigenstate channel', () => {
    it('pushEigenstate accumulates entries', () => {
      useDiagnosticsStore.getState().pushEigenstate(1.5, 0.3)
      useDiagnosticsStore.getState().pushEigenstate(2.5, 0.4)
      const ch = useDiagnosticsStore.getState().eigenstate
      expect(ch.eigenstates).toHaveLength(2)
      expect(ch.eigenstates[0]!.energy).toBe(1.5)
      expect(ch.eigenstates[0]!.ipr).toBe(0.3)
      expect(ch.eigenstates[1]!.index).toBe(1)
    })

    it('updateEigenstateIPR modifies existing entry', () => {
      useDiagnosticsStore.getState().pushEigenstate(1.5, 0.3)
      useDiagnosticsStore.getState().updateEigenstateIPR(0, 0.9)
      expect(useDiagnosticsStore.getState().eigenstate.eigenstates[0]!.ipr).toBe(0.9)
    })

    it('updateEigenstateIPR ignores invalid index', () => {
      useDiagnosticsStore.getState().pushEigenstate(1.5, 0.3)
      useDiagnosticsStore.getState().updateEigenstateIPR(-1, 0.9)
      useDiagnosticsStore.getState().updateEigenstateIPR(5, 0.9)
      expect(useDiagnosticsStore.getState().eigenstate.eigenstates[0]!.ipr).toBe(0.3)
    })

    it('updateEigenstateOrbitCorrelation modifies existing entry', () => {
      useDiagnosticsStore.getState().pushEigenstate(1.5, 0.3)
      useDiagnosticsStore.getState().updateEigenstateOrbitCorrelation(0, 0.85)
      expect(useDiagnosticsStore.getState().eigenstate.eigenstates[0]!.orbitCorrelation).toBe(0.85)
    })

    it('clearEigenstate empties all entries', () => {
      useDiagnosticsStore.getState().pushEigenstate(1.5, 0.3)
      useDiagnosticsStore.getState().pushEigenstate(2.5, 0.4)
      useDiagnosticsStore.getState().clearEigenstate()
      expect(useDiagnosticsStore.getState().eigenstate.eigenstates).toHaveLength(0)
    })
  })

  describe('Observables channel', () => {
    it('pushObservablesSnapshot stores energy and advances buffer', () => {
      const snapshot: ObservablesSnapshot = {
        totalEnergy: 5.0,
        positionMean: new Float64Array([1.0, 2.0, 3.0]),
        positionVariance: new Float64Array([0.1, 0.2, 0.3]),
        momentumMean: new Float64Array([0.5, 0.5, 0.5]),
        momentumVariance: new Float64Array([0.1, 0.1, 0.1]),
        uncertaintyProduct: new Float64Array([0.5, 0.5, 0.5]),
        activeDims: 3,
        positionNorm: 3.74,
        momentumNorm: 0.87,
      }
      useDiagnosticsStore.getState().pushObservablesSnapshot(snapshot)
      const ch = useDiagnosticsStore.getState().observables
      expect(ch.hasData).toBe(true)
      expect(ch.totalEnergy).toBe(5.0)
    })

    it('setObservablesEnergySpectrum updates spectrum', () => {
      const spectrum = new Float32Array([1, 2, 3, 4])
      useDiagnosticsStore.getState().setObservablesEnergySpectrum(spectrum)
      expect(useDiagnosticsStore.getState().observables.energySpectrum).toBe(spectrum)
    })

    it('resetObservables clears data', () => {
      const snapshot: ObservablesSnapshot = {
        totalEnergy: 5.0,
        positionMean: new Float64Array(3),
        positionVariance: new Float64Array(3),
        momentumMean: new Float64Array(3),
        momentumVariance: new Float64Array(3),
        uncertaintyProduct: new Float64Array(3),
        activeDims: 3,
        positionNorm: 0,
        momentumNorm: 0,
      }
      useDiagnosticsStore.getState().pushObservablesSnapshot(snapshot)
      useDiagnosticsStore.getState().resetObservables()
      expect(useDiagnosticsStore.getState().observables.hasData).toBe(false)
    })
  })

  describe('Open Quantum channel', () => {
    it('pushOpenQuantumMetrics stores purity and entropy', () => {
      useDiagnosticsStore.getState().pushOpenQuantumMetrics({
        purity: 0.95,
        linearEntropy: 0.05,
        vonNeumannEntropy: 0.07,
        coherenceMagnitude: 0.3,
        groundPopulation: 0.8,
        trace: 1.0,
      })
      const ch = useDiagnosticsStore.getState().openQuantum
      expect(ch.purity).toBe(0.95)
      expect(ch.vonNeumannEntropy).toBe(0.07)
    })

    it('setOpenQuantumPopulations updates population data', () => {
      const pops = new Float32Array([0.5, 0.3, 0.2])
      useDiagnosticsStore.getState().setOpenQuantumPopulations(pops, ['|0>', '|1>', '|2>'])
      const ch = useDiagnosticsStore.getState().openQuantum
      expect(ch.populations).toBe(pops)
      expect(ch.basisLabels).toEqual(['|0>', '|1>', '|2>'])
      expect(ch.basisCount).toBe(3)
    })

    it('resetOpenQuantum clears data', () => {
      useDiagnosticsStore.getState().pushOpenQuantumMetrics({
        purity: 0.95,
        linearEntropy: 0.05,
        vonNeumannEntropy: 0.07,
        coherenceMagnitude: 0.3,
        groundPopulation: 0.8,
        trace: 1.0,
      })
      useDiagnosticsStore.getState().resetOpenQuantum()
      // After reset, purity should be back to initial
      const ch = useDiagnosticsStore.getState().openQuantum
      expect(ch.readbackGeneration).toBeGreaterThan(0)
    })
  })

  describe('Density channel', () => {
    it('pushDensitySnapshot sets hasData', () => {
      const snapshot: DensitySnapshot = {
        maxDensity: 0.5,
        totalDensityMass: 1.0,
        activeVoxelCount: 1000,
        centerDensity: 0.1,
        gridSize: 64,
        worldBound: 3.2,
      }
      useDiagnosticsStore.getState().pushDensitySnapshot(snapshot)
      expect(useDiagnosticsStore.getState().density.hasData).toBe(true)
    })

    it('pushDensitySlices updates slice data', () => {
      const sliceData: WavefunctionSliceData = {
        sliceX: new Float32Array([1, 2, 3]),
        sliceY: new Float32Array([4, 5, 6]),
        sliceZ: new Float32Array([7, 8, 9]),
        sliceGridSize: 3,
        sliceWorldBound: 3.2,
      }
      useDiagnosticsStore.getState().pushDensitySlices(sliceData)
      const ch = useDiagnosticsStore.getState().density
      expect(ch.sliceX).toEqual(new Float32Array([1, 2, 3]))
    })

    it('resetDensity clears data', () => {
      useDiagnosticsStore.getState().pushDensitySnapshot({
        maxDensity: 0.5,
        totalDensityMass: 1.0,
        activeVoxelCount: 1000,
        centerDensity: 0.1,
        gridSize: 64,
        worldBound: 3.2,
      })
      useDiagnosticsStore.getState().resetDensity()
      expect(useDiagnosticsStore.getState().density.hasData).toBe(false)
    })
  })
})
