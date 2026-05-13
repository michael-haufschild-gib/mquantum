/**
 * Lighting state store.
 *
 * Thin wrapper that composes the lighting slice into a standalone store.
 * Light configuration, positions, and intensities live in the slice.
 *
 * @module stores/lightingStore
 */

import { create } from 'zustand'

import { createLightingSlice, LightingSlice } from '../slices/lightingSlice'

export type { LightingSlice }

export const useLightingStore = create<LightingSlice>((...a) => ({
  ...createLightingSlice(...a),
}))
