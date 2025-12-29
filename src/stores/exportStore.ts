import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ExportFormat = 'mp4' | 'webm'
export type ExportResolution = '720p' | '1080p' | '4k' | 'custom'
export type ExportMode = 'auto' | 'in-memory' | 'stream' | 'segmented'
export type ExportTier = 'small' | 'medium' | 'large'
export type BrowserType = 'chromium-capable' | 'standard'

export type VideoCodec = 'avc' | 'hevc' | 'vp9' | 'av1'

export interface TextOverlaySettings {
  enabled: boolean
  text: string
  fontFamily: string
  fontSize: number
  fontWeight: number // 100-900
  textAlign: 'left' | 'center' | 'right'
  letterSpacing: number
  color: string
  opacity: number
  shadowColor: string
  shadowBlur: number
  positionX: number // 0-1 (percentage)
  positionY: number // 0-1 (percentage)
}

export interface CropSettings {
  enabled: boolean
  x: number // 0-1
  y: number // 0-1
  width: number // 0-1
  height: number // 0-1
}

export interface ExportSettings {
  format: ExportFormat
  codec: VideoCodec
  resolution: ExportResolution
  customWidth: number
  customHeight: number
  fps: number
  duration: number // in seconds
  bitrate: number // in Mbps
  bitrateMode: 'constant' | 'variable'
  hardwareAcceleration: 'no-preference' | 'prefer-hardware' | 'prefer-software'
  warmupFrames: number
  
  // New Features
  textOverlay: TextOverlaySettings
  crop: CropSettings
}

export interface CompletionDetails {
  type: ExportMode
  segmentCount?: number
  filename?: string
}

interface ExportStore {
  isExporting: boolean
  isModalOpen: boolean
  isCropEditorOpen: boolean // New: Toggle for crop editor UI
  status: 'idle' | 'rendering' | 'previewing' | 'encoding' | 'completed' | 'error'
  progress: number // 0 to 1
  previewUrl: string | null
  previewImage: string | null // Screenshot captured before modal opens
  eta: string | null
  error: string | null
  settings: ExportSettings

  // New State
  browserType: BrowserType
  exportMode: ExportMode
  exportModeOverride: ExportMode | null
  exportTier: ExportTier
  estimatedSizeMB: number
  completionDetails: CompletionDetails | null
  canvasAspectRatio: number // Current canvas width/height ratio for dynamic crop presets

  // Actions
  setModalOpen: (isOpen: boolean) => void
  setCropEditorOpen: (isOpen: boolean) => void // New
  setCanvasAspectRatio: (ratio: number) => void
  setIsExporting: (isExporting: boolean) => void
  setStatus: (status: ExportStore['status']) => void
  setProgress: (progress: number) => void
  setPreviewUrl: (url: string | null) => void
  setPreviewImage: (url: string | null) => void
  setEta: (eta: string | null) => void
  setError: (error: string | null) => void
  updateSettings: (settings: Partial<ExportSettings> | ((prev: ExportSettings) => Partial<ExportSettings>)) => void
  setExportModeOverride: (mode: ExportMode | null) => void
  setCompletionDetails: (details: CompletionDetails | null) => void
  reset: () => void

  // Computed helpers
  recalculateMode: () => void
  applyPreset: (presetName: string) => void // New
}

const DEFAULT_SETTINGS: ExportSettings = {
  format: 'mp4',
  codec: 'avc',
  resolution: '1080p',
  customWidth: 1920,
  customHeight: 1080,
  fps: 60,
  duration: 30,
  bitrate: 12,
  bitrateMode: 'constant',
  hardwareAcceleration: 'prefer-software',
  warmupFrames: 5,
  
  textOverlay: {
    enabled: false,
    text: 'mdimension',
    fontFamily: 'Inter, sans-serif',
    fontSize: 48,
    fontWeight: 700,
    textAlign: 'center',
    letterSpacing: 0,
    color: '#ffffff',
    opacity: 1,
    shadowColor: 'rgba(0,0,0,0.5)',
    shadowBlur: 10,
    positionX: 0.5,
    positionY: 0.9,
  },
  crop: {
    enabled: false,
    x: 0,
    y: 0,
    width: 1,
    height: 1,
  }
}

const detectBrowser = (): BrowserType => {
  if (typeof window !== 'undefined' && 'showSaveFilePicker' in window) {
    return 'chromium-capable'
  }
  return 'standard'
}

/**
 * Calculate recommended bitrate based on resolution and FPS.
 * Higher resolution and FPS require more bitrate to maintain quality.
 *
 * Base bitrates (at 30 FPS):
 * - 720p:  8 Mbps
 * - 1080p: 12 Mbps
 * - 4K:    35 Mbps
 *
 * FPS multiplier: scale proportionally (60fps = 2x base, 24fps = 0.8x base)
 *
 * @param resolution - The video resolution preset
 * @param fps - The target frames per second
 * @param customWidth - Optional custom width in pixels
 * @param customHeight - Optional custom height in pixels
 * @returns Recommended bitrate in Mbps
 */
/**
 * Get compression factor for realistic file size estimation.
 *
 * Video codecs rarely use 100% of the target bitrate due to:
 * - Temporal compression (similar frames share data)
 * - Spatial compression (gradients/solid areas compress well)
 * - VBR mode dynamically reduces bitrate for simple scenes
 *
 * For 3D renders with smooth movements and gradients (typical for this app),
 * compression is particularly efficient due to high temporal redundancy.
 *
 * Factors are based on real-world encoding benchmarks:
 * - AVC (H.264): Mature codec, moderate efficiency
 * - HEVC (H.265): ~30-40% more efficient than AVC
 * - VP9: Similar efficiency to HEVC
 * - AV1: ~20-30% more efficient than HEVC (most modern)
 *
 * @param codec - The video codec being used
 * @param bitrateMode - CBR (constant) or VBR (variable)
 * @returns Factor to multiply theoretical size by (0.0 - 1.0)
 */
export const getCompressionFactor = (
  codec: VideoCodec,
  bitrateMode: 'constant' | 'variable'
): number => {
  // Base compression factors by codec (for CBR mode)
  // These represent typical output/theoretical ratios for animated 3D content
  const codecFactors: Record<VideoCodec, number> = {
    'avc': 0.55,   // H.264 - oldest, least efficient
    'hevc': 0.42,  // H.265 - ~25% better than AVC
    'vp9': 0.42,   // Similar to HEVC
    'av1': 0.32,   // ~25% better than HEVC, most efficient
  }

  let factor = codecFactors[codec] ?? 0.50

  // VBR mode is typically 15-25% more efficient for animated content
  // as it can allocate fewer bits to static/simple frames
  if (bitrateMode === 'variable') {
    factor *= 0.80
  }

  return factor
}

export const getRecommendedBitrate = (
  resolution: ExportResolution,
  fps: number,
  customWidth?: number,
  customHeight?: number
): number => {
  // Base bitrates at 30 FPS
  const baseBitrates: Record<ExportResolution, number> = {
    '720p': 8,
    '1080p': 12,
    '4k': 35,
    custom: 12, // Will be calculated below
  }

  let baseBitrate = baseBitrates[resolution]

  // For custom resolution, scale based on pixel count relative to 1080p
  if (resolution === 'custom' && customWidth && customHeight) {
    const pixels1080p = 1920 * 1080
    const customPixels = customWidth * customHeight
    const pixelRatio = customPixels / pixels1080p
    baseBitrate = Math.round(12 * pixelRatio) // Scale from 1080p base
  }

  // FPS multiplier: proportional to frame rate (30fps = 1.0x)
  const fpsMultiplier = fps / 30

  // Calculate final bitrate, with reasonable min/max bounds
  const recommendedBitrate = Math.round(baseBitrate * fpsMultiplier)
  return Math.max(4, Math.min(100, recommendedBitrate)) // Clamp between 4-100 Mbps
}

export const useExportStore = create<ExportStore>()(
  persist(
    (set, get) => ({
      isExporting: false,
      isModalOpen: false,
      isCropEditorOpen: false,
      status: 'idle',
      progress: 0,
      previewUrl: null,
      previewImage: null,
      eta: null,
      error: null,
      settings: DEFAULT_SETTINGS,

      browserType: detectBrowser(),
      exportMode: 'in-memory', // Default, updated by recalculateMode
      exportModeOverride: null,
      exportTier: 'small',
      estimatedSizeMB: 0,
      completionDetails: null,
      canvasAspectRatio: 16 / 9, // Default assumption

      setModalOpen: (isOpen) => {
        set({ isModalOpen: isOpen })
        // Recalculate on open to ensure fresh state
        if (isOpen) {
          get().recalculateMode()
        }
      },
      setCropEditorOpen: (isOpen) => set({ isCropEditorOpen: isOpen }),
      setCanvasAspectRatio: (ratio) => set({ canvasAspectRatio: ratio }),
      setIsExporting: (isExporting) => set({ isExporting }),
      setStatus: (status) => set({ status }),
      setProgress: (progress) => set({ progress }),
      setPreviewUrl: (url) =>
        set((state) => {
          if (state.previewUrl && state.previewUrl !== url) {
            URL.revokeObjectURL(state.previewUrl)
          }
          return { previewUrl: url }
        }),
      setPreviewImage: (url) => set({ previewImage: url }),
      setEta: (eta) => set({ eta }),
      setError: (error) => set({ error }),
      updateSettings: (newSettingsOrFn) => {
        const currentSettings = get().settings
        const newSettings = typeof newSettingsOrFn === 'function' 
            ? newSettingsOrFn(currentSettings) 
            : newSettingsOrFn
            
        const updatedSettings = { ...currentSettings, ...newSettings }

        // Deep merge for nested objects if they are partials
        if (newSettings.textOverlay) updatedSettings.textOverlay = { ...currentSettings.textOverlay, ...newSettings.textOverlay }
        if (newSettings.crop) updatedSettings.crop = { ...currentSettings.crop, ...newSettings.crop }

        // Auto-adjust bitrate when resolution, fps, or custom dimensions change
        // (but NOT when bitrate itself is being explicitly set)
        const resolutionChanged =
          'resolution' in newSettings && newSettings.resolution !== currentSettings.resolution
        const fpsChanged = 'fps' in newSettings && newSettings.fps !== currentSettings.fps
        const customDimensionsChanged =
          ('customWidth' in newSettings &&
            newSettings.customWidth !== currentSettings.customWidth) ||
          ('customHeight' in newSettings &&
            newSettings.customHeight !== currentSettings.customHeight)
        const bitrateExplicitlySet = 'bitrate' in newSettings

        if ((resolutionChanged || fpsChanged || customDimensionsChanged) && !bitrateExplicitlySet) {
          updatedSettings.bitrate = getRecommendedBitrate(
            updatedSettings.resolution,
            updatedSettings.fps,
            updatedSettings.customWidth,
            updatedSettings.customHeight
          )
        }

        set({ settings: updatedSettings })
        get().recalculateMode()
      },
      setExportModeOverride: (mode) => {
        set({ exportModeOverride: mode })
        get().recalculateMode()
      },
      setCompletionDetails: (details) => set({ completionDetails: details }),
      
      applyPreset: (presetName) => {
          const defaults = DEFAULT_SETTINGS
          const canvasRatio = get().canvasAspectRatio

          // Helper to calculate crop for target aspect ratio based on canvas aspect ratio
          const calculateCropForRatio = (targetRatio: number) => {
              if (canvasRatio > targetRatio) {
                  // Canvas is wider than target - crop width
                  const cropWidth = targetRatio / canvasRatio
                  return { x: (1 - cropWidth) / 2, y: 0, width: cropWidth, height: 1 }
              } else {
                  // Canvas is taller than target - crop height
                  const cropHeight = canvasRatio / targetRatio
                  return { x: 0, y: (1 - cropHeight) / 2, width: 1, height: cropHeight }
              }
          }

          if (presetName === 'instagram-story') {
              const crop = calculateCropForRatio(9 / 16)
              get().updateSettings({
                  resolution: 'custom',
                  customWidth: 1080,
                  customHeight: 1920,
                  duration: 15,
                  fps: 30,
                  bitrate: 8,
                  crop: { ...defaults.crop, enabled: true, ...crop }
              })
          } else if (presetName === 'instagram-post') {
              const crop = calculateCropForRatio(1) // Square
              get().updateSettings({
                  resolution: 'custom',
                  customWidth: 1080,
                  customHeight: 1080,
                  duration: 15,
                  fps: 30,
                  bitrate: 10,
                  crop: { ...defaults.crop, enabled: true, ...crop }
              })
          } else if (presetName === 'youtube-shorts') {
              const crop = calculateCropForRatio(9 / 16)
              get().updateSettings({
                  resolution: 'custom',
                  customWidth: 1080,
                  customHeight: 1920,
                  duration: 60,
                  fps: 60,
                  bitrate: 15,
                  crop: { ...defaults.crop, enabled: true, ...crop }
              })
          } else if (presetName === 'twitter-video') {
              get().updateSettings({
                  resolution: '1080p',
                  duration: 30,
                  fps: 60,
                  bitrate: 12,
                  crop: { ...defaults.crop, enabled: false }
              })
          } else if (presetName === 'cinematic') {
               get().updateSettings({
                  resolution: '4k',
                  fps: 24,
                  bitrate: 40
              })
          } else if (presetName === 'default') {
              get().updateSettings({
                  resolution: '1080p',
                  fps: 60,
                  duration: 30,
                  bitrate: 12,
                  crop: { ...defaults.crop, enabled: false },
                  textOverlay: { ...defaults.textOverlay, enabled: false }
              })
          }
      },

      recalculateMode: () => {
        const state = get()
        const s = state.settings

        // Calculate Size with compression factor for realistic estimation
        // Theoretical max: bitrate (Mbps) * duration (s) / 8 = MB
        // Then apply codec/bitrate-mode compression factor
        const theoreticalSizeMB = (s.bitrate * s.duration) / 8
        const compressionFactor = getCompressionFactor(s.codec, s.bitrateMode)
        const sizeMB = theoreticalSizeMB * compressionFactor

        // Determine Tier
        let tier: ExportTier = 'small'
        if (sizeMB >= 150) tier = 'large'
        else if (sizeMB >= 50) tier = 'medium'

        // Determine Mode
        let mode: ExportMode = 'in-memory'

        if (state.exportModeOverride) {
          mode = state.exportModeOverride
        } else {
          // Auto selection logic
          if (sizeMB < 100) {
            mode = 'in-memory'
          } else {
            if (state.browserType === 'chromium-capable') {
              mode = 'stream'
            } else {
              mode = 'segmented'
            }
          }
        }

        set({
          estimatedSizeMB: sizeMB,
          exportTier: tier,
          exportMode: mode,
        })
      },

      reset: () =>
        set((state) => {
          if (state.previewUrl) {
            URL.revokeObjectURL(state.previewUrl)
          }
          return {
            isExporting: false,
            status: 'idle',
            progress: 0,
            previewUrl: null,
            previewImage: null,
            eta: null,
            error: null,
            // We don't reset settings as they are persisted
            // We don't reset exportModeOverride as per PRD it resets on modal close?
            // PRD says: "Override preference is NOT persisted (resets to automatic on modal close)"
            // So we should reset it here if reset() is called on close.
            exportModeOverride: null,
            completionDetails: null,
          }
        }),
    }),
    {
      name: 'mdimension-export-settings',
      partialize: (state) => ({ settings: state.settings }), // Only persist settings
      merge: (persistedState, currentState) => {
        const persisted = persistedState as { settings?: Partial<ExportSettings> }
        // Deep merge persisted settings with defaults to handle new properties
        return {
          ...currentState,
          settings: {
            ...DEFAULT_SETTINGS,
            ...persisted?.settings,
            // Deep merge nested objects to preserve new defaults
            textOverlay: {
              ...DEFAULT_SETTINGS.textOverlay,
              ...persisted?.settings?.textOverlay,
            },
            crop: {
              ...DEFAULT_SETTINGS.crop,
              ...persisted?.settings?.crop,
            },
          },
        }
      },
    }
  )
)
