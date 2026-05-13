import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import { logger } from '@/lib/logger'

import {
  clampMin,
  clampToRange,
  getCompressionFactor as getCompressionFactorImpl,
  getRecommendedBitrate as getRecommendedBitrateImpl,
  isBitrateMode,
  isExportFormat,
  isExportMode,
  isExportResolution,
  isFiniteNumber,
  isHardwareAcceleration,
  isRotation,
  isVideoCodec,
  sanitizeCropPatch,
  sanitizeTextOverlayPatch,
  stripInvalidEnum,
} from '../utils/exportValidation'
import { useScreenshotCaptureStore } from './screenshotCaptureStore'

// Re-export for backward compatibility with tests and consumers
export const getCompressionFactor = getCompressionFactorImpl
export const getRecommendedBitrate = getRecommendedBitrateImpl

import type {
  BrowserType,
  CompletionDetails,
  CropSettings,
  ExportFormat,
  ExportMode,
  ExportResolution,
  ExportSettings,
  ExportTier,
  PresetConfig,
  TextOverlaySettings,
  VideoCodec,
} from '../utils/exportTypes'

export type {
  BrowserType,
  CompletionDetails,
  CropSettings,
  ExportFormat,
  ExportMode,
  ExportResolution,
  ExportSettings,
  ExportTier,
  PresetConfig,
  TextOverlaySettings,
  VideoCodec,
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
  lastAppliedPreset: string | null

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
  resetEvolution: false,

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

const VALID_VERTICAL: ReadonlySet<string> = new Set(['top', 'center', 'bottom'])
const VALID_HORIZONTAL: ReadonlySet<string> = new Set(['left', 'center', 'right'])

/** Resolve a numeric field: return clamped value if finite, otherwise the default. */
const resolveNumeric = (
  value: unknown,
  fallback: number,
  clamp?: (v: number) => number
): number => {
  if (!isFiniteNumber(value)) return fallback
  return clamp ? clamp(value) : value
}

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

  const defaults = DEFAULT_SETTINGS.textOverlay
  textOverlay.fontSize = resolveNumeric(textOverlay.fontSize, defaults.fontSize, (v) =>
    clampMin(v, 1)
  )
  textOverlay.fontWeight = resolveNumeric(textOverlay.fontWeight, defaults.fontWeight, (v) =>
    clampToRange(Math.round(v), 100, 900)
  )
  textOverlay.letterSpacing = resolveNumeric(textOverlay.letterSpacing, defaults.letterSpacing)
  textOverlay.opacity = resolveNumeric(textOverlay.opacity, defaults.opacity, (v) =>
    clampToRange(v, 0, 1)
  )
  textOverlay.shadowBlur = resolveNumeric(textOverlay.shadowBlur, defaults.shadowBlur, (v) =>
    clampMin(v, 0)
  )
  textOverlay.padding = resolveNumeric(textOverlay.padding, defaults.padding, (v) => clampMin(v, 0))

  if (!VALID_VERTICAL.has(textOverlay.verticalPlacement)) {
    textOverlay.verticalPlacement = defaults.verticalPlacement
  }
  if (!VALID_HORIZONTAL.has(textOverlay.horizontalPlacement)) {
    textOverlay.horizontalPlacement = defaults.horizontalPlacement
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

/** Return value if it is a finite positive number, else fallback. Optionally clamp. */
const resolvePositive = (
  value: unknown,
  fallback: number,
  clamp?: (v: number) => number
): number => {
  if (!isFiniteNumber(value) || value <= 0) return fallback
  return clamp ? clamp(value) : value
}

/** Return value if it passes the guard, else fallback. */
const resolveEnum = <T>(value: unknown, fallback: T, guard: (v: unknown) => v is T): T =>
  guard(value) ? value : fallback

const sanitizeHydratedSettings = (
  rawPersistedSettings: Partial<ExportSettings> | undefined
): ExportSettings => {
  const persistedSettings =
    rawPersistedSettings && typeof rawPersistedSettings === 'object' ? rawPersistedSettings : {}
  const merged = { ...DEFAULT_SETTINGS, ...persistedSettings }
  const d = DEFAULT_SETTINGS

  const roundClamp2to8192 = (v: number) => clampToRange(Math.round(v), 2, 8192)

  return {
    format: resolveEnum(merged.format, d.format, isExportFormat),
    codec: resolveEnum(merged.codec, d.codec, isVideoCodec),
    resolution: resolveEnum(merged.resolution, d.resolution, isExportResolution),
    customWidth: resolvePositive(merged.customWidth, d.customWidth, roundClamp2to8192),
    customHeight: resolvePositive(merged.customHeight, d.customHeight, roundClamp2to8192),
    fps: resolvePositive(merged.fps, d.fps),
    duration: resolvePositive(merged.duration, d.duration),
    bitrate: resolvePositive(merged.bitrate, d.bitrate, (v) => clampToRange(v, 2, 100)),
    bitrateMode: resolveEnum(merged.bitrateMode, d.bitrateMode, isBitrateMode),
    hardwareAcceleration: resolveEnum(
      merged.hardwareAcceleration,
      d.hardwareAcceleration,
      isHardwareAcceleration
    ),
    warmupFrames:
      isFiniteNumber(merged.warmupFrames) && merged.warmupFrames >= 0
        ? Math.max(0, Math.round(merged.warmupFrames))
        : d.warmupFrames,
    rotation: resolveEnum(merged.rotation, d.rotation, isRotation),
    resetEvolution:
      typeof merged.resetEvolution === 'boolean' ? merged.resetEvolution : d.resetEvolution,
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

/** Strip a numeric field from the patch if it is not a finite positive number. */
const stripNonFinitePositive = (
  settings: Partial<ExportSettings>,
  key: 'fps' | 'duration' | 'bitrate' | 'customWidth' | 'customHeight'
): void => {
  const value = settings[key]
  if (value === undefined) return
  if (!Number.isFinite(value) || value <= 0) {
    logger.warn(`[exportStore] Ignoring invalid ${key} update:`, value)
    delete settings[key]
  }
}

/** Round and clamp a custom dimension field to [2, 8192]. */
const normalizeCustomDimension = (
  settings: Partial<ExportSettings>,
  key: 'customWidth' | 'customHeight'
): void => {
  const value = settings[key]
  if (value === undefined) return
  settings[key] = Math.max(2, Math.min(8192, Math.round(value)))
}

/** Sanitize warmupFrames: must be finite and non-negative. */
const sanitizeWarmupFrames = (settings: Partial<ExportSettings>): void => {
  if (settings.warmupFrames === undefined) return
  const { warmupFrames } = settings
  if (!Number.isFinite(warmupFrames) || warmupFrames < 0) {
    logger.warn('[exportStore] Ignoring invalid warmupFrames update:', warmupFrames)
    delete settings.warmupFrames
    return
  }
  settings.warmupFrames = Math.max(0, Math.round(warmupFrames))
}

/** Validate and clamp all fields of an incoming settings patch in-place. */
const sanitizeSettingsPatch = (newSettings: Partial<ExportSettings>): void => {
  for (const key of ['fps', 'duration', 'bitrate', 'customWidth', 'customHeight'] as const) {
    stripNonFinitePositive(newSettings, key)
  }

  if (newSettings.bitrate !== undefined) {
    newSettings.bitrate = clampToRange(newSettings.bitrate, 2, 100)
  }

  normalizeCustomDimension(newSettings, 'customWidth')
  normalizeCustomDimension(newSettings, 'customHeight')
  sanitizeWarmupFrames(newSettings)

  stripInvalidEnum(newSettings, 'format', isExportFormat)
  stripInvalidEnum(newSettings, 'codec', isVideoCodec)
  stripInvalidEnum(newSettings, 'resolution', isExportResolution)
  stripInvalidEnum(newSettings, 'bitrateMode', isBitrateMode)
  stripInvalidEnum(newSettings, 'hardwareAcceleration', isHardwareAcceleration)
  stripInvalidEnum(newSettings, 'rotation', isRotation)

  if ('resetEvolution' in newSettings && typeof newSettings.resetEvolution !== 'boolean') {
    logger.warn('[exportStore] Ignoring invalid resetEvolution update:', newSettings.resetEvolution)
    delete newSettings.resetEvolution
  }

  if (newSettings.textOverlay) {
    newSettings.textOverlay = sanitizeTextOverlayPatch(
      newSettings.textOverlay as Partial<TextOverlaySettings>
    ) as ExportSettings['textOverlay']
  }
  if (newSettings.crop) {
    newSettings.crop = sanitizeCropPatch(
      newSettings.crop as Partial<CropSettings>
    ) as ExportSettings['crop']
  }
}

/** Merge settings with deep merge for nested objects (textOverlay, crop). */
const mergeSettingsWithDeepNested = (
  current: ExportSettings,
  patch: Partial<ExportSettings>
): ExportSettings => {
  const merged = { ...current, ...patch }
  if (patch.textOverlay) {
    merged.textOverlay = { ...current.textOverlay, ...patch.textOverlay }
  }
  if (patch.crop) {
    merged.crop = { ...current.crop, ...patch.crop }
  }
  return merged
}

/** Auto-adjust bitrate when resolution/fps/dimensions change (unless bitrate was explicitly set). */
const autoAdjustBitrate = (
  current: ExportSettings,
  patch: Partial<ExportSettings>,
  updated: ExportSettings
): void => {
  if ('bitrate' in patch) return

  const resolutionChanged = 'resolution' in patch && patch.resolution !== current.resolution
  const fpsChanged = 'fps' in patch && patch.fps !== current.fps
  const customDimensionsChanged =
    ('customWidth' in patch && patch.customWidth !== current.customWidth) ||
    ('customHeight' in patch && patch.customHeight !== current.customHeight)

  if (resolutionChanged || fpsChanged || customDimensionsChanged) {
    updated.bitrate = getRecommendedBitrate(
      updated.resolution,
      updated.fps,
      updated.customWidth,
      updated.customHeight
    )
  }
}

const resolveSettingsUpdate = (
  currentSettings: ExportSettings,
  rawSettings: Partial<ExportSettings>
): ExportSettings => {
  const newSettings: Partial<ExportSettings> = { ...rawSettings }

  sanitizeSettingsPatch(newSettings)

  const updatedSettings = mergeSettingsWithDeepNested(currentSettings, newSettings)
  autoAdjustBitrate(currentSettings, newSettings, updatedSettings)

  return updatedSettings
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
      lastAppliedPreset: null,

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
          logger.warn('[exportStore] Ignoring invalid canvas aspect ratio:', ratio)
          return
        }
        set({ canvasAspectRatio: ratio })
      },
      setIsExporting: (isExporting) => set({ isExporting }),
      setStatus: (status) => set({ status }),
      setProgress: (progress) => {
        if (!Number.isFinite(progress)) {
          logger.warn('[exportStore] Ignoring non-finite progress:', progress)
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
        const updatedSettings = resolveSettingsUpdate(currentSettings, rawNewSettings)

        set({ settings: updatedSettings, lastAppliedPreset: null })
      },
      setExportModeOverride: (mode) => {
        if (mode !== null && !isExportMode(mode)) {
          logger.warn('[exportStore] Ignoring invalid export mode override:', mode)
          return
        }
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

        const updatedSettings = resolveSettingsUpdate(get().settings, { ...settings, crop })
        set({ settings: updatedSettings, lastAppliedPreset: presetName })
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
            lastAppliedPreset: null,
          }
        }),
    }),
    {
      name: 'mquantum-export-settings',
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
