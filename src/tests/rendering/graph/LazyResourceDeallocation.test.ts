/**
 * Tests for Lazy Resource Deallocation feature.
 *
 * Verifies that render passes release their GPU resources after being
 * disabled for the configured grace period, and reallocate them when re-enabled.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'

import { BasePass } from '@/rendering/graph/BasePass'
import { RenderGraph } from '@/rendering/graph/RenderGraph'
import type { RenderContext, RenderPassConfig } from '@/rendering/graph/types'

// =============================================================================
// Test Pass with Trackable Resources
// =============================================================================

/**
 * Test pass that simulates internal resource allocation/deallocation.
 * Tracks when resources are allocated/released to verify the feature works.
 */
class ResourceTrackingPass extends BasePass {
  public resourcesAllocated = false
  public allocateCount = 0
  public releaseCount = 0
  private lastWidth = 0
  private lastHeight = 0

  constructor(config: RenderPassConfig) {
    super(config)
  }

  /**
   * Simulates ensureInitialized() pattern - allocates on first execute or size change.
   */
  private ensureInitialized(width: number, height: number): void {
    if (!this.resourcesAllocated || width !== this.lastWidth || height !== this.lastHeight) {
      this.resourcesAllocated = true
      this.allocateCount++
      this.lastWidth = width
      this.lastHeight = height
    }
  }

  execute(ctx: RenderContext): void {
    this.ensureInitialized(ctx.size.width, ctx.size.height)
  }

  releaseInternalResources(): void {
    if (this.resourcesAllocated) {
      this.resourcesAllocated = false
      this.releaseCount++
      this.lastWidth = 0
      this.lastHeight = 0
    }
  }

  dispose(): void {
    this.releaseInternalResources()
  }
}

// =============================================================================
// Mock Renderer
// =============================================================================

function createMockRenderer(): THREE.WebGLRenderer {
  const canvas = document.createElement('canvas')
  canvas.width = 100
  canvas.height = 100

  const gl = canvas.getContext('webgl2', { antialias: false })
  if (!gl) {
    throw new Error('WebGL2 not available')
  }

  let currentRenderTarget: THREE.WebGLRenderTarget | null = null
  const clearColor = new THREE.Color(0, 0, 0)
  let clearAlpha = 1

  return {
    domElement: canvas,
    getContext: () => gl,
    getClearColor: (target: THREE.Color) => {
      target.copy(clearColor)
      return target
    },
    getClearAlpha: () => clearAlpha,
    setClearColor: vi.fn(),
    autoClear: true,
    setRenderTarget: vi.fn((target: THREE.WebGLRenderTarget | null) => {
      currentRenderTarget = target
    }),
    getRenderTarget: vi.fn(() => currentRenderTarget),
    render: vi.fn(),
    clear: vi.fn(),
    info: {
      render: { calls: 0, triangles: 0, points: 0, lines: 0 },
      memory: { geometries: 0, textures: 0 },
      programs: [],
    },
    xr: { enabled: false },
    shadowMap: { enabled: false },
    toneMapping: THREE.NoToneMapping,
    outputColorSpace: THREE.SRGBColorSpace,
    getPixelRatio: () => 1,
    getSize: (target: THREE.Vector2) => target.set(100, 100),
    state: { reset: vi.fn() },
    properties: { get: vi.fn().mockReturnValue({}) },
    capabilities: {
      isWebGL2: true,
      maxTextures: 16,
      maxCubemapSize: 4096,
      maxTextureSize: 4096,
    },
    extensions: { get: vi.fn().mockReturnValue(null) },
  } as unknown as THREE.WebGLRenderer
}

// =============================================================================
// Tests
// =============================================================================

describe('Lazy Resource Deallocation', () => {
  let graph: RenderGraph
  let renderer: THREE.WebGLRenderer
  let scene: THREE.Scene
  let camera: THREE.Camera

  beforeEach(() => {
    graph = new RenderGraph()
    renderer = createMockRenderer()
    scene = new THREE.Scene()
    camera = new THREE.PerspectiveCamera()

    // Register a simple resource for the pass to use
    graph.addResource({
      id: 'testInput',
      type: 'renderTarget',
      size: { mode: 'fixed', width: 100, height: 100 },
    })
    graph.addResource({
      id: 'testOutput',
      type: 'renderTarget',
      size: { mode: 'fixed', width: 100, height: 100 },
    })

    graph.setSize(100, 100)
  })

  afterEach(() => {
    graph.dispose()
  })

  describe('Grace Period Behavior', () => {
    it('should NOT release resources before grace period elapses', () => {
      let isEnabled = true
      const pass = new ResourceTrackingPass({
        id: 'test',
        inputs: [{ resourceId: 'testInput', access: 'read' }],
        outputs: [{ resourceId: 'testOutput', access: 'write' }],
        enabled: () => isEnabled,
        disableGracePeriod: 10, // Short grace period for testing
      })

      graph.addPass(pass)
      graph.compile()

      // Execute once to allocate resources
      graph.execute(renderer, scene, camera, 0.016)
      expect(pass.resourcesAllocated).toBe(true)
      expect(pass.allocateCount).toBe(1)

      // Disable the pass
      isEnabled = false

      // Execute 9 frames (one less than grace period)
      for (let i = 0; i < 9; i++) {
        graph.execute(renderer, scene, camera, 0.016)
      }

      // Resources should still be allocated
      expect(pass.resourcesAllocated).toBe(true)
      expect(pass.releaseCount).toBe(0)
    })

    it('should release resources exactly when grace period elapses', () => {
      let isEnabled = true
      const pass = new ResourceTrackingPass({
        id: 'test',
        inputs: [{ resourceId: 'testInput', access: 'read' }],
        outputs: [{ resourceId: 'testOutput', access: 'write' }],
        enabled: () => isEnabled,
        disableGracePeriod: 10,
      })

      graph.addPass(pass)
      graph.compile()

      // Execute once to allocate resources
      graph.execute(renderer, scene, camera, 0.016)
      expect(pass.resourcesAllocated).toBe(true)

      // Disable the pass
      isEnabled = false

      // Execute exactly 10 frames (grace period)
      for (let i = 0; i < 10; i++) {
        graph.execute(renderer, scene, camera, 0.016)
      }

      // Resources should now be released
      expect(pass.resourcesAllocated).toBe(false)
      expect(pass.releaseCount).toBe(1)
    })

    it('should NOT release resources multiple times after grace period', () => {
      let isEnabled = true
      const pass = new ResourceTrackingPass({
        id: 'test',
        inputs: [{ resourceId: 'testInput', access: 'read' }],
        outputs: [{ resourceId: 'testOutput', access: 'write' }],
        enabled: () => isEnabled,
        disableGracePeriod: 5,
      })

      graph.addPass(pass)
      graph.compile()

      // Allocate resources
      graph.execute(renderer, scene, camera, 0.016)

      // Disable and run past grace period
      isEnabled = false
      for (let i = 0; i < 20; i++) {
        graph.execute(renderer, scene, camera, 0.016)
      }

      // Should only be released once
      expect(pass.releaseCount).toBe(1)
    })
  })

  describe('Re-enable Behavior', () => {
    it('should reallocate resources when pass is re-enabled after release', () => {
      let isEnabled = true
      const pass = new ResourceTrackingPass({
        id: 'test',
        inputs: [{ resourceId: 'testInput', access: 'read' }],
        outputs: [{ resourceId: 'testOutput', access: 'write' }],
        enabled: () => isEnabled,
        disableGracePeriod: 5,
      })

      graph.addPass(pass)
      graph.compile()

      // Allocate resources
      graph.execute(renderer, scene, camera, 0.016)
      expect(pass.allocateCount).toBe(1)

      // Disable and wait for release
      isEnabled = false
      for (let i = 0; i < 5; i++) {
        graph.execute(renderer, scene, camera, 0.016)
      }
      expect(pass.resourcesAllocated).toBe(false)
      expect(pass.releaseCount).toBe(1)

      // Re-enable
      isEnabled = true
      graph.execute(renderer, scene, camera, 0.016)

      // Resources should be reallocated
      expect(pass.resourcesAllocated).toBe(true)
      expect(pass.allocateCount).toBe(2)
    })

    it('should reset grace period counter when pass is re-enabled before release', () => {
      let isEnabled = true
      const pass = new ResourceTrackingPass({
        id: 'test',
        inputs: [{ resourceId: 'testInput', access: 'read' }],
        outputs: [{ resourceId: 'testOutput', access: 'write' }],
        enabled: () => isEnabled,
        disableGracePeriod: 10,
      })

      graph.addPass(pass)
      graph.compile()

      // Allocate resources
      graph.execute(renderer, scene, camera, 0.016)

      // Disable for 5 frames (half grace period)
      isEnabled = false
      for (let i = 0; i < 5; i++) {
        graph.execute(renderer, scene, camera, 0.016)
      }

      // Re-enable briefly
      isEnabled = true
      graph.execute(renderer, scene, camera, 0.016)

      // Disable again for 5 frames
      isEnabled = false
      for (let i = 0; i < 5; i++) {
        graph.execute(renderer, scene, camera, 0.016)
      }

      // Resources should NOT be released (counter was reset)
      expect(pass.resourcesAllocated).toBe(true)
      expect(pass.releaseCount).toBe(0)
    })
  })

  describe('keepResourcesWhenDisabled Option', () => {
    it('should NOT release resources when keepResourcesWhenDisabled is true', () => {
      let isEnabled = true
      const pass = new ResourceTrackingPass({
        id: 'test',
        inputs: [{ resourceId: 'testInput', access: 'read' }],
        outputs: [{ resourceId: 'testOutput', access: 'write' }],
        enabled: () => isEnabled,
        disableGracePeriod: 5,
        keepResourcesWhenDisabled: true,
      })

      graph.addPass(pass)
      graph.compile()

      // Allocate resources
      graph.execute(renderer, scene, camera, 0.016)

      // Disable and run way past grace period
      isEnabled = false
      for (let i = 0; i < 100; i++) {
        graph.execute(renderer, scene, camera, 0.016)
      }

      // Resources should still be allocated
      expect(pass.resourcesAllocated).toBe(true)
      expect(pass.releaseCount).toBe(0)
    })
  })

  describe('Default Grace Period', () => {
    it('should use default 60 frame grace period when not specified', () => {
      let isEnabled = true
      const pass = new ResourceTrackingPass({
        id: 'test',
        inputs: [{ resourceId: 'testInput', access: 'read' }],
        outputs: [{ resourceId: 'testOutput', access: 'write' }],
        enabled: () => isEnabled,
        // No disableGracePeriod specified - should use default of 60
      })

      graph.addPass(pass)
      graph.compile()

      // Allocate resources
      graph.execute(renderer, scene, camera, 0.016)

      // Disable and run 59 frames
      isEnabled = false
      for (let i = 0; i < 59; i++) {
        graph.execute(renderer, scene, camera, 0.016)
      }

      // Should still be allocated
      expect(pass.resourcesAllocated).toBe(true)

      // One more frame (60th)
      graph.execute(renderer, scene, camera, 0.016)

      // Now should be released
      expect(pass.resourcesAllocated).toBe(false)
    })
  })

  describe('Statistics', () => {
    it('should track pending deallocations correctly', () => {
      let isEnabled = true
      const pass = new ResourceTrackingPass({
        id: 'test',
        inputs: [{ resourceId: 'testInput', access: 'read' }],
        outputs: [{ resourceId: 'testOutput', access: 'write' }],
        enabled: () => isEnabled,
        disableGracePeriod: 10,
      })

      graph.addPass(pass)
      graph.compile()

      // Allocate resources
      graph.execute(renderer, scene, camera, 0.016)

      // Check initial stats
      let stats = graph.getResourceDeallocationStats()
      expect(stats.enabledPasses).toBe(1)
      expect(stats.disabledPasses).toBe(0)
      expect(stats.pendingDeallocations).toBe(0)

      // Disable pass
      isEnabled = false
      graph.execute(renderer, scene, camera, 0.016)

      // Should show pending deallocation
      stats = graph.getResourceDeallocationStats()
      expect(stats.enabledPasses).toBe(0)
      expect(stats.disabledPasses).toBe(1)
      expect(stats.pendingDeallocations).toBe(1)

      // Wait for grace period to elapse
      for (let i = 0; i < 10; i++) {
        graph.execute(renderer, scene, camera, 0.016)
      }

      // No longer pending (already released)
      stats = graph.getResourceDeallocationStats()
      expect(stats.pendingDeallocations).toBe(0)
    })
  })

  describe('Force Release', () => {
    it('should immediately release resources when forceReleasePassResources is called', () => {
      let isEnabled = true
      const pass = new ResourceTrackingPass({
        id: 'test',
        inputs: [{ resourceId: 'testInput', access: 'read' }],
        outputs: [{ resourceId: 'testOutput', access: 'write' }],
        enabled: () => isEnabled,
        disableGracePeriod: 100, // Long grace period
      })

      graph.addPass(pass)
      graph.compile()

      // Allocate resources
      graph.execute(renderer, scene, camera, 0.016)
      expect(pass.resourcesAllocated).toBe(true)

      // Force release without waiting for grace period
      const released = graph.forceReleasePassResources('test')

      expect(released).toBe(true)
      expect(pass.resourcesAllocated).toBe(false)
      expect(pass.releaseCount).toBe(1)
    })
  })
})
