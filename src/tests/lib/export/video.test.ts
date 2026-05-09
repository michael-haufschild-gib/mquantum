/**
 * Tests for video export utilities (VideoRecorder)
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { VideoRecorder } from '@/lib/export/video'

// Mock mediabunny - it uses WebCodecs which aren't available in test environment
vi.mock('mediabunny', () => {
  const mockBuffer = new ArrayBuffer(1024)

  class MockBufferTarget {
    buffer = mockBuffer
  }

  // Accept chunked options for StreamTarget
  class MockStreamTarget {
    writable: unknown
    options?: { chunked?: boolean; chunkSize?: number }

    constructor(writable: unknown, options?: { chunked?: boolean; chunkSize?: number }) {
      this.writable = writable
      this.options = options
    }
  }

  // Accept fastStart option for Mp4OutputFormat
  class MockMp4OutputFormat {
    options?: { fastStart?: 'in-memory' | 'reserve' | 'fragmented' | false }

    constructor(options?: { fastStart?: 'in-memory' | 'reserve' | 'fragmented' | false }) {
      this.options = options
    }
  }

  // Accept appendOnly option for WebMOutputFormat
  class MockWebMOutputFormat {
    options?: { appendOnly?: boolean }

    constructor(options?: { appendOnly?: boolean }) {
      this.options = options
    }
  }

  class MockOutput {
    private started = false
    private canceled = false
    options: unknown

    constructor(options: unknown) {
      this.options = options
    }

    addVideoTrack = vi.fn()

    start = vi.fn().mockImplementation(async () => {
      this.started = true
    })

    finalize = vi.fn().mockImplementation(async () => {
      if (!this.started) throw new Error('Output not started')
      if (this.canceled) throw new Error('Output already canceled')
    })

    cancel = vi.fn().mockImplementation(async () => {
      this.canceled = true
    })

    // Returns codec-qualified MIME type after finalization
    getMimeType = vi.fn().mockImplementation(async () => {
      return 'video/mp4; codecs="avc1.42e01e"'
    })
  }

  class MockCanvasSource {
    private initialized = false
    canvas: HTMLCanvasElement
    config: unknown

    constructor(canvas: HTMLCanvasElement, config: unknown) {
      this.canvas = canvas
      this.config = config
      this.initialized = true
    }

    add = vi.fn().mockImplementation(async (_timestamp: number, _duration: number) => {
      if (!this.initialized) throw new Error('Source not initialized')
    })
  }

  return {
    BufferTarget: MockBufferTarget,
    StreamTarget: MockStreamTarget,
    Mp4OutputFormat: MockMp4OutputFormat,
    WebMOutputFormat: MockWebMOutputFormat,
    Output: MockOutput,
    CanvasSource: MockCanvasSource,
    VideoEncodingConfig: {},
  }
})

describe('VideoRecorder', () => {
  let canvas: HTMLCanvasElement
  let recorder: VideoRecorder

  const defaultOptions = {
    width: 1920,
    height: 1080,
    fps: 60,
    duration: 5,
    bitrate: 12,
    format: 'mp4' as const,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    canvas = document.createElement('canvas')
    canvas.width = 1920
    canvas.height = 1080
    recorder = new VideoRecorder(canvas, defaultOptions)
  })

  describe('constructor', () => {
    it('should create recorder with canvas and options', () => {
      expect(recorder).toBeInstanceOf(VideoRecorder)
    })
  })

  describe('initialize', () => {
    it('should initialize recorder successfully', async () => {
      await expect(recorder.initialize()).resolves.not.toThrow()
    })

    it('normalizes encoder settings and track metadata before starting output', async () => {
      const recorderWithInvalidEnums = new VideoRecorder(canvas, {
        ...defaultOptions,
        fps: 24,
        format: 'webm',
        codec: 'bogus-codec' as never,
        bitrateMode: 'bogus-mode' as never,
        hardwareAcceleration: 'bogus-hardware' as never,
        rotation: 45 as never,
      })

      await recorderWithInvalidEnums.initialize()

      const internal = recorderWithInvalidEnums as unknown as {
        source: { canvas: HTMLCanvasElement; config: Record<string, unknown> }
        output: { addVideoTrack: ReturnType<typeof vi.fn> }
      }
      expect(internal.source.canvas).toBe(canvas)
      expect(internal.source.config).toMatchObject({
        codec: 'vp9',
        bitrate: 12_000_000,
        bitrateMode: 'variable',
        latencyMode: 'quality',
        keyFrameInterval: 48,
        hardwareAcceleration: 'prefer-software',
      })
      expect(internal.output.addVideoTrack).toHaveBeenCalledWith(internal.source, {
        frameRate: 24,
        rotation: 0,
      })
    })

    it('should set isRecording to true after initialize', async () => {
      await recorder.initialize()
      // Verify by trying to capture a frame (would throw if not recording)
      await expect(recorder.captureFrame(0, 1 / 60)).resolves.not.toThrow()
    })
  })

  describe('captureFrame', () => {
    it('should throw when called before initialize', async () => {
      await expect(recorder.captureFrame(0, 1 / 60)).rejects.toThrow(
        'Recorder not initialized or not recording'
      )
    })

    it('should capture frame with correct timestamp and duration', async () => {
      await recorder.initialize()
      await expect(recorder.captureFrame(0, 1 / 60)).resolves.not.toThrow()
      await expect(recorder.captureFrame(1 / 60, 1 / 60)).resolves.not.toThrow()
    })

    it('should call progress callback during capture', async () => {
      const onProgress = vi.fn()
      const recorderWithProgress = new VideoRecorder(canvas, {
        ...defaultOptions,
        onProgress,
      })

      await recorderWithProgress.initialize()
      await recorderWithProgress.captureFrame(2.5, 1 / 60) // 2.5s of 5s = 50%

      expect(onProgress).toHaveBeenCalled()
      const progressValue = onProgress.mock.calls[0]![0]
      expect(progressValue).toBeCloseTo(0.5, 1)
    })

    it('should cap progress at 0.99 during capture', async () => {
      const onProgress = vi.fn()
      const recorderWithProgress = new VideoRecorder(canvas, {
        ...defaultOptions,
        onProgress,
      })

      await recorderWithProgress.initialize()
      await recorderWithProgress.captureFrame(5, 1 / 60) // 5s of 5s = 100%

      expect(onProgress).toHaveBeenCalled()
      const progressValue = onProgress.mock.calls[0]![0]
      expect(progressValue).toBeLessThanOrEqual(0.99)
    })

    it('should clamp progress to a minimum of 0 for negative timestamps', async () => {
      const onProgress = vi.fn()
      const recorderWithProgress = new VideoRecorder(canvas, {
        ...defaultOptions,
        onProgress,
      })

      await recorderWithProgress.initialize()
      await recorderWithProgress.captureFrame(-1, 1 / 60)

      expect(onProgress).toHaveBeenCalled()
      const progressValue = onProgress.mock.calls[0]![0]
      expect(progressValue).toBe(0)
    })

    it('should report finite progress when total duration is non-finite', async () => {
      const onProgress = vi.fn()
      const recorderWithProgress = new VideoRecorder(canvas, {
        ...defaultOptions,
        duration: Number.NaN,
        onProgress,
      })

      await recorderWithProgress.initialize()
      await recorderWithProgress.captureFrame(1, 1 / 60)

      expect(onProgress).toHaveBeenCalled()
      const progressValue = onProgress.mock.calls[0]![0]
      expect(Number.isFinite(progressValue)).toBe(true)
      expect(progressValue).toBe(0)
    })

    it('falls back to full-frame draw when crop dimensions are non-positive', async () => {
      const recorderWithInvalidCrop = new VideoRecorder(canvas, {
        ...defaultOptions,
        crop: {
          enabled: true,
          x: 0.2,
          y: 0.1,
          width: 0,
          height: 0.8,
        },
      })

      await recorderWithInvalidCrop.initialize()

      const drawImage = vi.fn()
      ;(
        recorderWithInvalidCrop as unknown as {
          compositionCanvas: HTMLCanvasElement | null
          compositionCtx: CanvasRenderingContext2D | null
        }
      ).compositionCanvas = document.createElement('canvas')
      ;(
        recorderWithInvalidCrop as unknown as {
          compositionCanvas: HTMLCanvasElement | null
          compositionCtx: CanvasRenderingContext2D | null
        }
      ).compositionCtx = {
        globalCompositeOperation: 'source-over',
        fillStyle: '#000000',
        filter: 'none',
        fillRect: vi.fn(),
        drawImage,
      } as unknown as CanvasRenderingContext2D

      await recorderWithInvalidCrop.captureFrame(0, 1 / 60)

      expect(drawImage).toHaveBeenCalledTimes(1)
      const args = drawImage.mock.calls[0]
      expect(args?.[1]).toBe(0)
      expect(args?.[2]).toBe(0)
      expect(args?.[3]).toBe(canvas.width)
      expect(args?.[4]).toBe(canvas.height)
    })

    it('clamps valid crop coordinates and letterboxes the cropped scene into export bounds', async () => {
      canvas.width = 1000
      canvas.height = 500
      const recorderWithCrop = new VideoRecorder(canvas, {
        ...defaultOptions,
        width: 100,
        height: 100,
        crop: {
          enabled: true,
          x: -0.1,
          y: 0.25,
          width: 1.5,
          height: 0.5,
        },
      })

      await recorderWithCrop.initialize()

      const drawImage = vi.fn()
      ;(
        recorderWithCrop as unknown as {
          compositionCanvas: HTMLCanvasElement | null
          compositionCtx: CanvasRenderingContext2D | null
        }
      ).compositionCanvas = document.createElement('canvas')
      ;(
        recorderWithCrop as unknown as {
          compositionCanvas: HTMLCanvasElement | null
          compositionCtx: CanvasRenderingContext2D | null
        }
      ).compositionCtx = {
        globalCompositeOperation: 'source-over',
        fillStyle: '#000000',
        filter: 'none',
        fillRect: vi.fn(),
        drawImage,
      } as unknown as CanvasRenderingContext2D

      await recorderWithCrop.captureFrame(0, 1 / 60)

      expect(drawImage).toHaveBeenCalledTimes(1)
      const args = drawImage.mock.calls[0]
      expect(args?.[0]).toBe(canvas)
      expect(args?.[1]).toBe(0)
      expect(args?.[2]).toBe(125)
      expect(args?.[3]).toBe(1000)
      expect(args?.[4]).toBe(250)
      expect(args?.[5]).toBe(0)
      expect(args?.[6]).toBeCloseTo(37.5, 12)
      expect(args?.[7]).toBe(100)
      expect(args?.[8]).toBeCloseTo(25, 12)
    })
  })

  describe('finalize', () => {
    it('should throw when called before initialize', async () => {
      await expect(recorder.finalize()).rejects.toThrow('Recorder not initialized')
    })

    it('should return blob with codec-qualified MIME type after finalize', async () => {
      await recorder.initialize()
      await recorder.captureFrame(0, 1 / 60)
      const blob = await recorder.finalize()

      expect(blob).toBeInstanceOf(Blob)
      if (blob) {
        // Should use getMimeType() for codec-qualified MIME
        // Note: Blob API normalizes MIME types to lowercase
        expect(blob.type).toBe('video/mp4; codecs="avc1.42e01e"')
      }
    })

    it('should set isRecording to false after finalize', async () => {
      await recorder.initialize()
      await recorder.captureFrame(0, 1 / 60)
      await recorder.finalize()

      // Trying to capture after finalize should fail
      await expect(recorder.captureFrame(1 / 60, 1 / 60)).rejects.toThrow(
        'Recorder not initialized or not recording'
      )
    })
  })

  describe('dispose', () => {
    it('should clean up resources', async () => {
      await recorder.initialize()
      recorder.dispose()

      // After dispose, capture should fail
      await expect(recorder.captureFrame(0, 1 / 60)).rejects.toThrow(
        'Recorder not initialized or not recording'
      )
    })

    it('should be safe to call multiple times', () => {
      expect(() => {
        recorder.dispose()
        recorder.dispose()
      }).not.toThrow()
    })

    it('should be safe to call before initialize', () => {
      expect(() => recorder.dispose()).not.toThrow()
    })
  })

  describe('cancel', () => {
    it('should cancel recording without throwing', async () => {
      await recorder.initialize()
      await recorder.captureFrame(0, 1 / 60)
      await expect(recorder.cancel()).resolves.not.toThrow()
    })

    it('should set isRecording to false after cancel', async () => {
      await recorder.initialize()
      await recorder.cancel()

      // After cancel, capture should fail
      await expect(recorder.captureFrame(0, 1 / 60)).rejects.toThrow(
        'Recorder not initialized or not recording'
      )
    })

    it('should be safe to call before initialize', async () => {
      await expect(recorder.cancel()).resolves.not.toThrow()
    })

    it('should prevent finalize after cancel', async () => {
      await recorder.initialize()
      await recorder.cancel()

      // After cancel, finalize should fail
      await expect(recorder.finalize()).rejects.toThrow('Recorder not initialized')
    })
  })

  describe('streaming mode cleanup', () => {
    it('finalize returns null for stream targets and explicitly closes the writable stream', async () => {
      const closeFn = vi.fn().mockResolvedValue(undefined)
      const mockWritable = { close: closeFn } as unknown as FileSystemWritableFileStream
      const mockHandle = {
        createWritable: vi.fn().mockResolvedValue(mockWritable),
      } as unknown as FileSystemFileHandle

      const streamRecorder = new VideoRecorder(canvas, {
        ...defaultOptions,
        streamHandle: mockHandle,
      })

      await streamRecorder.initialize()
      await streamRecorder.captureFrame(0, 1 / 60)

      await expect(streamRecorder.finalize()).resolves.toBeNull()
      expect(mockHandle.createWritable).toHaveBeenCalledTimes(1)
      expect(closeFn).toHaveBeenCalledTimes(1)
      await expect(streamRecorder.captureFrame(1 / 60, 1 / 60)).rejects.toThrow(
        'Recorder not initialized or not recording'
      )
    })

    it('should close writable stream on dispose', async () => {
      const closeFn = vi.fn().mockResolvedValue(undefined)
      const mockWritable = { close: closeFn } as unknown as FileSystemWritableFileStream
      const mockHandle = {
        createWritable: vi.fn().mockResolvedValue(mockWritable),
      } as unknown as FileSystemFileHandle

      const streamRecorder = new VideoRecorder(canvas, {
        ...defaultOptions,
        streamHandle: mockHandle,
      })

      await streamRecorder.initialize()
      streamRecorder.dispose()

      expect(closeFn).toHaveBeenCalledTimes(1)
    })

    it('should close writable stream on cancel', async () => {
      const closeFn = vi.fn().mockResolvedValue(undefined)
      const mockWritable = { close: closeFn } as unknown as FileSystemWritableFileStream
      const mockHandle = {
        createWritable: vi.fn().mockResolvedValue(mockWritable),
      } as unknown as FileSystemFileHandle

      const streamRecorder = new VideoRecorder(canvas, {
        ...defaultOptions,
        streamHandle: mockHandle,
      })

      await streamRecorder.initialize()
      await streamRecorder.cancel()

      expect(closeFn).toHaveBeenCalledTimes(1)
    })

    it('should not throw if writable stream close fails', async () => {
      const closeFn = vi.fn().mockRejectedValue(new Error('already closed'))
      const mockWritable = { close: closeFn } as unknown as FileSystemWritableFileStream
      const mockHandle = {
        createWritable: vi.fn().mockResolvedValue(mockWritable),
      } as unknown as FileSystemFileHandle

      const streamRecorder = new VideoRecorder(canvas, {
        ...defaultOptions,
        streamHandle: mockHandle,
      })

      await streamRecorder.initialize()
      // dispose should not throw even if close() rejects
      expect(() => streamRecorder.dispose()).not.toThrow()
    })
  })

  describe('options validation', () => {
    it('rejects non-positive numeric runtime options during initialize', async () => {
      const invalidRecorder = new VideoRecorder(canvas, {
        ...defaultOptions,
        width: 0,
        height: -1,
        fps: 0,
        duration: -2,
        bitrate: 0,
      })

      await expect(invalidRecorder.initialize()).rejects.toThrow(
        'Video initialization failed: Invalid width: 0'
      )
    })

    it('should handle different FPS values', async () => {
      const recorder24fps = new VideoRecorder(canvas, { ...defaultOptions, fps: 24 })
      await expect(recorder24fps.initialize()).resolves.not.toThrow()
    })

    it('should handle different resolutions', async () => {
      const recorder4k = new VideoRecorder(canvas, {
        ...defaultOptions,
        width: 3840,
        height: 2160,
      })
      await expect(recorder4k.initialize()).resolves.not.toThrow()
    })

    it('should handle different bitrates', async () => {
      const recorderHighBitrate = new VideoRecorder(canvas, {
        ...defaultOptions,
        bitrate: 50,
      })
      await expect(recorderHighBitrate.initialize()).resolves.not.toThrow()
    })

    it('coerces invalid runtime rotation metadata to 0 degrees', async () => {
      const recorderWithInvalidRotation = new VideoRecorder(canvas, {
        ...defaultOptions,
        rotation: 45 as unknown as 0,
      })

      await recorderWithInvalidRotation.initialize()

      const output = (
        recorderWithInvalidRotation as unknown as {
          output: { addVideoTrack: ReturnType<typeof vi.fn> }
        }
      ).output
      const trackOptions = output.addVideoTrack.mock.calls[0]?.[1] as
        | { rotation?: number }
        | undefined
      expect(trackOptions?.rotation).toBe(0)
    })
  })
})
