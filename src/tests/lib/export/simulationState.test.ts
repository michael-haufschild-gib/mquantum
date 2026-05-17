/**
 * Unit tests for simulation state serialization (.mqstate format).
 *
 * Verifies:
 * - Round-trip serialize → deserialize preserves data
 * - Header magic and version validation
 * - Multi-component wavefunction support (Dirac spinors)
 * - Grid size encoding/decoding
 * - Config JSON round-trip
 * - Error handling for invalid files
 *
 * Note: happy-dom's Blob implementation has issues with ArrayBuffer parts,
 * so we extract raw bytes via the response() trick instead of blob.arrayBuffer().
 */

import { describe, expect, it } from 'vitest'

import { deserializeSimulationState, serializeSimulationState } from '@/lib/export/simulationState'
import { getQuantumTypeStateSaveIdMap } from '@/lib/geometry/registry'

/**
 * Convert a Blob to ArrayBuffer reliably in happy-dom.
 * happy-dom's Blob.arrayBuffer() incorrectly stringifies ArrayBuffer parts;
 * reading via Response works correctly in all environments.
 */
async function blobToArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  return new Response(blob).arrayBuffer()
}

describe('simulationState serialization', () => {
  const makeWavefunction = (totalSites: number, componentCount: number) => {
    const n = totalSites * componentCount
    const re = new Float32Array(n)
    const im = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      re[i] = Math.sin(i * 0.1)
      im[i] = Math.cos(i * 0.1)
    }
    return { re, im, totalSites, componentCount }
  }

  it('round-trips TDSE state (single component, 1D)', async () => {
    const gridSize = [64]
    const totalSites = 64
    const wf = makeWavefunction(totalSites, 1)
    const config = {
      quantumMode: 'tdseDynamics',
      tdse: { dt: 0.001, mass: 1.0, hbar: 1.0, latticeDim: 1, gridSize: [64] },
    }

    const blob = await serializeSimulationState(config, wf, 'tdseDynamics', gridSize)
    const data = await blobToArrayBuffer(blob)
    const result = await deserializeSimulationState(data)

    expect(result.quantumMode).toBe('tdseDynamics')
    expect(result.latticeDim).toBe(1)
    expect(result.gridSize).toEqual([64])
    expect(result.totalSites).toBe(64)
    expect(result.componentCount).toBe(1)
    expect(result.config).toEqual(config)

    // Verify wavefunction data matches within floating point tolerance
    for (let i = 0; i < totalSites; i++) {
      expect(result.psiRe[i]).toBeCloseTo(wf.re[i]!, 5)
      expect(result.psiIm[i]).toBeCloseTo(wf.im[i]!, 5)
    }
  })

  it('round-trips Dirac state (multi-component, 3D)', async () => {
    const gridSize = [8, 8, 8]
    const totalSites = 512
    const componentCount = 4 // 2^ceil(3/2) = 4 for 3D Dirac
    const wf = makeWavefunction(totalSites, componentCount)
    const config = {
      quantumMode: 'diracEquation',
      dirac: { mass: 1.0, latticeDim: 3, gridSize: [8, 8, 8] },
    }

    const blob = await serializeSimulationState(config, wf, 'diracEquation', gridSize)
    const data = await blobToArrayBuffer(blob)
    const result = await deserializeSimulationState(data)

    expect(result.quantumMode).toBe('diracEquation')
    expect(result.latticeDim).toBe(3)
    expect(result.gridSize).toEqual([8, 8, 8])
    expect(result.totalSites).toBe(512)
    expect(result.componentCount).toBe(4)

    const totalElements = totalSites * componentCount
    for (let i = 0; i < totalElements; i++) {
      expect(result.psiRe[i]).toBeCloseTo(wf.re[i]!, 5)
      expect(result.psiIm[i]).toBeCloseTo(wf.im[i]!, 5)
    }
  })

  it('round-trips BEC state (single component, 2D)', async () => {
    const gridSize = [32, 32]
    const totalSites = 1024
    const wf = makeWavefunction(totalSites, 1)
    const config = {
      quantumMode: 'becDynamics',
      bec: { interactionStrength: 10.0, trapOmega: 1.0 },
    }

    const blob = await serializeSimulationState(config, wf, 'becDynamics', gridSize)
    const data = await blobToArrayBuffer(blob)
    const result = await deserializeSimulationState(data)

    expect(result.quantumMode).toBe('becDynamics')
    expect(result.latticeDim).toBe(2)
    expect(result.gridSize).toEqual([32, 32])
    expect(result.totalSites).toBe(1024)
  })

  it('round-trips FSF state', async () => {
    const gridSize = [16, 16]
    const totalSites = 256
    const wf = makeWavefunction(totalSites, 1)
    const config = {
      quantumMode: 'freeScalarField',
      freeScalar: { mass: 0.5, latticeDim: 2 },
    }

    const blob = await serializeSimulationState(config, wf, 'freeScalarField', gridSize)
    const data = await blobToArrayBuffer(blob)
    const result = await deserializeSimulationState(data)

    expect(result.quantumMode).toBe('freeScalarField')
    expect(result.config).toEqual(config)
  })

  it('rejects invalid magic bytes', async () => {
    const data = new ArrayBuffer(128)
    const u8 = new Uint8Array(data)
    u8[0] = 'B'.charCodeAt(0)
    u8[1] = 'A'.charCodeAt(0)
    u8[2] = 'D'.charCodeAt(0)
    u8[3] = '!'.charCodeAt(0)

    await expect(deserializeSimulationState(data)).rejects.toThrow('bad magic')
  })

  it('rejects unsupported version', async () => {
    const data = new ArrayBuffer(128)
    const u8 = new Uint8Array(data)
    const view = new DataView(data)
    u8[0] = 'M'.charCodeAt(0)
    u8[1] = 'Q'.charCodeAt(0)
    u8[2] = 'S'.charCodeAt(0)
    u8[3] = 'T'.charCodeAt(0)
    view.setUint32(4, 999, true) // version 999

    await expect(deserializeSimulationState(data)).rejects.toThrow('Unsupported .mqstate version')
  })

  it('rejects malformed files before constructing wavefunction arrays', async () => {
    await expect(deserializeSimulationState(new ArrayBuffer(8))).rejects.toThrow('header too short')

    const data = new ArrayBuffer(64 + 2 + 4)
    const u8 = new Uint8Array(data)
    const view = new DataView(data)
    u8[0] = 'M'.charCodeAt(0)
    u8[1] = 'Q'.charCodeAt(0)
    u8[2] = 'S'.charCodeAt(0)
    u8[3] = 'T'.charCodeAt(0)
    view.setUint32(4, 1, true)
    u8[8] = getQuantumTypeStateSaveIdMap().tdseDynamics!
    u8[9] = 1
    u8[10] = 1
    view.setUint32(12, 4, true)
    view.setUint32(56, 4, true)
    view.setUint32(60, 2, true)
    new TextEncoder().encodeInto('{}', new Uint8Array(data, 64, 2))

    await expect(deserializeSimulationState(data)).rejects.toThrow(
      'expected wavefunction payload 32 bytes, got 4'
    )
  })

  it('rejects invalid header shape metadata', async () => {
    const data = new ArrayBuffer(128)
    const u8 = new Uint8Array(data)
    const view = new DataView(data)
    u8[0] = 'M'.charCodeAt(0)
    u8[1] = 'Q'.charCodeAt(0)
    u8[2] = 'S'.charCodeAt(0)
    u8[3] = 'T'.charCodeAt(0)
    view.setUint32(4, 1, true)
    u8[9] = 12
    u8[10] = 1
    view.setUint32(56, 1, true)

    await expect(deserializeSimulationState(data)).rejects.toThrow(
      'latticeDim must be 1..11, got 12'
    )

    u8[9] = 1
    u8[10] = 0
    await expect(deserializeSimulationState(data)).rejects.toThrow(
      'componentCount must be >= 1, got 0'
    )
  })

  it('rejects serialization when wavefunction arrays do not match the header shape', async () => {
    const wf = {
      re: new Float32Array(3),
      im: new Float32Array(4),
      totalSites: 4,
      componentCount: 1,
    }

    await expect(serializeSimulationState({}, wf, 'tdseDynamics', [4])).rejects.toThrow(
      'expected re=im=4'
    )
  })

  it('rejects serialization beyond the format dimension limit', async () => {
    const gridSize = Array.from({ length: 12 }, () => 1)
    const wf = makeWavefunction(1, 1)

    await expect(serializeSimulationState({}, wf, 'tdseDynamics', gridSize)).rejects.toThrow(
      'gridSize length must be 1..11, got 12'
    )
  })

  it('preserves config with nested objects', async () => {
    const gridSize = [32]
    const totalSites = 32
    const wf = makeWavefunction(totalSites, 1)
    const config = {
      quantumMode: 'tdseDynamics',
      tdse: {
        dt: 0.001,
        mass: 1.0,
        hbar: 1.0,
        potentialType: 'harmonic',
        potentialParams: { omega: 1.0 },
        packetCenter: [0.0],
        packetMomentum: [2.0],
      },
    }

    const blob = await serializeSimulationState(config, wf, 'tdseDynamics', gridSize)
    const data = await blobToArrayBuffer(blob)
    const result = await deserializeSimulationState(data)

    expect(result.config).toEqual(config)
  })

  it('handles all quantum mode indices correctly', async () => {
    const modes = [
      'harmonicOscillator',
      'hydrogenND',
      'hydrogenNDCoupled',
      'freeScalarField',
      'tdseDynamics',
      'becDynamics',
      'diracEquation',
      'quantumWalk',
      'wheelerDeWitt',
      'antiDeSitter',
      'pauliSpinor',
      'bellTest',
    ] as const
    const stateSaveIds = getQuantumTypeStateSaveIdMap()

    for (const mode of modes) {
      const wf = makeWavefunction(4, 1)
      const config = { quantumMode: mode }
      const blob = await serializeSimulationState(config, wf, mode, [4])
      const data = await blobToArrayBuffer(blob)
      expect(new Uint8Array(data)[8]).toBe(stateSaveIds[mode])
      const result = await deserializeSimulationState(data)
      expect(result.quantumMode).toBe(mode)
    }
  })

  it('preserves append-only binary save IDs for legacy modes', async () => {
    const legacyStateSaveIds = {
      harmonicOscillator: 0,
      hydrogenND: 1,
      freeScalarField: 2,
      tdseDynamics: 3,
      becDynamics: 4,
      diracEquation: 5,
      quantumWalk: 6,
      pauliSpinor: 7,
    } as const
    const stateSaveIds = getQuantumTypeStateSaveIdMap()

    expect(
      Object.fromEntries(Object.keys(legacyStateSaveIds).map((mode) => [mode, stateSaveIds[mode]]))
    ).toEqual(legacyStateSaveIds)
  })

  it('round-trips Pauli spinor state (2-component)', async () => {
    const gridSize = [16, 16, 16]
    const totalSites = 4096
    const componentCount = 2
    const wf = makeWavefunction(totalSites, componentCount)
    const config = {
      pauli: { fieldType: 'gradient', fieldStrength: 2.0, latticeDim: 3, gridSize: [16, 16, 16] },
    }

    const blob = await serializeSimulationState(config, wf, 'pauliSpinor', gridSize)
    const data = await blobToArrayBuffer(blob)
    const result = await deserializeSimulationState(data)

    expect(result.quantumMode).toBe('pauliSpinor')
    expect(result.latticeDim).toBe(3)
    expect(result.gridSize).toEqual([16, 16, 16])
    expect(result.totalSites).toBe(4096)
    expect(result.componentCount).toBe(2)

    const totalElements = totalSites * componentCount
    for (let i = 0; i < totalElements; i++) {
      expect(result.psiRe[i]).toBeCloseTo(wf.re[i]!, 5)
      expect(result.psiIm[i]).toBeCloseTo(wf.im[i]!, 5)
    }
  })

  it('deserializes legacy Pauli save (tdseDynamics + pauli key) as pauliSpinor', async () => {
    // Old Pauli saves used quantumMode='tdseDynamics' with a 'pauli' config key.
    // The backward compat path should detect this and return 'pauliSpinor'.
    const gridSize = [8, 8, 8]
    const totalSites = 512
    const wf = makeWavefunction(totalSites, 2)
    const config = {
      quantumMode: 'tdseDynamics',
      pauli: { fieldType: 'uniform', fieldStrength: 3.0 },
    }

    const blob = await serializeSimulationState(config, wf, 'tdseDynamics', gridSize)
    const data = await blobToArrayBuffer(blob)
    const result = await deserializeSimulationState(data)

    expect(result.quantumMode).toBe('pauliSpinor')
  })

  it('handles misaligned config length (odd-byte JSON forces copy path)', async () => {
    // Config JSON with odd length forces the wavBytes.byteOffset % 4 !== 0 branch
    // in deserialize, triggering the alignment copy path.
    const gridSize = [8]
    const totalSites = 8
    const wf = makeWavefunction(totalSites, 1)
    // Use a config whose JSON encoding has a length NOT divisible by 4
    const config = { x: 'abc' } // '{"x":"abc"}' = 11 bytes (11 % 4 = 3)

    const blob = await serializeSimulationState(config, wf, 'tdseDynamics', gridSize)
    const data = await blobToArrayBuffer(blob)
    const result = await deserializeSimulationState(data)

    expect(result.config).toEqual(config)
    expect(result.totalSites).toBe(totalSites)
    // Verify wavefunction data survived alignment
    for (let i = 0; i < totalSites; i++) {
      expect(result.psiRe[i]).toBeCloseTo(wf.re[i]!, 5)
      expect(result.psiIm[i]).toBeCloseTo(wf.im[i]!, 5)
    }
  })

  it('falls back to uncompressed when CompressionStream is unavailable', async () => {
    // happy-dom may or may not have CompressionStream. Either way, the round-trip
    // must work — this exercises the `else` branch when compression is unavailable,
    // or the compression path when it IS available.
    const gridSize = [4]
    const totalSites = 4
    const wf = makeWavefunction(totalSites, 1)
    const config = { quantumMode: 'tdseDynamics' }

    const blob = await serializeSimulationState(config, wf, 'tdseDynamics', gridSize)
    const data = await blobToArrayBuffer(blob)

    // Verify the header compression flag matches environment capability
    const header = new Uint8Array(data)
    const compressedFlag = header[11]!
    const hasCompression = typeof globalThis.CompressionStream !== 'undefined'
    expect(compressedFlag).toBe(hasCompression ? 1 : 0)

    // Round-trip must still work regardless
    const result = await deserializeSimulationState(data)
    expect(result.totalSites).toBe(totalSites)
    for (let i = 0; i < totalSites; i++) {
      expect(result.psiRe[i]).toBeCloseTo(wf.re[i]!, 5)
    }
  })

  it('defaults unknown mode index to tdseDynamics', async () => {
    // Manually construct a header with an unknown mode index (255)
    const gridSize = [4]
    const totalSites = 4
    const wf = makeWavefunction(totalSites, 1)
    const config = { quantumMode: 'tdseDynamics' }

    const blob = await serializeSimulationState(config, wf, 'tdseDynamics', gridSize)
    const data = await blobToArrayBuffer(blob)
    // Patch the mode index to an unknown value
    const u8 = new Uint8Array(data)
    u8[8] = 255

    const result = await deserializeSimulationState(data)
    // Unknown mode index falls back to 'tdseDynamics'
    expect(result.quantumMode).toBe('tdseDynamics')
  })

  it('handles high-dimensional grid sizes (up to 11D)', async () => {
    const gridSize = [2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2] // 11D
    const totalSites = Math.pow(2, 11) // 2048
    const wf = makeWavefunction(totalSites, 1)
    const config = { quantumMode: 'tdseDynamics' }

    const blob = await serializeSimulationState(config, wf, 'tdseDynamics', gridSize)
    const data = await blobToArrayBuffer(blob)
    const result = await deserializeSimulationState(data)

    expect(result.latticeDim).toBe(11)
    expect(result.gridSize).toEqual(gridSize)
    expect(result.totalSites).toBe(totalSites)
  })
})
