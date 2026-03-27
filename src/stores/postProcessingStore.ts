/**
 * Post-processing state store.
 *
 * Thin wrapper that composes the post-processing slice into a standalone store.
 * Bloom, SMAA/FXAA, tone mapping, paper texture, and frame blending settings
 * live in the slice.
 *
 * @module stores/postProcessingStore
 */

import { create } from 'zustand'

import { createPostProcessingSlice, PostProcessingSlice } from './slices/postProcessingSlice'

export type { PostProcessingSlice }

export const usePostProcessingStore = create<PostProcessingSlice>((...a) => ({
  ...createPostProcessingSlice(...a),
}))
