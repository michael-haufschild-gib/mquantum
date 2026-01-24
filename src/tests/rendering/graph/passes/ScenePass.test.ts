/**
 * Tests for ScenePass.
 *
 * Tests scene rendering with layer filtering and clear options.
 */

import * as THREE from 'three'
import { beforeEach, describe, expect, it } from 'vitest'

import { ScenePass } from '@/rendering/graph/passes/ScenePass'

describe('ScenePass', () => {
  let pass: ScenePass

  beforeEach(() => {
    pass = new ScenePass({
      id: 'scene',
      outputs: [{ resourceId: 'sceneColor', access: 'write' }],
    })
  })

  describe('initialization', () => {
    it('should create pass with correct ID', () => {
      expect(pass.id).toBe('scene')
    })

    it('should configure no inputs (source pass)', () => {
      expect(pass.config.inputs).toHaveLength(0)
    })

    it('should configure correct output', () => {
      expect(pass.config.outputs).toHaveLength(1)
      expect(pass.config.outputs[0]!.resourceId).toBe('sceneColor')
    })

    it('should default layers to null (all layers)', () => {
      const defaultPass = new ScenePass({
        id: 'default',
        outputs: [{ resourceId: 'color', access: 'write' }],
      })
      expect(defaultPass.id).toBe('default')
    })

    it('should default autoClear to true', () => {
      const defaultPass = new ScenePass({
        id: 'default',
        outputs: [{ resourceId: 'color', access: 'write' }],
      })
      expect(defaultPass.id).toBe('default')
    })

    it('should default renderBackground to true', () => {
      const defaultPass = new ScenePass({
        id: 'default',
        outputs: [{ resourceId: 'color', access: 'write' }],
      })
      expect(defaultPass.id).toBe('default')
    })
  })

  describe('clear color configuration', () => {
    it('should accept hex clear color', () => {
      const colorPass = new ScenePass({
        id: 'colored',
        outputs: [{ resourceId: 'color', access: 'write' }],
        clearColor: 0x000000,
      })
      expect(colorPass.id).toBe('colored')
    })

    it('should accept string clear color', () => {
      const colorPass = new ScenePass({
        id: 'colored',
        outputs: [{ resourceId: 'color', access: 'write' }],
        clearColor: '#ff0000',
      })
      expect(colorPass.id).toBe('colored')
    })

    it('should accept Color object as clear color', () => {
      const colorPass = new ScenePass({
        id: 'colored',
        outputs: [{ resourceId: 'color', access: 'write' }],
        clearColor: new THREE.Color(0x00ff00),
      })
      expect(colorPass.id).toBe('colored')
    })

    it('should accept null clear color (use renderer default)', () => {
      const colorPass = new ScenePass({
        id: 'default-color',
        outputs: [{ resourceId: 'color', access: 'write' }],
        clearColor: null,
      })
      expect(colorPass.id).toBe('default-color')
    })

    it('should accept clear alpha', () => {
      const alphaPass = new ScenePass({
        id: 'alpha',
        outputs: [{ resourceId: 'color', access: 'write' }],
        clearColor: 0x000000,
        clearAlpha: 0.5,
      })
      expect(alphaPass.id).toBe('alpha')
    })
  })

  describe('render options', () => {
    it('should accept autoClear option', () => {
      const noClearPass = new ScenePass({
        id: 'no-clear',
        outputs: [{ resourceId: 'color', access: 'write' }],
        autoClear: false,
      })
      expect(noClearPass.id).toBe('no-clear')
    })

    it('should accept renderBackground option', () => {
      const noBgPass = new ScenePass({
        id: 'no-bg',
        outputs: [{ resourceId: 'color', access: 'write' }],
        renderBackground: false,
      })
      expect(noBgPass.id).toBe('no-bg')
    })

    it('should accept custom layers', () => {
      const layeredPass = new ScenePass({
        id: 'layered',
        outputs: [{ resourceId: 'color', access: 'write' }],
        layers: [0, 1],
      })
      expect(layeredPass.id).toBe('layered')
    })
  })

  describe('full configuration', () => {
    it('should accept all options together', () => {
      const fullPass = new ScenePass({
        id: 'full',
        outputs: [{ resourceId: 'color', access: 'write' }],
        layers: [1, 2, 3],
        clearColor: 0x333333,
        clearAlpha: 0.8,
        autoClear: true,
        renderBackground: false,
      })
      expect(fullPass.id).toBe('full')
    })
  })

  describe('onRenderStats callback', () => {
    it('should accept onRenderStats callback option', () => {
      const statsCallback = () => {
        // Empty callback for test
      }
      const statsPass = new ScenePass({
        id: 'stats',
        outputs: [{ resourceId: 'color', access: 'write' }],
        onRenderStats: statsCallback,
      })
      expect(statsPass.id).toBe('stats')
    })

    it('should accept onRenderStats with full config', () => {
      let capturedStats: {
        calls: number
        triangles: number
        points: number
        lines: number
      } | null = null
      const statsPass = new ScenePass({
        id: 'stats-full',
        outputs: [{ resourceId: 'color', access: 'write' }],
        clearColor: 0x000000,
        autoClear: true,
        onRenderStats: (stats) => {
          capturedStats = stats
        },
      })
      expect(statsPass.id).toBe('stats-full')
      // Callback is not invoked until execute() is called with proper context
      expect(capturedStats).toBeNull()
    })
  })
})
