/**
 * PBR (Physically Based Rendering) Store
 *
 * Provides independent PBR settings for three object types:
 * - Face: Main objects (polytope faces, mandelbulb, julia, schroedinger, blackhole)
 * - Edge: TubeWireframe (when edgeThickness > 1)
 *
 * @module stores/pbrStore
 */

import { create } from 'zustand'
import { createPBRSlice, PBRSlice, PBRTarget } from './slices/visual/pbrSlice'

export type { PBRSlice, PBRTarget }
export type { PBRConfig } from '@/stores/defaults/visualDefaults'

export const usePBRStore = create<PBRSlice>((...a) => ({
  ...createPBRSlice(...a),
}))
