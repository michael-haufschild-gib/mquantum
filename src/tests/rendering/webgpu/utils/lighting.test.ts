import { describe, expect, it } from 'vitest'
import { rotationToDirection } from '@/rendering/lights/types'
import { parseHexColorToLinearRgb } from '@/rendering/webgpu/utils/color'
import { packLightingUniforms } from '@/rendering/webgpu/utils/lighting'

describe('rendering/webgpu/utils/lighting', () => {
  describe('packLightingUniforms', () => {
    it('packs light data, ambient, and lightCount with correct offsets/types', () => {
      const data = new Float32Array(144)

      const rotation: [number, number, number] = [-0.6154797, 0.7853982, 0]
      const outerAngleRad = (30 * Math.PI) / 180
      const innerAngleRad = outerAngleRad * (1 - 0.2)

      packLightingUniforms(data, {
        lights: [
          {
            id: 'light-1',
            name: 'Test Spot',
            type: 'spot',
            enabled: true,
            position: [5, 5, 5],
            rotation,
            color: '#808080',
            intensity: 2.0,
            coneAngle: 30,
            penumbra: 0.2,
            range: 0, // infinite (no falloff)
            decay: 2.0,
          },
        ],
        ambientColor: '#ffffff',
        ambientIntensity: 0.25,
        ambientEnabled: true,
      })

      // Light 0: position.xyzw (type)
      expect(data[0]).toBe(5)
      expect(data[1]).toBe(5)
      expect(data[2]).toBe(5)
      expect(data[3]).toBe(3) // spot = 3

      // Light 0: direction.xyz derived from rotation, range in w
      const dir = rotationToDirection(rotation)
      expect(data[4]).toBeCloseTo(dir[0], 6)
      expect(data[5]).toBeCloseTo(dir[1], 6)
      expect(data[6]).toBeCloseTo(dir[2], 6)
      expect(data[7]).toBe(0)

      // Light 0: color.rgb converted to linear, intensity in a
      const linear = parseHexColorToLinearRgb('#808080', [0, 0, 0])
      expect(data[8]).toBeCloseTo(linear[0], 6)
      expect(data[9]).toBeCloseTo(linear[1], 6)
      expect(data[10]).toBeCloseTo(linear[2], 6)
      expect(data[11]).toBe(2.0)

      // Light 0: params = decay, cosInner, cosOuter, enabled
      expect(data[12]).toBe(2.0)
      expect(data[13]).toBeCloseTo(Math.cos(innerAngleRad), 6)
      expect(data[14]).toBeCloseTo(Math.cos(outerAngleRad), 6)
      expect(data[15]).toBe(1.0)

      // Ambient packed at 128..131
      expect(data[128]).toBe(1.0)
      expect(data[129]).toBe(1.0)
      expect(data[130]).toBe(1.0)
      expect(data[131]).toBe(0.25)

      // lightCount is i32 at byte offset 132*4
      const view = new DataView(data.buffer)
      expect(view.getInt32(132 * 4, true)).toBe(1)
    })

    it('packs enabled flag and zeros ambient when ambientEnabled is false', () => {
      const data = new Float32Array(144)

      packLightingUniforms(data, {
        lights: [
          {
            id: 'light-1',
            name: 'Disabled',
            type: 'point',
            enabled: false,
            position: [0, 0, 0],
            rotation: [0, 0, 0],
            color: '#ffffff',
            intensity: 1.0,
            coneAngle: 30,
            penumbra: 0.5,
            range: 0,
            decay: 2.0,
          },
        ],
        ambientColor: '#ffffff',
        ambientIntensity: 0.3,
        ambientEnabled: false,
      })

      expect(data[15]).toBe(0.0) // enabled flag in params.w
      expect(data[131]).toBe(0.0) // ambientIntensity gated by ambientEnabled
    })

    it('clamps to 8 lights and throws on too-small buffers', () => {
      const tooSmall = new Float32Array(10)
      expect(() => packLightingUniforms(tooSmall, { lights: [] })).toThrow(/expected data length/i)

      const data = new Float32Array(144)
      const lights = Array.from({ length: 9 }, (_, i) => ({
        id: `light-${i}`,
        name: `Light ${i}`,
        type: 'point' as const,
        enabled: true,
        position: [i, i, i] as [number, number, number],
        rotation: [0, 0, 0] as [number, number, number],
        color: '#ffffff',
        intensity: 1.0,
        coneAngle: 30,
        penumbra: 0.5,
        range: 0,
        decay: 2.0,
      }))

      packLightingUniforms(data, { lights })

      const view = new DataView(data.buffer)
      expect(view.getInt32(132 * 4, true)).toBe(8)
    })
  })
})

