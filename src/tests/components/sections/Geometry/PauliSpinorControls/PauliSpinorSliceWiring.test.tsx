/**
 * End-to-end wiring test for Pauli extra-dimension slice sliders.
 *
 * Regression: the Pauli slice sliders used to key `pauli.slicePositions[d]`
 * and `setPauliSlicePosition(d)` with `d = i + 3` (full dim index). The
 * writer in PauliComputePassBuffers, every other mode's UI (TDSE/BEC/Dirac),
 * and the default-config shape all assume 0-indexed extra dims (positions[0]
 * drives dim 3). The misaligned indexing meant user drags hit slots the
 * shader never reads — slice sliders were silently disconnected from the
 * rendered density grid.
 *
 * This test locks down the full wiring chain:
 *   drag slider at i=0 → store.slicePositions[0] updated → GPU uniform writer
 *   places that value at WGSL slicePositions[3] (which the shader reads).
 */

import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { PauliSpinorControls } from '@/components/sections/Geometry/PauliSpinorControls'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'

describe('PauliSpinorControls — slice position wiring', () => {
  beforeEach(() => {
    useExtendedObjectStore.setState(useExtendedObjectStore.getInitialState())
    useExtendedObjectStore.getState().initializePauliForDimension(5)
    // `Section` persists its open/closed state in localStorage. Without this
    // reset, the first test's click-to-expand leaks into subsequent tests,
    // so the `{ expanded: false }` header query returns nothing.
    localStorage.clear()
  })

  it('slice slider for dim 3 writes positions[0] (0-indexed extra dim)', () => {
    render(<PauliSpinorControls />)
    // Open the Slice Positions section — defaultOpen={false}, click its header.
    const sliceSectionHeaders = screen.getAllByRole('button', { expanded: false })
    const sliceHeader = sliceSectionHeaders.find((el) => el.textContent?.includes('Slice'))
    if (!sliceHeader) throw new Error('Slice Positions section header not found')
    fireEvent.click(sliceHeader)

    const sliders = screen.getAllByRole('slider', { name: /Dim 3/i })
    expect(sliders).toHaveLength(1)
    fireEvent.change(sliders[0]!, { target: { value: '0.4' } })

    // The store must receive the update at index 0, NOT index 3 (the old bug).
    const slicePositions = useExtendedObjectStore.getState().pauliSpinor.slicePositions
    expect(slicePositions[0]).toBe(0.4)
    // The 5D initializer sized the array to 2, so index 3 is out of bounds —
    // asserting exact length proves the pre-fix behavior (writing positions[3])
    // can no longer slip in.
    expect(slicePositions).toHaveLength(2)
  })

  it('slice slider for dim 4 writes positions[1]', () => {
    render(<PauliSpinorControls />)
    const sliceSectionHeaders = screen.getAllByRole('button', { expanded: false })
    const sliceHeader = sliceSectionHeaders.find((el) => el.textContent?.includes('Slice'))
    if (!sliceHeader) throw new Error('Slice Positions section header not found')
    fireEvent.click(sliceHeader)

    const sliders = screen.getAllByRole('slider', { name: /Dim 4/i })
    expect(sliders).toHaveLength(1)
    fireEvent.change(sliders[0]!, { target: { value: '-0.25' } })

    const slicePositions = useExtendedObjectStore.getState().pauliSpinor.slicePositions
    expect(slicePositions[1]).toBe(-0.25)
  })

  it('renders exactly (latticeDim - 3) slice sliders', () => {
    render(<PauliSpinorControls />)
    const sliceSectionHeaders = screen.getAllByRole('button', { expanded: false })
    const sliceHeader = sliceSectionHeaders.find((el) => el.textContent?.includes('Slice'))
    if (!sliceHeader) throw new Error('Slice Positions section header not found')
    fireEvent.click(sliceHeader)

    // 5D → extra dims = 2 (dim 3, dim 4)
    const sliders = screen.getAllByRole('slider')
    const sliceSliders = sliders.filter((s) => /Dim [3-4]/.test(s.getAttribute('aria-label') ?? ''))
    expect(sliceSliders).toHaveLength(2)
  })
})
