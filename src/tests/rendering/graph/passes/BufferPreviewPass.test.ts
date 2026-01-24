/**
 * Tests for BufferPreviewPass.
 *
 * Tests debug visualization pass for G-buffer contents.
 */

import { describe, expect, it, beforeEach } from 'vitest'

import { BufferPreviewPass } from '@/rendering/graph/passes/BufferPreviewPass'

describe('BufferPreviewPass', () => {
  let pass: BufferPreviewPass

  beforeEach(() => {
    pass = new BufferPreviewPass({
      id: 'bufferPreview',
      bufferInput: 'sceneDepth',
      outputResource: 'previewOutput',
      bufferType: 'depth',
      depthMode: 'linear',
    })
  })

  describe('initialization', () => {
    it('should create pass with correct ID', () => {
      expect(pass.id).toBe('bufferPreview')
    })

    it('should configure buffer input', () => {
      expect(pass.config.inputs).toHaveLength(1)
      expect(pass.config.inputs[0]!.resourceId).toBe('sceneDepth')
    })

    it('should configure correct output', () => {
      expect(pass.config.outputs).toHaveLength(1)
      expect(pass.config.outputs[0]!.resourceId).toBe('previewOutput')
    })
  })

  describe('buffer type configurations', () => {
    it('should create copy buffer preview', () => {
      const copyPass = new BufferPreviewPass({
        id: 'copy',
        bufferInput: 'sceneColor',
        outputResource: 'copyOutput',
        bufferType: 'copy',
      })
      expect(copyPass.id).toBe('copy')
    })

    it('should create depth buffer preview', () => {
      const depthPass = new BufferPreviewPass({
        id: 'depth',
        bufferInput: 'sceneDepth',
        outputResource: 'depthOutput',
        bufferType: 'depth',
      })
      expect(depthPass.id).toBe('depth')
    })

    it('should create normal buffer preview', () => {
      const normalPass = new BufferPreviewPass({
        id: 'normal',
        bufferInput: 'normalBuffer',
        outputResource: 'normalOutput',
        bufferType: 'normal',
      })
      expect(normalPass.id).toBe('normal')
    })

    it('should create temporal depth buffer preview', () => {
      const temporalPass = new BufferPreviewPass({
        id: 'temporal',
        bufferInput: 'temporalDepth',
        outputResource: 'temporalOutput',
        bufferType: 'temporalDepth',
      })
      expect(temporalPass.id).toBe('temporal')
    })
  })

  describe('depth visualization modes', () => {
    it('should create raw depth visualization', () => {
      const rawPass = new BufferPreviewPass({
        id: 'raw',
        bufferInput: 'sceneDepth',
        outputResource: 'rawOutput',
        bufferType: 'depth',
        depthMode: 'raw',
      })
      expect(rawPass.id).toBe('raw')
    })

    it('should create linear depth visualization', () => {
      const linearPass = new BufferPreviewPass({
        id: 'linear',
        bufferInput: 'sceneDepth',
        outputResource: 'linearOutput',
        bufferType: 'depth',
        depthMode: 'linear',
      })
      expect(linearPass.id).toBe('linear')
    })

    it('should create focus zones visualization', () => {
      const focusPass = new BufferPreviewPass({
        id: 'focus',
        bufferInput: 'sceneDepth',
        outputResource: 'focusOutput',
        bufferType: 'depth',
        depthMode: 'focusZones',
        focus: 10.0,
        focusRange: 5.0,
      })
      expect(focusPass.id).toBe('focus')
    })
  })

  describe('camera clip planes configuration', () => {
    it('should accept custom near/far clip planes', () => {
      const customPass = new BufferPreviewPass({
        id: 'custom',
        bufferInput: 'sceneDepth',
        outputResource: 'output',
        bufferType: 'depth',
        depthMode: 'linear',
        nearClip: 0.01,
        farClip: 500.0,
      })
      expect(customPass.id).toBe('custom')
    })
  })

  describe('parameter setters', () => {
    it('should set buffer type', () => {
      expect(() => pass.setBufferType('copy')).not.toThrow()
      expect(() => pass.setBufferType('depth')).not.toThrow()
      expect(() => pass.setBufferType('normal')).not.toThrow()
      expect(() => pass.setBufferType('temporalDepth')).not.toThrow()
    })

    it('should set depth mode', () => {
      expect(() => pass.setDepthMode('raw')).not.toThrow()
      expect(() => pass.setDepthMode('linear')).not.toThrow()
      expect(() => pass.setDepthMode('focusZones')).not.toThrow()
    })

    it('should set focus parameters', () => {
      expect(() => pass.setFocusParams(15.0, 3.0)).not.toThrow()
    })
  })

  describe('disposal', () => {
    it('should dispose without error', () => {
      expect(() => pass.dispose()).not.toThrow()
    })

    it('should be safe to call dispose multiple times', () => {
      pass.dispose()
      expect(() => pass.dispose()).not.toThrow()
    })
  })
})
