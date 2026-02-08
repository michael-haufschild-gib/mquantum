/**
 * WebGPU canvas capture utility.
 *
 * Encodes a GPUTexture->GPUBuffer copy on the active frame command encoder and
 * asynchronously maps the readback buffer after submit. Converts pixels to a PNG
 * data URL for screenshot/crop workflows.
 */

const BYTES_PER_PIXEL = 4
const COPY_BYTES_PER_ROW_ALIGNMENT = 256

function alignTo(value: number, alignment: number): number {
  return Math.ceil(value / alignment) * alignment
}

function isBGRAFormat(format: GPUTextureFormat): boolean {
  return format === 'bgra8unorm' || format === 'bgra8unorm-srgb'
}

export interface QueueCanvasCaptureParams {
  encoder: GPUCommandEncoder
  texture: GPUTexture
  width: number
  height: number
  format: GPUTextureFormat
  requestId: number
  onSuccess: (dataUrl: string, requestId: number) => void
  onError: (error: string, requestId: number) => void
}

/**
 * Stateful canvas capture helper with readback buffer reuse.
 */
export class WebGPUCanvasCapture {
  private readonly device: GPUDevice
  private readbackBuffer: GPUBuffer | null = null
  private readbackBytesPerRow = 0
  private readbackBufferSize = 0
  private readbackWidth = 0
  private readbackHeight = 0
  private readbackFormat: GPUTextureFormat | null = null
  private inFlight = false
  private disposed = false

  constructor(device: GPUDevice) {
    this.device = device
  }

  private ensureReadbackBuffer(width: number, height: number, format: GPUTextureFormat): void {
    const bytesPerRowUnaligned = width * BYTES_PER_PIXEL
    const bytesPerRow = alignTo(bytesPerRowUnaligned, COPY_BYTES_PER_ROW_ALIGNMENT)
    const bufferSize = bytesPerRow * height

    const needsRecreate =
      !this.readbackBuffer ||
      this.readbackBytesPerRow !== bytesPerRow ||
      this.readbackBufferSize !== bufferSize ||
      this.readbackWidth !== width ||
      this.readbackHeight !== height ||
      this.readbackFormat !== format

    if (!needsRecreate) return

    this.readbackBuffer?.destroy()
    this.readbackBuffer = this.device.createBuffer({
      label: 'screenshot-readback',
      size: bufferSize,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    })
    this.readbackBytesPerRow = bytesPerRow
    this.readbackBufferSize = bufferSize
    this.readbackWidth = width
    this.readbackHeight = height
    this.readbackFormat = format
  }

  private decodePixels(
    bytes: Uint8Array,
    width: number,
    height: number,
    bytesPerRow: number,
    format: GPUTextureFormat
  ): Uint8ClampedArray {
    const out = new Uint8ClampedArray(width * height * BYTES_PER_PIXEL)
    const bgraInput = isBGRAFormat(format)

    for (let y = 0; y < height; y++) {
      const srcRowOffset = y * bytesPerRow
      const dstRowOffset = y * width * BYTES_PER_PIXEL

      for (let x = 0; x < width; x++) {
        const src = srcRowOffset + x * BYTES_PER_PIXEL
        const dst = dstRowOffset + x * BYTES_PER_PIXEL

        let r = bgraInput ? bytes[src + 2]! : bytes[src]!
        let g = bytes[src + 1]!
        let b = bgraInput ? bytes[src]! : bytes[src + 2]!
        const a = bytes[src + 3]!

        // Canvas context is configured as premultiplied alpha; un-premultiply for PNG export.
        if (a > 0 && a < 255) {
          const invAlpha = 255 / a
          r = Math.min(255, Math.round(r * invAlpha))
          g = Math.min(255, Math.round(g * invAlpha))
          b = Math.min(255, Math.round(b * invAlpha))
        }

        out[dst] = r
        out[dst + 1] = g
        out[dst + 2] = b
        out[dst + 3] = a
      }
    }

    return out
  }

  private pixelsToDataUrl(pixels: Uint8ClampedArray, width: number, height: number): string {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height

    const ctx = canvas.getContext('2d')
    if (!ctx) {
      throw new Error('Failed to create 2D canvas context for screenshot export')
    }

    const imageDataPixels = new Uint8ClampedArray(width * height * BYTES_PER_PIXEL)
    imageDataPixels.set(pixels)
    const imageData = new ImageData(imageDataPixels, width, height)
    ctx.putImageData(imageData, 0, 0)
    return canvas.toDataURL('image/png')
  }

  queueCapture(params: QueueCanvasCaptureParams): void {
    if (this.disposed || this.inFlight) return

    const { encoder, texture, width, height, format, requestId, onSuccess, onError } = params

    if (width <= 0 || height <= 0) {
      onError('Cannot capture screenshot: invalid canvas size.', requestId)
      return
    }

    try {
      this.ensureReadbackBuffer(width, height, format)
      if (!this.readbackBuffer) {
        onError('Unable to allocate screenshot readback buffer.', requestId)
        return
      }

      encoder.copyTextureToBuffer(
        { texture },
        {
          buffer: this.readbackBuffer,
          bytesPerRow: this.readbackBytesPerRow,
          rowsPerImage: height,
        },
        { width, height, depthOrArrayLayers: 1 }
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to queue screenshot copy'
      onError(message, requestId)
      return
    }

    this.inFlight = true
    const readbackBuffer = this.readbackBuffer
    const readbackBytesPerRow = this.readbackBytesPerRow
    const readbackBufferSize = this.readbackBufferSize

    this.device.queue
      .onSubmittedWorkDone()
      .then(async () => {
        if (this.disposed || this.readbackBuffer !== readbackBuffer || !readbackBuffer) return

        await readbackBuffer.mapAsync(GPUMapMode.READ, 0, readbackBufferSize)
        try {
          const mapped = readbackBuffer.getMappedRange(0, readbackBufferSize)
          const bytes = new Uint8Array(mapped)
          const pixels = this.decodePixels(bytes, width, height, readbackBytesPerRow, format)
          const dataUrl = this.pixelsToDataUrl(pixels, width, height)
          onSuccess(dataUrl, requestId)
        } finally {
          readbackBuffer.unmap()
        }
      })
      .catch((error) => {
        if (this.disposed) return // Buffer destroyed by dispose() — expected
        const message = error instanceof Error ? error.message : 'Screenshot readback failed'
        onError(message, requestId)
      })
      .finally(() => {
        this.inFlight = false
      })
  }

  dispose(): void {
    this.disposed = true
    this.readbackBuffer?.destroy()
    this.readbackBuffer = null
    this.inFlight = false
  }
}
