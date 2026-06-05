import { describe, expect, it } from 'vitest'

import {
  generateRotateGizmo,
  generateTranslateGizmo,
} from '@/rendering/webgpu/passes/gizmoTransformGeometry'

const STRIDE = 7

function expectAllFinite(vertices: Float32Array): void {
  for (let i = 0; i < vertices.length; i++) {
    expect(Number.isFinite(vertices[i])).toBe(true)
  }
}

describe('generateTranslateGizmo', () => {
  it('sanitizes opacity and shaft length before writing vertex data', () => {
    const vertices = generateTranslateGizmo(Number.POSITIVE_INFINITY, Number.NaN)

    expect(vertices.length).toBe(3 * 5 * 2 * STRIDE)
    expectAllFinite(vertices)
    expect(vertices[STRIDE + 0]).toBeCloseTo(3)
    expect(vertices[6]).toBeCloseTo(1)
  })
})

describe('generateRotateGizmo', () => {
  it('bounds invalid segment counts and radius before generating rings', () => {
    const vertices = generateRotateGizmo(2, Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY)

    expect(vertices.length).toBe(3 * 48 * 2 * STRIDE)
    expectAllFinite(vertices)
    expect(vertices[6]).toBeCloseTo(1)
  })

  it('clamps segment counts to a bounded integer range', () => {
    const tooSmall = generateRotateGizmo(1, 2.5, 1)
    const tooLarge = generateRotateGizmo(1, 2.5, 1000)

    expect(tooSmall.length).toBe(3 * 3 * 2 * STRIDE)
    expect(tooLarge.length).toBe(3 * 256 * 2 * STRIDE)
  })
})
