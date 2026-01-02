import { 
  Output, 
  Mp4OutputFormat, 
  WebMOutputFormat,
  BufferTarget, 
  StreamTarget,
  CanvasSource, 
  VideoEncodingConfig 
} from 'mediabunny'

import { VideoCodec, TextOverlaySettings, CropSettings } from '@/stores/exportStore'

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
  private writableStream: FileSystemWritableFileStream | null = null

  constructor(canvas: HTMLCanvasElement, options: VideoExportOptions) {
    this.canvas = canvas
    this.options = options
  }

  async initialize(): Promise<void> {
    try {
      // 0. Setup Composition Canvas if needed
      const needsComposition =
          (this.options.textOverlay?.enabled) ||
          (this.options.crop?.enabled)

      let sourceCanvas = this.canvas

      if (needsComposition) {
          this.compositionCanvas = document.createElement('canvas')
          this.compositionCanvas.width = this.options.width
          this.compositionCanvas.height = this.options.height
          this.compositionCtx = this.compositionCanvas.getContext('2d', {
              willReadFrequently: false,
              alpha: false
          }) as CanvasRenderingContext2D
          sourceCanvas = this.compositionCanvas
      }

      // 1. Setup Target & Format Options
      const isStreaming = !!this.options.streamHandle

      // Configure format with appropriate options for web playability
      // MP4: fastStart 'reserve' reserves space at file start for moov atom (good seeking)
      //      fastStart 'in-memory' processes moov in memory (for BufferTarget)
      // WebM: appendOnly for streaming avoids seeking during writes
      const format = this.options.format === 'webm'
        ? new WebMOutputFormat({
            appendOnly: isStreaming // Enable append-only for streaming (no seeking during write)
          })
        : new Mp4OutputFormat({
            // 'reserve' works with FileSystemWritableFileStream (supports seek)
            // and produces proper MP4 with moov at front for good seeking support
            fastStart: isStreaming ? 'reserve' : 'in-memory'
          })

      if (this.options.streamHandle) {
          // Stream Mode - use chunked writes for batched disk I/O
          const writable = await this.options.streamHandle.createWritable()
          this.writableStream = writable
          this.target = new StreamTarget(writable, {
            chunked: true,
            chunkSize: 16 * 1024 * 1024 // 16 MiB chunks
          })
      } else {
          // Memory Mode
          this.target = new BufferTarget()
      }

      // 2. Create Output
      this.output = new Output({
        format,
        target: this.target
      })

      // 3. Configure Encoder with quality-optimized settings
      const codec = this.options.codec || (this.options.format === 'webm' ? 'vp9' : 'avc')

      const config: VideoEncodingConfig = {
        codec,
        bitrate: this.options.bitrate * 1_000_000, // Convert Mbps to bps
        bitrateMode: this.options.bitrateMode || 'variable', // VBR is WebCodecs default, ~20% smaller files
        latencyMode: 'quality', // Prioritize visual quality over encoding speed
        keyFrameInterval: this.options.fps * 2, // Keyframe every 2 seconds for good seeking + quality
        hardwareAcceleration: this.options.hardwareAcceleration || 'prefer-software',
      }

      // 4. Create Source
      this.source = new CanvasSource(sourceCanvas, config)

      // 5. Add Track with metadata
      this.output.addVideoTrack(this.source, {
          frameRate: this.options.fps,
          rotation: this.options.rotation ?? 0 // Rotation metadata for vertical video support
      })

      // 6. Start the output
      await this.output.start()

      this.isRecording = true
    } catch (error) {
      // Ensure resources are cleaned up on initialization failure
      this.dispose()
      throw new Error(
        `Video initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }
  }

  /**
   * Captures the current state of the canvas as a frame.
   * @param timestamp - The timestamp of the frame in seconds (segment-relative for encoding).
   * @param duration - The duration of the frame in seconds.
   * @param _globalTimestamp - Optional global video timestamp for fade calculations (reserved for future use).
   */
  async captureFrame(timestamp: number, duration: number, _globalTimestamp?: number): Promise<void> {
    if (!this.source || !this.isRecording) {
      throw new Error('Recorder not initialized or not recording')
    }

    try {
      // Perform Composition if needed
      if (this.compositionCanvas && this.compositionCtx) {
          const ctx = this.compositionCtx
          const { width, height, crop, textOverlay } = this.options

          // 1. Background (Clear)
          ctx.globalCompositeOperation = 'source-over'
          ctx.fillStyle = '#000000'
          ctx.fillRect(0, 0, width, height)

          // 2. Draw Scene (with Crop)
          // Reset filters for drawing the image (unless we want filters applied to the image source)
          // We apply filters to the drawImage call context

          ctx.filter = 'none'

          if (crop?.enabled) {
              // Source coordinates (relative to original canvas)
              const sx = crop.x * this.canvas.width
              const sy = crop.y * this.canvas.height
              const sw = crop.width * this.canvas.width
              const sh = crop.height * this.canvas.height

              // Calculate aspect ratios to maintain proportions (no stretching)
              const cropAspect = sw / sh
              const exportAspect = width / height

              let dw: number, dh: number, dx: number, dy: number

              if (Math.abs(cropAspect - exportAspect) < 0.01) {
                  // Aspect ratios match - fill entire frame
                  dx = 0
                  dy = 0
                  dw = width
                  dh = height
              } else if (cropAspect > exportAspect) {
                  // Crop is wider than export - fit to width, letterbox top/bottom
                  dw = width
                  dh = width / cropAspect
                  dx = 0
                  dy = (height - dh) / 2
              } else {
                  // Crop is taller than export - fit to height, pillarbox left/right
                  dh = height
                  dw = height * cropAspect
                  dx = (width - dw) / 2
                  dy = 0
              }

              ctx.drawImage(this.canvas, sx, sy, sw, sh, dx, dy, dw, dh)
          } else {
              // No crop - preserve aspect ratio with letterbox/pillarbox if needed
              const srcAspect = this.canvas.width / this.canvas.height
              const dstAspect = width / height

              let dw: number, dh: number, dx: number, dy: number

              if (Math.abs(srcAspect - dstAspect) < 0.01) {
                  // Aspect ratios match - fill entire frame
                  dx = 0
                  dy = 0
                  dw = width
                  dh = height
              } else if (srcAspect > dstAspect) {
                  // Source is wider than destination - fit to width, letterbox top/bottom
                  dw = width
                  dh = width / srcAspect
                  dx = 0
                  dy = (height - dh) / 2
              } else {
                  // Source is taller than destination - fit to height, pillarbox left/right
                  dh = height
                  dw = height * srcAspect
                  dx = (width - dw) / 2
                  dy = 0
              }

              ctx.drawImage(this.canvas, 0, 0, this.canvas.width, this.canvas.height, dx, dy, dw, dh)
          }

          // 3. Reset Filter for Overlays
          ctx.filter = 'none'

          // 6. Text Overlay
          if (textOverlay?.enabled && textOverlay.text.trim()) {
              ctx.save()

              const fontSize = textOverlay.fontSize
              const fontWeight = textOverlay.fontWeight || 700
              const fontFamily = textOverlay.fontFamily || 'Inter, sans-serif'
              const { verticalPlacement, horizontalPlacement, padding } = textOverlay

              ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`

              // Horizontal position and alignment
              let x: number
              if (horizontalPlacement === 'left') {
                  x = padding
                  ctx.textAlign = 'left'
              } else if (horizontalPlacement === 'right') {
                  x = width - padding
                  ctx.textAlign = 'right'
              } else {
                  x = width / 2
                  ctx.textAlign = 'center'
              }

              // Vertical position and baseline
              let y: number
              if (verticalPlacement === 'top') {
                  y = padding
                  ctx.textBaseline = 'top'
              } else if (verticalPlacement === 'bottom') {
                  y = height - padding
                  ctx.textBaseline = 'bottom'
              } else {
                  y = height / 2
                  ctx.textBaseline = 'middle'
              }

              // Text Shadow
              if (textOverlay.shadowBlur > 0) {
                  ctx.shadowColor = textOverlay.shadowColor
                  ctx.shadowBlur = textOverlay.shadowBlur
                  ctx.shadowOffsetX = 0
                  ctx.shadowOffsetY = 2
              }

              ctx.fillStyle = textOverlay.color
              ctx.globalAlpha = textOverlay.opacity

              // Letter Spacing support (modern browsers)
              if (textOverlay.letterSpacing !== 0) {
                  // Use letterSpacing if available (Chrome 94+, Firefox 125+, Safari 17+)
                  const ctxAny = ctx as unknown as { letterSpacing?: string }
                  if (typeof ctxAny.letterSpacing !== 'undefined') {
                      ctxAny.letterSpacing = `${textOverlay.letterSpacing}px`
                  }
              }
              ctx.fillText(textOverlay.text, x, y)

              ctx.restore()
          }
      }

      await this.source.add(timestamp, duration)

      if (this.options.onProgress) {
          const totalDuration = this.options.duration
          const progress = Math.min((timestamp / totalDuration), 0.99)
          this.options.onProgress(progress)
      }
    } catch (error) {
      throw new Error(
        `Frame capture failed at ${timestamp.toFixed(2)}s: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }
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

      if (this.target instanceof BufferTarget) {
          // Get the buffer
          const buffer = this.target.buffer
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
          } catch {
              // Stream may already be closed by mediabunny - that's fine
          }
      }
      return null
    } catch (error) {
      throw new Error(
        `Video finalization failed: ${error instanceof Error ? error.message : 'Unknown error'}`
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

  dispose() {
    this.isRecording = false
    this.source = null
    this.output = null
    this.target = null
    this.compositionCanvas = null
    this.compositionCtx = null
  }
}
