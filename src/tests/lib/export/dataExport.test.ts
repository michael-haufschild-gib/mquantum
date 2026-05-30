/**
 * Unit tests for data export serializers.
 *
 * Verifies CSV and JSON export functions produce correct output
 * from Zustand store diagnostic histories. Tests cover:
 * - Ring buffer readout in chronological order
 * - CSV column headers and data formatting
 * - JSON structure and metadata
 * - Empty-data guard (returns '' for CSV, empty JSON for JSON)
 * - Wavefunction slice CSV export
 * - Dirac and Pauli CSV exporters
 */

import { beforeEach, describe, expect, it } from 'vitest'

import {
  atlasResultsToCSV,
  atlasResultsToJSON,
  exportBecDiagnosticsCSV,
  exportDiagnosticsJSON,
  exportDiracDiagnosticsCSV,
  exportFilename,
  exportFsfDiagnosticsCSV,
  exportObservablesDiagnosticsCSV,
  exportOpenQuantumDiagnosticsCSV,
  exportPauliDiagnosticsCSV,
  exportTdseDiagnosticsCSV,
  exportWavefunctionSliceCSV,
  readRingBuffer,
} from '@/lib/export/dataExport'
import { useDiagnosticsStore } from '@/stores/diagnostics/diagnosticsStore'
import type { AtlasPoint } from '@/stores/diagnostics/quantumnessAtlasStore'
import { useWavefunctionSliceStore } from '@/stores/diagnostics/wavefunctionSliceStore'
import { useExtendedObjectStore } from '@/stores/scene/extendedObjectStore'

beforeEach(() => {
  useDiagnosticsStore.getState().resetTdse()
  useDiagnosticsStore.getState().resetBec()
  useDiagnosticsStore.getState().resetFsf()
  useDiagnosticsStore.getState().resetObservables()
  useDiagnosticsStore.getState().resetOpenQuantum()
  useDiagnosticsStore.getState().resetDirac()
  useDiagnosticsStore.getState().resetPauli()
  useDiagnosticsStore.getState().resetDensity()
  useWavefunctionSliceStore.getState().reset()
  useExtendedObjectStore.getState().reset()
})

describe('readRingBuffer', () => {
  it('reads entries in chronological order from a partially filled buffer', () => {
    const buf = new Float32Array(5)
    buf[0] = 10
    buf[1] = 20
    buf[2] = 30
    const result = readRingBuffer(buf, 3, 3)
    expect(result).toEqual([10, 20, 30])
  })

  it('handles wrap-around correctly', () => {
    const buf = new Float32Array(4)
    // After writing 6 entries to a 4-slot buffer, head=2, count=4
    // Chronological order: buf[2], buf[3], buf[0], buf[1]
    buf[0] = 50
    buf[1] = 60
    buf[2] = 30
    buf[3] = 40
    const result = readRingBuffer(buf, 2, 4)
    expect(result).toEqual([30, 40, 50, 60])
  })

  it('returns empty array for count=0', () => {
    const buf = new Float32Array(4)
    expect(readRingBuffer(buf, 0, 0)).toEqual([])
  })
})

describe('exportTdseDiagnosticsCSV', () => {
  it('returns empty string when no data exists', () => {
    expect(exportTdseDiagnosticsCSV()).toBe('')
  })

  it('produces correct CSV with header and data rows', () => {
    useDiagnosticsStore.getState().pushTdseSnapshot({
      simTime: 0.1,
      totalNorm: 0.99,
      maxDensity: 0.5,
      normDrift: 0.01,
      normLeft: 0.4,
      normRight: 0.5,
      R: 0.3,
      T: 0.6,
      ipr: 0,
    })
    useDiagnosticsStore.getState().pushTdseSnapshot({
      simTime: 0.2,
      totalNorm: 0.98,
      maxDensity: 0.4,
      normDrift: 0.02,
      normLeft: 0.35,
      normRight: 0.55,
      R: 0.35,
      T: 0.55,
      ipr: 0,
    })

    const csv = exportTdseDiagnosticsCSV()
    const lines = csv.split('\n')
    expect(lines[0]).toBe('simTime,frame,norm,R,T')
    expect(lines).toHaveLength(3) // header + 2 data rows

    const row1 = lines[1]!.split(',').map(Number)
    expect(row1[1]).toBe(0) // frame index
    expect(row1[2]).toBeCloseTo(0.99, 2) // norm
    expect(row1[3]).toBeCloseTo(0.3, 2) // R
    expect(row1[4]).toBeCloseTo(0.6, 2) // T
  })

  it('3-row export preserves chronological order (oldest first)', () => {
    const snapshots = [
      {
        simTime: 0.1,
        totalNorm: 1.0,
        maxDensity: 0.5,
        normDrift: 0,
        normLeft: 0.5,
        normRight: 0.5,
        R: 0.1,
        T: 0.9,
        ipr: 0,
      },
      {
        simTime: 0.2,
        totalNorm: 0.99,
        maxDensity: 0.5,
        normDrift: 0,
        normLeft: 0.4,
        normRight: 0.6,
        R: 0.25,
        T: 0.74,
        ipr: 0,
      },
      {
        simTime: 0.3,
        totalNorm: 0.98,
        maxDensity: 0.5,
        normDrift: 0,
        normLeft: 0.3,
        normRight: 0.7,
        R: 0.4,
        T: 0.58,
        ipr: 0,
      },
    ]
    for (const s of snapshots) useDiagnosticsStore.getState().pushTdseSnapshot(s)

    const csv = exportTdseDiagnosticsCSV()
    const lines = csv.split('\n')
    expect(lines).toHaveLength(4) // header + 3 rows

    // Verify chronological order via distinguishable R values (column index 3 after simTime addition)
    const r0 = Number(lines[1]!.split(',')[3])
    const r1 = Number(lines[2]!.split(',')[3])
    const r2 = Number(lines[3]!.split(',')[3])
    expect(r0).toBeCloseTo(0.1, 2) // oldest
    expect(r1).toBeCloseTo(0.25, 2) // middle
    expect(r2).toBeCloseTo(0.4, 2) // newest

    // Verify simTime column
    const t0 = Number(lines[1]!.split(',')[0])
    const t2 = Number(lines[3]!.split(',')[0])
    expect(t0).toBeCloseTo(0.1, 2) // oldest simTime
    expect(t2).toBeCloseTo(0.3, 2) // newest simTime

    // Row 2 second snapshot values
    const row2 = lines[2]!.split(',').map(Number)
    expect(row2[2]).toBeCloseTo(0.99, 2) // norm
    expect(row2[4]).toBeCloseTo(0.74, 2) // T
  })
})

describe('exportBecDiagnosticsCSV', () => {
  it('returns empty string when no data exists', () => {
    expect(exportBecDiagnosticsCSV()).toBe('')
  })

  it('produces CSV with correct columns', () => {
    useDiagnosticsStore.getState().updateBec({
      totalNorm: 1.0,
      chemicalPotential: 2.5,
      healingLength: 0.1,
    })
    const csv = exportBecDiagnosticsCSV()
    expect(csv.startsWith('frame,norm,chemicalPotential,healingLength')).toBe(true)
    const lines = csv.split('\n')
    expect(lines).toHaveLength(2)
  })

  it('CSV row values match pushed BEC snapshot data', () => {
    useDiagnosticsStore.getState().updateBec({
      totalNorm: 0.97,
      chemicalPotential: 3.14,
      healingLength: 0.25,
    })
    useDiagnosticsStore.getState().updateBec({
      totalNorm: 0.95,
      chemicalPotential: 4.0,
      healingLength: 0.18,
    })

    const csv = exportBecDiagnosticsCSV()
    const lines = csv.split('\n')
    expect(lines).toHaveLength(3)

    const row1 = lines[1]!.split(',').map(Number)
    expect(row1[0]).toBe(0) // frame
    expect(row1[1]).toBeCloseTo(0.97, 2) // norm
    expect(row1[2]).toBeCloseTo(3.14, 2) // chemicalPotential
    expect(row1[3]).toBeCloseTo(0.25, 2) // healingLength

    const row2 = lines[2]!.split(',').map(Number)
    expect(row2[0]).toBe(1) // frame
    expect(row2[1]).toBeCloseTo(0.95, 2)
    expect(row2[2]).toBeCloseTo(4.0, 2)
    expect(row2[3]).toBeCloseTo(0.18, 2)
  })
})

describe('exportFsfDiagnosticsCSV', () => {
  it('returns empty string when no data exists', () => {
    expect(exportFsfDiagnosticsCSV()).toBe('')
  })

  it('produces CSV with energy and norm columns', () => {
    useDiagnosticsStore.getState().pushFsfSnapshot({
      totalEnergy: 5.0,
      totalNorm: 1.0,
      maxPhi: 0.3,
      maxPi: 0.2,
      energyDrift: 0,
      meanPhi: 0,
      variancePhi: 0.01,
    })
    const csv = exportFsfDiagnosticsCSV()
    expect(csv.startsWith('frame,energy,norm')).toBe(true)
    const row = csv.split('\n')[1]!.split(',')
    expect(Number(row[1])).toBeCloseTo(5.0)
    expect(Number(row[2])).toBeCloseTo(1.0)
  })
})

describe('exportObservablesDiagnosticsCSV', () => {
  it('returns empty string when no data exists', () => {
    expect(exportObservablesDiagnosticsCSV()).toBe('')
  })

  it('produces CSV with per-dimension uncertainty columns', () => {
    useDiagnosticsStore.getState().pushObservablesSnapshot({
      activeDims: 2,
      positionMean: new Float64Array([0, 0]),
      positionVariance: new Float64Array([1, 1]),
      momentumMean: new Float64Array([0, 0]),
      momentumVariance: new Float64Array([1, 1]),
      uncertaintyProduct: new Float64Array([0.5, 0.6]),
      totalEnergy: 3.0,
      positionNorm: 1.0,
      momentumNorm: 1.0,
    })
    const csv = exportObservablesDiagnosticsCSV()
    const header = csv.split('\n')[0]!
    expect(header).toBe('frame,energy,dxdp_x,dxdp_y')
  })

  it('multi-row 3D CSV contains correct values in every cell', () => {
    const snap1 = {
      activeDims: 3,
      positionMean: new Float64Array([0, 0, 0]),
      positionVariance: new Float64Array([1, 1, 1]),
      momentumMean: new Float64Array([0, 0, 0]),
      momentumVariance: new Float64Array([1, 1, 1]),
      uncertaintyProduct: new Float64Array([0.5, 0.55, 0.6]),
      totalEnergy: 1.5,
      positionNorm: 1.0,
      momentumNorm: 1.0,
    }
    const snap2 = {
      activeDims: 3,
      positionMean: new Float64Array([0, 0, 0]),
      positionVariance: new Float64Array([1, 1, 1]),
      momentumMean: new Float64Array([0, 0, 0]),
      momentumVariance: new Float64Array([1, 1, 1]),
      uncertaintyProduct: new Float64Array([0.7, 0.75, 0.8]),
      totalEnergy: 2.5,
      positionNorm: 1.0,
      momentumNorm: 1.0,
    }
    useDiagnosticsStore.getState().pushObservablesSnapshot(snap1)
    useDiagnosticsStore.getState().pushObservablesSnapshot(snap2)

    const csv = exportObservablesDiagnosticsCSV()
    const lines = csv.split('\n')
    expect(lines[0]).toBe('frame,energy,dxdp_x,dxdp_y,dxdp_z')
    expect(lines).toHaveLength(3)

    // Row 0 (oldest snapshot)
    const r1 = lines[1]!.split(',').map(Number)
    expect(r1[0]).toBe(0)
    expect(r1[1]).toBeCloseTo(1.5, 2) // energy
    expect(r1[2]).toBeCloseTo(0.5, 2) // dxdp_x
    expect(r1[3]).toBeCloseTo(0.55, 2) // dxdp_y
    expect(r1[4]).toBeCloseTo(0.6, 2) // dxdp_z

    // Row 1 (newest snapshot)
    const r2 = lines[2]!.split(',').map(Number)
    expect(r2[1]).toBeCloseTo(2.5, 2)
    expect(r2[2]).toBeCloseTo(0.7, 2)
    expect(r2[3]).toBeCloseTo(0.75, 2)
    expect(r2[4]).toBeCloseTo(0.8, 2)
  })
})

describe('exportOpenQuantumDiagnosticsCSV', () => {
  it('returns empty string when no data exists', () => {
    expect(exportOpenQuantumDiagnosticsCSV()).toBe('')
  })

  it('produces CSV with purity, entropy, coherence columns', () => {
    useDiagnosticsStore.getState().pushOpenQuantumMetrics({
      purity: 0.8,
      linearEntropy: 0.2,
      vonNeumannEntropy: 0.5,
      coherenceMagnitude: 0.3,
      groundPopulation: 0.6,
      trace: 1.0,
    })
    const csv = exportOpenQuantumDiagnosticsCSV()
    expect(csv.startsWith('frame,purity,vonNeumannEntropy,coherence')).toBe(true)
    const values = csv.split('\n')[1]!.split(',').map(Number)
    expect(values[1]).toBeCloseTo(0.8)
    expect(values[2]).toBeCloseTo(0.5)
    expect(values[3]).toBeCloseTo(0.3)
  })
})

describe('exportDiracDiagnosticsCSV', () => {
  it('returns empty string when no data exists', () => {
    expect(exportDiracDiagnosticsCSV()).toBe('')
  })

  it('produces CSV with norm, particleFraction, antiparticleFraction', () => {
    useDiagnosticsStore.getState().updateDirac({
      totalNorm: 0.99,
      particleFraction: 0.7,
      antiparticleFraction: 0.3,
    })
    useDiagnosticsStore.getState().updateDirac({
      totalNorm: 0.98,
      particleFraction: 0.65,
      antiparticleFraction: 0.35,
    })
    const csv = exportDiracDiagnosticsCSV()
    const lines = csv.split('\n')
    expect(lines[0]).toBe('frame,norm,particleFraction,antiparticleFraction')
    expect(lines).toHaveLength(3)

    const row2 = lines[2]!.split(',').map(Number)
    expect(row2[1]).toBeCloseTo(0.98, 1)
    expect(row2[2]).toBeCloseTo(0.65, 1)
    expect(row2[3]).toBeCloseTo(0.35, 1)
  })
})

describe('exportPauliDiagnosticsCSV', () => {
  it('returns empty string when no data exists', () => {
    expect(exportPauliDiagnosticsCSV()).toBe('')
  })

  it('produces CSV with norm, spinUpFraction, spinExpectationZ', () => {
    useDiagnosticsStore.getState().updatePauli({
      totalNorm: 1.0,
      spinUpFraction: 0.6,
      spinExpectationZ: 0.2,
    })
    const csv = exportPauliDiagnosticsCSV()
    const lines = csv.split('\n')
    expect(lines[0]).toBe('frame,norm,spinUpFraction,spinExpectationZ')
    expect(lines).toHaveLength(2)

    const values = lines[1]!.split(',').map(Number)
    expect(values[1]).toBeCloseTo(1.0)
    expect(values[2]).toBeCloseTo(0.6)
    expect(values[3]).toBeCloseTo(0.2)
  })
})

describe('exportWavefunctionSliceCSV', () => {
  it('returns empty string when no density slice data exists', () => {
    expect(exportWavefunctionSliceCSV('density', 'x')).toBe('')
  })

  it('returns empty string when no wavefunction slice data exists', () => {
    expect(exportWavefunctionSliceCSV('wavefunction', 'x')).toBe('')
  })

  it('exports density grid slice with voxel-centered position labels', () => {
    // The DensityGrid compute shader writes voxel i at world position
    // (-bound + (i + 0.5) * 2*bound/N) — see densityGrid.wgsl.ts. Exported
    // positions must match that voxel-center convention so analytic
    // comparisons (e.g. Gaussian sigma fits) aren't biased outward by a
    // half-voxel. For N=5 and worldBound=2: voxel-centers are at
    // -1.6, -0.8, 0.0, 0.8, 1.6.
    const sliceX = new Float32Array([0.1, 0.5, 0.9, 0.5, 0.1])
    useDiagnosticsStore.getState().pushDensitySlices({
      sliceX,
      sliceY: new Float32Array(5),
      sliceZ: new Float32Array(5),
      sliceGridSize: 5,
      sliceWorldBound: 2.0,
    })

    const csv = exportWavefunctionSliceCSV('density', 'x')
    const lines = csv.split('\n')
    expect(lines[0]).toBe('position_x,density')
    expect(lines).toHaveLength(6) // header + 5 data rows

    const firstRow = lines[1]!.split(',').map(Number)
    expect(firstRow[0]).toBeCloseTo(-1.6)
    expect(firstRow[1]).toBeCloseTo(0.1)

    const middleRow = lines[3]!.split(',').map(Number)
    expect(middleRow[0]).toBeCloseTo(0.0)
    expect(middleRow[1]).toBeCloseTo(0.9)

    const lastRow = lines[5]!.split(',').map(Number)
    expect(lastRow[0]).toBeCloseTo(1.6)
    expect(lastRow[1]).toBeCloseTo(0.1)
  })

  it('exports wavefunction slice store data', () => {
    useWavefunctionSliceStore.getState().fulfillCapture({
      sliceData: new Float32Array([0.2, 0.8, 0.2]),
      axis: 'y',
      sourceMode: 'tdseDynamics',
      gridSize: 3,
      worldBound: 1.5,
    })

    const csv = exportWavefunctionSliceCSV('wavefunction', 'y')
    const lines = csv.split('\n')
    expect(lines[0]).toBe('position_y,density')
    expect(lines).toHaveLength(4)
  })

  it('does not export a captured wavefunction slice under the wrong axis label', () => {
    useWavefunctionSliceStore.getState().fulfillCapture({
      sliceData: new Float32Array([0.2, 0.8, 0.2]),
      axis: 'y',
      sourceMode: 'tdseDynamics',
      gridSize: 3,
      worldBound: 1.5,
    })

    expect(exportWavefunctionSliceCSV('wavefunction', 'x')).toBe('')
  })
})

describe('exportDiagnosticsJSON', () => {
  it('includes metadata for any mode', () => {
    const json = exportDiagnosticsJSON('tdseDynamics')
    const parsed = JSON.parse(json) as Record<string, unknown>
    const meta = parsed._meta as Record<string, unknown>
    expect(meta.version).toBe(1)
    expect(meta.quantumMode).toBe('tdseDynamics')
    expect(meta.application).toBe('mquantum')
    expect(meta.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('includes TDSE time-series for tdseDynamics mode', () => {
    useDiagnosticsStore.getState().pushTdseSnapshot({
      simTime: 0.1,
      totalNorm: 0.99,
      maxDensity: 0.5,
      normDrift: 0.01,
      normLeft: 0.4,
      normRight: 0.5,
      R: 0.3,
      T: 0.6,
      ipr: 0,
    })

    const json = exportDiagnosticsJSON('tdseDynamics')
    const parsed = JSON.parse(json) as Record<string, unknown>
    const tdse = parsed.tdse as Record<string, unknown>
    expect(tdse).toHaveProperty('current')
    expect(tdse).toHaveProperty('timeSeries')

    const current = tdse.current as Record<string, number>
    expect(current.totalNorm).toBeCloseTo(0.99)
    expect(current.R).toBeCloseTo(0.3)

    const ts = tdse.timeSeries as Record<string, number[]>
    expect(ts.norm).toHaveLength(1)
    expect(ts.R).toHaveLength(1)

    // Verify time-series VALUES, not just lengths
    expect(ts.norm![0]).toBeCloseTo(0.99, 2)
    expect(ts.R![0]).toBeCloseTo(0.3, 2)
    expect(ts.T![0]).toBeCloseTo(0.6, 2)
  })

  it('TDSE JSON time-series preserves chronological order across snapshots', () => {
    useDiagnosticsStore.getState().pushTdseSnapshot({
      simTime: 0.1,
      totalNorm: 1.0,
      maxDensity: 0.5,
      normDrift: 0,
      normLeft: 0.5,
      normRight: 0.5,
      R: 0.1,
      T: 0.9,
      ipr: 0,
    })
    useDiagnosticsStore.getState().pushTdseSnapshot({
      simTime: 0.2,
      totalNorm: 0.98,
      maxDensity: 0.4,
      normDrift: 0.02,
      normLeft: 0.4,
      normRight: 0.6,
      R: 0.3,
      T: 0.68,
      ipr: 0,
    })

    const json = exportDiagnosticsJSON('tdseDynamics')
    const parsed = JSON.parse(json) as Record<string, unknown>
    const ts = (parsed.tdse as Record<string, unknown>).timeSeries as Record<string, number[]>
    expect(ts.R).toHaveLength(2)
    expect(ts.R![0]).toBeCloseTo(0.1, 2) // oldest
    expect(ts.R![1]).toBeCloseTo(0.3, 2) // newest
    expect(ts.norm![0]).toBeCloseTo(1.0, 2)
    expect(ts.norm![1]).toBeCloseTo(0.98, 2)
  })

  it('includes Dirac data for diracEquation mode', () => {
    useDiagnosticsStore.getState().updateDirac({
      totalNorm: 0.99,
      particleFraction: 0.7,
      antiparticleFraction: 0.3,
      comptonWavelength: 99,
      zitterbewegungFreq: 99,
      kleinThreshold: 99,
    })
    useExtendedObjectStore.getState().setDiracMass(2)
    const json = exportDiagnosticsJSON('diracEquation')
    const parsed = JSON.parse(json) as Record<string, unknown>
    expect(parsed).toHaveProperty('dirac')
    const dirac = parsed.dirac as Record<string, unknown>
    const current = dirac.current as Record<string, number>
    expect(current.particleFraction).toBeCloseTo(0.7)
    expect(current.comptonWavelength).toBeCloseTo(0.5)
    expect(current.zitterbewegungFreq).toBeCloseTo(4)
    expect(current.kleinThreshold).toBeCloseTo(4)
  })

  it('includes Pauli data for pauliSpinor mode', () => {
    useDiagnosticsStore.getState().updatePauli({
      totalNorm: 0.98,
      spinUpFraction: 0.6,
      spinDownFraction: 0.4,
      spinExpectationZ: 0.2,
      coherenceMagnitude: 0.35,
      larmorFrequency: 4.5,
      meanPosition: [0.1, -0.2, 0.3],
    })
    const json = exportDiagnosticsJSON('pauliSpinor')
    const parsed = JSON.parse(json) as Record<string, unknown>
    expect(parsed).toHaveProperty('pauli')
    const pauli = parsed.pauli as Record<string, unknown>
    const current = pauli.current as Record<string, unknown>
    expect(current.spinUpFraction).toBeCloseTo(0.6)
    expect(current.spinExpectationZ).toBeCloseTo(0.2)
    expect(current.coherenceMagnitude).toBeCloseTo(0.35)
    expect(current.larmorFrequency).toBeCloseTo(4.5)
    const ts = pauli.timeSeries as Record<string, number[]>
    expect(ts.norm).toHaveLength(1)
    expect(ts.spinUpFraction).toHaveLength(1)
    expect(ts.spinExpectationZ).toHaveLength(1)
  })

  it('includes wavefunction slice data when available', () => {
    useDiagnosticsStore.getState().pushDensitySlices({
      sliceX: new Float32Array([0.1, 0.5, 0.1]),
      sliceY: new Float32Array([0.2, 0.6, 0.2]),
      sliceZ: new Float32Array([0.3, 0.7, 0.3]),
      sliceGridSize: 3,
      sliceWorldBound: 1.0,
    })
    const json = exportDiagnosticsJSON('harmonicOscillator')
    const parsed = JSON.parse(json) as Record<string, unknown>
    expect(parsed).toHaveProperty('wavefunctionSlices')
    const slices = parsed.wavefunctionSlices as Record<string, unknown>
    expect(slices.gridSize).toBe(3)
    expect((slices.x as number[]).length).toBe(3)
  })

  it('JSON observables section contains per-dimension uncertainty values', () => {
    useDiagnosticsStore.getState().pushObservablesSnapshot({
      activeDims: 2,
      positionMean: new Float64Array([1.5, -0.3]),
      positionVariance: new Float64Array([0.5, 0.8]),
      momentumMean: new Float64Array([0.2, 0.1]),
      momentumVariance: new Float64Array([0.4, 0.6]),
      uncertaintyProduct: new Float64Array([0.52, 0.61]),
      totalEnergy: 4.2,
      positionNorm: 1.0,
      momentumNorm: 1.0,
    })

    const json = exportDiagnosticsJSON('tdseDynamics')
    const parsed = JSON.parse(json) as Record<string, unknown>
    const obs = parsed.observables as Record<string, unknown>
    const current = obs.current as Record<string, number>
    expect(current.totalEnergy).toBeCloseTo(4.2, 2)
    expect(current.dxdp_x).toBeCloseTo(0.52, 2)
    expect(current.dxdp_y).toBeCloseTo(0.61, 2)

    const ts = obs.timeSeries as Record<string, number[]>
    expect(ts.energy![0]).toBeCloseTo(4.2, 2)
    expect(ts.dxdp_x![0]).toBeCloseTo(0.52, 2)
    expect(ts.dxdp_y![0]).toBeCloseTo(0.61, 2)
  })

  it('JSON open quantum section contains exact metric values', () => {
    useDiagnosticsStore.getState().pushOpenQuantumMetrics({
      purity: 0.85,
      linearEntropy: 0.15,
      vonNeumannEntropy: 0.42,
      coherenceMagnitude: 0.37,
      groundPopulation: 0.72,
      trace: 1.0,
    })
    const json = exportDiagnosticsJSON('harmonicOscillator')
    const parsed = JSON.parse(json) as Record<string, unknown>
    const oq = parsed.openQuantum as Record<string, unknown>
    const current = oq.current as Record<string, number>
    expect(current.purity).toBeCloseTo(0.85, 2)
    expect(current.vonNeumannEntropy).toBeCloseTo(0.42, 2)
    expect(current.coherenceMagnitude).toBeCloseTo(0.37, 2)
    expect(current.groundPopulation).toBeCloseTo(0.72, 2)

    const ts = oq.timeSeries as Record<string, number[]>
    expect(ts.purity![0]).toBeCloseTo(0.85, 2)
    expect(ts.vonNeumannEntropy![0]).toBeCloseTo(0.42, 2)
    expect(ts.coherence![0]).toBeCloseTo(0.37, 2)
  })

  it('does not include unrelated mode data', () => {
    // Push TDSE data but export for BEC mode — should not have tdse key
    useDiagnosticsStore.getState().pushTdseSnapshot({
      simTime: 0.1,
      totalNorm: 0.99,
      maxDensity: 0.5,
      normDrift: 0.01,
      normLeft: 0.4,
      normRight: 0.5,
      R: 0.3,
      T: 0.6,
      ipr: 0,
    })
    const json = exportDiagnosticsJSON('becDynamics')
    const parsed = JSON.parse(json) as Record<string, unknown>
    expect(parsed.tdse).toBeUndefined()
  })
})

describe('exportFilename', () => {
  it('generates a filename with prefix, timestamp, and extension', () => {
    const name = exportFilename('mdim-tdse', 'csv')
    expect(name).toMatch(/^mdim-tdse-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.csv$/)
  })
})

// ─── Quantumness Atlas Export ───────────────────────────────────────────

describe('atlasResultsToCSV', () => {
  const POINT: AtlasPoint = {
    lambda: 1.5,
    dim: 3,
    gamma: 0.3,
    avgNormalizedEntropy: 0.42,
    varNormalizedEntropy: 0.01,
    avgWignerNegativity: 0.15,
    varWignerNegativity: 0.002,
    avgIPR: 0.65,
    varIPR: 0.003,
    gridSizePerDim: 64,
    totalSamples: 200,
    measurementSamples: 10,
  }

  it('produces header + data rows', () => {
    const csv = atlasResultsToCSV([POINT])
    const lines = csv.split('\n')
    expect(lines).toHaveLength(2)
    expect(lines[0]).toMatch(/^dim,lambda,gamma/)
    expect(lines[1]).toBe('3,1.5,0.3,0.42,0.01,0.15,0.002,0.65,0.003,64,200,10')
  })

  it('returns header only for empty results', () => {
    const csv = atlasResultsToCSV([])
    const lines = csv.split('\n')
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatch(/^dim,lambda,gamma/)
  })

  it('produces one row per point', () => {
    const p2: AtlasPoint = { ...POINT, dim: 5, gamma: 1.0 }
    const csv = atlasResultsToCSV([POINT, p2])
    const lines = csv.split('\n')
    expect(lines).toHaveLength(3) // header + 2 data
  })

  it('serializes non-finite atlas numbers as blank cells', () => {
    const csv = atlasResultsToCSV([
      {
        ...POINT,
        avgNormalizedEntropy: Number.NaN,
        avgWignerNegativity: Infinity,
        avgIPR: -Infinity,
      },
    ])
    const line = csv.split('\n')[1]!

    expect(line).toBe('3,1.5,0.3,,0.01,,0.002,,0.003,64,200,10')
    expect(line).not.toContain('NaN')
    expect(line).not.toContain('Infinity')
  })
})

describe('atlasResultsToJSON', () => {
  it('round-trips through JSON.parse', () => {
    const point: AtlasPoint = {
      lambda: 2,
      dim: 4,
      gamma: 0,
      avgNormalizedEntropy: 0.5,
      varNormalizedEntropy: 0.01,
      avgWignerNegativity: 0.1,
      varWignerNegativity: 0.002,
      avgIPR: 0.8,
      varIPR: 0.003,
      gridSizePerDim: 32,
      totalSamples: 200,
      measurementSamples: 10,
    }
    const json = atlasResultsToJSON([point])
    const parsed = JSON.parse(json) as AtlasPoint[]
    expect(parsed).toHaveLength(1)
    expect(parsed[0]!.dim).toBe(4)
    expect(parsed[0]!.avgNormalizedEntropy).toBe(0.5)
  })
})
