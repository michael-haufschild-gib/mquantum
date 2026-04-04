/**
 * Data Export Utilities
 *
 * Serialize diagnostic time-series from Zustand stores to CSV and JSON
 * formats for download. Designed for one-click export of simulation data.
 *
 * @module lib/export/dataExport
 */

import { useCoordinateEntanglementStore } from '@/stores/coordinateEntanglementStore'
import { useDiagnosticsStore } from '@/stores/diagnosticsStore'
import { useWavefunctionSliceStore } from '@/stores/wavefunctionSliceStore'

// ─── Ring buffer utility ──────────────────────────────────────────────────

/**
 * Read a ring buffer in chronological order.
 *
 * @param buffer - Ring buffer Float32Array
 * @param head - Current write head
 * @param count - Number of valid entries
 * @returns Array of values in chronological order (oldest first)
 */
export function readRingBuffer(buffer: Float32Array, head: number, count: number): number[] {
  const result: number[] = []
  const len = buffer.length
  const start = (head - count + len) % len
  for (let i = 0; i < count; i++) {
    result.push(buffer[(start + i) % len]!)
  }
  return result
}

/**
 * Read a Float64Array ring buffer in chronological order.
 *
 * @param buffer - Ring buffer source
 * @param head - Current write head position
 * @param count - Number of valid entries
 * @returns Array of values in chronological order
 */
export function readRingBuffer64(buffer: Float64Array, head: number, count: number): number[] {
  const result: number[] = []
  const len = buffer.length
  const start = (head - count + len) % len
  for (let i = 0; i < count; i++) {
    result.push(buffer[(start + i) % len]!)
  }
  return result
}

// ─── CSV exporters ────────────────────────────────────────────────────────

/**
 * Export TDSE diagnostics time-series as CSV.
 *
 * @returns CSV string with columns: simTime, frame, norm, R, T
 */
export function exportTdseDiagnosticsCSV(): string {
  const state = useDiagnosticsStore.getState().tdse
  const { historyHead: head, historyCount: count } = state

  if (count === 0) return ''

  const simTime = readRingBuffer(state.historySimTime, head, count)
  const norm = readRingBuffer(state.historyNorm, head, count)
  const R = readRingBuffer(state.historyR, head, count)
  const T = readRingBuffer(state.historyT, head, count)

  const lines = ['simTime,frame,norm,R,T']
  for (let i = 0; i < count; i++) {
    lines.push(`${simTime[i]},${i},${norm[i]},${R[i]},${T[i]}`)
  }
  return lines.join('\n')
}

/**
 * Export BEC diagnostics time-series as CSV.
 *
 * @returns CSV string with columns: frame, norm, chemicalPotential, healingLength
 */
export function exportBecDiagnosticsCSV(): string {
  const state = useDiagnosticsStore.getState().bec
  const { historyHead: head, historyCount: count } = state

  if (count === 0) return ''

  const norm = readRingBuffer(state.historyNorm, head, count)
  const chemPot = readRingBuffer(state.historyChemPot, head, count)
  const healingLen = readRingBuffer(state.historyHealingLen, head, count)

  const lines = ['frame,norm,chemicalPotential,healingLength']
  for (let i = 0; i < count; i++) {
    lines.push(`${i},${norm[i]},${chemPot[i]},${healingLen[i]}`)
  }
  return lines.join('\n')
}

/**
 * Export FSF diagnostics time-series as CSV.
 *
 * @returns CSV string with columns: frame, energy, norm
 */
export function exportFsfDiagnosticsCSV(): string {
  const state = useDiagnosticsStore.getState().fsf
  const { historyHead: head, historyCount: count } = state

  if (count === 0) return ''

  const energy = readRingBuffer(state.historyEnergy, head, count)
  const norm = readRingBuffer(state.historyNorm, head, count)

  const lines = ['frame,energy,norm']
  for (let i = 0; i < count; i++) {
    lines.push(`${i},${energy[i]},${norm[i]}`)
  }
  return lines.join('\n')
}

/**
 * Export observable expectation values time-series as CSV.
 *
 * @returns CSV string with per-dimension uncertainty products and total energy
 */
export function exportObservablesDiagnosticsCSV(): string {
  const state = useDiagnosticsStore.getState().observables
  const { historyHead: head, historyCount: count, activeDims } = state

  if (count === 0 || activeDims === 0) return ''

  const energy = readRingBuffer(state.historyEnergy, head, count)
  const uncertainties: number[][] = []
  for (let d = 0; d < activeDims; d++) {
    uncertainties.push(readRingBuffer(state.historyUncertainty[d]!, head, count))
  }

  // Build header: frame, energy, deltaXdeltaP_0, deltaXdeltaP_1, ...
  const dimLabels = ['x', 'y', 'z', 'w', 'v', 'u', 't', 's', 'r', 'q', 'p']
  const header = ['frame', 'energy']
  for (let d = 0; d < activeDims; d++) {
    header.push(`dxdp_${dimLabels[d]}`)
  }

  const lines = [header.join(',')]
  for (let i = 0; i < count; i++) {
    const row = [String(i), String(energy[i])]
    for (let d = 0; d < activeDims; d++) {
      row.push(String(uncertainties[d]![i]))
    }
    lines.push(row.join(','))
  }
  return lines.join('\n')
}

/**
 * Export open quantum diagnostics time-series as CSV.
 *
 * @returns CSV string with columns: frame, purity, vonNeumannEntropy, coherence
 */
export function exportOpenQuantumDiagnosticsCSV(): string {
  const state = useDiagnosticsStore.getState().openQuantum
  const { historyHead: head, historyCount: count } = state

  if (count === 0) return ''

  const purity = readRingBuffer(state.historyPurity, head, count)
  const entropy = readRingBuffer(state.historyEntropy, head, count)
  const coherence = readRingBuffer(state.historyCoherence, head, count)

  const lines = ['frame,purity,vonNeumannEntropy,coherence']
  for (let i = 0; i < count; i++) {
    lines.push(`${i},${purity[i]},${entropy[i]},${coherence[i]}`)
  }
  return lines.join('\n')
}

/**
 * Export Dirac diagnostics time-series as CSV.
 *
 * @returns CSV string with columns: frame, norm, particleFraction, antiparticleFraction
 */
export function exportDiracDiagnosticsCSV(): string {
  const state = useDiagnosticsStore.getState().dirac
  const { historyHead: head, historyCount: count } = state

  if (count === 0) return ''

  const norm = readRingBuffer(state.historyNorm, head, count)
  const particleFrac = readRingBuffer(state.historyParticleFrac, head, count)
  const antiparticleFrac = readRingBuffer(state.historyAntiparticleFrac, head, count)

  const lines = ['frame,norm,particleFraction,antiparticleFraction']
  for (let i = 0; i < count; i++) {
    lines.push(`${i},${norm[i]},${particleFrac[i]},${antiparticleFrac[i]}`)
  }
  return lines.join('\n')
}

/**
 * Export Pauli diagnostics time-series as CSV.
 *
 * @returns CSV string with columns: frame, norm, spinUpFraction, spinExpectationZ
 */
export function exportPauliDiagnosticsCSV(): string {
  const state = useDiagnosticsStore.getState().pauli
  const { historyHead: head, historyCount: count } = state

  if (count === 0) return ''

  const norm = readRingBuffer(state.historyNorm, head, count)
  const spinUp = readRingBuffer(state.historySpinUpFrac, head, count)
  const spinExpZ = readRingBuffer(state.historySpinExpZ, head, count)

  const lines = ['frame,norm,spinUpFraction,spinExpectationZ']
  for (let i = 0; i < count; i++) {
    lines.push(`${i},${norm[i]},${spinUp[i]},${spinExpZ[i]}`)
  }
  return lines.join('\n')
}

/**
 * Export coordinate entanglement time-series as CSV.
 *
 * @returns CSV string with columns: frame, averageEntropy, per-dimension entropies
 */
export function exportEntanglementCSV(): string {
  const state = useCoordinateEntanglementStore.getState()
  const { historyHead: head, historyCount: count } = state

  if (count === 0) return ''

  const avg = readRingBuffer64(state.historyAverage, head, count)
  const N = state.currentEntropies.length
  const perDim: number[][] = []
  for (let d = 0; d < N; d++) {
    perDim.push(readRingBuffer64(state.historyEntropies[d]!, head, count))
  }

  const dimHeaders = Array.from({ length: N }, (_, d) => `S_${d}`).join(',')
  const lines = [`frame,averageEntropy,${dimHeaders}`]
  for (let i = 0; i < count; i++) {
    // Replace NaN (skipped/oversized dimensions) with empty string so CSV
    // consumers can distinguish "not computed" from genuine zero entropy.
    const dimVals = perDim.map((arr) => (Number.isNaN(arr[i]) ? '' : arr[i])).join(',')
    const avgVal = Number.isNaN(avg[i]) ? '' : avg[i]
    lines.push(`${i},${avgVal},${dimVals}`)
  }
  return lines.join('\n')
}

/**
 * Export atlas sweep results as CSV.
 *
 * @returns CSV string with columns: lambda, dimension, normalizedEntropy
 */
export function exportAtlasSweepCSV(): string {
  const state = useCoordinateEntanglementStore.getState()

  if (state.sweepResults.length === 0) return ''

  const lines = ['lambda,dimension,normalizedEntropy']
  for (const r of state.sweepResults) {
    lines.push(`${r.lambda},${r.dim},${r.entropy}`)
  }
  return lines.join('\n')
}

function readSliceSource(
  source: 'density' | 'wavefunction',
  axis: 'x' | 'y' | 'z'
): { data: Float32Array; gridSize: number; worldBound: number } | null {
  if (source === 'density') {
    const state = useDiagnosticsStore.getState().density
    const axisMap = { x: state.sliceX, y: state.sliceY, z: state.sliceZ }
    const data = axisMap[axis]
    if (!data || state.sliceGridSize === 0) return null
    return { data, gridSize: state.sliceGridSize, worldBound: state.sliceWorldBound }
  }
  const state = useWavefunctionSliceStore.getState()
  if (!state.hasData || !state.sliceData || state.sliceGridSize === 0) return null
  return { data: state.sliceData, gridSize: state.sliceGridSize, worldBound: state.sliceWorldBound }
}

/**
 * Export wavefunction slice |ψ(x)|² as CSV.
 * Uses density grid slices (analytic modes) or the wavefunction slice store (dynamic modes).
 *
 * @param source - 'density' for analytic mode grid slices, 'wavefunction' for dynamic mode capture
 * @param axis - Which axis slice to export ('x', 'y', or 'z')
 * @returns CSV string with columns: position, density
 */
export function exportWavefunctionSliceCSV(
  source: 'density' | 'wavefunction',
  axis: 'x' | 'y' | 'z'
): string {
  const slice = readSliceSource(source, axis)
  if (!slice) return ''

  const { data, gridSize, worldBound } = slice

  const lines = [`position_${axis},density`]
  for (let i = 0; i < gridSize; i++) {
    const pos = -worldBound + (2 * worldBound * i) / (gridSize - 1 || 1)
    lines.push(`${pos},${data[i]}`)
  }
  return lines.join('\n')
}

// ─── JSON export ──────────────────────────────────────────────────────────

// ─── Per-mode JSON payload builders ──────────────────────────────────────

function buildTdsePayload(): Record<string, unknown> | null {
  const s = useDiagnosticsStore.getState().tdse
  if (s.historyCount === 0) return null
  return {
    current: {
      totalNorm: s.totalNorm,
      normDrift: s.normDrift,
      maxDensity: s.maxDensity,
      R: s.R,
      T: s.T,
      simTime: s.simTime,
    },
    timeSeries: {
      norm: readRingBuffer(s.historyNorm, s.historyHead, s.historyCount),
      R: readRingBuffer(s.historyR, s.historyHead, s.historyCount),
      T: readRingBuffer(s.historyT, s.historyHead, s.historyCount),
    },
  }
}

function buildBecPayload(): Record<string, unknown> | null {
  const s = useDiagnosticsStore.getState().bec
  if (s.historyCount === 0) return null
  return {
    current: {
      totalNorm: s.totalNorm,
      normDrift: s.normDrift,
      chemicalPotential: s.chemicalPotential,
      healingLength: s.healingLength,
      soundSpeed: s.soundSpeed,
      thomasFermiRadius: s.thomasFermiRadius,
    },
    timeSeries: {
      norm: readRingBuffer(s.historyNorm, s.historyHead, s.historyCount),
      chemicalPotential: readRingBuffer(s.historyChemPot, s.historyHead, s.historyCount),
      healingLength: readRingBuffer(s.historyHealingLen, s.historyHead, s.historyCount),
    },
  }
}

function buildFsfPayload(): Record<string, unknown> | null {
  const s = useDiagnosticsStore.getState().fsf
  if (s.historyCount === 0) return null
  return {
    current: {
      totalEnergy: s.totalEnergy,
      totalNorm: s.totalNorm,
      energyDrift: s.energyDrift,
      maxPhi: s.maxPhi,
      maxPi: s.maxPi,
      meanPhi: s.meanPhi,
      variancePhi: s.variancePhi,
    },
    timeSeries: {
      energy: readRingBuffer(s.historyEnergy, s.historyHead, s.historyCount),
      norm: readRingBuffer(s.historyNorm, s.historyHead, s.historyCount),
    },
  }
}

function buildDiracPayload(): Record<string, unknown> | null {
  const s = useDiagnosticsStore.getState().dirac
  if (s.historyCount === 0) return null
  return {
    current: {
      totalNorm: s.totalNorm,
      normDrift: s.normDrift,
      maxDensity: s.maxDensity,
      particleFraction: s.particleFraction,
      antiparticleFraction: s.antiparticleFraction,
      comptonWavelength: s.comptonWavelength,
      zitterbewegungFreq: s.zitterbewegungFreq,
      kleinThreshold: s.kleinThreshold,
      meanPosition: s.meanPosition,
    },
    timeSeries: {
      norm: readRingBuffer(s.historyNorm, s.historyHead, s.historyCount),
      particleFraction: readRingBuffer(s.historyParticleFrac, s.historyHead, s.historyCount),
      antiparticleFraction: readRingBuffer(
        s.historyAntiparticleFrac,
        s.historyHead,
        s.historyCount
      ),
    },
  }
}

function buildObservablesPayload(): Record<string, unknown> | null {
  const s = useDiagnosticsStore.getState().observables
  if (s.historyCount === 0 || s.activeDims === 0) return null
  const dimLabels = ['x', 'y', 'z', 'w', 'v', 'u', 't', 's', 'r', 'q', 'p']
  const uncertaintyTimeSeries: Record<string, number[]> = {}
  const currentUncertainty: Record<string, number> = {}
  for (let d = 0; d < s.activeDims; d++) {
    const label = dimLabels[d]!
    uncertaintyTimeSeries[`dxdp_${label}`] = readRingBuffer(
      s.historyUncertainty[d]!,
      s.historyHead,
      s.historyCount
    )
    currentUncertainty[`dxdp_${label}`] = s.uncertaintyProduct[d]!
  }
  return {
    current: {
      totalEnergy: s.totalEnergy,
      positionNorm: s.positionNorm,
      momentumNorm: s.momentumNorm,
      ...currentUncertainty,
    },
    timeSeries: {
      energy: readRingBuffer(s.historyEnergy, s.historyHead, s.historyCount),
      ...uncertaintyTimeSeries,
    },
  }
}

function buildPauliPayload(): Record<string, unknown> | null {
  const s = useDiagnosticsStore.getState().pauli
  if (s.historyCount === 0) return null
  return {
    current: {
      totalNorm: s.totalNorm,
      normDrift: s.normDrift,
      maxDensity: s.maxDensity,
      spinUpFraction: s.spinUpFraction,
      spinDownFraction: s.spinDownFraction,
      spinExpectationZ: s.spinExpectationZ,
      coherenceMagnitude: s.coherenceMagnitude,
      meanPosition: s.meanPosition,
      larmorFrequency: s.larmorFrequency,
    },
    timeSeries: {
      norm: readRingBuffer(s.historyNorm, s.historyHead, s.historyCount),
      spinUpFraction: readRingBuffer(s.historySpinUpFrac, s.historyHead, s.historyCount),
      spinExpectationZ: readRingBuffer(s.historySpinExpZ, s.historyHead, s.historyCount),
    },
  }
}

function buildOpenQuantumPayload(): Record<string, unknown> | null {
  const s = useDiagnosticsStore.getState().openQuantum
  if (s.historyCount === 0) return null
  return {
    current: {
      purity: s.purity,
      linearEntropy: s.linearEntropy,
      vonNeumannEntropy: s.vonNeumannEntropy,
      coherenceMagnitude: s.coherenceMagnitude,
      groundPopulation: s.groundPopulation,
      trace: s.trace,
    },
    timeSeries: {
      purity: readRingBuffer(s.historyPurity, s.historyHead, s.historyCount),
      vonNeumannEntropy: readRingBuffer(s.historyEntropy, s.historyHead, s.historyCount),
      coherence: readRingBuffer(s.historyCoherence, s.historyHead, s.historyCount),
    },
  }
}

/** Build grid positions for a slice export. */
function buildGridPositions(gridSize: number, worldBound: number): number[] {
  return Array.from(
    { length: gridSize },
    (_, i) => -worldBound + (2 * worldBound * i) / (gridSize - 1 || 1)
  )
}

function appendWavefunctionSlices(payload: Record<string, unknown>): void {
  const density = useDiagnosticsStore.getState().density
  if (density.sliceX && density.sliceGridSize > 0) {
    payload.wavefunctionSlices = {
      gridSize: density.sliceGridSize,
      worldBound: density.sliceWorldBound,
      positions: buildGridPositions(density.sliceGridSize, density.sliceWorldBound),
      x: Array.from(density.sliceX),
      y: density.sliceY ? Array.from(density.sliceY) : null,
      z: density.sliceZ ? Array.from(density.sliceZ) : null,
    }
  }

  const wfSlice = useWavefunctionSliceStore.getState()
  if (wfSlice.hasData && wfSlice.sliceData) {
    payload.wavefunctionSlice = {
      axis: wfSlice.sliceAxis,
      gridSize: wfSlice.sliceGridSize,
      worldBound: wfSlice.sliceWorldBound,
      positions: buildGridPositions(wfSlice.sliceGridSize, wfSlice.sliceWorldBound),
      density: Array.from(wfSlice.sliceData),
    }
  }
}

// ─── Mode → payload key + builder mapping ────────────────────────────────

/** Mapping from quantum mode to the payload key and builder function. */
const MODE_PAYLOAD_BUILDERS: Record<
  string,
  { key: string; build: () => Record<string, unknown> | null }[]
> = {
  tdseDynamics: [
    { key: 'tdse', build: buildTdsePayload },
    { key: 'observables', build: buildObservablesPayload },
  ],
  becDynamics: [
    { key: 'bec', build: buildBecPayload },
    { key: 'observables', build: buildObservablesPayload },
  ],
  freeScalarField: [{ key: 'fsf', build: buildFsfPayload }],
  diracEquation: [{ key: 'dirac', build: buildDiracPayload }],
  pauliSpinor: [{ key: 'pauli', build: buildPauliPayload }],
  harmonicOscillator: [{ key: 'openQuantum', build: buildOpenQuantumPayload }],
  hydrogenND: [{ key: 'openQuantum', build: buildOpenQuantumPayload }],
  hydrogenNDCoupled: [{ key: 'openQuantum', build: buildOpenQuantumPayload }],
}

/**
 * Export all active diagnostics as a single JSON object.
 * Includes metadata, current snapshot values, and full time-series histories.
 *
 * @param quantumMode - Current quantum mode identifier
 * @returns JSON string with all diagnostics data
 */
export function exportDiagnosticsJSON(quantumMode: string): string {
  const payload: Record<string, unknown> = {
    _meta: {
      version: 1,
      quantumMode,
      exportedAt: new Date().toISOString(),
      application: 'mquantum',
    },
  }

  const builders = MODE_PAYLOAD_BUILDERS[quantumMode]
  if (builders) {
    for (const { key, build } of builders) {
      const data = build()
      if (data) payload[key] = data
    }
  }

  appendWavefunctionSlices(payload)

  return JSON.stringify(payload, null, 2)
}

// ─── Download helpers ─────────────────────────────────────────────────────

/**
 * Trigger browser download of a string or Blob as a file.
 *
 * @param content - File content (string or Blob)
 * @param filename - Download filename
 * @param mimeType - MIME type (default: 'text/csv')
 */
export function downloadFile(
  content: string | Blob,
  filename: string,
  mimeType = 'text/csv'
): void {
  const blob = typeof content === 'string' ? new Blob([content], { type: mimeType }) : content
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // Delay revocation — the browser needs time to initiate the download
  // before the blob URL is invalidated. Immediate revocation races with
  // the download in headless Chrome.
  setTimeout(() => URL.revokeObjectURL(url), 5_000)
}

/**
 * Generate a timestamped filename for exports.
 *
 * @param prefix - Filename prefix (e.g., 'mdim-tdse')
 * @param extension - File extension (e.g., 'csv')
 * @returns Formatted filename
 */
export function exportFilename(prefix: string, extension: string): string {
  const now = new Date()
  const ts = now.toISOString().replace(/[:.]/g, '-').slice(0, 19)
  return `${prefix}-${ts}.${extension}`
}
