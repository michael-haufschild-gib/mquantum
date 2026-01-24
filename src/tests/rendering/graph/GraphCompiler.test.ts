/**
 * Tests for GraphCompiler.
 *
 * Tests topological sorting, cycle detection, and hazard analysis.
 */

import { describe, expect, it, beforeEach } from 'vitest'

import { GraphCompiler } from '@/rendering/graph/GraphCompiler'
import { BasePass } from '@/rendering/graph/BasePass'
import type { RenderContext, RenderPassConfig } from '@/rendering/graph/types'

/**
 * Test pass implementation.
 */
class TestPass extends BasePass {
  executed = false

  constructor(config: RenderPassConfig) {
    super(config)
  }

  execute(_ctx: RenderContext): void {
    this.executed = true
  }
}

describe('GraphCompiler', () => {
  let compiler: GraphCompiler

  beforeEach(() => {
    compiler = new GraphCompiler()
  })

  describe('pass registration', () => {
    it('should add passes', () => {
      const pass = new TestPass({
        id: 'test',
        inputs: [],
        outputs: [],
      })

      compiler.addPass(pass)
      // No error means success
    })

    it('should throw when adding duplicate pass ID', () => {
      const pass1 = new TestPass({ id: 'test', inputs: [], outputs: [] })
      const pass2 = new TestPass({ id: 'test', inputs: [], outputs: [] })

      compiler.addPass(pass1)
      expect(() => compiler.addPass(pass2)).toThrow("Pass 'test' already exists")
    })

    it('should remove passes', () => {
      const pass = new TestPass({ id: 'test', inputs: [], outputs: [] })
      compiler.addPass(pass)
      compiler.removePass('test')

      // Should be able to add again after removal
      compiler.addPass(pass)
    })
  })

  describe('resource registration', () => {
    it('should add resources', () => {
      compiler.addResource({
        id: 'color',
        type: 'renderTarget',
        size: { mode: 'screen' },
      })
      // No error means success
    })

    it('should remove resources', () => {
      compiler.addResource({
        id: 'color',
        type: 'renderTarget',
        size: { mode: 'screen' },
      })
      compiler.removeResource('color')
      // No error means success
    })
  })

  describe('topological sort', () => {
    it('should order passes by dependencies', () => {
      // Add resources
      compiler.addResource({ id: 'a', type: 'renderTarget', size: { mode: 'screen' } })
      compiler.addResource({ id: 'b', type: 'renderTarget', size: { mode: 'screen' } })

      // Pass1 writes to 'a'
      const pass1 = new TestPass({
        id: 'pass1',
        inputs: [],
        outputs: [{ resourceId: 'a', access: 'write' }],
      })

      // Pass2 reads from 'a', writes to 'b'
      const pass2 = new TestPass({
        id: 'pass2',
        inputs: [{ resourceId: 'a', access: 'read' }],
        outputs: [{ resourceId: 'b', access: 'write' }],
      })

      // Add in reverse order to test sorting
      compiler.addPass(pass2)
      compiler.addPass(pass1)

      const result = compiler.compile()

      expect(result.passes).toHaveLength(2)
      expect(result.passes[0]!.id).toBe('pass1')
      expect(result.passes[1]!.id).toBe('pass2')
    })

    it('should handle diamond dependencies', () => {
      // Resources
      compiler.addResource({ id: 'a', type: 'renderTarget', size: { mode: 'screen' } })
      compiler.addResource({ id: 'b', type: 'renderTarget', size: { mode: 'screen' } })
      compiler.addResource({ id: 'c', type: 'renderTarget', size: { mode: 'screen' } })
      compiler.addResource({ id: 'd', type: 'renderTarget', size: { mode: 'screen' } })

      // Diamond: A -> B,C -> D
      const passA = new TestPass({
        id: 'A',
        inputs: [],
        outputs: [{ resourceId: 'a', access: 'write' }],
        priority: 0,
      })
      const passB = new TestPass({
        id: 'B',
        inputs: [{ resourceId: 'a', access: 'read' }],
        outputs: [{ resourceId: 'b', access: 'write' }],
        priority: 1,
      })
      const passC = new TestPass({
        id: 'C',
        inputs: [{ resourceId: 'a', access: 'read' }],
        outputs: [{ resourceId: 'c', access: 'write' }],
        priority: 2,
      })
      const passD = new TestPass({
        id: 'D',
        inputs: [
          { resourceId: 'b', access: 'read' },
          { resourceId: 'c', access: 'read' },
        ],
        outputs: [{ resourceId: 'd', access: 'write' }],
        priority: 3,
      })

      compiler.addPass(passD)
      compiler.addPass(passC)
      compiler.addPass(passB)
      compiler.addPass(passA)

      const result = compiler.compile()

      expect(result.passes).toHaveLength(4)
      expect(result.passes[0]!.id).toBe('A')
      // B and C can be in either order, but both before D
      const bcOrder = result.passes.slice(1, 3).map((p) => p.id)
      expect(bcOrder).toContain('B')
      expect(bcOrder).toContain('C')
      expect(result.passes[3]!.id).toBe('D')
    })

    it('should respect priority for independent passes', () => {
      // Two independent passes with different priorities
      const passLow = new TestPass({
        id: 'low',
        inputs: [],
        outputs: [],
        priority: 10,
      })
      const passHigh = new TestPass({
        id: 'high',
        inputs: [],
        outputs: [],
        priority: -10,
      })

      compiler.addPass(passLow)
      compiler.addPass(passHigh)

      const result = compiler.compile()

      expect(result.passes).toHaveLength(2)
      expect(result.passes[0]!.id).toBe('high') // Lower priority number = runs first
      expect(result.passes[1]!.id).toBe('low')
    })
  })

  describe('cycle detection', () => {
    it('should detect simple cycles', () => {
      compiler.addResource({ id: 'a', type: 'renderTarget', size: { mode: 'screen' } })
      compiler.addResource({ id: 'b', type: 'renderTarget', size: { mode: 'screen' } })

      // A writes 'a', reads 'b'
      // B writes 'b', reads 'a'
      // Creates cycle: A -> B -> A
      const passA = new TestPass({
        id: 'A',
        inputs: [{ resourceId: 'b', access: 'read' }],
        outputs: [{ resourceId: 'a', access: 'write' }],
      })
      const passB = new TestPass({
        id: 'B',
        inputs: [{ resourceId: 'a', access: 'read' }],
        outputs: [{ resourceId: 'b', access: 'write' }],
      })

      compiler.addPass(passA)
      compiler.addPass(passB)

      expect(() => compiler.compile()).toThrow(/Cycle detected/)
    })

    it('should detect transitive cycles', () => {
      compiler.addResource({ id: 'a', type: 'renderTarget', size: { mode: 'screen' } })
      compiler.addResource({ id: 'b', type: 'renderTarget', size: { mode: 'screen' } })
      compiler.addResource({ id: 'c', type: 'renderTarget', size: { mode: 'screen' } })

      // A -> B -> C -> A
      const passA = new TestPass({
        id: 'A',
        inputs: [{ resourceId: 'c', access: 'read' }],
        outputs: [{ resourceId: 'a', access: 'write' }],
      })
      const passB = new TestPass({
        id: 'B',
        inputs: [{ resourceId: 'a', access: 'read' }],
        outputs: [{ resourceId: 'b', access: 'write' }],
      })
      const passC = new TestPass({
        id: 'C',
        inputs: [{ resourceId: 'b', access: 'read' }],
        outputs: [{ resourceId: 'c', access: 'write' }],
      })

      compiler.addPass(passA)
      compiler.addPass(passB)
      compiler.addPass(passC)

      expect(() => compiler.compile()).toThrow(/Cycle detected/)
    })
  })

  describe('ping-pong detection', () => {
    it('should detect readwrite access needing ping-pong', () => {
      compiler.addResource({ id: 'buffer', type: 'renderTarget', size: { mode: 'screen' } })

      const pass = new TestPass({
        id: 'blur',
        inputs: [{ resourceId: 'buffer', access: 'readwrite' }],
        outputs: [],
      })

      compiler.addPass(pass)

      const result = compiler.compile()

      expect(result.pingPongResources.has('buffer')).toBe(true)
    })
  })

  describe('validation', () => {
    it('should warn about missing resource definitions', () => {
      const pass = new TestPass({
        id: 'test',
        inputs: [{ resourceId: 'missing', access: 'read' }],
        outputs: [],
      })

      compiler.addPass(pass)

      const result = compiler.compile()

      expect(result.warnings).toContain("Pass 'test' reads from undefined resource 'missing'")
    })

    it('should warn about missing output resource definitions', () => {
      const pass = new TestPass({
        id: 'test',
        inputs: [],
        outputs: [{ resourceId: 'missing', access: 'write' }],
      })

      compiler.addPass(pass)

      const result = compiler.compile()

      expect(result.warnings).toContain("Pass 'test' writes to undefined resource 'missing'")
    })
  })

  describe('resource order', () => {
    it('should compute resource allocation order', () => {
      compiler.addResource({ id: 'a', type: 'renderTarget', size: { mode: 'screen' } })
      compiler.addResource({ id: 'b', type: 'renderTarget', size: { mode: 'screen' } })

      const pass1 = new TestPass({
        id: 'pass1',
        inputs: [],
        outputs: [{ resourceId: 'a', access: 'write' }],
      })
      const pass2 = new TestPass({
        id: 'pass2',
        inputs: [{ resourceId: 'a', access: 'read' }],
        outputs: [{ resourceId: 'b', access: 'write' }],
      })

      compiler.addPass(pass1)
      compiler.addPass(pass2)

      const result = compiler.compile()

      expect(result.resourceOrder).toContain('a')
      expect(result.resourceOrder).toContain('b')
      // 'a' should come before 'b' since pass1 outputs to 'a' first
      expect(result.resourceOrder.indexOf('a')).toBeLessThan(result.resourceOrder.indexOf('b'))
    })
  })

  describe('debug info', () => {
    it('should generate debug info', () => {
      compiler.addResource({ id: 'color', type: 'renderTarget', size: { mode: 'screen' } })
      compiler.addPass(
        new TestPass({
          id: 'test',
          inputs: [],
          outputs: [{ resourceId: 'color', access: 'write' }],
        })
      )

      const info = compiler.getDebugInfo()

      expect(info).toContain('Render Graph')
      expect(info).toContain('test')
      expect(info).toContain('color')
    })
  })

  describe('ResourceStateMachine simulation', () => {
    it('should validate state transitions during simulated execution', () => {
      // Create a valid pipeline
      compiler.addResource({ id: 'a', type: 'renderTarget', size: { mode: 'screen' } })
      compiler.addResource({ id: 'b', type: 'renderTarget', size: { mode: 'screen' } })

      const pass1 = new TestPass({
        id: 'pass1',
        inputs: [],
        outputs: [{ resourceId: 'a', access: 'write' }],
      })

      const pass2 = new TestPass({
        id: 'pass2',
        inputs: [{ resourceId: 'a', access: 'read' }],
        outputs: [{ resourceId: 'b', access: 'write' }],
      })

      compiler.addPass(pass1)
      compiler.addPass(pass2)

      const result = compiler.compile()

      // Should compile without any warnings from state machine simulation
      // since pass1 writes before pass2 reads
      const stateValidationWarnings = result.warnings.filter((w) => w.includes('validation failed'))
      expect(stateValidationWarnings).toHaveLength(0)
    })

    it('should handle readwrite access patterns correctly', () => {
      compiler.addResource({ id: 'buffer', type: 'renderTarget', size: { mode: 'screen' } })

      // First pass writes to buffer
      const passWrite = new TestPass({
        id: 'passWrite',
        inputs: [],
        outputs: [{ resourceId: 'buffer', access: 'write' }],
      })

      // Second pass does readwrite on buffer (like a blur pass)
      const passBlur = new TestPass({
        id: 'passBlur',
        inputs: [{ resourceId: 'buffer', access: 'readwrite' }],
        outputs: [],
      })

      compiler.addPass(passWrite)
      compiler.addPass(passBlur)

      const result = compiler.compile()

      // Should detect ping-pong need for readwrite
      expect(result.pingPongResources.has('buffer')).toBe(true)

      // Should not have state machine validation errors since passWrite runs first
      const stateValidationWarnings = result.warnings.filter((w) => w.includes('validation failed'))
      expect(stateValidationWarnings).toHaveLength(0)
    })

    it('should handle complex dependency chains with state machine validation', () => {
      compiler.addResource({ id: 'color', type: 'renderTarget', size: { mode: 'screen' } })
      compiler.addResource({ id: 'bloom', type: 'renderTarget', size: { mode: 'screen' } })
      compiler.addResource({ id: 'composite', type: 'renderTarget', size: { mode: 'screen' } })

      const scenePass = new TestPass({
        id: 'scene',
        inputs: [],
        outputs: [{ resourceId: 'color', access: 'write' }],
        priority: 0,
      })

      const bloomPass = new TestPass({
        id: 'bloom',
        inputs: [{ resourceId: 'color', access: 'read' }],
        outputs: [{ resourceId: 'bloom', access: 'write' }],
        priority: 1,
      })

      const compositePass = new TestPass({
        id: 'composite',
        inputs: [
          { resourceId: 'color', access: 'read' },
          { resourceId: 'bloom', access: 'read' },
        ],
        outputs: [{ resourceId: 'composite', access: 'write' }],
        priority: 2,
      })

      compiler.addPass(compositePass)
      compiler.addPass(bloomPass)
      compiler.addPass(scenePass)

      const result = compiler.compile()

      // Should be ordered correctly: scene -> bloom -> composite
      expect(result.passes.map((p) => p.id)).toEqual(['scene', 'bloom', 'composite'])

      // No state validation errors
      const stateValidationWarnings = result.warnings.filter((w) => w.includes('validation failed'))
      expect(stateValidationWarnings).toHaveLength(0)
    })
  })
})
