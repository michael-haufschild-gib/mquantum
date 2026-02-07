/**
 * PBR (Physically Based Rendering) Store
 *
 * Provides PBR settings for face rendering (schroedinger wavefunctions).
 *
 * @module stores/pbrStore
 */

import { create } from 'zustand'
import { createPBRSlice, PBRSlice } from './slices/visual/pbrSlice'

export type { PBRSlice }
export type { PBRConfig } from '@/stores/defaults/visualDefaults'

export const usePBRStore = create<PBRSlice>((...a) => ({
  ...createPBRSlice(...a),
}))
