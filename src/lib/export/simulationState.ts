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
import {
  getQuantumTypeKeyByStateSaveIdMap,
  getQuantumTypeStateSaveIdMap,
} from '@/lib/geometry/registry'

/** Quantum modes that can be saved/loaded, including pauliSpinor and bellTest (separate object types). */
export type SaveableQuantumMode = SchroedingerQuantumMode | 'pauliSpinor' | 'bellTest'

/** Wavefunction data read back from GPU, ready for serialization. */
export interface WavefunctionReadbackResult {
  /** Real parts of the wavefunction (interleaved for multi-component). */
  re: Float32Array
  /** Imaginary parts of the wavefunction. */
  im: Float32Array
  /** Total number of lattice sites. */
  totalSites: number
  /** Number of components per site (1 for TDSE/BEC, 2 for Pauli, S for Dirac). */
  componentCount: number
}

const HEADER_SIZE = 64
const UINT32_MAX = 0xffffffff

const STATE_SAVE_ID_BY_MODE = getQuantumTypeStateSaveIdMap() as Partial<
  Record<SaveableQuantumMode, number>
>
const MODE_BY_STATE_SAVE_ID = getQuantumTypeKeyByStateSaveIdMap() as Partial<
  Record<number, SaveableQuantumMode>
>

interface StateHeader {
  modeIndex: number
  latticeDim: number
  componentCount: number
  compressed: boolean
  gridSize: number[]
  totalSites: number
  configLength: number
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
  validateSerializableState(wavefunction, gridSize)
  const modeIndex = STATE_SAVE_ID_BY_MODE[quantumMode]
  if (modeIndex === undefined) {
    throw new Error(`Cannot serialize .mqstate: unknown quantum mode "${quantumMode}"`)
  }

  const configJSON = JSON.stringify(config)
  const configBytes = new TextEncoder().encode(configJSON)

  // Concatenate psiRe and psiIm into a single buffer: [psiRe..., psiIm...].
  // Matches the header spec layout and the deserializer's `wavData.slice`
  // split at `totalElements`. Previously labeled "Interleave" but the code
  // has always written them as two contiguous spans, not r/i/r/i pairs.
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
  hU8[0] = 77
  hU8[1] = 81
  hU8[2] = 83
  hU8[3] = 84

  // Version
  hView.setUint32(4, 1, true)

  // Mode metadata
  hU8[8] = modeIndex
  hU8[9] = gridSize.length
  hU8[10] = wavefunction.componentCount
  hU8[11] = isCompressed ? 1 : 0

  // Grid sizes (up to 11 dimensions)
  for (let d = 0; d < gridSize.length; d++) {
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
  const header = parseStateHeader(data)
  const { modeIndex, latticeDim, componentCount, gridSize, totalSites, configLength } = header

  // Parse config JSON
  const config = parseStateConfig(data, configLength)

  // Parse wavefunction data
  const totalElements = componentCount * totalSites
  const wavBytes = await readWavefunctionPayload(data, header, totalElements)
  const alignedBytes = alignWavefunctionBytes(wavBytes)

  const wavData = new Float32Array(alignedBytes.buffer, alignedBytes.byteOffset, totalElements * 2)
  const psiRe = wavData.slice(0, totalElements)
  const psiIm = wavData.slice(totalElements, totalElements * 2)

  const quantumMode = MODE_BY_STATE_SAVE_ID[modeIndex]
  if (!quantumMode) {
    throw new Error(`Invalid .mqstate file: unknown quantum mode id ${modeIndex}`)
  }

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

function parseStateHeader(data: ArrayBuffer): StateHeader {
  if (data.byteLength < HEADER_SIZE) {
    throw new Error(`Invalid .mqstate file: header too short (${data.byteLength} bytes)`)
  }

  const view = new DataView(data)
  const u8 = new Uint8Array(data)
  if (u8[0] !== 77 || u8[1] !== 81 || u8[2] !== 83 || u8[3] !== 84) {
    throw new Error('Invalid .mqstate file: bad magic')
  }

  const version = view.getUint32(4, true)
  if (version !== 1) throw new Error(`Unsupported .mqstate version: ${version}`)

  const latticeDim = u8[9]!
  const componentCount = u8[10]!
  const compressedFlag = u8[11]!
  const totalSites = view.getUint32(56, true)
  const configLength = view.getUint32(60, true)
  assertHeaderShape(data, latticeDim, componentCount, totalSites, configLength, compressedFlag)

  const gridSize: number[] = []
  for (let d = 0; d < latticeDim; d++) gridSize.push(view.getUint32(12 + d * 4, true))
  assertGridShape(gridSize, totalSites, 'Invalid .mqstate file')

  return {
    modeIndex: u8[8]!,
    latticeDim,
    componentCount,
    compressed: compressedFlag === 1,
    gridSize,
    totalSites,
    configLength,
  }
}

function assertHeaderShape(
  data: ArrayBuffer,
  latticeDim: number,
  componentCount: number,
  totalSites: number,
  configLength: number,
  compressedFlag: number
): void {
  if (latticeDim < 1 || latticeDim > 11) {
    throw new Error(`Invalid .mqstate file: latticeDim must be 1..11, got ${latticeDim}`)
  }
  if (componentCount < 1) {
    throw new Error(`Invalid .mqstate file: componentCount must be >= 1, got ${componentCount}`)
  }
  if (compressedFlag > 1) {
    throw new Error(`Invalid .mqstate file: compressed flag ${compressedFlag}`)
  }
  if (totalSites < 1) {
    throw new Error(`Invalid .mqstate file: totalSites must be >= 1, got ${totalSites}`)
  }
  if (HEADER_SIZE + configLength > data.byteLength) {
    throw new Error(`Invalid .mqstate file: config length ${configLength} exceeds file size`)
  }
}

function parseStateConfig(data: ArrayBuffer, configLength: number): Record<string, unknown> {
  const configRaw: unknown = JSON.parse(
    new TextDecoder().decode(new Uint8Array(data, HEADER_SIZE, configLength))
  )
  return typeof configRaw === 'object' && configRaw !== null
    ? (configRaw as Record<string, unknown>)
    : {}
}

async function readWavefunctionPayload(
  data: ArrayBuffer,
  header: StateHeader,
  totalElements: number
): Promise<Uint8Array<ArrayBuffer>> {
  const wavStart = HEADER_SIZE + header.configLength
  let wavBytes: Uint8Array<ArrayBuffer> = new Uint8Array(data, wavStart)
  if (header.compressed) {
    if (typeof DecompressionStream === 'undefined') {
      throw new Error('Compressed .mqstate requires DecompressionStream')
    }
    wavBytes = await decompressGzip(wavBytes)
  }

  const expectedWavBytes = totalElements * 8
  if (wavBytes.byteLength !== expectedWavBytes) {
    throw new Error(
      `Invalid .mqstate file: expected wavefunction payload ${expectedWavBytes} bytes, got ${wavBytes.byteLength}`
    )
  }
  return wavBytes
}

function alignWavefunctionBytes(wavBytes: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> {
  // Ensure 4-byte alignment for Float32Array view.
  // When configLength is not a multiple of 4, wavBytes.byteOffset is misaligned.
  if (wavBytes.byteOffset % 4 === 0) return wavBytes

  const alignedBytes = new Uint8Array(wavBytes.length)
  alignedBytes.set(wavBytes)
  return alignedBytes
}

function validateSerializableState(
  wavefunction: WavefunctionReadbackResult,
  gridSize: number[]
): void {
  if (gridSize.length < 1 || gridSize.length > 11) {
    throw new Error(
      `Cannot serialize .mqstate: gridSize length must be 1..11, got ${gridSize.length}`
    )
  }
  if (
    !Number.isInteger(wavefunction.totalSites) ||
    wavefunction.totalSites < 1 ||
    wavefunction.totalSites > UINT32_MAX ||
    !Number.isInteger(wavefunction.componentCount) ||
    wavefunction.componentCount < 1 ||
    wavefunction.componentCount > 255
  ) {
    throw new Error(
      `Cannot serialize .mqstate: invalid shape ${wavefunction.totalSites}/${wavefunction.componentCount}`
    )
  }
  assertGridShape(gridSize, wavefunction.totalSites, 'Cannot serialize .mqstate')

  const expected = wavefunction.totalSites * wavefunction.componentCount
  if (wavefunction.re.length !== expected || wavefunction.im.length !== expected) {
    throw new Error(
      `Cannot serialize .mqstate: expected re=im=${expected}, got re=${wavefunction.re.length}, im=${wavefunction.im.length}`
    )
  }
}

function assertGridShape(gridSize: number[], totalSites: number, context: string): void {
  let product = 1
  for (let d = 0; d < gridSize.length; d++) {
    const size = gridSize[d]!
    if (!Number.isInteger(size) || size < 1 || size > UINT32_MAX) {
      throw new Error(`${context}: gridSize[${d}] invalid ${size}`)
    }
    if (product > UINT32_MAX / size) {
      product = UINT32_MAX + 1
      break
    }
    product *= size
  }
  if (product !== totalSites) {
    throw new Error(
      `${context}: gridSize product ${product} does not match totalSites ${totalSites}`
    )
  }
}

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
