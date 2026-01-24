import { describe, it, expect } from 'vitest'
import { generateRidgedNoiseTexture3D } from '@/rendering/utils/NoiseGenerator'
import * as THREE from 'three'

describe('NoiseGenerator', () => {
  it('should generate a 3D ridged noise texture with default size', () => {
    const texture = generateRidgedNoiseTexture3D()
    expect(texture).toBeInstanceOf(THREE.Data3DTexture)
    // Default size is 64 for black hole accretion disk
    expect(texture.image.width).toBe(64)
    expect(texture.image.height).toBe(64)
    expect(texture.image.depth).toBe(64)
    expect(texture.format).toBe(THREE.RedFormat)
    expect(texture.type).toBe(THREE.UnsignedByteType)
  })

  it('should generate a 3D ridged noise texture with custom size', () => {
    const size = 32
    const texture = generateRidgedNoiseTexture3D(size)
    expect(texture.image.width).toBe(size)
    expect(texture.image.height).toBe(size)
    expect(texture.image.depth).toBe(size)
    expect(texture.image.data).not.toBeNull()
    expect(texture.image.data!.length).toBe(size * size * size)
  })

  it('should generate valid ridged noise data', () => {
    const size = 16
    const texture = generateRidgedNoiseTexture3D(size)
    const data = texture.image.data
    expect(data).not.toBeNull()

    // Check if data contains values other than just 0 or 255 (indicating noise)
    let min = 255
    let max = 0

    for (let i = 0; i < data!.length; i++) {
      const val = data![i]!
      if (val < min) min = val
      if (val > max) max = val
    }

    const hasVariation = min < max

    expect(hasVariation).toBe(true)
    expect(min).toBeGreaterThanOrEqual(0)
    expect(max).toBeLessThanOrEqual(255)
  })

  it('should generate consistent noise with fixed seed', () => {
    // generateRidgedNoiseTexture3D uses a fixed seed (42) for consistency
    const size = 8
    const texture1 = generateRidgedNoiseTexture3D(size)
    const texture2 = generateRidgedNoiseTexture3D(size)

    // Same seed should produce identical output
    expect(texture1.image.data).toEqual(texture2.image.data)
  })
})
