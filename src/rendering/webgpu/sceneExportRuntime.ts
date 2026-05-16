/**
 * Export runtime types, state factories, and helpers for the WebGPU scene.
 *
 * @module rendering/webgpu/sceneExportRuntime
 */

import type React from 'react'

import type { ExportMode, ExportSettings } from '@/stores/runtime/exportStore'
import { useExportStore } from '@/stores/runtime/exportStore'

import type { WebGPUCamera } from './core/WebGPUCamera'
import type { WebGPUDevice } from './core/WebGPUDevice'
import type { WebGPURenderGraph } from './graph/WebGPURenderGraph'

/** Current phase of the export pipeline. */
export type ExportPhase = 'warmup' | 'preview' | 'recording'
/** Resolved export mode after auto-detection. */
export type RuntimeExportMode = Exclude<ExportMode, 'auto'>

/** Frame-level state for the export recording loop. */
export interface ExportLoopState {
  phase: ExportPhase
  frameId: number
  warmupFrame: number
  startTime: number
  totalFrames: number
  frameDuration: number
  exportStartTime: number
  lastEtaUpdate: number
  mainStreamHandle?: FileSystemFileHandle
  segmentDurationFrames: number
  currentSegment: number
  framesInCurrentSegment: number
  segmentStartTimeVideo: number
}

/** Snapshot of performance settings to restore after export completes. */
export interface ExportPerformanceSnapshot {
  renderResolutionScale: number
}

/** Minimal recorder interface — avoids static import of VideoRecorder (and mediabunny). */
export interface ExportRecorder {
  initialize(): Promise<void>
  captureFrame(videoTime: number, frameDuration: number, globalVideoTime?: number): Promise<void>
  finalize(): Promise<Blob | null>
  cancel(): Promise<void>
  dispose(): void
}

/** Full mutable state for the video export runtime. */
export interface ExportRuntimeState {
  starting: boolean
  started: boolean
  processing: boolean
  finishing: boolean
  canceling: boolean
  abortRequested: boolean
  mode: RuntimeExportMode | null
  settings: ExportSettings | null
  recorder: ExportRecorder | null
  rotationSnapshot: Map<string, number> | null
  environmentCaptured: boolean
  originalCanvasWidth: number
  originalCanvasHeight: number
  originalCameraAspect: number
  exportWidth: number
  exportHeight: number
  renderWidth: number
  renderHeight: number
  originalPerf: ExportPerformanceSnapshot
  loop: ExportLoopState
}

/**
 * Check whether the export runtime is in any active phase.
 * @param runtime - Partial runtime state with boolean flags
 */
export function isExportRuntimeActive(
  runtime: Pick<
    ExportRuntimeState,
    'starting' | 'started' | 'processing' | 'finishing' | 'canceling'
  >
): boolean {
  return (
    runtime.starting ||
    runtime.started ||
    runtime.processing ||
    runtime.finishing ||
    runtime.canceling
  )
}

/** @returns Fresh export loop state with all counters at zero. */
export function createInitialExportLoopState(): ExportLoopState {
  return {
    phase: 'warmup',
    frameId: 0,
    warmupFrame: 0,
    startTime: 0,
    totalFrames: 0,
    frameDuration: 0,
    exportStartTime: 0,
    lastEtaUpdate: 0,
    mainStreamHandle: undefined,
    segmentDurationFrames: 0,
    currentSegment: 0,
    framesInCurrentSegment: 0,
    segmentStartTimeVideo: 0,
  }
}

/** @returns Fresh export runtime state ready for a new export session. */
export function createInitialExportRuntimeState(): ExportRuntimeState {
  return {
    starting: false,
    started: false,
    processing: false,
    finishing: false,
    canceling: false,
    abortRequested: false,
    mode: null,
    settings: null,
    recorder: null,
    rotationSnapshot: null,
    environmentCaptured: false,
    originalCanvasWidth: 0,
    originalCanvasHeight: 0,
    originalCameraAspect: 1,
    exportWidth: 0,
    exportHeight: 0,
    renderWidth: 0,
    renderHeight: 0,
    originalPerf: {
      renderResolutionScale: 1,
    },
    loop: createInitialExportLoopState(),
  }
}

/** @returns Deep clone of export settings (text overlay and crop are value objects). */
export function cloneExportSettings(settings: ExportSettings): ExportSettings {
  return {
    ...settings,
    textOverlay: { ...settings.textOverlay },
    crop: { ...settings.crop },
  }
}

/** @returns Estimated export file size in MB based on duration and bitrate. */
export function estimateExportSizeMb(settings: ExportSettings): number {
  return (settings.duration * settings.bitrate) / 8
}

/** @returns Resolved export mode ('in-memory', 'stream', or 'segmented') based on browser capability and estimated size. */
export function resolveRuntimeExportMode(
  mode: ExportMode,
  browserType: ReturnType<typeof useExportStore.getState>['browserType'],
  settings: ExportSettings
): RuntimeExportMode {
  if (mode !== 'auto') {
    return mode
  }

  const estimatedSizeMb = estimateExportSizeMb(settings)
  if (estimatedSizeMb < 100) {
    return 'in-memory'
  }

  return browserType === 'chromium-capable' ? 'stream' : 'segmented'
}

/**
 * Wait for the browser to complete at least one paint cycle.
 * Double-rAF guarantees the DOM has been painted.
 */
export function waitForPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve())
    })
  })
}

/**
 * Dependencies injected from the parent WebGPUScene component.
 */
export interface UseExportRuntimeParams {
  canvas: HTMLCanvasElement
  device: WebGPUDevice
  graph: WebGPURenderGraph
  cameraRef: React.RefObject<WebGPUCamera | null>
  size: { width: number; height: number }
  advanceSceneStateByDelta: (deltaTime: number) => void
  executeSceneFrame: (deltaTime: number) => void
  exportRuntimeRef: React.RefObject<ExportRuntimeState>
}

/** Return type of useExportRuntime: per-frame tick and cleanup handles. */
export interface UseExportRuntimeReturn {
  tickExport: () => boolean
  cleanupExport: () => void
}

/**
 * Create a VideoRecorder with standard config derived from export settings.
 * Dynamically imports video.ts to keep mediabunny out of the initial bundle.
 */
export async function createExportRecorder(
  canvas: HTMLCanvasElement,
  settings: ExportSettings,
  width: number,
  height: number,
  duration: number
): Promise<ExportRecorder> {
  const { VideoRecorder } = await import('@/lib/export/video')
  return new VideoRecorder(canvas, {
    width,
    height,
    fps: settings.fps,
    duration,
    totalDuration: settings.duration,
    bitrate: settings.bitrate,
    format: settings.format,
    codec: settings.codec,
    hardwareAcceleration: settings.hardwareAcceleration,
    bitrateMode: settings.bitrateMode,
    textOverlay: settings.textOverlay,
    crop: settings.crop,
    rotation: settings.rotation,
  })
}

/** Validate export settings. Throws on invalid values. */
export function validateExportSettings(settings: ExportSettings): void {
  if (!Number.isFinite(settings.fps) || settings.fps <= 0) {
    throw new Error(`Invalid FPS: ${settings.fps}`)
  }
  if (!Number.isFinite(settings.duration) || settings.duration <= 0) {
    throw new Error(`Invalid duration: ${settings.duration}`)
  }
  if (!Number.isFinite(settings.bitrate) || settings.bitrate <= 0) {
    throw new Error(`Invalid bitrate: ${settings.bitrate}`)
  }
}

/** Download a recorded video segment as a file. */
export async function triggerSegmentDownload(
  blob: Blob,
  segmentIndex: number,
  format: ExportSettings['format']
): Promise<void> {
  const { downloadFile } = await import('@/lib/export/dataExport')
  const ext = format === 'webm' ? 'webm' : 'mp4'
  downloadFile(blob, `mquantum-${Date.now()}-part${segmentIndex}.${ext}`, `video/${ext}`)
}
