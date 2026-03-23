/**
 * KTX2 Cubemap Loader
 *
 * Parses KTX2 containers with GPU-native compressed texture data (BC7 or ASTC 4×4)
 * and Zstd supercompression. Uploads compressed blocks directly to the GPU — no
 * runtime transcoding, no WASM dependencies, no CSP issues.
 *
 * Asset selection: the caller picks the correct file variant (bc7 or astc) based
 * on `device.features`. This loader validates that the file matches.
 *
 * @module rendering/webgpu/utils/ktx2Loader
 */

import { logger } from '@/lib/logger'

// ─── KTX2 Constants ──────────────────────────────────────────────────────────

/** KTX2 file identifier (first 12 bytes). */
const KTX2_MAGIC = new Uint8Array([
  0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a,
])

const SUPERCOMPRESSION_NONE = 0
const SUPERCOMPRESSION_ZSTD = 2

/** Supported vkFormat values → WebGPU format + block geometry. */
const FORMAT_MAP: Record<
  number,
  { gpuFormat: GPUTextureFormat; blockW: number; blockH: number; blockBytes: number }
> = {
  // VK_FORMAT_BC7_UNORM_BLOCK
  145: { gpuFormat: 'bc7-rgba-unorm', blockW: 4, blockH: 4, blockBytes: 16 },
  // VK_FORMAT_ASTC_4x4_UNORM_BLOCK
  157: { gpuFormat: 'astc-4x4-unorm', blockW: 4, blockH: 4, blockBytes: 16 },
}

// ─── KTX2 Container Parsing ─────────────────────────────────────────────────

interface KTX2Header {
  vkFormat: number
  pixelWidth: number
  pixelHeight: number
  faceCount: number
  levelCount: number
  supercompressionScheme: number
}

interface KTX2Level {
  byteOffset: number
  byteLength: number
  uncompressedByteLength: number
}

interface KTX2Container {
  header: KTX2Header
  levels: KTX2Level[]
  data: Uint8Array
}

/**
 * Parse a KTX2 container: header, level index, and raw data reference.
 * Validates magic, face count (6 for cubemaps), and supercompression scheme.
 */
function parseKTX2(buffer: ArrayBuffer): KTX2Container {
  const data = new Uint8Array(buffer)
  const view = new DataView(buffer)

  for (let i = 0; i < 12; i++) {
    if (data[i] !== KTX2_MAGIC[i]) {
      throw new Error('Not a valid KTX2 file')
    }
  }

  const vkFormat = view.getUint32(12, true)
  const pixelWidth = view.getUint32(20, true)
  const pixelHeight = view.getUint32(24, true)
  const faceCount = view.getUint32(36, true)
  const levelCount = view.getUint32(40, true)
  const supercompressionScheme = view.getUint32(44, true)

  if (!FORMAT_MAP[vkFormat]) {
    throw new Error(`Unsupported vkFormat: ${vkFormat}. Expected BC7 (145) or ASTC 4×4 (157).`)
  }

  if (faceCount !== 6) {
    throw new Error(`Expected cubemap with 6 faces, got ${faceCount}`)
  }

  if (
    supercompressionScheme !== SUPERCOMPRESSION_NONE &&
    supercompressionScheme !== SUPERCOMPRESSION_ZSTD
  ) {
    throw new Error(`Unsupported supercompression: ${supercompressionScheme}`)
  }

  // Level index: 48-byte fixed header + 32-byte descriptor offsets = byte 80
  const LEVEL_INDEX_OFFSET = 80
  const levels: KTX2Level[] = []
  for (let i = 0; i < levelCount; i++) {
    const base = LEVEL_INDEX_OFFSET + i * 24
    levels.push({
      byteOffset: Number(view.getBigUint64(base, true)),
      byteLength: Number(view.getBigUint64(base + 8, true)),
      uncompressedByteLength: Number(view.getBigUint64(base + 16, true)),
    })
  }

  return {
    header: { vkFormat, pixelWidth, pixelHeight, faceCount, levelCount, supercompressionScheme },
    levels,
    data,
  }
}

// ─── Zstd Decompression ─────────────────────────────────────────────────────

let fzstdDecompress: ((compressed: Uint8Array) => Uint8Array) | null = null

async function zstdDecompress(compressed: Uint8Array): Promise<Uint8Array> {
  if (!fzstdDecompress) {
    const fzstd = await import('fzstd')
    fzstdDecompress = fzstd.decompress
  }
  return fzstdDecompress(compressed)
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Byte size of one cubemap face at a given mip level for a block-compressed format. */
function faceByteSize(
  width: number,
  height: number,
  blockW: number,
  blockH: number,
  blockBytes: number
): number {
  return (
    Math.max(1, Math.ceil(width / blockW)) * Math.max(1, Math.ceil(height / blockH)) * blockBytes
  )
}

// ─── Format Detection ────────────────────────────────────────────────────────

/**
 * Determine the compressed texture format suffix for this device.
 * Returns `'bc7'` (Windows/Linux), `'astc'` (macOS/mobile), or `null` if neither.
 */
export function detectCompressedFormatSuffix(device: GPUDevice): 'bc7' | 'astc' | null {
  if (device.features.has('texture-compression-bc')) return 'bc7'
  if (device.features.has('texture-compression-astc')) return 'astc'
  return null
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Load a KTX2 cubemap file and upload it to the GPU.
 * The file must contain BC7 or ASTC 4×4 blocks with optional Zstd supercompression.
 *
 * @param device - WebGPU device
 * @param url - URL to the KTX2 file (Vite-resolved asset URL)
 * @returns The GPU cubemap texture, or null on failure
 */
export async function loadKTX2CubeTexture(
  device: GPUDevice,
  url: string
): Promise<GPUTexture | null> {
  const response = await fetch(url)
  if (!response.ok) {
    logger.error(`[KTX2] Failed to fetch ${url}: ${response.status}`)
    return null
  }
  const buffer = await response.arrayBuffer()
  const { header, levels, data } = parseKTX2(buffer)
  const { vkFormat, pixelWidth, pixelHeight, levelCount, supercompressionScheme } = header

  const fmt = FORMAT_MAP[vkFormat]!

  // For block-compressed formats, mip levels smaller than one block (e.g. 2×2
  // or 1×1 for 4×4 blocks) cannot be uploaded via writeTexture. Clamp the mip
  // count to exclude sub-block levels.
  const minMipDim = Math.max(fmt.blockW, fmt.blockH)
  const usableMipCount = Math.min(
    levelCount,
    Math.floor(Math.log2(Math.max(pixelWidth, pixelHeight) / minMipDim)) + 1
  )

  // Create GPU texture
  const texture = device.createTexture({
    label: 'skybox-ktx2-cube',
    size: { width: pixelWidth, height: pixelHeight, depthOrArrayLayers: 6 },
    format: fmt.gpuFormat,
    mipLevelCount: usableMipCount,
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  })

  for (let mip = 0; mip < usableMipCount; mip++) {
    const level = levels[mip]!
    const mipW = Math.max(1, pixelWidth >> mip)
    const mipH = Math.max(1, pixelHeight >> mip)
    const faceSz = faceByteSize(mipW, mipH, fmt.blockW, fmt.blockH, fmt.blockBytes)

    const rawLevelData = data.subarray(level.byteOffset, level.byteOffset + level.byteLength)
    const levelData =
      supercompressionScheme === SUPERCOMPRESSION_ZSTD
        ? await zstdDecompress(rawLevelData)
        : rawLevelData

    const blocksWide = Math.max(1, Math.ceil(mipW / fmt.blockW))
    const blocksHigh = Math.max(1, Math.ceil(mipH / fmt.blockH))

    for (let face = 0; face < 6; face++) {
      const offset = face * faceSz
      if (offset + faceSz > levelData.byteLength) break
      device.queue.writeTexture(
        { texture, origin: { x: 0, y: 0, z: face }, mipLevel: mip },
        levelData as Uint8Array<ArrayBuffer>,
        { offset, bytesPerRow: blocksWide * fmt.blockBytes, rowsPerImage: blocksHigh },
        { width: mipW, height: mipH, depthOrArrayLayers: 1 }
      )
    }
  }

  logger.log(
    `[KTX2] Cubemap loaded: ${pixelWidth}×${pixelHeight}, ${levelCount} mips, ${fmt.gpuFormat}`
  )
  return texture
}
