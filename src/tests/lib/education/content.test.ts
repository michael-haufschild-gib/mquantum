/**
 * Tests for education content
 */

import { describe, it, expect } from 'vitest';
import {
  getDimensionInfo,
  getPolytopeInfo,
  getRotationPlaneCount,
  getHypercubeVertexCount,
  getSimplexVertexCount,
  getCrossPolytopeVertexCount,
} from '@/lib/education/content';

describe('education content', () => {
  describe('getDimensionInfo', () => {
    it('should return undefined for unsupported dimensions', () => {
      expect(getDimensionInfo(2)).toBeUndefined();
      expect(getDimensionInfo(7)).toBeUndefined();
    });
  });

  describe('getPolytopeInfo', () => {
    it('should return undefined for unknown type', () => {
      expect(getPolytopeInfo('unknown')).toBeUndefined();
    });
  });

  describe('getRotationPlaneCount', () => {
    it('should return 3 for 3D', () => {
      expect(getRotationPlaneCount(3)).toBe(3);
    });

    it('should return 6 for 4D', () => {
      expect(getRotationPlaneCount(4)).toBe(6);
    });

    it('should return 10 for 5D', () => {
      expect(getRotationPlaneCount(5)).toBe(10);
    });

    it('should return 15 for 6D', () => {
      expect(getRotationPlaneCount(6)).toBe(15);
    });
  });

  describe('getHypercubeVertexCount', () => {
    it('should return 8 for 3D', () => {
      expect(getHypercubeVertexCount(3)).toBe(8);
    });

    it('should return 16 for 4D', () => {
      expect(getHypercubeVertexCount(4)).toBe(16);
    });

    it('should return 32 for 5D', () => {
      expect(getHypercubeVertexCount(5)).toBe(32);
    });

    it('should return 64 for 6D', () => {
      expect(getHypercubeVertexCount(6)).toBe(64);
    });
  });

  describe('getSimplexVertexCount', () => {
    it('should return 4 for 3D', () => {
      expect(getSimplexVertexCount(3)).toBe(4);
    });

    it('should return 5 for 4D', () => {
      expect(getSimplexVertexCount(4)).toBe(5);
    });

    it('should return 6 for 5D', () => {
      expect(getSimplexVertexCount(5)).toBe(6);
    });

    it('should return 7 for 6D', () => {
      expect(getSimplexVertexCount(6)).toBe(7);
    });
  });

  describe('getCrossPolytopeVertexCount', () => {
    it('should return 6 for 3D', () => {
      expect(getCrossPolytopeVertexCount(3)).toBe(6);
    });

    it('should return 8 for 4D', () => {
      expect(getCrossPolytopeVertexCount(4)).toBe(8);
    });

    it('should return 10 for 5D', () => {
      expect(getCrossPolytopeVertexCount(5)).toBe(10);
    });

    it('should return 12 for 6D', () => {
      expect(getCrossPolytopeVertexCount(6)).toBe(12);
    });
  });

});
