/**
 * Tests for quantum walk store setters.
 *
 * Validates:
 * - Mode selection wires quantum walk config correctly
 * - Dimension changes resize quantum walk arrays
 * - clearComputeNeedsReset('quantumWalk') clears the flag
 * - setSchroedingerConfig patch merges correctly
 * - Representation is forced to position for compute modes including quantumWalk
 */

import { beforeEach, describe, expect, it } from 'vitest'

import { useExtendedObjectStore } from '@/stores/scene/extendedObjectStore'
import { useGeometryStore } from '@/stores/scene/geometryStore'

describe('Quantum walk store setters', () => {
  beforeEach(() => {
    useExtendedObjectStore.getState().reset()
    useGeometryStore.getState().setDimension(3)
  })

  const getQW = () => useExtendedObjectStore.getState().schroedinger.quantumWalk

  it('switches to quantumWalk mode and preserves config', () => {
    const s = useExtendedObjectStore.getState()
    s.setSchroedingerQuantumMode('quantumWalk')
    expect(useExtendedObjectStore.getState().schroedinger.quantumMode).toBe('quantumWalk')
    // Config should have arrays sized to current dimension (3)
    const qw = getQW()
    expect(qw.latticeDim).toBe(3)
    expect(qw.gridSize).toHaveLength(3)
    expect(qw.spacing).toHaveLength(3)
    expect(qw.initialPosition).toHaveLength(3)
  })

  it('forces representation to position when switching to quantumWalk', () => {
    const s = useExtendedObjectStore.getState()
    // First set momentum representation
    s.setSchroedingerRepresentation('momentum')
    expect(useExtendedObjectStore.getState().schroedinger.representation).toBe('momentum')
    // Now switch to quantum walk
    s.setSchroedingerQuantumMode('quantumWalk')
    expect(useExtendedObjectStore.getState().schroedinger.representation).toBe('position')
  })

  it('blocks non-position representation in quantumWalk mode', () => {
    const s = useExtendedObjectStore.getState()
    s.setSchroedingerQuantumMode('quantumWalk')
    s.setSchroedingerRepresentation('momentum')
    // Should remain position since quantumWalk is a compute mode
    expect(useExtendedObjectStore.getState().schroedinger.representation).toBe('position')
  })

  it('resizes quantum walk arrays on dimension change via initializeSchroedingerForDimension', () => {
    const s = useExtendedObjectStore.getState()
    s.setSchroedingerQuantumMode('quantumWalk')
    // Verify initial dimension
    expect(getQW().latticeDim).toBe(3)

    // Change dimension to 5
    s.initializeSchroedingerForDimension(5)
    const qw = getQW()
    expect(qw.latticeDim).toBe(5)
    expect(qw.gridSize).toHaveLength(5)
    expect(qw.spacing).toHaveLength(5)
    expect(qw.initialPosition).toHaveLength(5)
    expect(qw.needsReset).toBe(true)
  })

  it('does not resize quantum walk arrays when dimension is unchanged', () => {
    const s = useExtendedObjectStore.getState()
    s.setSchroedingerQuantumMode('quantumWalk')
    const originalGridSize = [...getQW().gridSize]

    // Re-initialize with same dimension
    s.initializeSchroedingerForDimension(3)
    expect(getQW().gridSize).toEqual(originalGridSize)
  })

  it('clearComputeNeedsReset(quantumWalk) clears the needsReset flag', () => {
    const s = useExtendedObjectStore.getState()
    s.setSchroedingerConfig({ quantumWalk: { ...getQW(), needsReset: true } })
    expect(getQW().needsReset).toBe(true)

    s.clearComputeNeedsReset('quantumWalk')
    expect(getQW().needsReset).toBe(false)
  })

  it('setSchroedingerConfig can update quantum walk config', () => {
    const s = useExtendedObjectStore.getState()
    s.setSchroedingerConfig({
      quantumWalk: { ...getQW(), coinType: 'dft', stepsPerFrame: 4 },
    })
    const qw = getQW()
    expect(qw.coinType).toBe('dft')
    expect(qw.stepsPerFrame).toBe(4)
  })

  it('setSchroedingerConfig sanitizes quantum walk grids for shader invariants', () => {
    const s = useExtendedObjectStore.getState()
    s.setSchroedingerConfig({
      quantumWalk: {
        ...getQW(),
        latticeDim: 3,
        gridSize: [30, 17, 999],
        spacing: [0.1, Number.NaN, 0.2],
        initialPosition: [99, -4, 300],
        needsReset: false,
      },
    })
    const qw = getQW()
    expect(qw.gridSize).toEqual([32, 16, 128])
    expect(qw.spacing).toEqual([0.1, 0.1, 0.2])
    expect(qw.initialPosition).toEqual([31, 0, 127])
    expect(qw.needsReset).toBe(true)
  })

  it('propagates preset PML target to shared absorber overrides', async () => {
    const s = useExtendedObjectStore.getState()
    s.setSchroedingerQuantumMode('quantumWalk')

    await s.applyQuantumWalkPreset('absorbingBoundary', { expectedQuantumMode: 'quantumWalk' })

    const schro = useExtendedObjectStore.getState().schroedinger
    expect(schro.quantumWalk.pmlTargetReflection).toBe(1e-4)
    expect(schro.pmlTargetReflection).toBe(1e-4)
  })

  it('total sites stay within limits for high dimensions', () => {
    const s = useExtendedObjectStore.getState()
    s.setSchroedingerQuantumMode('quantumWalk')
    s.initializeSchroedingerForDimension(8)
    const qw = getQW()
    const totalSites = qw.gridSize.reduce((a, b) => a * b, 1)
    expect(totalSites).toBeLessThanOrEqual(65535 * 64)
    expect(totalSites).toBeGreaterThan(0)
  })
})
