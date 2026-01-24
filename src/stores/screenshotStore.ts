import { create } from 'zustand'
import { useScreenshotCaptureStore } from './screenshotCaptureStore'

interface ScreenshotStore {
  isOpen: boolean
  imageSrc: string | null

  // Actions
  openModal: (imageSrc: string) => void
  closeModal: () => void
  reset: () => void
}

export const useScreenshotStore = create<ScreenshotStore>((set) => ({
  isOpen: false,
  imageSrc: null,

  openModal: (imageSrc) => set({ isOpen: true, imageSrc }),
  closeModal: () => set({ isOpen: false }),
  reset: () => {
    set({ isOpen: false, imageSrc: null })
    // Clean up the screenshot capture store to free memory from data URL
    useScreenshotCaptureStore.getState().reset()
  },
}))
