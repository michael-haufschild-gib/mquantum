/**
 * Tests for RenderGraph resource aliasing system.
 *
 * Tests the skipPassthrough feature that allows disabled passes to use
 * resource aliasing instead of texture copying for better performance.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'

import { BasePass } from '@/rendering/graph/BasePass'
import { RenderGraph } from '@/rendering/graph/RenderGraph'
import type { RenderContext, RenderPassConfig } from '@/rendering/graph/types'

// =============================================================================
// Test Utilities
// =============================================================================

/**
 * Test pass that tracks execution and can be configured for various scenarios.
 */
class TestPass extends BasePass {
  public executed = false
  public lastInputTexture: THREE.Texture | null = null

  constructor(config: RenderPassConfig) {
    super(config)
  }

  execute(ctx: RenderContext): void {
    this.executed = true

    // Capture input texture if we have an input
    if (this.config.inputs.length > 0) {
      const inputId = this.config.inputs[0]!.resourceId
      this.lastInputTexture = ctx.getReadTexture(inputId)
    }
  }

  reset(): void {
    this.executed = false
    this.lastInputTexture = null
  }
}

/**
 * Create a mock WebGLRenderer that satisfies minimal requirements.
 * @returns Mock WebGLRenderer
 */
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

  const renderer = {
    domElement: canvas,
    getContext: () => gl,
    getClearColor: (target: THREE.Color) => {
      target.copy(clearColor)
      return target
    },
    getClearAlpha: () => clearAlpha,
    setClearColor: vi.fn((color: THREE.ColorRepresentation, alpha?: number) => {
      clearColor.set(color as THREE.ColorRepresentation)
      if (alpha !== undefined) clearAlpha = alpha
    }),
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
    state: {
      reset: vi.fn(),
    },
    // MRTStateManager expects these
    properties: {
      get: vi.fn().mockReturnValue({}),
    },
    capabilities: {
      maxTextures: 16,
    },
  } as unknown as THREE.WebGLRenderer

  return renderer
}

/**
 * Create a basic scene and camera for testing.
 * @returns Object with scene and camera
 */
function createSceneAndCamera(): { scene: THREE.Scene; camera: THREE.Camera } {
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000)
  camera.position.z = 5
  return { scene, camera }
}

// =============================================================================
// Tests
// =============================================================================

describe('RenderGraph Resource Aliasing', () => {
  let graph: RenderGraph
  let renderer: THREE.WebGLRenderer
  let scene: THREE.Scene
  let camera: THREE.Camera

  beforeEach(() => {
    graph = new RenderGraph()
    renderer = createMockRenderer()
    const sceneAndCamera = createSceneAndCamera()
    scene = sceneAndCamera.scene
    camera = sceneAndCamera.camera

    // Set up graph size
    graph.setSize(100, 100)
  })

  afterEach(() => {
    graph.dispose()
  })

  describe('skipPassthrough flag', () => {
    it('should use passthrough copy when skipPassthrough is false (default)', () => {
      // Set up resources
      graph.addResource({
        id: 'input',
        type: 'renderTarget',
        size: { mode: 'screen' },
      })
      graph.addResource({
        id: 'output',
        type: 'renderTarget',
        size: { mode: 'screen' },
      })
      graph.addResource({
        id: 'final',
        type: 'renderTarget',
        size: { mode: 'screen' },
      })

      // Pass A: writes to 'input' (always enabled)
      const passA = new TestPass({
        id: 'passA',
        inputs: [],
        outputs: [{ resourceId: 'input', access: 'write' }],
      })

      // Pass B: reads 'input', writes 'output' (disabled, uses passthrough)
      const passB = new TestPass({
        id: 'passB',
        inputs: [{ resourceId: 'input', access: 'read' }],
        outputs: [{ resourceId: 'output', access: 'write' }],
        enabled: () => false,
        skipPassthrough: false, // Explicitly false (default)
      })

      // Pass C: reads 'output', writes 'final' (always enabled)
      const passC = new TestPass({
        id: 'passC',
        inputs: [{ resourceId: 'output', access: 'read' }],
        outputs: [{ resourceId: 'final', access: 'write' }],
      })

      graph.addPass(passA)
      graph.addPass(passB)
      graph.addPass(passC)

      graph.compile()
      graph.execute(renderer, scene, camera, 0.016)

      // Pass B should not execute
      expect(passB.executed).toBe(false)

      // Pass A and C should execute
      expect(passA.executed).toBe(true)
      expect(passC.executed).toBe(true)

      // No aliases should be set (passthrough copy was used instead)
      const aliases = graph.getResourceAliases()
      expect(aliases.size).toBe(0)
    })

    it('should use aliasing when skipPassthrough is true', () => {
      // Set up resources
      graph.addResource({
        id: 'input',
        type: 'renderTarget',
        size: { mode: 'screen' },
      })
      graph.addResource({
        id: 'output',
        type: 'renderTarget',
        size: { mode: 'screen' },
      })
      graph.addResource({
        id: 'final',
        type: 'renderTarget',
        size: { mode: 'screen' },
      })

      // Pass A: writes to 'input' (always enabled)
      const passA = new TestPass({
        id: 'passA',
        inputs: [],
        outputs: [{ resourceId: 'input', access: 'write' }],
      })

      // Pass B: reads 'input', writes 'output' (disabled, uses aliasing)
      const passB = new TestPass({
        id: 'passB',
        inputs: [{ resourceId: 'input', access: 'read' }],
        outputs: [{ resourceId: 'output', access: 'write' }],
        enabled: () => false,
        skipPassthrough: true, // Use aliasing instead of passthrough
      })

      // Pass C: reads 'output', writes 'final' (always enabled)
      const passC = new TestPass({
        id: 'passC',
        inputs: [{ resourceId: 'output', access: 'read' }],
        outputs: [{ resourceId: 'final', access: 'write' }],
      })

      graph.addPass(passA)
      graph.addPass(passB)
      graph.addPass(passC)

      graph.compile()
      graph.execute(renderer, scene, camera, 0.016)

      // Pass B should not execute
      expect(passB.executed).toBe(false)

      // Pass A and C should execute
      expect(passA.executed).toBe(true)
      expect(passC.executed).toBe(true)

      // Alias should be set: output → input
      const aliases = graph.getResourceAliases()
      expect(aliases.has('output')).toBe(true)
      expect(aliases.get('output')).toBe('input')
    })

    it('should resolve alias chains correctly', () => {
      // Set up resources for a chain: A → B → C → D
      graph.addResource({ id: 'resA', type: 'renderTarget', size: { mode: 'screen' } })
      graph.addResource({ id: 'resB', type: 'renderTarget', size: { mode: 'screen' } })
      graph.addResource({ id: 'resC', type: 'renderTarget', size: { mode: 'screen' } })
      graph.addResource({ id: 'resD', type: 'renderTarget', size: { mode: 'screen' } })
      graph.addResource({ id: 'final', type: 'renderTarget', size: { mode: 'screen' } })

      // Pass that writes to resA (always enabled)
      const passSource = new TestPass({
        id: 'passSource',
        inputs: [],
        outputs: [{ resourceId: 'resA', access: 'write' }],
      })

      // Passes B, C, D form a chain (all disabled with skipPassthrough)
      const passB = new TestPass({
        id: 'passB',
        inputs: [{ resourceId: 'resA', access: 'read' }],
        outputs: [{ resourceId: 'resB', access: 'write' }],
        enabled: () => false,
        skipPassthrough: true,
      })

      const passC = new TestPass({
        id: 'passC',
        inputs: [{ resourceId: 'resB', access: 'read' }],
        outputs: [{ resourceId: 'resC', access: 'write' }],
        enabled: () => false,
        skipPassthrough: true,
      })

      const passD = new TestPass({
        id: 'passD',
        inputs: [{ resourceId: 'resC', access: 'read' }],
        outputs: [{ resourceId: 'resD', access: 'write' }],
        enabled: () => false,
        skipPassthrough: true,
      })

      // Final pass reads from resD (should resolve to resA)
      const passFinal = new TestPass({
        id: 'passFinal',
        inputs: [{ resourceId: 'resD', access: 'read' }],
        outputs: [{ resourceId: 'final', access: 'write' }],
      })

      graph.addPass(passSource)
      graph.addPass(passB)
      graph.addPass(passC)
      graph.addPass(passD)
      graph.addPass(passFinal)

      graph.compile()
      graph.execute(renderer, scene, camera, 0.016)

      // Source and final should execute
      expect(passSource.executed).toBe(true)
      expect(passFinal.executed).toBe(true)

      // Chain passes should not execute
      expect(passB.executed).toBe(false)
      expect(passC.executed).toBe(false)
      expect(passD.executed).toBe(false)

      // Aliases should resolve through the chain
      const aliases = graph.getResourceAliases()
      expect(aliases.get('resB')).toBe('resA')
      expect(aliases.get('resC')).toBe('resA')
      expect(aliases.get('resD')).toBe('resA')
    })

    it('should clear aliases between frames', () => {
      graph.addResource({ id: 'input', type: 'renderTarget', size: { mode: 'screen' } })
      graph.addResource({ id: 'output', type: 'renderTarget', size: { mode: 'screen' } })

      let passEnabled = false

      const passA = new TestPass({
        id: 'passA',
        inputs: [],
        outputs: [{ resourceId: 'input', access: 'write' }],
      })

      const passB = new TestPass({
        id: 'passB',
        inputs: [{ resourceId: 'input', access: 'read' }],
        outputs: [{ resourceId: 'output', access: 'write' }],
        enabled: () => passEnabled,
        skipPassthrough: true,
      })

      graph.addPass(passA)
      graph.addPass(passB)
      graph.compile()

      // Frame 1: passB disabled → alias created
      graph.execute(renderer, scene, camera, 0.016)
      expect(graph.getResourceAliases().has('output')).toBe(true)

      // Reset for frame 2
      passA.reset()
      passB.reset()

      // Frame 2: passB enabled → no alias
      passEnabled = true
      graph.execute(renderer, scene, camera, 0.016)
      expect(graph.getResourceAliases().has('output')).toBe(false)
      expect(passB.executed).toBe(true)
    })

    it('should not create alias when output already written by enabled pass', () => {
      // This tests mutual exclusion (e.g., scene pass vs gravityComposite)
      graph.addResource({ id: 'envColor', type: 'renderTarget', size: { mode: 'screen' } })
      graph.addResource({ id: 'sceneColor', type: 'renderTarget', size: { mode: 'screen' } })

      // Scene pass writes to sceneColor directly (enabled)
      const scenePass = new TestPass({
        id: 'scene',
        inputs: [],
        outputs: [{ resourceId: 'sceneColor', access: 'write' }],
        enabled: () => true,
      })

      // Gravity composite also writes to sceneColor (disabled)
      // Should NOT create alias or passthrough because scene already wrote it
      const gravityComposite = new TestPass({
        id: 'gravityComposite',
        inputs: [{ resourceId: 'envColor', access: 'read' }],
        outputs: [{ resourceId: 'sceneColor', access: 'write' }],
        enabled: () => false,
        skipPassthrough: true,
      })

      graph.addPass(scenePass)
      graph.addPass(gravityComposite)
      graph.compile()
      graph.execute(renderer, scene, camera, 0.016)

      // Scene pass should execute
      expect(scenePass.executed).toBe(true)
      expect(gravityComposite.executed).toBe(false)

      // No alias should be created because sceneColor was already written
      const aliases = graph.getResourceAliases()
      expect(aliases.has('sceneColor')).toBe(false)
    })
  })

  describe('edge cases', () => {
    it('should handle pass with no inputs (no aliasing possible)', () => {
      graph.addResource({ id: 'output', type: 'renderTarget', size: { mode: 'screen' } })

      const pass = new TestPass({
        id: 'noInputPass',
        inputs: [],
        outputs: [{ resourceId: 'output', access: 'write' }],
        enabled: () => false,
        skipPassthrough: true,
      })

      graph.addPass(pass)
      graph.compile()
      graph.execute(renderer, scene, camera, 0.016)

      // No crash, no alias (can't alias with no input)
      expect(graph.getResourceAliases().size).toBe(0)
    })

    it('should handle pass with no outputs', () => {
      graph.addResource({ id: 'input', type: 'renderTarget', size: { mode: 'screen' } })

      // Source pass
      const source = new TestPass({
        id: 'source',
        inputs: [],
        outputs: [{ resourceId: 'input', access: 'write' }],
      })

      const pass = new TestPass({
        id: 'noOutputPass',
        inputs: [{ resourceId: 'input', access: 'read' }],
        outputs: [],
        enabled: () => false,
        skipPassthrough: true,
      })

      graph.addPass(source)
      graph.addPass(pass)
      graph.compile()
      graph.execute(renderer, scene, camera, 0.016)

      // No crash, no alias (can't alias with no output)
      expect(graph.getResourceAliases().size).toBe(0)
    })
  })
})
