/**
 * Tests for TemporalDepthCapturePass.
 *
 * Verifies self-contained state management and temporal uniform generation.
 */

import * as THREE from 'three'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { TemporalDepthCapturePass } from '@/rendering/graph/passes/TemporalDepthCapturePass'
import type { RenderGraph } from '@/rendering/graph/RenderGraph'
import type { RenderContext } from '@/rendering/graph/types'

// Mock stores
vi.mock('@/stores/performanceStore', () => ({
  usePerformanceStore: {
    getState: vi.fn(() => ({ temporalReprojectionEnabled: true })),
  },
}))

describe('TemporalDepthCapturePass', () => {
  let pass: TemporalDepthCapturePass

  beforeEach(() => {
    pass = new TemporalDepthCapturePass({
      id: 'temporalDepth',
      positionInput: 'position',
      positionAttachment: 2,
      outputResource: 'output',
    })
  })

  afterEach(() => {
    pass.dispose()
    vi.restoreAllMocks()
  })

  it('should create pass with correct configuration', () => {
    expect(pass.id).toBe('temporalDepth')
    expect(pass.getOutputResourceId()).toBe('output')
  })

  it('should have invalid history initially', () => {
    const mockGraph = {
      getReadTexture: vi.fn(() => null),
    } as unknown as RenderGraph

    const uniforms = pass.getTemporalUniforms(mockGraph)

    expect(uniforms.uTemporalEnabled).toBe(false)
    expect(uniforms.uPrevDepthTexture).toBeNull()
  })

  it('should have valid history after successful execution', () => {
    const positionTexture = new THREE.DataTexture(
      new Float32Array(4 * 4 * 4),
      4,
      4,
      THREE.RGBAFormat,
      THREE.FloatType
    )
    ;(positionTexture as unknown as { image: { width: number; height: number } }).image = {
      width: 4,
      height: 4,
    }

    const writeTarget = new THREE.WebGLRenderTarget(4, 4)

    const ctx = {
      renderer: {
        autoClear: true,
        setRenderTarget: vi.fn(),
        setClearColor: vi.fn(),
        clear: vi.fn(),
        render: vi.fn(),
      } as unknown as THREE.WebGLRenderer,
      getReadTexture: (id: string) => (id === 'position' ? positionTexture : null),
      getWriteTarget: (id: string) => (id === 'output' ? writeTarget : null),
      camera: new THREE.PerspectiveCamera(),
    } as unknown as RenderContext

    pass.execute(ctx)

    // Create mock graph that returns a texture
    const mockTexture = new THREE.Texture()
    const mockGraph = {
      getReadTexture: vi.fn(() => mockTexture),
    } as unknown as RenderGraph

    const uniforms = pass.getTemporalUniforms(mockGraph)

    expect(uniforms.uTemporalEnabled).toBe(true)
    expect(uniforms.uPrevDepthTexture).toBe(mockTexture)
    expect(uniforms.uDepthBufferResolution.x).toBe(4)
    expect(uniforms.uDepthBufferResolution.y).toBe(4)
  })

  it('should skip execution when inputs are missing', () => {
    const renderSpy = vi.fn()

    const ctx = {
      renderer: {
        render: renderSpy,
      } as unknown as THREE.WebGLRenderer,
      getReadTexture: () => null, // Missing input
      getWriteTarget: () => new THREE.WebGLRenderTarget(1, 1),
      camera: new THREE.PerspectiveCamera(),
    } as unknown as RenderContext

    pass.execute(ctx)

    expect(renderSpy).not.toHaveBeenCalled()
  })

  it('should invalidate history when invalidate() is called', () => {
    const positionTexture = new THREE.DataTexture(
      new Float32Array(4 * 4 * 4),
      4,
      4,
      THREE.RGBAFormat,
      THREE.FloatType
    )
    ;(positionTexture as unknown as { image: { width: number; height: number } }).image = {
      width: 4,
      height: 4,
    }

    const writeTarget = new THREE.WebGLRenderTarget(4, 4)

    const ctx = {
      renderer: {
        autoClear: true,
        setRenderTarget: vi.fn(),
        setClearColor: vi.fn(),
        clear: vi.fn(),
        render: vi.fn(),
      } as unknown as THREE.WebGLRenderer,
      getReadTexture: (id: string) => (id === 'position' ? positionTexture : null),
      getWriteTarget: (id: string) => (id === 'output' ? writeTarget : null),
      camera: new THREE.PerspectiveCamera(),
    } as unknown as RenderContext

    // Execute to create valid history
    pass.execute(ctx)

    // Invalidate
    pass.invalidate()

    const mockGraph = {
      getReadTexture: vi.fn(() => new THREE.Texture()),
    } as unknown as RenderGraph

    const uniforms = pass.getTemporalUniforms(mockGraph)

    expect(uniforms.uTemporalEnabled).toBe(false)
  })

  it('should track camera matrices across frames', () => {
    const positionTexture = new THREE.DataTexture(
      new Float32Array(4 * 4 * 4),
      4,
      4,
      THREE.RGBAFormat,
      THREE.FloatType
    )
    ;(positionTexture as unknown as { image: { width: number; height: number } }).image = {
      width: 4,
      height: 4,
    }

    const writeTarget = new THREE.WebGLRenderTarget(4, 4)
    const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 100)
    camera.position.set(5, 5, 5)
    camera.lookAt(0, 0, 0)
    camera.updateMatrixWorld()
    camera.updateProjectionMatrix()

    const ctx = {
      renderer: {
        autoClear: true,
        setRenderTarget: vi.fn(),
        setClearColor: vi.fn(),
        clear: vi.fn(),
        render: vi.fn(),
      } as unknown as THREE.WebGLRenderer,
      getReadTexture: (id: string) => (id === 'position' ? positionTexture : null),
      getWriteTarget: (id: string) => (id === 'output' ? writeTarget : null),
      camera,
    } as unknown as RenderContext

    pass.execute(ctx)

    const mockGraph = {
      getReadTexture: vi.fn(() => new THREE.Texture()),
    } as unknown as RenderGraph

    const uniforms = pass.getTemporalUniforms(mockGraph)

    // Verify matrices are non-identity (they should have been set from camera)
    const identity = new THREE.Matrix4()
    expect(uniforms.uPrevViewProjectionMatrix.equals(identity)).toBe(false)
    expect(uniforms.uPrevInverseViewProjectionMatrix.equals(identity)).toBe(false)
  })
})
