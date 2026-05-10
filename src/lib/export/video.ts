// mediabunny is loaded dynamically to keep it out of the critical bundle path.
// Only the 6 classes needed for video export are imported via mediabunny-subset.ts,
// which allows Vite/Rollup to tree-shake the unused demuxers, audio codecs,
// subtitle support, and input format parsers (~67% size reduction).
type MediaBunnySubset = typeof import('./mediabunny-subset')
type Output = InstanceType<MediaBunnySubset['Output']>
type BufferTarget = InstanceType<MediaBunnySubset['BufferTarget']>
type StreamTarget = InstanceType<MediaBunnySubset['StreamTarget']>
type CanvasSource = InstanceType<MediaBunnySubset['CanvasSource']>

import { logger } from '@/lib/logger'
import { CropSettings, TextOverlaySettings, VideoCodec } from '@/stores/runtime/exportStore'

let _mediabunny: MediaBunnySubset | null = null
async function loadMediaBunny(): Promise<MediaBunnySubset> {
  if (!_mediabunny) {
    _mediabunny = await import('./mediabunny-subset')
  }
  return _mediabunny
}

/**
 * Runtime video encoding and composition options for export sessions.
 */
export interface VideoExportOptions {
  width: number
  height: number
  fps: number
  duration: number
  /** Total video duration for fade calculations (defaults to duration). Use for segmented exports. */
  totalDuration?: number
  bitrate: number
  format: 'mp4' | 'webm'
  codec?: VideoCodec
  hardwareAcceleration?: 'no-preference' | 'prefer-hardware' | 'prefer-software'
  bitrateMode?: 'constant' | 'variable'
  onProgress?: (progress: number) => void
  streamHandle?: FileSystemFileHandle // Optional: for Stream-to-File mode
  /** Video rotation metadata for vertical/portrait video support (0, 90, 180, 270 degrees) */
  rotation?: 0 | 90 | 180 | 270

  // New Features
  textOverlay?: TextOverlaySettings
  crop?: CropSettings
}

// ─── Composition helpers ────────────────────────────────────────────────────

/** Check whether crop settings represent a valid, enabled crop region. */
function isValidCrop(crop: CropSettings | undefined): boolean {
  return (
    !!crop?.enabled &&
    Number.isFinite(crop.x) &&
    Number.isFinite(crop.y) &&
    Number.isFinite(crop.width) &&
    Number.isFinite(crop.height) &&
    crop.width > 0 &&
    crop.height > 0
  )
}

/** Compute letterbox/pillarbox destination rect for a given source aspect ratio. */
function computeLetterbox(
  srcAspect: number,
  dstWidth: number,
  dstHeight: number
): { dx: number; dy: number; dw: number; dh: number } {
  const dstAspect = dstWidth / dstHeight
  if (Math.abs(srcAspect - dstAspect) < 0.01) {
    return { dx: 0, dy: 0, dw: dstWidth, dh: dstHeight }
  }
  if (srcAspect > dstAspect) {
    const dh = dstWidth / srcAspect
    return { dx: 0, dy: (dstHeight - dh) / 2, dw: dstWidth, dh }
  }
  const dw = dstHeight * srcAspect
  return { dx: (dstWidth - dw) / 2, dy: 0, dw, dh: dstHeight }
}

/** Horizontal placement → x coordinate and textAlign. */
const H_PLACEMENT: Record<string, (w: number, p: number) => { x: number; align: CanvasTextAlign }> =
  {
    left: (_w, p) => ({ x: p, align: 'left' }),
    right: (w, p) => ({ x: w - p, align: 'right' }),
    center: (w) => ({ x: w / 2, align: 'center' }),
  }

/** Vertical placement → y coordinate and textBaseline. */
const V_PLACEMENT: Record<
  string,
  (h: number, p: number) => { y: number; baseline: CanvasTextBaseline }
> = {
  top: (_h, p) => ({ y: p, baseline: 'top' }),
  bottom: (h, p) => ({ y: h - p, baseline: 'bottom' }),
  center: (h) => ({ y: h / 2, baseline: 'middle' }),
}

/** Draw a text overlay onto a 2D canvas context. */
function drawTextOverlay(
  ctx: CanvasRenderingContext2D,
  overlay: TextOverlaySettings,
  width: number,
  height: number
): void {
  ctx.save()

  const fontWeight = overlay.fontWeight || 700
  const fontFamily = overlay.fontFamily || 'Inter, sans-serif'
  ctx.font = `${fontWeight} ${overlay.fontSize}px ${fontFamily}`

  const hPlace = H_PLACEMENT[overlay.horizontalPlacement] ?? H_PLACEMENT.center!
  const { x, align } = hPlace(width, overlay.padding)
  ctx.textAlign = align

  const vPlace = V_PLACEMENT[overlay.verticalPlacement] ?? V_PLACEMENT['center']!
  const { y, baseline } = vPlace(height, overlay.padding)
  ctx.textBaseline = baseline

  if (overlay.shadowBlur > 0) {
    ctx.shadowColor = overlay.shadowColor
    ctx.shadowBlur = overlay.shadowBlur
    ctx.shadowOffsetX = 0
    ctx.shadowOffsetY = 2
  }

  ctx.fillStyle = overlay.color
  ctx.globalAlpha = overlay.opacity

  if (overlay.letterSpacing !== 0) {
    const ctxAny = ctx as unknown as { letterSpacing?: string }
    if (typeof ctxAny.letterSpacing !== 'undefined') {
      ctxAny.letterSpacing = `${overlay.letterSpacing}px`
    }
  }

  ctx.fillText(overlay.text, x, y)
  ctx.restore()
}

/**
 * Handles video recording from a canvas using WebCodecs and MediaBunny.
 * Supports both in-memory buffering and direct-to-disk streaming.
 */
export class VideoRecorder {
  private output: Output | null = null
  private target: BufferTarget | StreamTarget | null = null
  private source: CanvasSource | null = null
  private canvas: HTMLCanvasElement
  private compositionCanvas: HTMLCanvasElement | null = null
  private compositionCtx: CanvasRenderingContext2D | null = null
  private options: VideoExportOptions
  private isRecording: boolean = false
  private isBufferMode: boolean = false
  private writableStream: FileSystemWritableFileStream | null = null

  constructor(canvas: HTMLCanvasElement, options: VideoExportOptions) {
    this.canvas = canvas
    this.options = options
  }

  async initialize(): Promise<void> {
    try {
      const mb = await loadMediaBunny()

      const validatePositiveFinite = (name: string, value: number): number => {
        if (!Number.isFinite(value) || value <= 0) {
          throw new Error(`Invalid ${name}: ${value}`)
        }
        return value
      }

      const safeWidth = Math.max(2, Math.round(validatePositiveFinite('width', this.options.width)))
      const safeHeight = Math.max(
        2,
        Math.round(validatePositiveFinite('height', this.options.height))
      )
      const safeFps = validatePositiveFinite('fps', this.options.fps)
      const safeBitrate = validatePositiveFinite('bitrate', this.options.bitrate)
      const safeFormat = this.options.format === 'webm' ? 'webm' : 'mp4'
      const fallbackCodec = safeFormat === 'webm' ? 'vp9' : 'avc'
      const safeCodec =
        this.options.codec === 'avc' ||
        this.options.codec === 'hevc' ||
        this.options.codec === 'vp9' ||
        this.options.codec === 'av1'
          ? this.options.codec
          : fallbackCodec
      const safeBitrateMode =
        this.options.bitrateMode === 'constant' || this.options.bitrateMode === 'variable'
          ? this.options.bitrateMode
          : 'variable'
      const safeHardwareAcceleration =
        this.options.hardwareAcceleration === 'no-preference' ||
        this.options.hardwareAcceleration === 'prefer-hardware' ||
        this.options.hardwareAcceleration === 'prefer-software'
          ? this.options.hardwareAcceleration
          : 'prefer-software'

      this.options = {
        ...this.options,
        width: safeWidth,
        height: safeHeight,
        fps: safeFps,
        bitrate: safeBitrate,
        format: safeFormat,
        codec: safeCodec,
        bitrateMode: safeBitrateMode,
        hardwareAcceleration: safeHardwareAcceleration,
      }

      // 0. Setup Composition Canvas if needed
      const needsComposition = this.options.textOverlay?.enabled || this.options.crop?.enabled

      let sourceCanvas = this.canvas

      if (needsComposition) {
        this.compositionCanvas = document.createElement('canvas')
        this.compositionCanvas.width = safeWidth
        this.compositionCanvas.height = safeHeight
        this.compositionCtx = this.compositionCanvas.getContext('2d', {
          willReadFrequently: false,
          alpha: false,
        }) as CanvasRenderingContext2D
        sourceCanvas = this.compositionCanvas
      }

      // 1. Setup Target & Format Options
      const isStreaming = !!this.options.streamHandle

      // Configure format with appropriate options for web playability
      // MP4: fastStart 'reserve' reserves space at file start for moov atom (good seeking)
      //      fastStart 'in-memory' processes moov in memory (for BufferTarget)
      // WebM: appendOnly for streaming avoids seeking during writes
      const format =
        safeFormat === 'webm'
          ? new mb.WebMOutputFormat({
              appendOnly: isStreaming, // Enable append-only for streaming (no seeking during write)
            })
          : new mb.Mp4OutputFormat({
              // 'reserve' works with FileSystemWritableFileStream (supports seek)
              // and produces proper MP4 with moov at front for good seeking support
              fastStart: isStreaming ? 'reserve' : 'in-memory',
            })

      if (this.options.streamHandle) {
        // Stream Mode - use chunked writes for batched disk I/O
        const writable = await this.options.streamHandle.createWritable()
        this.writableStream = writable
        this.target = new mb.StreamTarget(writable, {
          chunked: true,
          chunkSize: 16 * 1024 * 1024, // 16 MiB chunks
        })
      } else {
        // Memory Mode
        this.target = new mb.BufferTarget()
        this.isBufferMode = true
      }

      // 2. Create Output
      this.output = new mb.Output({
        format,
        target: this.target,
      })

      // 3. Configure Encoder with quality-optimized settings
      const normalizedRotation =
        this.options.rotation === 0 ||
        this.options.rotation === 90 ||
        this.options.rotation === 180 ||
        this.options.rotation === 270
          ? this.options.rotation
          : 0

      const config = {
        codec: safeCodec,
        bitrate: safeBitrate * 1_000_000, // Convert Mbps to bps
        bitrateMode: safeBitrateMode, // VBR is WebCodecs default, ~20% smaller files
        latencyMode: 'quality' as const, // Prioritize visual quality over encoding speed
        keyFrameInterval: safeFps * 2, // Keyframe every 2 seconds for good seeking + quality
        hardwareAcceleration: safeHardwareAcceleration,
      }

      // 4. Create Source
      this.source = new mb.CanvasSource(sourceCanvas, config)

      // 5. Add Track with metadata
      this.output.addVideoTrack(this.source, {
        frameRate: safeFps,
        rotation: normalizedRotation, // Rotation metadata for vertical video support
      })

      // 6. Start the output
      await this.output.start()

      this.isRecording = true
    } catch (error) {
      // Ensure resources are cleaned up on initialization failure
      this.dispose()
      throw new Error(
        `Video initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { cause: error }
      )
    }
  }

  /**
   * Captures the current state of the canvas as a frame.
   * @param timestamp - The timestamp of the frame in seconds (segment-relative for encoding).
   * @param duration - The duration of the frame in seconds.
   * @param _globalTimestamp - Optional global video timestamp for fade calculations (reserved for future use).
   */
  async captureFrame(
    timestamp: number,
    duration: number,
    _globalTimestamp?: number
  ): Promise<void> {
    if (!this.source || !this.isRecording) {
      throw new Error('Recorder not initialized or not recording')
    }

    try {
      if (this.compositionCanvas && this.compositionCtx) {
        this.composeFrame()
      }

      await this.source.add(timestamp, duration)
      this.reportProgress(timestamp)
    } catch (error) {
      throw new Error(
        `Frame capture failed at ${timestamp.toFixed(2)}s: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { cause: error }
      )
    }
  }

  /** Compose the full frame: background, scene draw (with optional crop), and text overlay. */
  private composeFrame(): void {
    const ctx = this.compositionCtx!
    const { width, height, crop, textOverlay } = this.options

    ctx.globalCompositeOperation = 'source-over'
    ctx.fillStyle = '#000000'
    ctx.fillRect(0, 0, width, height)
    ctx.filter = 'none'

    if (isValidCrop(crop)) {
      this.drawCroppedScene(ctx, crop!, width, height)
    } else {
      this.drawFullScene(ctx, width, height)
    }

    ctx.filter = 'none'

    if (textOverlay?.enabled && textOverlay.text.trim()) {
      drawTextOverlay(ctx, textOverlay, width, height)
    }
  }

  /** Draw the source canvas cropped to the given region, letterboxed into the export frame. */
  private drawCroppedScene(
    ctx: CanvasRenderingContext2D,
    crop: CropSettings,
    width: number,
    height: number
  ): void {
    const normalizedX = Math.min(Math.max(crop.x, 0), 1)
    const normalizedY = Math.min(Math.max(crop.y, 0), 1)
    const normalizedWidth = Math.min(Math.max(crop.width, 0), 1)
    const normalizedHeight = Math.min(Math.max(crop.height, 0), 1)

    const sx = normalizedX * this.canvas.width
    const sy = normalizedY * this.canvas.height
    const sw = normalizedWidth * this.canvas.width
    const sh = normalizedHeight * this.canvas.height

    const { dx, dy, dw, dh } = computeLetterbox(sw / sh, width, height)
    ctx.drawImage(this.canvas, sx, sy, sw, sh, dx, dy, dw, dh)
  }

  /** Draw the full source canvas letterboxed into the export frame. */
  private drawFullScene(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const { dx, dy, dw, dh } = computeLetterbox(
      this.canvas.width / this.canvas.height,
      width,
      height
    )
    ctx.drawImage(this.canvas, 0, 0, this.canvas.width, this.canvas.height, dx, dy, dw, dh)
  }

  /** Report encoding progress to the callback, if registered. */
  private reportProgress(timestamp: number): void {
    if (!this.options.onProgress) return
    const hasValidDuration = Number.isFinite(this.options.duration) && this.options.duration > 0
    if (!hasValidDuration) {
      this.options.onProgress(0)
      return
    }
    const rawProgress = timestamp / this.options.duration
    const progress = Number.isFinite(rawProgress) ? Math.min(Math.max(rawProgress, 0), 0.99) : 0
    this.options.onProgress(progress)
  }

  /**
   * Finalizes the recording.
   * Returns a Blob if using BufferTarget, or null if using StreamTarget (data already saved).
   * @returns A promise that resolves with the video Blob or null.
   */
  async finalize(): Promise<Blob | null> {
    if (!this.output || !this.target) {
      throw new Error('Recorder not initialized')
    }

    this.isRecording = false

    try {
      // Finalize the output (writes atoms/headers)
      await this.output.finalize()

      if (this.compositionCanvas) {
        // Cleanup composition resources
        this.compositionCanvas = null
        this.compositionCtx = null
      }

      if (this.isBufferMode) {
        // Get the buffer
        const buffer = (this.target as BufferTarget).buffer
        if (!buffer) {
          throw new Error('Buffer is empty after finalization')
        }
        // Use codec-qualified MIME type for better browser/player compatibility
        // e.g., 'video/mp4; codecs="avc1.42E01E"' instead of just 'video/mp4'
        const mimeType = await this.output.getMimeType()
        return new Blob([buffer], { type: mimeType })
      }

      // For StreamTarget: mediabunny should auto-close, but explicitly close to ensure file is committed
      if (this.writableStream) {
        try {
          await this.writableStream.close()
        } catch (err) {
          // Stream may already be closed by mediabunny — log for debugging
          logger.warn('[VideoRecorder] writable stream close failed during finalize:', err)
        }
      }
      return null
    } catch (error) {
      throw new Error(
        `Video finalization failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { cause: error }
      )
    }
  }

  /**
   * Cancels the recording and frees all resources.
   * Use this instead of finalize() when aborting an export.
   * Does not write a partial file - properly terminates the encoding.
   */
  async cancel(): Promise<void> {
    if (!this.output) {
      return
    }

    this.isRecording = false

    try {
      await this.output.cancel()
    } finally {
      this.dispose()
    }
  }

  dispose(): void {
    this.isRecording = false
    this.source = null
    this.output = null
    this.target = null
    this.compositionCanvas = null
    this.compositionCtx = null
    // Best-effort close of writable stream (streaming mode)
    if (this.writableStream) {
      void this.writableStream
        .close()
        .catch((err) =>
          logger.warn('[VideoRecorder] writable stream close failed during dispose:', err)
        )
      this.writableStream = null
    }
  }
}
