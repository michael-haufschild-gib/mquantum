/**
 * Screenshot preview modal store.
 *
 * Manages the open/close state and image source for the screenshot
 * preview modal. Clears the capture store on close.
 *
 * @module stores/screenshotStore
 */

import { create } from 'zustand'

import { useScreenshotCaptureStore } from './screenshotCaptureStore'

interface ScreenshotStore {
  isOpen: boolean
  imageSrc: string | null
  filename: string | null

  // Actions
  openModal: (imageSrc: string, filename?: string) => void
  closeModal: () => void
  reset: () => void
}

export const useScreenshotStore = create<ScreenshotStore>((set) => ({
  isOpen: false,
  imageSrc: null,
  filename: null,

  openModal: (imageSrc, filename) => set({ isOpen: true, imageSrc, filename: filename ?? null }),
  closeModal: () => {
    set({ isOpen: false, imageSrc: null, filename: null })
    useScreenshotCaptureStore.getState().reset()
  },
  reset: () => {
    set({ isOpen: false, imageSrc: null, filename: null })
    // Clean up the screenshot capture store to free memory from data URL
    useScreenshotCaptureStore.getState().reset()
  },
}))
