/**
 * Data Export Utilities
 *
 * Serialize diagnostic time-series from Zustand stores to CSV format
 * for download. Designed for one-click export of simulation data.
 *
 * @module lib/export/dataExport
 */

import { useBecDiagnosticsStore } from '@/stores/becDiagnosticsStore'
import { useFsfDiagnosticsStore } from '@/stores/fsfDiagnosticsStore'
import { useObservablesDiagnosticsStore } from '@/stores/observablesDiagnosticsStore'
import { useOpenQuantumDiagnosticsStore } from '@/stores/openQuantumDiagnosticsStore'
import { useTdseDiagnosticsStore } from '@/stores/tdseDiagnosticsStore'

/**
 * Read a ring buffer in chronological order.
 *
 * @param buffer - Ring buffer Float32Array
 * @param head - Current write head
 * @param count - Number of valid entries
 * @returns Array of values in chronological order (oldest first)
 */
function readRingBuffer(buffer: Float32Array, head: number, count: number): number[] {
  const result: number[] = []
  const len = buffer.length
  const start = (head - count + len) % len
  for (let i = 0; i < count; i++) {
    result.push(buffer[(start + i) % len]!)
  }
  return result
}

/**
 * Export TDSE diagnostics time-series as CSV.
 *
 * @returns CSV string with columns: frame, norm, R, T
 */
export function exportTdseDiagnosticsCSV(): string {
  const state = useTdseDiagnosticsStore.getState()
  const { historyHead: head, historyCount: count } = state

  if (count === 0) return ''

  const norm = readRingBuffer(state.historyNorm, head, count)
  const R = readRingBuffer(state.historyR, head, count)
  const T = readRingBuffer(state.historyT, head, count)

  const lines = ['frame,norm,R,T']
  for (let i = 0; i < count; i++) {
    lines.push(`${i},${norm[i]},${R[i]},${T[i]}`)
  }
  return lines.join('\n')
}

/**
 * Export BEC diagnostics time-series as CSV.
 *
 * @returns CSV string with columns: frame, norm, chemicalPotential, healingLength
 */
export function exportBecDiagnosticsCSV(): string {
  const state = useBecDiagnosticsStore.getState()
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
  const state = useFsfDiagnosticsStore.getState()
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
  const state = useObservablesDiagnosticsStore.getState()
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
  const state = useOpenQuantumDiagnosticsStore.getState()
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
  URL.revokeObjectURL(url)
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
