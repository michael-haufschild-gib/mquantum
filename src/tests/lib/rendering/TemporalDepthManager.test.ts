/**
 * Tests for TemporalDepthState (per-scene state holder).
 */

import { TemporalDepthState, invalidateAllTemporalDepth } from '@/rendering/core/temporalDepth'
import { usePerformanceStore } from '@/stores/performanceStore'
import * as THREE from 'three'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock stores
vi.mock('@/stores/performanceStore', () => ({
  usePerformanceStore: {
    getState: vi.fn(() => ({ temporalReprojectionEnabled: true })),
  },
}))

vi.mock('@/stores/webglContextStore', () => ({
  useWebGLContextStore: {
    getState: vi.fn(() => ({ status: 'active' })),
  },
}))

describe('TemporalDepthState', () => {
  let state: TemporalDepthState

  beforeEach(() => {
    // Reset mock to default (enabled) before each test
    ;(usePerformanceStore.getState as ReturnType<typeof vi.fn>).mockReturnValue({
      temporalReprojectionEnabled: true,
    })
    state = new TemporalDepthState()
  })

  afterEach(() => {
    state.dispose()
    vi.clearAllMocks()
  })

  it('should update state and provide uniforms', () => {
    const texture = new THREE.Texture()
    const camera = new THREE.PerspectiveCamera()
    camera.updateMatrixWorld()

    state.updateCameraMatrices(camera)
    state.updateState(texture, 100, 100)

    const uniforms = state.getUniforms()
    expect(uniforms.uTemporalEnabled).toBe(true)
    expect(uniforms.uPrevDepthTexture).toBe(texture)
    expect(uniforms.uDepthBufferResolution.x).toBe(100)
  })

  it('should disable uniforms when invalidated', () => {
    const texture = new THREE.Texture()
    state.updateState(texture, 100, 100)
    expect(state.getUniforms().uTemporalEnabled).toBe(true)

    state.invalidate()
    expect(state.getUniforms().uTemporalEnabled).toBe(false)
    expect(state.getUniforms().uPrevDepthTexture).toBeNull()
  })

  it('should reflect performance store enabled state', () => {
    // Mock disabled
    ;(usePerformanceStore.getState as ReturnType<typeof vi.fn>).mockReturnValue({
      temporalReprojectionEnabled: false,
    })

    const texture = new THREE.Texture()
    state.updateState(texture, 100, 100) // Should fail to set valid

    expect(state.isEnabled()).toBe(false)
    expect(state.getUniforms().uTemporalEnabled).toBe(false)
  })

  it('should invalidate all instances via global function', () => {
    const state1 = new TemporalDepthState()
    const state2 = new TemporalDepthState()

    const texture = new THREE.Texture()
    state1.updateState(texture, 100, 100)
    state2.updateState(texture, 100, 100)

    expect(state1.getUniforms().uTemporalEnabled).toBe(true)
    expect(state2.getUniforms().uTemporalEnabled).toBe(true)

    invalidateAllTemporalDepth()

    expect(state1.getUniforms().uTemporalEnabled).toBe(false)
    expect(state2.getUniforms().uTemporalEnabled).toBe(false)

    state1.dispose()
    state2.dispose()
  })

  it('should unregister on dispose', () => {
    const localState = new TemporalDepthState()
    const texture = new THREE.Texture()
    localState.updateState(texture, 100, 100)
    expect(localState.getUniforms().uTemporalEnabled).toBe(true)

    localState.dispose()

    // After dispose, calling invalidateAll shouldn't affect disposed instance
    // (no error thrown, it's simply not in registry anymore)
    invalidateAllTemporalDepth() // Should not throw
  })
})
