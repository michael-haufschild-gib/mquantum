import { describe, it, expect } from 'vitest'
import { generateHypercubeFaces } from '@/lib/geometry/hypercube'

describe('generateHypercubeFaces', () => {
  it('should generate 6 faces for 3D cube', () => {
    const faces = generateHypercubeFaces(3)
    expect(faces.length).toBe(6)
    // Verify all are length 4
    faces.forEach((face) => expect(face.length).toBe(4))
  })

  it('should generate 24 faces for 4D tesseract', () => {
    const faces = generateHypercubeFaces(4)
    expect(faces.length).toBe(24)
  })

  it('should generate 80 faces for 5D hypercube', () => {
    const faces = generateHypercubeFaces(5)
    expect(faces.length).toBe(80)
  })

  it('should generate faces with correct vertex indices', () => {
    // For 3D cube, vertices are 0..7
    const faces = generateHypercubeFaces(3)
    const allIndices = new Set(faces.flat())
    expect(allIndices.size).toBe(8)
    expect(Math.max(...allIndices)).toBe(7)
    expect(Math.min(...allIndices)).toBe(0)
  })

  it('should generate valid cycles (edges exist)', () => {
    // Check that for each face [v1, v2, v3, v4],
    // v1-v2, v2-v3, v3-v4, v4-v1 are valid edges (differ by 1 bit)
    const faces = generateHypercubeFaces(3)

    for (const face of faces) {
      if (face.length !== 4) continue
      const [v1, v2, v3, v4] = face as [number, number, number, number]
      expect(countBitDiff(v1, v2)).toBe(1)
      expect(countBitDiff(v2, v3)).toBe(1)
      expect(countBitDiff(v3, v4)).toBe(1)
      expect(countBitDiff(v4, v1)).toBe(1)
    }
  })
})

function countBitDiff(a: number, b: number): number {
  let diff = a ^ b
  let count = 0
  while (diff > 0) {
    count += diff & 1
    diff >>= 1
  }
  return count
}
