import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { useScreenshotCaptureStore } from './screenshotCaptureStore'

/** Supported container formats for exported videos. */
export type ExportFormat = 'mp4' | 'webm'
/** Output resolution presets available in export UI. */
export type ExportResolution = '720p' | '1080p' | '4k' | 'custom'
/** Export execution mode selected by capability heuristics or user override. */
export type ExportMode = 'auto' | 'in-memory' | 'stream' | 'segmented'
/** Coarse export-size tier used by planner heuristics. */
export type ExportTier = 'small' | 'medium' | 'large'
/** Browser capability bucket for file-system streaming support. */
export type BrowserType = 'chromium-capable' | 'standard'

/** Supported codecs for MediaBunny/WebCodecs encoding. */
export type VideoCodec = 'avc' | 'hevc' | 'vp9' | 'av1'

/**
 * Text overlay configuration applied during composed video export.
 */
export interface TextOverlaySettings {
  enabled: boolean
  text: string
  fontFamily: string
  fontSize: number
  fontWeight: number // 100-900
  letterSpacing: number
  color: string
  opacity: number
  shadowColor: string
  shadowBlur: number
  verticalPlacement: 'top' | 'center' | 'bottom'
  horizontalPlacement: 'left' | 'center' | 'right'
  padding: number // pixels
}

/**
 * Normalized crop rectangle in [0,1] canvas coordinates.
 */
export interface CropSettings {
  enabled: boolean
  x: number // 0-1
  y: number // 0-1
  width: number // 0-1
  height: number // 0-1
}

/**
 * User-configurable export settings persisted between sessions.
 */
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
  /** Video rotation metadata for vertical/portrait video (0, 90, 180, 270 degrees) */
  rotation: 0 | 90 | 180 | 270

  // New Features
  textOverlay: TextOverlaySettings
  crop: CropSettings
}

/**
 * Metadata shown after export completion.
 */
export interface CompletionDetails {
  type: ExportMode
  segmentCount?: number
  filename?: string
}

/** Configuration for export presets with optional crop ratio for auto-centering */
export type PresetConfig = Partial<ExportSettings> & { cropRatio?: number }

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
  updateSettings: (
    settings: Partial<ExportSettings> | ((prev: ExportSettings) => Partial<ExportSettings>)
  ) => void
  setExportModeOverride: (mode: ExportMode | null) => void
  setCompletionDetails: (details: CompletionDetails | null) => void
  reset: () => void

  // Helpers
  applyPreset: (presetName: string) => void
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
  bitrateMode: 'variable',
  hardwareAcceleration: 'prefer-software',
  warmupFrames: 5,
  rotation: 0,

  textOverlay: {
    enabled: false,
    text: '',
    fontFamily: 'Inter, sans-serif',
    fontSize: 24,
    fontWeight: 300,
    letterSpacing: 0,
    color: '#ffffff',
    opacity: 1,
    shadowColor: 'rgba(0,0,0,0.5)',
    shadowBlur: 10,
    verticalPlacement: 'bottom',
    horizontalPlacement: 'center',
    padding: 20,
  },
  crop: {
    enabled: false,
    x: 0,
    y: 0,
    width: 1,
    height: 1,
  },
}

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

const clampToRange = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value))

const clampMin = (value: number, min: number): number => Math.max(min, value)

const isExportFormat = (value: unknown): value is ExportFormat => value === 'mp4' || value === 'webm'

const isVideoCodec = (value: unknown): value is VideoCodec =>
  value === 'avc' || value === 'hevc' || value === 'vp9' || value === 'av1'

const isExportResolution = (value: unknown): value is ExportResolution =>
  value === '720p' || value === '1080p' || value === '4k' || value === 'custom'

const isBitrateMode = (value: unknown): value is ExportSettings['bitrateMode'] =>
  value === 'constant' || value === 'variable'

const isHardwareAcceleration = (
  value: unknown
): value is ExportSettings['hardwareAcceleration'] =>
  value === 'no-preference' || value === 'prefer-hardware' || value === 'prefer-software'

const isRotation = (value: unknown): value is ExportSettings['rotation'] =>
  value === 0 || value === 90 || value === 180 || value === 270

const sanitizeHydratedTextOverlay = (rawTextOverlay: unknown): TextOverlaySettings => {
  const textOverlay = {
    ...DEFAULT_SETTINGS.textOverlay,
    ...(typeof rawTextOverlay === 'object' && rawTextOverlay !== null
      ? (rawTextOverlay as Partial<TextOverlaySettings>)
      : {}),
  }

  if (typeof textOverlay.enabled !== 'boolean') {
    textOverlay.enabled = DEFAULT_SETTINGS.textOverlay.enabled
  }

  for (const key of ['text', 'fontFamily', 'color', 'shadowColor'] as const) {
    if (typeof textOverlay[key] !== 'string') {
      textOverlay[key] = DEFAULT_SETTINGS.textOverlay[key]
    }
  }

  textOverlay.fontSize = isFiniteNumber(textOverlay.fontSize)
    ? clampMin(textOverlay.fontSize, 1)
    : DEFAULT_SETTINGS.textOverlay.fontSize
  textOverlay.fontWeight = isFiniteNumber(textOverlay.fontWeight)
    ? clampToRange(Math.round(textOverlay.fontWeight), 100, 900)
    : DEFAULT_SETTINGS.textOverlay.fontWeight
  textOverlay.letterSpacing = isFiniteNumber(textOverlay.letterSpacing)
    ? textOverlay.letterSpacing
    : DEFAULT_SETTINGS.textOverlay.letterSpacing
  textOverlay.opacity = isFiniteNumber(textOverlay.opacity)
    ? clampToRange(textOverlay.opacity, 0, 1)
    : DEFAULT_SETTINGS.textOverlay.opacity
  textOverlay.shadowBlur = isFiniteNumber(textOverlay.shadowBlur)
    ? clampMin(textOverlay.shadowBlur, 0)
    : DEFAULT_SETTINGS.textOverlay.shadowBlur
  textOverlay.padding = isFiniteNumber(textOverlay.padding)
    ? clampMin(textOverlay.padding, 0)
    : DEFAULT_SETTINGS.textOverlay.padding

  if (
    textOverlay.verticalPlacement !== 'top' &&
    textOverlay.verticalPlacement !== 'center' &&
    textOverlay.verticalPlacement !== 'bottom'
  ) {
    textOverlay.verticalPlacement = DEFAULT_SETTINGS.textOverlay.verticalPlacement
  }

  if (
    textOverlay.horizontalPlacement !== 'left' &&
    textOverlay.horizontalPlacement !== 'center' &&
    textOverlay.horizontalPlacement !== 'right'
  ) {
    textOverlay.horizontalPlacement = DEFAULT_SETTINGS.textOverlay.horizontalPlacement
  }

  return textOverlay
}

const sanitizeHydratedCrop = (rawCrop: unknown): CropSettings => {
  const crop = {
    ...DEFAULT_SETTINGS.crop,
    ...(typeof rawCrop === 'object' && rawCrop !== null ? (rawCrop as Partial<CropSettings>) : {}),
  }

  if (typeof crop.enabled !== 'boolean') {
    crop.enabled = DEFAULT_SETTINGS.crop.enabled
  }

  for (const key of ['x', 'y', 'width', 'height'] as const) {
    crop[key] = isFiniteNumber(crop[key])
      ? clampToRange(crop[key], 0, 1)
      : DEFAULT_SETTINGS.crop[key]
  }

  return crop
}

const sanitizeHydratedSettings = (rawPersistedSettings: Partial<ExportSettings> | undefined): ExportSettings => {
  const persistedSettings =
    rawPersistedSettings && typeof rawPersistedSettings === 'object' ? rawPersistedSettings : {}
  const merged = { ...DEFAULT_SETTINGS, ...persistedSettings }

  return {
    format: isExportFormat(merged.format) ? merged.format : DEFAULT_SETTINGS.format,
    codec: isVideoCodec(merged.codec) ? merged.codec : DEFAULT_SETTINGS.codec,
    resolution: isExportResolution(merged.resolution) ? merged.resolution : DEFAULT_SETTINGS.resolution,
    customWidth:
      isFiniteNumber(merged.customWidth) && merged.customWidth > 0
        ? clampToRange(Math.round(merged.customWidth), 2, 8192)
        : DEFAULT_SETTINGS.customWidth,
    customHeight:
      isFiniteNumber(merged.customHeight) && merged.customHeight > 0
        ? clampToRange(Math.round(merged.customHeight), 2, 8192)
        : DEFAULT_SETTINGS.customHeight,
    fps: isFiniteNumber(merged.fps) && merged.fps > 0 ? merged.fps : DEFAULT_SETTINGS.fps,
    duration:
      isFiniteNumber(merged.duration) && merged.duration > 0 ? merged.duration : DEFAULT_SETTINGS.duration,
    bitrate:
      isFiniteNumber(merged.bitrate) && merged.bitrate > 0
        ? clampToRange(merged.bitrate, 2, 100)
        : DEFAULT_SETTINGS.bitrate,
    bitrateMode: isBitrateMode(merged.bitrateMode) ? merged.bitrateMode : DEFAULT_SETTINGS.bitrateMode,
    hardwareAcceleration: isHardwareAcceleration(merged.hardwareAcceleration)
      ? merged.hardwareAcceleration
      : DEFAULT_SETTINGS.hardwareAcceleration,
    warmupFrames:
      isFiniteNumber(merged.warmupFrames) && merged.warmupFrames >= 0
        ? Math.max(0, Math.round(merged.warmupFrames))
        : DEFAULT_SETTINGS.warmupFrames,
    rotation: isRotation(merged.rotation) ? merged.rotation : DEFAULT_SETTINGS.rotation,
    textOverlay: sanitizeHydratedTextOverlay(persistedSettings.textOverlay),
    crop: sanitizeHydratedCrop(persistedSettings.crop),
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
    avc: 0.55, // H.264 - oldest, least efficient
    hevc: 0.42, // H.265 - ~25% better than AVC
    vp9: 0.42, // Similar to HEVC
    av1: 0.32, // ~25% better than HEVC, most efficient
  }

  let factor = codecFactors[codec] ?? 0.5

  // VBR mode is typically 15-25% more efficient for animated content
  // as it can allocate fewer bits to static/simple frames
  if (bitrateMode === 'variable') {
    factor *= 0.8
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

  const safeFps = Number.isFinite(fps) && fps > 0 ? fps : 30
  const safeResolution: ExportResolution =
    resolution in baseBitrates ? resolution : '1080p'
  let baseBitrate = baseBitrates[safeResolution]

  // For custom resolution, scale based on pixel count relative to 1080p
  if (
    safeResolution === 'custom' &&
    typeof customWidth === 'number' &&
    Number.isFinite(customWidth) &&
    customWidth > 0 &&
    typeof customHeight === 'number' &&
    Number.isFinite(customHeight) &&
    customHeight > 0
  ) {
    const pixels1080p = 1920 * 1080
    const customPixels = customWidth * customHeight
    const pixelRatio = customPixels / pixels1080p
    baseBitrate = Math.round(12 * pixelRatio) // Scale from 1080p base
  }

  // FPS multiplier: proportional to frame rate (30fps = 1.0x)
  const fpsMultiplier = safeFps / 30

  // Calculate final bitrate, with reasonable min/max bounds
  const recommendedBitrate = Math.round(baseBitrate * fpsMultiplier)
  if (!Number.isFinite(recommendedBitrate)) {
    return 12
  }
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
      exportMode: 'in-memory',
      exportModeOverride: null,
      exportTier: 'small',
      estimatedSizeMB: 0,
      completionDetails: null,
      canvasAspectRatio: 16 / 9, // Default assumption

      setModalOpen: (isOpen) => {
        set({ isModalOpen: isOpen })
        // Clean up screenshot capture store and preview image when modal closes
        if (!isOpen) {
          set({ previewImage: null })
          useScreenshotCaptureStore.getState().reset()
        }
      },
      setCropEditorOpen: (isOpen) => set({ isCropEditorOpen: isOpen }),
      setCanvasAspectRatio: (ratio) => {
        if (!Number.isFinite(ratio) || ratio <= 0) {
          if (import.meta.env.DEV) {
            console.warn('[exportStore] Ignoring invalid canvas aspect ratio:', ratio)
          }
          return
        }
        set({ canvasAspectRatio: ratio })
      },
      setIsExporting: (isExporting) => set({ isExporting }),
      setStatus: (status) => set({ status }),
      setProgress: (progress) => {
        if (!Number.isFinite(progress)) {
          if (import.meta.env.DEV) {
            console.warn('[exportStore] Ignoring non-finite progress:', progress)
          }
          return
        }
        set({ progress: Math.max(0, Math.min(1, progress)) })
      },
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
        const rawNewSettings =
          typeof newSettingsOrFn === 'function' ? newSettingsOrFn(currentSettings) : newSettingsOrFn
        const newSettings: Partial<ExportSettings> = { ...rawNewSettings }

        const stripNonFinitePositive = (
          key: 'fps' | 'duration' | 'bitrate' | 'customWidth' | 'customHeight'
        ): void => {
          const value = newSettings[key]
          if (value === undefined) {
            return
          }
          if (!Number.isFinite(value) || value <= 0) {
            if (import.meta.env.DEV) {
              console.warn(`[exportStore] Ignoring invalid ${key} update:`, value)
            }
            delete newSettings[key]
          }
        }

        stripNonFinitePositive('fps')
        stripNonFinitePositive('duration')
        stripNonFinitePositive('bitrate')
        stripNonFinitePositive('customWidth')
        stripNonFinitePositive('customHeight')

        if (newSettings.bitrate !== undefined) {
          newSettings.bitrate = clampToRange(newSettings.bitrate, 2, 100)
        }

        const normalizeCustomDimension = (key: 'customWidth' | 'customHeight'): void => {
          const value = newSettings[key]
          if (value === undefined) {
            return
          }
          newSettings[key] = Math.max(2, Math.min(8192, Math.round(value)))
        }

        normalizeCustomDimension('customWidth')
        normalizeCustomDimension('customHeight')

        if (newSettings.warmupFrames !== undefined) {
          const { warmupFrames } = newSettings
          if (!Number.isFinite(warmupFrames) || warmupFrames < 0) {
            if (import.meta.env.DEV) {
              console.warn('[exportStore] Ignoring invalid warmupFrames update:', warmupFrames)
            }
            delete newSettings.warmupFrames
          } else {
            newSettings.warmupFrames = Math.max(0, Math.round(warmupFrames))
          }
        }

        if (newSettings.format !== undefined && !isExportFormat(newSettings.format)) {
          if (import.meta.env.DEV) {
            console.warn('[exportStore] Ignoring invalid format update:', newSettings.format)
          }
          delete newSettings.format
        }

        if (newSettings.codec !== undefined && !isVideoCodec(newSettings.codec)) {
          if (import.meta.env.DEV) {
            console.warn('[exportStore] Ignoring invalid codec update:', newSettings.codec)
          }
          delete newSettings.codec
        }

        if (newSettings.resolution !== undefined && !isExportResolution(newSettings.resolution)) {
          if (import.meta.env.DEV) {
            console.warn('[exportStore] Ignoring invalid resolution update:', newSettings.resolution)
          }
          delete newSettings.resolution
        }

        if (newSettings.bitrateMode !== undefined && !isBitrateMode(newSettings.bitrateMode)) {
          if (import.meta.env.DEV) {
            console.warn('[exportStore] Ignoring invalid bitrateMode update:', newSettings.bitrateMode)
          }
          delete newSettings.bitrateMode
        }

        if (
          newSettings.hardwareAcceleration !== undefined &&
          !isHardwareAcceleration(newSettings.hardwareAcceleration)
        ) {
          if (import.meta.env.DEV) {
            console.warn(
              '[exportStore] Ignoring invalid hardwareAcceleration update:',
              newSettings.hardwareAcceleration
            )
          }
          delete newSettings.hardwareAcceleration
        }

        if (newSettings.rotation !== undefined && !isRotation(newSettings.rotation)) {
          if (import.meta.env.DEV) {
            console.warn('[exportStore] Ignoring invalid rotation update:', newSettings.rotation)
          }
          delete newSettings.rotation
        }

        if (newSettings.textOverlay) {
          const textPatch = { ...(newSettings.textOverlay as Partial<TextOverlaySettings>) }
          const clampToRange = (value: number, min: number, max: number): number =>
            Math.max(min, Math.min(max, value))
          const clampMin = (value: number, min: number): number => Math.max(min, value)

          const sanitizeFiniteNumber = (
            key:
              | 'fontSize'
              | 'fontWeight'
              | 'letterSpacing'
              | 'opacity'
              | 'shadowBlur'
              | 'padding'
          ): number | undefined => {
            const value = textPatch[key]
            if (value === undefined) {
              return undefined
            }
            if (!Number.isFinite(value)) {
              if (import.meta.env.DEV) {
                console.warn(`[exportStore] Ignoring invalid textOverlay.${key} update:`, value)
              }
              delete textPatch[key]
              return undefined
            }
            return value
          }

          const fontSize = sanitizeFiniteNumber('fontSize')
          if (fontSize !== undefined) {
            textPatch.fontSize = clampMin(fontSize, 1)
          }

          const fontWeight = sanitizeFiniteNumber('fontWeight')
          if (fontWeight !== undefined) {
            textPatch.fontWeight = clampToRange(Math.round(fontWeight), 100, 900)
          }

          const letterSpacing = sanitizeFiniteNumber('letterSpacing')
          if (letterSpacing !== undefined) {
            textPatch.letterSpacing = letterSpacing
          }

          const opacity = sanitizeFiniteNumber('opacity')
          if (opacity !== undefined) {
            textPatch.opacity = clampToRange(opacity, 0, 1)
          }

          const shadowBlur = sanitizeFiniteNumber('shadowBlur')
          if (shadowBlur !== undefined) {
            textPatch.shadowBlur = clampMin(shadowBlur, 0)
          }

          const padding = sanitizeFiniteNumber('padding')
          if (padding !== undefined) {
            textPatch.padding = clampMin(padding, 0)
          }

          if ('enabled' in textPatch && typeof textPatch.enabled !== 'boolean') {
            if (import.meta.env.DEV) {
              console.warn(
                '[exportStore] Ignoring invalid textOverlay.enabled update:',
                textPatch.enabled
              )
            }
            delete textPatch.enabled
          }

          for (const key of ['text', 'fontFamily', 'color', 'shadowColor'] as const) {
            if (key in textPatch && typeof textPatch[key] !== 'string') {
              if (import.meta.env.DEV) {
                console.warn(`[exportStore] Ignoring invalid textOverlay.${key} update:`, textPatch[key])
              }
              delete textPatch[key]
            }
          }

          if (
            'verticalPlacement' in textPatch &&
            textPatch.verticalPlacement !== 'top' &&
            textPatch.verticalPlacement !== 'center' &&
            textPatch.verticalPlacement !== 'bottom'
          ) {
            if (import.meta.env.DEV) {
              console.warn(
                '[exportStore] Ignoring invalid textOverlay.verticalPlacement update:',
                textPatch.verticalPlacement
              )
            }
            delete textPatch.verticalPlacement
          }

          if (
            'horizontalPlacement' in textPatch &&
            textPatch.horizontalPlacement !== 'left' &&
            textPatch.horizontalPlacement !== 'center' &&
            textPatch.horizontalPlacement !== 'right'
          ) {
            if (import.meta.env.DEV) {
              console.warn(
                '[exportStore] Ignoring invalid textOverlay.horizontalPlacement update:',
                textPatch.horizontalPlacement
              )
            }
            delete textPatch.horizontalPlacement
          }

          newSettings.textOverlay = textPatch as ExportSettings['textOverlay']
        }

        if (newSettings.crop) {
          const cropPatch = { ...(newSettings.crop as Partial<CropSettings>) }
          const clampUnitRange = (value: number): number => Math.max(0, Math.min(1, value))

          const sanitizeCropNumeric = (key: 'x' | 'y' | 'width' | 'height'): void => {
            const value = cropPatch[key]
            if (value === undefined) {
              return
            }
            if (!Number.isFinite(value)) {
              if (import.meta.env.DEV) {
                console.warn(`[exportStore] Ignoring invalid crop.${key} update:`, value)
              }
              delete cropPatch[key]
              return
            }
            cropPatch[key] = clampUnitRange(value)
          }

          sanitizeCropNumeric('x')
          sanitizeCropNumeric('y')
          sanitizeCropNumeric('width')
          sanitizeCropNumeric('height')

          if ('enabled' in cropPatch && typeof cropPatch.enabled !== 'boolean') {
            if (import.meta.env.DEV) {
              console.warn('[exportStore] Ignoring invalid crop.enabled update:', cropPatch.enabled)
            }
            delete cropPatch.enabled
          }

          newSettings.crop = cropPatch as ExportSettings['crop']
        }

        const updatedSettings = { ...currentSettings, ...newSettings }

        // Deep merge for nested objects if they are partials
        if (newSettings.textOverlay)
          updatedSettings.textOverlay = {
            ...currentSettings.textOverlay,
            ...newSettings.textOverlay,
          }
        if (newSettings.crop)
          updatedSettings.crop = { ...currentSettings.crop, ...newSettings.crop }

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
      },
      setExportModeOverride: (mode) => {
        set({ exportModeOverride: mode, exportMode: mode ?? 'in-memory' })
      },
      setCompletionDetails: (details) => set({ completionDetails: details }),

      applyPreset: (presetName) => {
        const defaults = DEFAULT_SETTINGS
        const canvasRatio = get().canvasAspectRatio

        /**
         * Calculates a centered crop region for a target aspect ratio.
         * The crop coordinates are relative to the current canvas (0-1 normalized).
         *
         * @param targetRatio - Desired output aspect ratio (width/height)
         * @returns Crop settings that center-crop the canvas to achieve targetRatio
         */
        const calculateCropForRatio = (
          targetRatio: number
        ): { x: number; y: number; width: number; height: number } => {
          if (canvasRatio > targetRatio) {
            // Canvas is wider than target - crop horizontally (pillarbox in reverse)
            const cropWidth = targetRatio / canvasRatio
            return { x: (1 - cropWidth) / 2, y: 0, width: cropWidth, height: 1 }
          }
          // Canvas is taller than target - crop vertically (letterbox in reverse)
          const cropHeight = canvasRatio / targetRatio
          return { x: 0, y: (1 - cropHeight) / 2, width: 1, height: cropHeight }
        }

        const presets: Record<string, PresetConfig> = {
          'landscape-1080p': {
            resolution: '1080p',
            fps: 60,
            duration: 30,
            bitrate: 12,
          },
          'landscape-720p': {
            resolution: '720p',
            fps: 30,
            duration: 30,
            bitrate: 8,
          },
          instagram: {
            resolution: 'custom',
            customWidth: 1080,
            customHeight: 1080,
            fps: 30,
            duration: 60,
            bitrate: 10,
            cropRatio: 1, // 1:1 square
          },
          tiktok: {
            resolution: 'custom',
            customWidth: 1080,
            customHeight: 1920,
            fps: 30,
            duration: 30,
            bitrate: 8,
            cropRatio: 9 / 16, // 9:16 portrait
          },
          'youtube-shorts': {
            resolution: 'custom',
            customWidth: 1080,
            customHeight: 1920,
            fps: 60,
            duration: 30,
            bitrate: 15,
            cropRatio: 9 / 16, // 9:16 portrait
          },
          'twitter-video': {
            resolution: '720p',
            fps: 30,
            duration: 30,
            bitrate: 8,
          },
          cinematic: {
            resolution: 'custom',
            customWidth: 3840,
            customHeight: 1634, // 21:9 aspect ratio
            fps: 24,
            bitrate: 40,
            cropRatio: 21 / 9, // 21:9 ultrawide
          },
          'square-60fps': {
            resolution: 'custom',
            customWidth: 1080,
            customHeight: 1080,
            fps: 60,
            duration: 60,
            bitrate: 15,
            cropRatio: 1, // 1:1 square
          },
          'high-q': {
            resolution: '4k',
            format: 'webm',
            codec: 'vp9',
            fps: 60,
            duration: 120,
            bitrate: 50,
          },
        }

        const config = presets[presetName]
        if (!config) return

        const { cropRatio, ...settings } = config

        // Calculate centered crop for presets with cropRatio
        const crop = cropRatio
          ? { ...defaults.crop, enabled: true, ...calculateCropForRatio(cropRatio) }
          : { ...defaults.crop, enabled: false }

        get().updateSettings({ ...settings, crop })
      },

      reset: () =>
        set((state) => {
          if (state.previewUrl) {
            URL.revokeObjectURL(state.previewUrl)
          }
          // Note: previewImage is NOT cleared here - it should persist while modal is open
          // Clear it explicitly via setPreviewImage(null) when the modal closes
          return {
            isExporting: false,
            status: 'idle',
            progress: 0,
            previewUrl: null,
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
        const hydratedSettings = sanitizeHydratedSettings(persisted?.settings)
        return {
          ...currentState,
          settings: hydratedSettings,
        }
      },
    }
  )
)
