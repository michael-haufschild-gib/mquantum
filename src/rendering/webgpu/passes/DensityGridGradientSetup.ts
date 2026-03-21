/**
 * Gradient normal pipeline setup for DensityGridComputePass.
 *
 * Extracted to keep the main pass file under the 600-line max-lines limit.
 * Creates the compute pipeline that reads the density grid and writes
 * per-voxel gradient normals to an rgba8snorm texture.
 */

import { gradientGridComputeShader } from '../shaders/schroedinger/compute/gradientGrid.wgsl'

/** Result of creating the gradient normal pipeline */
export interface GradientPipelineResult {
  pipeline: GPUComputePipeline
  bindGroup: GPUBindGroup
}

/**
 * Creates the gradient normal compute pipeline and bind group.
 *
 * Reads the density grid texture, computes central-difference gradient,
 * and writes normalized normals to the normal grid texture. Eliminates
 * 6 texture fetches per visible sample in the fragment shader.
 *
 * @param device - GPU device
 * @param densityTextureView - 3D density grid texture view (read)
 * @param normalTextureView - 3D normal grid texture view (write)
 * @param densityTextureFormat - Format of the density texture
 * @param gridSize - Grid resolution per axis
 * @returns Pipeline and bind group for gradient dispatch
 */
export async function createGradientPipeline(
  device: GPUDevice,
  densityTextureView: GPUTextureView,
  normalTextureView: GPUTextureView,
  densityTextureFormat: string,
  gridSize: number
): Promise<GradientPipelineResult> {
  const hasLogDensity = densityTextureFormat === 'rgba16float'
  const isDualChannel = false // analytic modes are never dual-channel

  const gradientModule = device.createShaderModule({
    label: 'gradient-grid-compute-shader',
    code: gradientGridComputeShader,
  })

  const gradientBGL = device.createBindGroupLayout({
    label: 'gradient-grid-bgl',
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.COMPUTE,
        texture: { sampleType: 'unfilterable-float', viewDimension: '3d' },
      },
      {
        binding: 1,
        visibility: GPUShaderStage.COMPUTE,
        storageTexture: { access: 'write-only', format: 'rgba8snorm', viewDimension: '3d' },
      },
    ],
  })

  const bindGroup = device.createBindGroup({
    label: 'gradient-grid-bg',
    layout: gradientBGL,
    entries: [
      { binding: 0, resource: densityTextureView },
      { binding: 1, resource: normalTextureView },
    ],
  })

  const pipeline = await device.createComputePipelineAsync({
    label: 'gradient-grid-pipeline',
    layout: device.createPipelineLayout({ bindGroupLayouts: [gradientBGL] }),
    compute: {
      module: gradientModule,
      entryPoint: 'main',
      constants: {
        GRID_SIZE: gridSize,
        HAS_LOG_DENSITY: hasLogDensity ? 1 : 0,
        IS_DUAL_CHANNEL_GRID: isDualChannel ? 1 : 0,
      } as Record<string, number>,
    },
  })

  return { pipeline, bindGroup }
}
