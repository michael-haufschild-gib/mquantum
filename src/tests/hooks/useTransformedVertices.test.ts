import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useTransformedVertices } from '@/hooks/useTransformedVertices'
import type { VectorND, MatrixND } from '@/lib/math/types'

describe('useTransformedVertices', () => {
  it('should return empty array for empty input', () => {
    const { result } = renderHook(() => useTransformedVertices([], new Float32Array([1]), [0]))
    expect(result.current).toEqual([])
  })

  it('should apply shear matrix', () => {
    // Identity shear
    const vertices: VectorND[] = [[1, 2]]
    const shear: MatrixND = new Float32Array([1, 0, 0, 1])
    const translation: VectorND = [0, 0]

    const { result } = renderHook(() => useTransformedVertices(vertices, shear, translation))

    expect(result.current[0]).toEqual([1, 2])

    // Actual shear
    // x' = x + y
    // y' = y
    const shear2: MatrixND = new Float32Array([1, 1, 0, 1])
    const { result: result2 } = renderHook(() =>
      useTransformedVertices(vertices, shear2, translation)
    )

    // 1*1 + 2*1 = 3
    // 1*0 + 2*1 = 2
    // Wait, matrix multiplication is M * v
    // [[1, 1], [0, 1]] * [1, 2]
    // Row 0: 1*1 + 1*2 = 3
    // Row 1: 0*1 + 1*2 = 2
    expect(result2.current[0]).toEqual([3, 2])
  })

  it('should apply translation', () => {
    const vertices: VectorND[] = [[1, 2]]
    const shear: MatrixND = new Float32Array([1, 0, 0, 1])
    const translation: VectorND = [10, 20]

    const { result } = renderHook(() => useTransformedVertices(vertices, shear, translation))

    expect(result.current[0]).toEqual([11, 22])
  })

  it('should apply shear then translation', () => {
    const vertices: VectorND[] = [[1, 2]]
    const shear: MatrixND = new Float32Array([1, 1, 0, 1]) // x' = x+y, y'=y -> [3, 2]
    const translation: VectorND = [10, 20]

    const { result } = renderHook(() => useTransformedVertices(vertices, shear, translation))

    // [3+10, 2+20] = [13, 22]
    expect(result.current[0]).toEqual([13, 22])
  })

  it('should memoize results', () => {
    const vertices: VectorND[] = [[1, 2]]
    const shear: MatrixND = new Float32Array([1, 0, 0, 1])
    const translation: VectorND = [0, 0]

    const { result, rerender } = renderHook(() =>
      useTransformedVertices(vertices, shear, translation)
    )

    const firstResult = result.current
    rerender()
    const secondResult = result.current

    expect(firstResult).toBe(secondResult)
  })

  it('should update values and return new reference when inputs change', () => {
    const vertices: VectorND[] = [[1, 2]]
    const shear: MatrixND = new Float32Array([1, 0, 0, 1])
    const translation: VectorND = [0, 0]

    const { result, rerender } = renderHook(
      (props) => useTransformedVertices(props.vertices, props.shear, props.translation),
      { initialProps: { vertices, shear, translation } }
    )

    const firstResult = result.current
    // Initial values
    expect(firstResult[0]).toEqual([1, 2])

    // Change translation
    rerender({ vertices, shear, translation: [1, 1] })

    const secondResult = result.current
    // Values should update
    expect(secondResult[0]).toEqual([2, 3])
    // Array reference should change to trigger downstream re-renders
    expect(firstResult).not.toBe(secondResult)
  })

  it('should return new array reference when vertex count changes', () => {
    const vertices1: VectorND[] = [[1, 2]]
    const vertices2: VectorND[] = [
      [1, 2],
      [3, 4],
    ]
    const shear: MatrixND = new Float32Array([1, 0, 0, 1])
    const translation: VectorND = [0, 0]

    const { result, rerender } = renderHook(
      (props) => useTransformedVertices(props.vertices, props.shear, props.translation),
      { initialProps: { vertices: vertices1, shear, translation } }
    )

    const firstResult = result.current
    expect(firstResult).toHaveLength(1)

    // Change to more vertices
    rerender({ vertices: vertices2, shear, translation })

    const secondResult = result.current
    expect(secondResult).toHaveLength(2)

    // Array reference should change when length changes
    expect(firstResult).not.toBe(secondResult)
  })
})
