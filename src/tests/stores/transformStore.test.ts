/**
 * Tests for transformStore
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { useTransformStore, MIN_SCALE, MAX_SCALE, DEFAULT_SCALE } from '@/stores/transformStore'

describe('transformStore', () => {
  beforeEach(() => {
    useTransformStore.getState().resetAll()
    useTransformStore.getState().setDimension(4)
  })

  it('clamps uniformScale and updates perAxisScale when locked', () => {
    const cases: Array<{ input: number; expected: number }> = [
      { input: MIN_SCALE - 999, expected: MIN_SCALE },
      { input: MIN_SCALE, expected: MIN_SCALE },
      { input: 1.5, expected: 1.5 },
      { input: MAX_SCALE, expected: MAX_SCALE },
      { input: MAX_SCALE + 999, expected: MAX_SCALE },
    ]

    for (const { input, expected } of cases) {
      useTransformStore.getState().setScaleLocked(true)
      useTransformStore.getState().setUniformScale(input)
      const state = useTransformStore.getState()
      expect(state.uniformScale).toBe(expected)
      expect(state.perAxisScale.every((s) => s === expected)).toBe(true)
    }
  })

  it('when unlocked, setUniformScale does not mutate perAxisScale', () => {
    useTransformStore.getState().setScaleLocked(false)
    const before = [...useTransformStore.getState().perAxisScale]
    useTransformStore.getState().setUniformScale(2.0)
    expect(useTransformStore.getState().uniformScale).toBe(2.0)
    expect(useTransformStore.getState().perAxisScale).toEqual(before)
  })

  it('setAxisScale clamps and ignores invalid indices; locking forces all axes to the same value', () => {
    useTransformStore.getState().setScaleLocked(false)

    useTransformStore.getState().setAxisScale(0, 0)
    expect(useTransformStore.getState().perAxisScale[0]).toBe(MIN_SCALE)

    useTransformStore.getState().setAxisScale(1, 10)
    expect(useTransformStore.getState().perAxisScale[1]).toBe(MAX_SCALE)

    const before = [...useTransformStore.getState().perAxisScale]
    useTransformStore.getState().setAxisScale(-1, 2.0)
    useTransformStore.getState().setAxisScale(999, 2.0)
    expect(useTransformStore.getState().perAxisScale).toEqual(before)

    useTransformStore.getState().setScaleLocked(true)
    useTransformStore.getState().setAxisScale(0, 2.0)
    expect(useTransformStore.getState().uniformScale).toBe(2.0)
    expect(useTransformStore.getState().perAxisScale.every((s) => s === 2.0)).toBe(true)
  })

  it('setScaleLocked(true) syncs all axes to uniformScale', () => {
    useTransformStore.getState().setScaleLocked(false)
    useTransformStore.getState().setAxisScale(0, 1.5)
    useTransformStore.getState().setAxisScale(1, 2.0)
    useTransformStore.getState().setUniformScale(1.8)

    useTransformStore.getState().setScaleLocked(true)
    expect(useTransformStore.getState().scaleLocked).toBe(true)
    expect(useTransformStore.getState().perAxisScale.every((s) => s === 1.8)).toBe(true)
  })

  it('getScaleMatrix diagonal reflects per-axis scaling', () => {
    useTransformStore.getState().setScaleLocked(true)
    useTransformStore.getState().setUniformScale(2.0)
    const matrix = useTransformStore.getState().getScaleMatrix()

    // 4x4 matrix stored as flat array = 16 elements
    expect(matrix).toHaveLength(16)
    for (let i = 0; i < 4; i++) {
      expect(matrix[i * 4 + i]).toBe(2.0)
    }
  })

  it('dimension changes reset scales and resize perAxisScale; invalid dimensions are ignored', () => {
    useTransformStore.getState().setUniformScale(2.0)
    useTransformStore.getState().setDimension(4)
    expect(useTransformStore.getState().uniformScale).toBe(2.0)

    useTransformStore.getState().setDimension(6)
    expect(useTransformStore.getState().dimension).toBe(6)
    expect(useTransformStore.getState().uniformScale).toBe(DEFAULT_SCALE)
    expect(useTransformStore.getState().perAxisScale).toHaveLength(6)
    expect(useTransformStore.getState().perAxisScale.every((s) => s === DEFAULT_SCALE)).toBe(true)

    useTransformStore.getState().setDimension(1)
    expect(useTransformStore.getState().dimension).toBe(6)
    useTransformStore.getState().setDimension(100)
    expect(useTransformStore.getState().dimension).toBe(6)
  })
})
