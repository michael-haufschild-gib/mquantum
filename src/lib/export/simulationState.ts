/**
 * Simulation State Save/Load (.mqstate)
 *
 * Binary file format for saving and restoring complete simulation state
 * including wavefunction data and configuration. Uses CompressionStream
 * for gzip compression when available.
 *
 * Format (version 1):
 *   Header (64 bytes):
 *     magic: "MQST" (4 bytes)
 *     version: u32 (4 bytes)
 *     quantumMode: u8 (1 byte)
 *     latticeDim: u8 (1 byte)
 *     componentCount: u8 (1 byte)
 *     compressed: u8 (1 byte, 0=raw, 1=gzip)
 *     gridSize[0..10]: u32[11] (44 bytes)
 *     totalSites: u32 (4 bytes)
 *     configLength: u32 (4 bytes)
 *   Config blob (configLength bytes): UTF-8 JSON
 *   Wavefunction data: Float32Array [psiRe..., psiIm...]
 *
 * @module lib/export/simulationState
 */

import type { SchroedingerQuantumMode } from '@/lib/geometry/extended/types'
import type { WavefunctionReadbackResult } from '@/rendering/webgpu/utils/wavefunctionReadback'

/** Quantum modes that can be saved/loaded, including pauliSpinor (separate object type). */
export type SaveableQuantumMode = SchroedingerQuantumMode | 'pauliSpinor'

const MAGIC = 'MQST'
const VERSION = 1
const HEADER_SIZE = 64

const QUANTUM_MODE_INDEX: Record<string, number> = {
  harmonicOscillator: 0,
  hydrogenND: 1,
  freeScalarField: 2,
  tdseDynamics: 3,
  becDynamics: 4,
  diracEquation: 5,
  quantumWalk: 6,
  pauliSpinor: 7,
}

const INDEX_TO_QUANTUM_MODE: Record<number, SaveableQuantumMode> = {
  0: 'harmonicOscillator',
  1: 'hydrogenND',
  2: 'freeScalarField',
  3: 'tdseDynamics',
  4: 'becDynamics',
  5: 'diracEquation',
  6: 'quantumWalk',
  7: 'pauliSpinor',
}

/**
 * Serialize simulation state to a downloadable Blob.
 *
 * @param config - JSON-serializable configuration object
 * @param wavefunction - GPU readback result
 * @param quantumMode - Current quantum mode identifier
 * @param gridSize - Per-dimension grid sizes
 * @returns Blob containing the .mqstate binary data
 */
export async function serializeSimulationState(
  config: Record<string, unknown>,
  wavefunction: WavefunctionReadbackResult,
  quantumMode: SaveableQuantumMode,
  gridSize: number[]
): Promise<Blob> {
  const configJSON = JSON.stringify(config)
  const configBytes = new TextEncoder().encode(configJSON)

  // Interleave psiRe and psiIm into a single buffer
  const totalFloats = wavefunction.re.length + wavefunction.im.length
  const wavData = new Float32Array(totalFloats)
  wavData.set(wavefunction.re, 0)
  wavData.set(wavefunction.im, wavefunction.re.length)
  const wavBytes = new Uint8Array(wavData.buffer)

  // Try compression
  let compressedWav: Uint8Array<ArrayBuffer>
  let isCompressed = false
  if (typeof CompressionStream !== 'undefined') {
    compressedWav = await compressGzip(wavBytes)
    isCompressed = true
  } else {
    compressedWav = wavBytes
  }

  // Build header
  const header = new ArrayBuffer(HEADER_SIZE)
  const hView = new DataView(header)
  const hU8 = new Uint8Array(header)

  // Magic
  hU8[0] = MAGIC.charCodeAt(0)
  hU8[1] = MAGIC.charCodeAt(1)
  hU8[2] = MAGIC.charCodeAt(2)
  hU8[3] = MAGIC.charCodeAt(3)

  // Version
  hView.setUint32(4, VERSION, true)

  // Mode metadata
  hU8[8] = QUANTUM_MODE_INDEX[quantumMode] ?? 0
  hU8[9] = gridSize.length
  hU8[10] = wavefunction.componentCount
  hU8[11] = isCompressed ? 1 : 0

  // Grid sizes (up to 11 dimensions)
  for (let d = 0; d < Math.min(gridSize.length, 11); d++) {
    hView.setUint32(12 + d * 4, gridSize[d]!, true)
  }

  // Total sites + config length
  hView.setUint32(56, wavefunction.totalSites, true)
  hView.setUint32(60, configBytes.length, true)

  return new Blob([hU8, configBytes, compressedWav], {
    type: 'application/octet-stream',
  })
}

/**
 * Deserialize a .mqstate file back to config + wavefunction data.
 *
 * @param data - Raw ArrayBuffer from file read
 * @returns Parsed state with config and wavefunction arrays
 * @throws Error if magic bytes or version are invalid
 */
export async function deserializeSimulationState(data: ArrayBuffer): Promise<{
  quantumMode: SaveableQuantumMode
  latticeDim: number
  componentCount: number
  gridSize: number[]
  totalSites: number
  config: Record<string, unknown>
  psiRe: Float32Array
  psiIm: Float32Array
}> {
  const view = new DataView(data)
  const u8 = new Uint8Array(data)

  // Validate magic
  const magic = String.fromCharCode(u8[0]!, u8[1]!, u8[2]!, u8[3]!)
  if (magic !== MAGIC) throw new Error(`Invalid .mqstate file: bad magic "${magic}"`)

  const version = view.getUint32(4, true)
  if (version !== VERSION) throw new Error(`Unsupported .mqstate version: ${version}`)

  const modeIndex = u8[8]!
  const latticeDim = u8[9]!
  const componentCount = u8[10]!
  const compressed = u8[11]! === 1

  const gridSize: number[] = []
  for (let d = 0; d < latticeDim; d++) {
    gridSize.push(view.getUint32(12 + d * 4, true))
  }

  const totalSites = view.getUint32(56, true)
  const configLength = view.getUint32(60, true)

  // Parse config JSON
  const configBytes = new Uint8Array(data, HEADER_SIZE, configLength)
  const configJSON = new TextDecoder().decode(configBytes)
  const config = JSON.parse(configJSON) as Record<string, unknown>

  // Parse wavefunction data
  const wavStart = HEADER_SIZE + configLength
  let wavBytes = new Uint8Array(data, wavStart)
  if (compressed) {
    wavBytes = await decompressGzip(wavBytes)
  }

  const totalElements = componentCount * totalSites

  // Ensure 4-byte alignment for Float32Array view.
  // When configLength is not a multiple of 4, wavBytes.byteOffset is misaligned.
  let alignedBytes: Uint8Array<ArrayBuffer>
  if (wavBytes.byteOffset % 4 !== 0) {
    alignedBytes = new Uint8Array(wavBytes.length)
    alignedBytes.set(wavBytes)
  } else {
    alignedBytes = wavBytes as Uint8Array<ArrayBuffer>
  }

  const wavData = new Float32Array(alignedBytes.buffer, alignedBytes.byteOffset, totalElements * 2)
  const psiRe = wavData.slice(0, totalElements)
  const psiIm = wavData.slice(totalElements, totalElements * 2)

  const quantumMode = INDEX_TO_QUANTUM_MODE[modeIndex] ?? 'tdseDynamics'

  // Backward compat: files saved before pauliSpinor was a separate mode
  // stored quantumMode='tdseDynamics' with a 'pauli' key in config.
  const effectiveMode: SaveableQuantumMode =
    quantumMode === 'tdseDynamics' && 'pauli' in config ? 'pauliSpinor' : quantumMode

  return {
    quantumMode: effectiveMode,
    latticeDim,
    componentCount,
    gridSize,
    totalSites,
    config,
    psiRe,
    psiIm,
  }
}

// ─── Compression utilities ────────────────────────────────────────────────

async function compressGzip(input: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const cs = new CompressionStream('gzip')
  const writer = cs.writable.getWriter()
  void writer.write(input)
  void writer.close()

  const chunks: Uint8Array<ArrayBuffer>[] = []
  const reader = cs.readable.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
  }

  let totalLen = 0
  for (const c of chunks) totalLen += c.length
  const result = new Uint8Array(totalLen)
  let offset = 0
  for (const c of chunks) {
    result.set(c, offset)
    offset += c.length
  }
  return result
}

async function decompressGzip(input: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const ds = new DecompressionStream('gzip')
  const writer = ds.writable.getWriter()
  void writer.write(input)
  void writer.close()

  const chunks: Uint8Array<ArrayBuffer>[] = []
  const reader = ds.readable.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
  }

  let totalLen = 0
  for (const c of chunks) totalLen += c.length
  const result = new Uint8Array(totalLen)
  let offset = 0
  for (const c of chunks) {
    result.set(c, offset)
    offset += c.length
  }
  return result
}
