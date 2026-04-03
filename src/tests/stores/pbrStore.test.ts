/**
 * Tests for pbrStore.
 * Verifies PBR numeric setter contracts and sanitization behavior.
 */

import { beforeEach, describe, expect, it } from 'vitest'

import { usePBRStore } from '@/stores/pbrStore'
import { PBR_INITIAL_STATE } from '@/stores/slices/visual/pbrSlice'

describe('pbrStore', () => {
  beforeEach(() => {
    usePBRStore.setState({
      ...PBR_INITIAL_STATE,
      face: { ...PBR_INITIAL_STATE.face },
    })
  })

  it('clamps direct numeric PBR setters to valid ranges', () => {
    const store = usePBRStore.getState()
    store.setFaceRoughness(10)
    store.setFaceMetallic(-10)
    store.setFaceSpecularIntensity(10)

    const next = usePBRStore.getState()
    expect(next.face.roughness).toBe(1)
    expect(next.face.metallic).toBe(0)
    expect(next.face.specularIntensity).toBe(2)
  })

  it('ignores non-finite direct numeric PBR setter inputs', () => {
    const store = usePBRStore.getState()
    store.setFaceRoughness(0.7)
    store.setFaceMetallic(0.2)
    store.setFaceSpecularIntensity(1.1)

    store.setFaceRoughness(Number.NaN)
    store.setFaceMetallic(Number.POSITIVE_INFINITY)
    store.setFaceSpecularIntensity(Number.NEGATIVE_INFINITY)

    const next = usePBRStore.getState()
    expect(next.face.roughness).toBe(0.7)
    expect(next.face.metallic).toBe(0.2)
    expect(next.face.specularIntensity).toBe(1.1)
  })

  it('ignores non-finite numeric fields in setFacePBR while applying valid fields', () => {
    const store = usePBRStore.getState()
    store.setFacePBR({
      roughness: 0.6,
      metallic: 0.3,
      specularIntensity: 1.2,
      specularColor: '#ffffff',
    })

    store.setFacePBR({
      roughness: Number.NaN,
      metallic: Number.POSITIVE_INFINITY,
      specularIntensity: Number.NEGATIVE_INFINITY,
      specularColor: '#123456',
    })

    const next = usePBRStore.getState()
    expect(next.face.roughness).toBe(0.6)
    expect(next.face.metallic).toBe(0.3)
    expect(next.face.specularIntensity).toBe(1.2)
    expect(next.face.specularColor).toBe('#123456')
  })

  it('setFacePBR applies and clamps ior, transmission, thickness', () => {
    usePBRStore.getState().setFacePBR({
      ior: 5.0,
      transmission: -1.0,
      thickness: 20.0,
    })

    const next = usePBRStore.getState()
    expect(next.face.ior).toBe(3.0) // clamped from 5.0
    expect(next.face.transmission).toBe(0.0) // clamped from -1.0
    expect(next.face.thickness).toBe(10.0) // clamped from 20.0
  })

  it('setFacePBR ignores non-finite ior/transmission/thickness', () => {
    usePBRStore.getState().setFacePBR({ ior: 2.0, transmission: 0.5, thickness: 3.0 })
    usePBRStore.getState().setFacePBR({
      ior: Number.NaN,
      transmission: Number.POSITIVE_INFINITY,
      thickness: Number.NEGATIVE_INFINITY,
    })

    const next = usePBRStore.getState()
    expect(next.face.ior).toBe(2.0)
    expect(next.face.transmission).toBe(0.5)
    expect(next.face.thickness).toBe(3.0)
  })

  it('clamps reflectance via direct setter', () => {
    usePBRStore.getState().setFaceReflectance(5.0)
    expect(usePBRStore.getState().face.reflectance).toBe(1.0)

    usePBRStore.getState().setFaceReflectance(-1.0)
    expect(usePBRStore.getState().face.reflectance).toBe(0.0)
  })
})
