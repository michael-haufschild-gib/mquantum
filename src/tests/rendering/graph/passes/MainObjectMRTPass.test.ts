/**
 * Tests for MainObjectMRTPass.
 *
 * Verifies MRT setup, basic execution, and material caching behavior.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'

import { MainObjectMRTPass } from '@/rendering/graph/passes/MainObjectMRTPass'
import type { RenderContext } from '@/rendering/graph/types'

describe('MainObjectMRTPass', () => {
  let pass: MainObjectMRTPass

  beforeEach(() => {
    pass = new MainObjectMRTPass({
      id: 'mainObjectMrt',
      outputResource: 'mrtOut',
    })
  })

  afterEach(() => {
    pass.dispose()
  })

  it('should create pass with correct ID', () => {
    expect(pass.id).toBe('mainObjectMrt')
  })

  it('should allow updating layers', () => {
    pass.setLayers([1, 2])
    pass.setLayers(null)
    expect(pass.id).toBe('mainObjectMrt')
  })

  it('should execute without throwing', () => {
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100)
    const geometry = new THREE.BoxGeometry(1, 1, 1)
    const material = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.5 })
    const mesh = new THREE.Mesh(geometry, material)
    scene.add(mesh)

    const target = new THREE.WebGLRenderTarget(8, 8)

    const mockRenderer = {
      autoClear: true,
      getClearColor: vi.fn().mockReturnValue(new THREE.Color(0, 0, 0)),
      getClearAlpha: vi.fn().mockReturnValue(1),
      setClearColor: vi.fn(),
      setRenderTarget: vi.fn(),
      clear: vi.fn(),
      render: vi.fn(),
      getContext: vi.fn().mockReturnValue({
        drawBuffers: vi.fn(),
        COLOR_ATTACHMENT0: 0x8ce0,
        COLOR_ATTACHMENT1: 0x8ce1,
        COLOR_ATTACHMENT2: 0x8ce2,
      }),
    } as unknown as THREE.WebGLRenderer

    const ctx = {
      renderer: mockRenderer,
      scene,
      camera,
      getWriteTarget: () => target,
    } as unknown as RenderContext

    expect(() => pass.execute(ctx)).not.toThrow()
  })

  it('should dispose without error', () => {
    expect(() => pass.dispose()).not.toThrow()
  })

  describe('Material Caching', () => {
    let scene: THREE.Scene
    let camera: THREE.PerspectiveCamera
    let target: THREE.WebGLRenderTarget
    let mockRenderer: THREE.WebGLRenderer
    let ctx: RenderContext
    let traverseSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
      scene = new THREE.Scene()
      camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100)
      target = new THREE.WebGLRenderTarget(8, 8)

      mockRenderer = {
        autoClear: true,
        getClearColor: vi.fn().mockReturnValue(new THREE.Color(0, 0, 0)),
        getClearAlpha: vi.fn().mockReturnValue(1),
        setClearColor: vi.fn(),
        setRenderTarget: vi.fn(),
        clear: vi.fn(),
        render: vi.fn(),
        getContext: vi.fn().mockReturnValue({
          drawBuffers: vi.fn(),
          COLOR_ATTACHMENT0: 0x8ce0,
          COLOR_ATTACHMENT1: 0x8ce1,
          COLOR_ATTACHMENT2: 0x8ce2,
        }),
      } as unknown as THREE.WebGLRenderer

      ctx = {
        renderer: mockRenderer,
        scene,
        camera,
        getWriteTarget: () => target,
      } as unknown as RenderContext

      // Add a transparent mesh to the scene
      const material = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.5 })
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material)
      scene.add(mesh)

      traverseSpy = vi.spyOn(scene, 'traverse')
    })

    afterEach(() => {
      traverseSpy.mockRestore()
    })

    it('should build material cache on first execute', () => {
      pass.execute(ctx)
      expect(traverseSpy).toHaveBeenCalledTimes(1)
    })

    it('should rebuild material cache on each execute for dynamic layer support', () => {
      // Material cache is rebuilt on each execute because:
      // 1. Mesh layers may be set AFTER first render (via ref callbacks)
      // 2. Materials may change at runtime
      // 3. Transparency state may change dynamically
      pass.execute(ctx)
      pass.execute(ctx)
      pass.execute(ctx)
      // Traversed 3 times - cache is rebuilt each time
      expect(traverseSpy).toHaveBeenCalledTimes(3)
    })

    it('should support invalidateCache() method', () => {
      // invalidateCache clears the cache, but cache is rebuilt every execute anyway
      pass.execute(ctx)
      expect(traverseSpy).toHaveBeenCalledTimes(1)

      pass.invalidateCache()
      pass.execute(ctx)
      // Traversed again (would happen regardless due to always-rebuild behavior)
      expect(traverseSpy).toHaveBeenCalledTimes(2)
    })

    it('should support setLayers() method', () => {
      pass.execute(ctx)
      expect(traverseSpy).toHaveBeenCalledTimes(1)

      pass.setLayers([1])
      pass.execute(ctx)
      // Traversed again (would happen regardless due to always-rebuild behavior)
      expect(traverseSpy).toHaveBeenCalledTimes(2)
    })

    it('should restore material properties after render', () => {
      const material = new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0.5,
        blending: THREE.NormalBlending,
      })
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material)
      scene.add(mesh)

      // Verify original state
      expect(material.transparent).toBe(true)
      expect(material.depthWrite).toBe(true)
      expect(material.blending).toBe(THREE.NormalBlending)

      pass.execute(ctx)

      // After execute, properties should be restored
      expect(material.transparent).toBe(true)
      expect(material.depthWrite).toBe(true)
      expect(material.blending).toBe(THREE.NormalBlending)
    })

    it('should not cache already-opaque materials', () => {
      // Clear scene and add only opaque mesh
      scene.clear()
      const opaqueMaterial = new THREE.MeshBasicMaterial({
        transparent: false,
        blending: THREE.NoBlending,
      })
      opaqueMaterial.depthWrite = true
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), opaqueMaterial)
      scene.add(mesh)

      pass.execute(ctx)

      // Material should not have been modified (it's already opaque)
      expect(opaqueMaterial.transparent).toBe(false)
      expect(opaqueMaterial.depthWrite).toBe(true)
      expect(opaqueMaterial.blending).toBe(THREE.NoBlending)
    })
  })
})
