/**
 * GTAOPass tests (high-signal invariants).
 *
 * Focus:
 * - External G-buffer wiring (historical "rectangular shadow" regression)
 * - Half-resolution upsample shader uniform propagation
 */

import * as THREE from 'three'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { GTAOPass } from '@/rendering/graph/passes/GTAOPass'

// Mock shader uniform structure
const createMockUniforms = () => ({
  tNormal: { value: null },
  tDepth: { value: null },
})

// Mock the Three.js GTAOPass since it requires WebGL context
vi.mock('three/examples/jsm/postprocessing/GTAOPass.js', () => ({
  GTAOPass: class MockGTAOPass {
    // Correct values from Three.js GTAOPass source
    public static OUTPUT = {
      Off: -1,
      Default: 0,
      Diffuse: 1,
      Depth: 2,
      Normal: 3,
      AO: 4,
      Denoise: 5,
    }

    public normalTexture: THREE.Texture | null = null
    public depthTexture: THREE.Texture | null = null
    public radius: number = 0.25
    public scale: number = 1.0
    public blendIntensity: number = 1.0
    public output: number = 0

    // Internal properties accessed by configureExternalGBuffer
    public _renderGBuffer: boolean = true
    public gtaoMaterial = {
      defines: {
        NORMAL_VECTOR_TYPE: 0,
        DEPTH_SWIZZLING: 'x',
      },
      uniforms: createMockUniforms(),
      needsUpdate: false,
    }
    public pdMaterial = {
      defines: {
        NORMAL_VECTOR_TYPE: 0,
        DEPTH_SWIZZLING: 'x',
      },
      uniforms: createMockUniforms(),
      needsUpdate: false,
    }

    constructor() {
      // Mock constructor
    }

    render() {
      // Mock render
    }

    setSize() {
      // Mock setSize
    }

    dispose() {
      // Mock dispose
    }
  },
}))

// Mock FullscreenQuad utilities
vi.mock('@/rendering/core/FullscreenQuad', () => ({
  getFullscreenQuadGeometry: () => new THREE.PlaneGeometry(2, 2),
  releaseFullscreenQuadGeometry: vi.fn(),
}))

describe('GTAOPass', () => {
  let pass: GTAOPass

  beforeEach(() => {
    pass = new GTAOPass({
      id: 'gtao',
      colorInput: 'sceneColor',
      normalInput: 'normalBuffer',
      depthInput: 'sceneDepth',
      outputResource: 'gtaoOutput',
    })
  })

  afterEach(() => {
    pass.dispose()
  })

  it('wires external normal/depth into the underlying Three.js GTAOPass (regression guard)', () => {
    // Use full-res path for easier inspection.
    pass.setHalfResolution(false)

    const mockGl = {
      blitFramebuffer: vi.fn(),
      bindFramebuffer: vi.fn(),
      READ_FRAMEBUFFER: 0x8ca8,
      DRAW_FRAMEBUFFER: 0x8ca9,
      FRAMEBUFFER: 0x8d40,
      COLOR_BUFFER_BIT: 0x4000,
      NEAREST: 0x2600,
    }
    const mockProperties = new Map()
    const renderer = {
      setRenderTarget: vi.fn(),
      render: vi.fn(),
      getContext: vi.fn(() => mockGl),
      properties: { get: vi.fn((target: unknown) => mockProperties.get(target) ?? {}) },
    } as unknown as THREE.WebGLRenderer

    const colorTex = new THREE.Texture()
    const normalTex = new THREE.Texture()
    const depthTex = new THREE.Texture()
    const outputTarget = new THREE.WebGLRenderTarget(8, 8)

    const getReadTexture = vi.fn((resourceId: string) => {
      if (resourceId === 'sceneColor') return colorTex
      if (resourceId === 'normalBuffer') return normalTex
      if (resourceId === 'sceneDepth') return depthTex
      return null
    })

    const ctx = {
      renderer,
      size: { width: 8, height: 8 },
      scene: new THREE.Scene(),
      camera: new THREE.PerspectiveCamera(),
      getReadTexture,
      getWriteTarget: vi.fn(() => outputTarget),
    } as unknown as import('@/rendering/graph/types').RenderContext

    pass.execute(ctx)

    const internal = (
      pass as unknown as {
        gtaoPass: import('three/examples/jsm/postprocessing/GTAOPass.js').GTAOPass
      }
    ).gtaoPass
    expect(internal).toBeTruthy()
    expect(internal._renderGBuffer).toBe(false)
    expect(internal.normalTexture).toBe(normalTex)
    expect(internal.depthTexture).toBe(depthTex)
    expect(internal.gtaoMaterial.defines.NORMAL_VECTOR_TYPE).toBe(1)
    expect(internal.gtaoMaterial.defines.DEPTH_SWIZZLING).toBe('x')
    expect(internal.gtaoMaterial.uniforms.tNormal?.value).toBe(normalTex)
    expect(internal.gtaoMaterial.uniforms.tDepth?.value).toBe(depthTex)
  })

  it('propagates AO intensity + bilateral depth threshold into the half-res upsample shader', () => {
    expect(pass.isHalfResolution()).toBe(true)

    pass.setIntensity(0.75)
    pass.setBilateralDepthThreshold(0.05)

    const upsampleMaterial = (pass as unknown as { upsampleMaterial: THREE.ShaderMaterial | null })
      .upsampleMaterial
    expect(upsampleMaterial).toBeTruthy()

    const uniforms = upsampleMaterial!.uniforms as Record<string, THREE.IUniform>
    expect(uniforms.uAOIntensity?.value).toBe(0.75)
    expect(uniforms.uDepthThreshold?.value).toBe(0.05)
  })
})
