/**
 * Phase 1a supplement: static vertex shaders for the Schrödinger render
 * pipeline (2D fullscreen-triangle + 3D cube-raymarch).
 *
 * @module tests/rendering/wgsl/enumerateSchroedingerVertex
 */

import { createHash } from 'node:crypto'

import {
  composeSchroedingerVertexShader,
  composeSchroedingerVertexShader2D,
} from '@/rendering/webgpu/shaders/schroedinger/compose'

import type { ShaderRecord } from './enumerateSchroedingerAnalytic'

/** Yield the 2D + 3D Schrödinger vertex shaders (both are static). */
export function* enumerateSchroedingerVertex(): Generator<ShaderRecord> {
  const vert3D = composeSchroedingerVertexShader()
  yield {
    label: 'schroedinger-vertex-3d',
    wgsl: vert3D,
    sha256: createHash('sha256').update(vert3D).digest('hex'),
    cacheKey: 'vertex-3d',
    surface: 'schroedinger-analytic',
  }

  const vert2D = composeSchroedingerVertexShader2D()
  yield {
    label: 'schroedinger-vertex-2d',
    wgsl: vert2D,
    sha256: createHash('sha256').update(vert2D).digest('hex'),
    cacheKey: 'vertex-2d',
    surface: 'schroedinger-analytic',
  }
}
