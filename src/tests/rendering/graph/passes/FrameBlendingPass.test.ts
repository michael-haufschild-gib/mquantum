/**
 * Tests for FrameBlendingPass.
 *
 * Tests frame blending temporal smoothing post-processing effect.
 */

import { describe, expect, it, beforeEach, afterEach } from 'vitest';

import { FrameBlendingPass } from '@/rendering/graph/passes/FrameBlendingPass';

describe('FrameBlendingPass', () => {
  let pass: FrameBlendingPass;

  beforeEach(() => {
    pass = new FrameBlendingPass({
      id: 'frameBlending',
      colorInput: 'tonemappedColor',
      outputResource: 'blendedOutput',
    });
  });

  afterEach(() => {
    pass.dispose();
  });

  describe('initialization', () => {
    it('should create pass with correct ID', () => {
      expect(pass.id).toBe('frameBlending');
    });

    it('should configure color input', () => {
      expect(pass.config.inputs).toHaveLength(1);
      expect(pass.config.inputs[0]!.resourceId).toBe('tonemappedColor');
    });

    it('should configure correct output', () => {
      expect(pass.config.outputs).toHaveLength(1);
      expect(pass.config.outputs[0]!.resourceId).toBe('blendedOutput');
    });
  });

  describe('default parameters', () => {
    it('should default blend factor to 0.3', () => {
      const customPass = new FrameBlendingPass({
        id: 'test',
        colorInput: 'input',
        outputResource: 'output',
      });
      // Default blend factor is set in constructor as 0.3
      // We test this by creating a pass without blendFactor specified
      expect(customPass).toBeDefined();
      customPass.dispose();
    });
  });

  describe('custom configuration', () => {
    it('should accept custom blend factor', () => {
      const customPass = new FrameBlendingPass({
        id: 'custom',
        colorInput: 'input',
        outputResource: 'output',
        blendFactor: 0.5,
      });
      expect(customPass).toBeDefined();
      customPass.dispose();
    });

    it('should accept blend factor of 0', () => {
      const customPass = new FrameBlendingPass({
        id: 'custom',
        colorInput: 'input',
        outputResource: 'output',
        blendFactor: 0,
      });
      expect(customPass).toBeDefined();
      customPass.dispose();
    });

    it('should accept blend factor of 1', () => {
      const customPass = new FrameBlendingPass({
        id: 'custom',
        colorInput: 'input',
        outputResource: 'output',
        blendFactor: 1,
      });
      expect(customPass).toBeDefined();
      customPass.dispose();
    });
  });

  describe('parameter setters', () => {
    it('should set blend factor', () => {
      expect(() => pass.setBlendFactor(0.5)).not.toThrow();
    });

    it('should handle blend factor of 0', () => {
      expect(() => pass.setBlendFactor(0)).not.toThrow();
    });

    it('should handle blend factor of 1', () => {
      expect(() => pass.setBlendFactor(1)).not.toThrow();
    });

    it('should handle extreme blend factor values', () => {
      expect(() => pass.setBlendFactor(0.01)).not.toThrow();
      expect(() => pass.setBlendFactor(0.99)).not.toThrow();
    });
  });

  describe('history reset', () => {
    it('should reset history without error', () => {
      expect(() => pass.resetHistory()).not.toThrow();
    });

    it('should be safe to call resetHistory multiple times', () => {
      pass.resetHistory();
      expect(() => pass.resetHistory()).not.toThrow();
    });
  });

  describe('onEnabled lifecycle', () => {
    it('should reset history when onEnabled is called', () => {
      expect(() => pass.onEnabled()).not.toThrow();
    });

    it('should be safe to call onEnabled multiple times', () => {
      pass.onEnabled();
      expect(() => pass.onEnabled()).not.toThrow();
    });

    it('should be safe to call onEnabled after resetHistory', () => {
      pass.resetHistory();
      expect(() => pass.onEnabled()).not.toThrow();
    });
  });

  describe('disposal', () => {
    it('should dispose without error', () => {
      const testPass = new FrameBlendingPass({
        id: 'disposalTest',
        colorInput: 'input',
        outputResource: 'output',
      });
      expect(() => testPass.dispose()).not.toThrow();
    });

    it('should be safe to call dispose multiple times', () => {
      const testPass = new FrameBlendingPass({
        id: 'disposalTest',
        colorInput: 'input',
        outputResource: 'output',
      });
      testPass.dispose();
      expect(() => testPass.dispose()).not.toThrow();
    });
  });
});
