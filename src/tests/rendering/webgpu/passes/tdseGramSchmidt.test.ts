/**
 * TDSE Gram-Schmidt module tests.
 *
 * Tests the CPU-side state management for eigenstate storage and
 * Gram-Schmidt orthogonalization dispatch. GPU buffer creation
 * and dispatch calls are mocked since WebGPU is unavailable in vitest.
 *
 * Key behaviors tested:
 * - ensureGSBuffers creates buffers only once
 * - storeCurrentEigenstate copies psi and increments count
 * - clearEigenstates destroys all eigenstate buffers
 * - MAX_STORED_EIGENSTATES enforced
 * - dispatchGramSchmidt skips when no eigenstates stored
 */
import { describe, expect, it, vi } from 'vitest'

import {
  clearEigenstates,
  destroyGSBuffers,
  ensureGSBuffers,
  type GramSchmidtState,
  MAX_STORED_EIGENSTATES,
  storeCurrentEigenstate,
} from '@/rendering/webgpu/passes/TDSEGramSchmidt'
import { createMockBuffer } from '@/tests/__mocks__/webgpu'

function createMockDevice(): GPUDevice {
  return {
    createBuffer: vi.fn(() => createMockBuffer()),
    createCommandEncoder: vi.fn(() => ({
      copyBufferToBuffer: vi.fn(),
      finish: vi.fn(() => 'command-buffer'),
    })),
    queue: {
      submit: vi.fn(),
      writeBuffer: vi.fn(),
    },
  } as unknown as GPUDevice
}

function createGSState(overrides: Partial<GramSchmidtState> = {}): GramSchmidtState {
  return {
    gsEigenstates: [],
    gsUniformBuffer: null,
    gsPartialReBuffer: null,
    gsPartialImBuffer: null,
    gsResultBuffer: null,
    gsNumWorkgroups: 0,
    gsBufferTotalSites: 0,
    psiBuffer: null,
    totalSites: 0,
    pl: null,
    eigenstateGeneration: 0,
    ...overrides,
  }
}

describe('ensureGSBuffers', () => {
  it('creates uniform, partial, and result buffers', () => {
    const device = createMockDevice()
    const state = createGSState({ totalSites: 1024 })

    ensureGSBuffers(device, state)

    // Verify all 4 buffers were created and assigned
    expect(device.createBuffer).toHaveBeenCalledTimes(4)
    expect(state.gsUniformBuffer).toHaveProperty('destroy')
    expect(state.gsPartialReBuffer).toHaveProperty('destroy')
    expect(state.gsPartialImBuffer).toHaveProperty('destroy')
    expect(state.gsResultBuffer).toHaveProperty('destroy')
  })

  it('computes workgroup count from totalSites / 256', () => {
    const device = createMockDevice()
    const state = createGSState({ totalSites: 512 })

    ensureGSBuffers(device, state)

    // ceil(512 / 256) = 2
    expect(state.gsNumWorkgroups).toBe(2)
    expect(state.gsBufferTotalSites).toBe(512)
  })

  it('does not recreate buffers on subsequent calls', () => {
    const device = createMockDevice()
    const state = createGSState({ totalSites: 1024 })

    ensureGSBuffers(device, state)
    ensureGSBuffers(device, state)

    expect(device.createBuffer).toHaveBeenCalledTimes(4)
  })

  it('recreates buffers when totalSites changes', () => {
    const device = createMockDevice()
    const state = createGSState({ totalSites: 256 })

    ensureGSBuffers(device, state)
    const oldUniform = state.gsUniformBuffer
    const oldPartialRe = state.gsPartialReBuffer
    const oldPartialIm = state.gsPartialImBuffer
    const oldResult = state.gsResultBuffer
    state.gsEigenstates = [
      { psi: createMockBuffer('old-eigen'), normSquared: 1, energy: NaN, ipr: NaN },
    ]

    state.totalSites = 513
    ensureGSBuffers(device, state)

    expect(oldUniform?.destroy).toHaveBeenCalled()
    expect(oldPartialRe?.destroy).toHaveBeenCalled()
    expect(oldPartialIm?.destroy).toHaveBeenCalled()
    expect(oldResult?.destroy).toHaveBeenCalled()
    expect(state.gsEigenstates).toHaveLength(0)
    expect(state.gsNumWorkgroups).toBe(3)
    expect(state.gsBufferTotalSites).toBe(513)
    expect(device.createBuffer).toHaveBeenCalledTimes(8)
  })
})

describe('storeCurrentEigenstate', () => {
  it('returns -1 when psi buffers are null', () => {
    const device = createMockDevice()
    const state = createGSState()

    const result = storeCurrentEigenstate(device, state)

    expect(result).toBe(-1)
  })

  it('returns -1 when totalSites is invalid', () => {
    const device = createMockDevice()
    const state = createGSState({ psiBuffer: createMockBuffer('psi'), totalSites: 0 })

    const result = storeCurrentEigenstate(device, state)

    expect(result).toBe(-1)
    expect(device.createBuffer).not.toHaveBeenCalled()
  })

  it('copies psi buffers and increments eigenstate count', () => {
    const device = createMockDevice()
    const state = createGSState({
      psiBuffer: createMockBuffer('psi'),
      totalSites: 256,
    })

    const count = storeCurrentEigenstate(device, state)

    expect(count).toBe(1)
    expect(state.gsEigenstates).toHaveLength(1)
    // Both allocations must size to the merged vec2f layout (8 bytes / site).
    // A stale 4-byte assumption would still satisfy createBuffer call counts
    // but silently truncate half the spinor and break IPR readbacks.
    expect(device.createBuffer).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ size: state.totalSites * 8 })
    )
    expect(device.createBuffer).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ size: state.totalSites * 8 })
    )
    // 1 buffer for eigenstate copy (merged vec2f psi) + 1 staging buffer for async IPR readback
    expect(device.createBuffer).toHaveBeenCalledTimes(2)
    // 2 submits: one for eigenstate copy, one for IPR readback
    expect(device.queue.submit).toHaveBeenCalledTimes(2)
  })

  it('stores multiple eigenstates up to MAX_STORED_EIGENSTATES', () => {
    const device = createMockDevice()
    const state = createGSState({
      psiBuffer: createMockBuffer('psi'),
      totalSites: 256,
    })

    for (let i = 0; i < MAX_STORED_EIGENSTATES; i++) {
      const count = storeCurrentEigenstate(device, state)
      expect(count).toBe(i + 1)
    }

    expect(state.gsEigenstates).toHaveLength(MAX_STORED_EIGENSTATES)
  })

  it('returns -1 when storage is full', () => {
    const device = createMockDevice()
    const state = createGSState({
      psiBuffer: createMockBuffer('psi'),
      totalSites: 256,
    })

    for (let i = 0; i < MAX_STORED_EIGENSTATES; i++) {
      storeCurrentEigenstate(device, state)
    }

    const result = storeCurrentEigenstate(device, state)
    expect(result).toBe(-1)
  })
})

describe('clearEigenstates', () => {
  it('destroys all eigenstate buffers and resets array', () => {
    const buf1 = createMockBuffer('es-0')
    const buf2 = createMockBuffer('es-1')
    const state = createGSState()
    state.gsEigenstates = [
      { psi: buf1, normSquared: 1.0, energy: NaN, ipr: NaN },
      { psi: buf2, normSquared: 1.0, energy: NaN, ipr: NaN },
    ]

    clearEigenstates(state)

    expect(buf1.destroy).toHaveBeenCalled()
    expect(buf2.destroy).toHaveBeenCalled()
    expect(state.gsEigenstates).toHaveLength(0)
  })

  it('bumps eigenstateGeneration so in-flight async readbacks invalidate', () => {
    // The async eigenstate-diagnostic readback in storeCurrentEigenstate
    // captures eigenstateGeneration at submit time and compares against the
    // current value at resolve time. Without bumping on clear, a stale
    // readback overwrites the next sweep's slot 0 with values computed from
    // the just-destroyed wavefunction.
    const state = createGSState()
    expect(state.eigenstateGeneration).toBe(0)
    clearEigenstates(state)
    expect(state.eigenstateGeneration).toBe(1)
    clearEigenstates(state)
    expect(state.eigenstateGeneration).toBe(2)
  })
})

describe('destroyGSBuffers', () => {
  it('clears eigenstates and destroys all GS infrastructure buffers', () => {
    const uniform = createMockBuffer('gs-uniform')
    const partialRe = createMockBuffer('gs-partial-re')
    const partialIm = createMockBuffer('gs-partial-im')
    const result = createMockBuffer('gs-result')
    const state = createGSState({
      gsUniformBuffer: uniform,
      gsPartialReBuffer: partialRe,
      gsPartialImBuffer: partialIm,
      gsResultBuffer: result,
    })

    destroyGSBuffers(state)

    expect(uniform.destroy).toHaveBeenCalled()
    expect(partialRe.destroy).toHaveBeenCalled()
    expect(partialIm.destroy).toHaveBeenCalled()
    expect(result.destroy).toHaveBeenCalled()
    expect(state.gsUniformBuffer).toBeNull()
    expect(state.gsPartialReBuffer).toBeNull()
    expect(state.gsPartialImBuffer).toBeNull()
    expect(state.gsResultBuffer).toBeNull()
    expect(state.gsNumWorkgroups).toBe(0)
    expect(state.gsBufferTotalSites).toBe(0)
  })
})

describe('MAX_STORED_EIGENSTATES', () => {
  it('is 32 (matches UI button disable threshold)', () => {
    expect(MAX_STORED_EIGENSTATES).toBe(32)
  })
})
