/**
 * Type-only module for export store shapes.
 *
 * Lives in this utils sibling so {@link ./exportValidation} can reference
 * these types without importing the value-export store hub
 * (`stores/exportStore.ts`) — which imports validation back, forming a
 * structural cycle.
 *
 * The store re-exports these types so consumers continue to do
 * `import type { ExportSettings } from '@/stores/runtime/exportStore'`.
 *
 * @module stores/utils/exportTypes
 */

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

  /** When true, reset the wavefunction/evolution to initial state before recording starts. */
  resetEvolution: boolean

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

/** Configuration for export presets with optional crop ratio for auto-centering. */
export type PresetConfig = Partial<ExportSettings> & { cropRatio?: number }
