/**
 * Shared utilities and constants for split-operator compute passes
 * (TDSE, Dirac, Pauli).
 */

/** 1D dispatch workgroup size — must match @workgroup_size in 1D compute shaders */
export const LINEAR_WG = 64

/**
 * Maximum workgroups per dimension (WebGPU spec minimum guaranteed limit).
 * All dispatches must stay within this bound.
 */
export const MAX_DISPATCH_PER_DIM = 65535

/**
 * Maximum total lattice sites that can be dispatched with a single linear dispatch.
 * Exceeding this causes a GPU validation error.
 */
export const MAX_LINEAR_DISPATCH_SITES = MAX_DISPATCH_PER_DIM * LINEAR_WG

/** 3D dispatch workgroup size for write-grid passes */
export const GRID_WG = 4

/** Density grid texture resolution */
export const DENSITY_GRID_SIZE = 96

/** Maximum supported dimensions */
export const MAX_DIM = 12

/** FFTStageUniforms struct size (32 bytes) */
export const FFT_UNIFORM_SIZE = 32

/** PackUniforms struct size (16 bytes) */
export const PACK_UNIFORM_SIZE = 16

/** Run diagnostics every N frames to minimize GPU overhead */
export const DIAG_DECIMATION = 5

/**
 * Snap a value to the nearest power of 2 (minimum 2, maximum 128) for FFT compatibility.
 * @param v - Input value
 * @returns Nearest power of 2 in [2, 128]
 */
export function nearestPow2(v: number): number {
  const p = Math.max(2, 2 ** Math.round(Math.log2(Math.max(1, v))))
  return Math.min(128, p)
}

/**
 * Reduce grid dimensions until total sites fit within the GPU dispatch limit.
 * Halves the largest axis repeatedly until the product is within bounds.
 *
 * @param grid - Per-axis grid sizes (power-of-2 values)
 * @param maxSites - Maximum allowed total sites (defaults to MAX_LINEAR_DISPATCH_SITES)
 * @returns Grid sizes reduced to fit within the dispatch limit
 */
export function reduceGridToFit(grid: number[], maxSites = MAX_LINEAR_DISPATCH_SITES): number[] {
  const result = [...grid]
  while (result.reduce((a, b) => a * b, 1) > maxSites) {
    let maxIdx = 0
    for (let i = 1; i < result.length; i++) {
      if (result[i]! > result[maxIdx]!) maxIdx = i
    }
    if (result[maxIdx]! <= 2) break
    result[maxIdx] = result[maxIdx]! / 2
  }
  return result
}

/**
 * Compute row-major strides for an N-dimensional grid.
 * @param gridSize - Array of grid dimensions
 * @returns Array of strides (one per dimension)
 */
export function computeStrides(gridSize: number[]): number[] {
  const dim = gridSize.length
  const strides = new Array<number>(dim)
  strides[dim - 1] = 1
  for (let d = dim - 2; d >= 0; d--) {
    strides[d] = strides[d + 1]! * gridSize[d + 1]!
  }
  return strides
}

/**
 * Create a 3D density grid texture for volume visualization.
 * @param device - WebGPU device
 * @param label - Texture label prefix
 * @returns GPUTexture with rgba16float format, sized DENSITY_GRID_SIZE^3
 */
export function createDensityTexture(device: GPUDevice, label: string): GPUTexture {
  return device.createTexture({
    label: `${label}-density-grid`,
    size: [DENSITY_GRID_SIZE, DENSITY_GRID_SIZE, DENSITY_GRID_SIZE],
    format: 'rgba16float',
    dimension: '3d',
    usage:
      GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC,
  })
}

/**
 * Create paired FFT scratch buffers for split-operator methods.
 * @param device - WebGPU device
 * @param totalSites - Total number of lattice sites
 * @param label - Buffer label prefix
 * @returns Tuple of [scratchA, scratchB]
 */
export function createFFTScratchBuffers(
  device: GPUDevice,
  totalSites: number,
  label: string
): [GPUBuffer, GPUBuffer] {
  const size = totalSites * 8 // 2 × f32 per site (complex)
  const usage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST
  return [
    device.createBuffer({ label: `${label}-fft-scratch-a`, size, usage }),
    device.createBuffer({ label: `${label}-fft-scratch-b`, size, usage }),
  ]
}

/**
 * Create diagnostic result + staging buffers for GPU readback.
 * @param device - WebGPU device
 * @param resultCount - Number of f32 values in the result
 * @param label - Buffer label prefix
 * @returns Tuple of [resultBuffer, stagingBuffer]
 */
export function createDiagnosticBuffers(
  device: GPUDevice,
  resultCount: number,
  label: string
): [GPUBuffer, GPUBuffer] {
  const size = resultCount * 4
  return [
    device.createBuffer({
      label: `${label}-diag-result`,
      size,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    }),
    device.createBuffer({
      label: `${label}-diag-staging`,
      size,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    }),
  ]
}
