/**
 * Tests for useRotationUpdates hook.
 */

import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { MAX_DIMENSION } from '@/constants/dimension'
import { useRotationUpdates } from '@/hooks/useRotationUpdates'
import { useRotationStore } from '@/stores/scene/rotationStore'

function resetStore() {
  useRotationStore.setState({ rotations: new Map(), dimension: 4, version: 0 })
}

describe('useRotationUpdates', () => {
  beforeEach(resetStore)

  describe('initial render', () => {
    it('returns Float32Arrays of length MAX_DIMENSION for basis vectors', () => {
      const { result } = renderHook(() => useRotationUpdates({ dimension: 3, parameterValues: [] }))
      const { basisX, basisY, basisZ } = result.current.getBasisVectors(false)
      expect(basisX.length).toBe(MAX_DIMENSION)
      expect(basisY.length).toBe(MAX_DIMENSION)
      expect(basisZ.length).toBe(MAX_DIMENSION)
    })

    it('returns identity basis vectors when no rotations set (dim=3)', () => {
      const { result } = renderHook(() => useRotationUpdates({ dimension: 3, parameterValues: [] }))
      const { basisX, basisY, basisZ } = result.current.getBasisVectors(false)
      // Identity: X=[1,0,0,...], Y=[0,1,0,...], Z=[0,0,1,...]
      expect(basisX[0]).toBeCloseTo(1)
      expect(basisX[1]).toBeCloseTo(0)
      expect(basisX[2]).toBeCloseTo(0)
      expect(basisY[0]).toBeCloseTo(0)
      expect(basisY[1]).toBeCloseTo(1)
      expect(basisY[2]).toBeCloseTo(0)
      expect(basisZ[0]).toBeCloseTo(0)
      expect(basisZ[1]).toBeCloseTo(0)
      expect(basisZ[2]).toBeCloseTo(1)
    })

    it('marks changed=true on first call (dirty initial state)', () => {
      const { result } = renderHook(() => useRotationUpdates({ dimension: 3, parameterValues: [] }))
      const { changed } = result.current.getBasisVectors(false)
      expect(changed).toBe(true)
    })

    it('rotationMatrix is null before first getBasisVectors call', () => {
      const { result } = renderHook(() => useRotationUpdates({ dimension: 3, parameterValues: [] }))
      expect(result.current.rotationMatrix).toBe(null)
    })
  })

  describe('caching — getBasisVectors', () => {
    it('returns changed=false on second call with no changes', () => {
      const { result } = renderHook(() => useRotationUpdates({ dimension: 3, parameterValues: [] }))
      result.current.getBasisVectors(false) // prime cache
      const { changed } = result.current.getBasisVectors(false)
      expect(changed).toBe(false)
    })

    it('returns changed=true when rotationsChangedHint=true', () => {
      const { result } = renderHook(() => useRotationUpdates({ dimension: 3, parameterValues: [] }))
      result.current.getBasisVectors(false) // prime cache
      const { changed } = result.current.getBasisVectors(true)
      expect(changed).toBe(true)
    })

    it('returns changed=true after markDirty()', () => {
      const { result } = renderHook(() => useRotationUpdates({ dimension: 3, parameterValues: [] }))
      result.current.getBasisVectors(false) // prime cache
      act(() => result.current.markDirty())
      const { changed } = result.current.getBasisVectors(false)
      expect(changed).toBe(true)
    })

    it('returns changed=true when forceUpdate=true even after stable state', () => {
      const { result } = renderHook(() =>
        useRotationUpdates({ dimension: 3, parameterValues: [], forceUpdate: true })
      )
      result.current.getBasisVectors(false) // first call
      const { changed } = result.current.getBasisVectors(false)
      expect(changed).toBe(true)
    })
  })

  describe('dimension change detection', () => {
    it('returns changed=true when dimension prop changes', () => {
      let dimension = 3
      const { result, rerender } = renderHook(() =>
        useRotationUpdates({ dimension, parameterValues: [] })
      )
      result.current.getBasisVectors(false) // prime cache
      dimension = 4
      rerender()
      const { changed } = result.current.getBasisVectors(false)
      expect(changed).toBe(true)
    })

    it('produces valid orthogonal basis for dimension 4', () => {
      const { result } = renderHook(() => useRotationUpdates({ dimension: 4, parameterValues: [] }))
      const { basisX, basisY, basisZ } = result.current.getBasisVectors(false)
      // Identity in 4D — first 4 components verified
      expect(basisX[0]).toBeCloseTo(1)
      expect(basisX[1]).toBeCloseTo(0)
      expect(basisY[0]).toBeCloseTo(0)
      expect(basisY[1]).toBeCloseTo(1)
      expect(basisZ[2]).toBeCloseTo(1)
    })
  })

  describe('parameterValues change detection', () => {
    it('returns changed=true when parameterValues array changes', () => {
      let params = [0.5]
      const { result, rerender } = renderHook(() =>
        useRotationUpdates({ dimension: 4, parameterValues: params })
      )
      result.current.getBasisVectors(false)
      params = [0.8]
      rerender()
      const { changed } = result.current.getBasisVectors(false)
      expect(changed).toBe(true)
    })

    it('returns changed=false when parameterValues values are identical', () => {
      const params = [0.5, 0.2]
      const { result } = renderHook(() =>
        useRotationUpdates({ dimension: 4, parameterValues: params })
      )
      result.current.getBasisVectors(false)
      const { changed } = result.current.getBasisVectors(false)
      expect(changed).toBe(false)
    })
  })

  describe('rotation store reactivity', () => {
    it('detects changed=true after store version bumps', () => {
      const { result } = renderHook(() => useRotationUpdates({ dimension: 4, parameterValues: [] }))
      result.current.getBasisVectors(false) // prime
      act(() => {
        useRotationStore.setState((s) => ({ version: s.version + 1 }))
      })
      const { changed } = result.current.getBasisVectors(false)
      expect(changed).toBe(true)
    })
  })

  describe('getOrigin', () => {
    it('returns Float32Array of length MAX_DIMENSION', () => {
      const { result } = renderHook(() => useRotationUpdates({ dimension: 3, parameterValues: [] }))
      result.current.getBasisVectors(false) // populate rotation matrix
      const { origin } = result.current.getOrigin([0, 0, 0])
      expect(origin.length).toBe(MAX_DIMENSION)
    })

    it('maps zero origin to zero under any rotation', () => {
      const { result } = renderHook(() => useRotationUpdates({ dimension: 3, parameterValues: [] }))
      result.current.getBasisVectors(false)
      const { origin } = result.current.getOrigin([0, 0, 0])
      for (let i = 0; i < 3; i++) {
        expect(origin[i]).toBeCloseTo(0)
      }
    })

    it('preserves origin through identity rotation', () => {
      const { result } = renderHook(() => useRotationUpdates({ dimension: 3, parameterValues: [] }))
      result.current.getBasisVectors(false)
      const { origin } = result.current.getOrigin([1, 2, 3])
      expect(origin[0]).toBeCloseTo(1)
      expect(origin[1]).toBeCloseTo(2)
      expect(origin[2]).toBeCloseTo(3)
    })

    it('returns changed=true when origin values differ', () => {
      const { result } = renderHook(() => useRotationUpdates({ dimension: 3, parameterValues: [] }))
      result.current.getBasisVectors(false)
      result.current.getOrigin([0, 0, 0])
      const { changed } = result.current.getOrigin([1, 0, 0])
      expect(changed).toBe(true)
    })

    it('returns changed=false when origin values are the same', () => {
      const { result } = renderHook(() => useRotationUpdates({ dimension: 3, parameterValues: [] }))
      result.current.getBasisVectors(false)
      result.current.getOrigin([1, 0, 0])
      const { changed } = result.current.getOrigin([1, 0, 0])
      expect(changed).toBe(false)
    })

    it('returns changed=true when the rotation matrix changes with the same origin values', () => {
      const { result } = renderHook(() => useRotationUpdates({ dimension: 3, parameterValues: [] }))
      result.current.getBasisVectors(false)
      result.current.getOrigin([1, 0, 0])
      act(() => {
        useRotationStore.setState((s) => ({
          rotations: new Map([['XY', Math.PI / 2]]),
          version: s.version + 1,
        }))
      })
      result.current.getBasisVectors(false)
      const { changed, origin } = result.current.getOrigin([1, 0, 0])
      expect(changed).toBe(true)
      expect(Math.abs(origin[0] ?? 0)).toBeLessThan(1e-5)
      expect(Math.abs(origin[1] ?? 0)).toBeCloseTo(1)
    })

    it('pads short originValues with zeros for higher dimensions', () => {
      const { result } = renderHook(() => useRotationUpdates({ dimension: 4, parameterValues: [] }))
      result.current.getBasisVectors(false)
      // Only 2 values for dimension=4, rest should be 0
      const { origin } = result.current.getOrigin([1, 2])
      expect(origin[0]).toBeCloseTo(1)
      expect(origin[1]).toBeCloseTo(2)
      expect(origin[2]).toBeCloseTo(0)
      expect(origin[3]).toBeCloseTo(0)
    })

    it('returns unchanged origin (zero) when no rotation matrix computed yet', () => {
      const { result } = renderHook(() => useRotationUpdates({ dimension: 3, parameterValues: [] }))
      // No getBasisVectors call — rotationMatrix is null
      const { origin } = result.current.getOrigin([5, 5, 5])
      // rotatedOrigin is initialized to all zeros — no rotation applied
      expect(origin[0]).toBeCloseTo(0)
    })
  })

  describe('workingArrays', () => {
    it('exposes pre-allocated Float32Arrays for basis vectors', () => {
      const { result } = renderHook(() => useRotationUpdates({ dimension: 3, parameterValues: [] }))
      const { workingArrays } = result.current
      expect(workingArrays.rotatedX).toBeInstanceOf(Float32Array)
      expect(workingArrays.rotatedY).toBeInstanceOf(Float32Array)
      expect(workingArrays.rotatedZ).toBeInstanceOf(Float32Array)
      expect(workingArrays.rotatedOrigin).toBeInstanceOf(Float32Array)
      expect(workingArrays.rotatedX.length).toBe(MAX_DIMENSION)
    })

    it('basisX from getBasisVectors is the same reference as workingArrays.rotatedX', () => {
      const { result } = renderHook(() => useRotationUpdates({ dimension: 3, parameterValues: [] }))
      const { basisX } = result.current.getBasisVectors(false)
      expect(basisX).toBe(result.current.workingArrays.rotatedX)
    })
  })
})
