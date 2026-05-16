/**
 * Schrödinger renderer pipeline creation and GPU resource management.
 *
 * Extracted from WebGPUSchrodingerRenderer to keep files under 500 lines.
 * Contains pipeline caching, async compilation, bind group setup, and
 * bounding geometry creation.
 *
 * @module rendering/webgpu/renderers/schrodingerPipeline
 */

import { logger } from '@/lib/logger'

import { DensityGridComputePass } from '../passes/DensityGridComputePass'
import { EigenfunctionCacheComputePass } from '../passes/EigenfunctionCacheComputePass'
import {
  composeSchroedingerShader,
  composeSchroedingerVertexShader,
  composeSchroedingerVertexShader2D,
  type SchroedingerWGSLShaderConfig,
} from '../shaders/schroedinger/compose'
import { LIGHTING_UNIFORMS_SIZE } from '../utils/lighting'
import { BASIS_UNIFORMS_SIZE } from './basisLayout'
import { CAMERA_UNIFORMS_SIZE } from './cameraLayout'
import { MATERIAL_UNIFORMS_SIZE } from './materialLayout'
import { computePipelineCacheKey, isComputeQuantumMode } from './rendererConfigUtils'
import {
  type SchrodingerRendererConfig,
  SCHROEDINGER_UNIFORM_SIZE,
} from './schrodingerRendererTypes'
import type { ModeSetupResult } from './strategies/types'

// ---------------------------------------------------------------------------
// Pipeline cache (replaces static class properties)
// ---------------------------------------------------------------------------

const pipelineCache = new Map<string, GPURenderPipeline>()
const MAX_CACHE_SIZE = 16

/** Clear the render pipeline cache (e.g. on device loss). */
export function clearSchrodingerPipelineCache(): void {
  pipelineCache.clear()
}

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

/** All GPU resources created by pipeline setup. */
export interface SchrodingerPipelineResources {
  renderPipeline: GPURenderPipeline
  cameraUniformBuffer: GPUBuffer
  lightingUniformBuffer: GPUBuffer
  materialUniformBuffer: GPUBuffer
  schroedingerUniformBuffer: GPUBuffer
  basisUniformBuffer: GPUBuffer
  cameraBindGroup: GPUBindGroup
  lightingBindGroup: GPUBindGroup
  objectBindGroup: GPUBindGroup
  objectBindGroupLayout: GPUBindGroupLayout
  vertexBuffer: GPUBuffer | null
  indexBuffer: GPUBuffer | null
  indexCount: number
}

/** Base-class helper methods needed during pipeline creation. */
export interface PipelineCreationDeps {
  createShaderModule: (device: GPUDevice, code: string, label: string) => GPUShaderModule
  createUniformBuffer: (device: GPUDevice, size: number, label: string) => GPUBuffer
}

// ---------------------------------------------------------------------------
// Bounding geometry
// ---------------------------------------------------------------------------

/** Bounding cube geometry for volume raymarching. */
export interface BoundingGeometry {
  vertexBuffer: GPUBuffer
  indexBuffer: GPUBuffer
  indexCount: number
}

/**
 * Create a cube for volume raymarching sized to the given bounding radius.
 *
 * @param device - GPU device
 * @param boundingRadius - Half-extent of the cube
 * @returns Vertex buffer, index buffer, and index count
 */
export function createBoundingGeometry(
  device: GPUDevice,
  boundingRadius: number
): BoundingGeometry {
  const halfSize = boundingRadius

  // prettier-ignore
  const vertices = new Float32Array([
    -halfSize, -halfSize,  halfSize,
     halfSize, -halfSize,  halfSize,
     halfSize,  halfSize,  halfSize,
    -halfSize,  halfSize,  halfSize,
    -halfSize, -halfSize, -halfSize,
    -halfSize,  halfSize, -halfSize,
     halfSize,  halfSize, -halfSize,
     halfSize, -halfSize, -halfSize,
    -halfSize,  halfSize, -halfSize,
    -halfSize,  halfSize,  halfSize,
     halfSize,  halfSize,  halfSize,
     halfSize,  halfSize, -halfSize,
    -halfSize, -halfSize, -halfSize,
     halfSize, -halfSize, -halfSize,
     halfSize, -halfSize,  halfSize,
    -halfSize, -halfSize,  halfSize,
     halfSize, -halfSize, -halfSize,
     halfSize,  halfSize, -halfSize,
     halfSize,  halfSize,  halfSize,
     halfSize, -halfSize,  halfSize,
    -halfSize, -halfSize, -halfSize,
    -halfSize, -halfSize,  halfSize,
    -halfSize,  halfSize,  halfSize,
    -halfSize,  halfSize, -halfSize,
  ])

  // prettier-ignore
  const indices = new Uint16Array([
    0,  1,  2,    0,  2,  3,   // Front
    4,  5,  6,    4,  6,  7,   // Back
    8,  9,  10,   8,  10, 11,  // Top
    12, 13, 14,   12, 14, 15,  // Bottom
    16, 17, 18,   16, 18, 19,  // Right
    20, 21, 22,   20, 22, 23,  // Left
  ])

  const vertexBuffer = device.createBuffer({
    label: 'schroedinger-vertices',
    size: vertices.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  })
  device.queue.writeBuffer(vertexBuffer, 0, vertices)

  const indexBuffer = device.createBuffer({
    label: 'schroedinger-indices',
    size: indices.byteLength,
    usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
  })
  device.queue.writeBuffer(indexBuffer, 0, indices)

  return { vertexBuffer, indexBuffer, indexCount: indices.length }
}

// ---------------------------------------------------------------------------
// Pipeline creation
// ---------------------------------------------------------------------------

/**
 * Create or retrieve a cached Schrödinger render pipeline with all GPU resources.
 *
 * On error, clears all pipeline caches to prevent stale entries.
 *
 * @param device - GPU device
 * @param rendererConfig - Renderer configuration
 * @param shaderConfig - Shader specialization config
 * @param modeSetup - Result from the active strategy's setup()
 * @param boundingRadius - Current bounding radius for geometry
 * @param deps - Base-class helper methods
 * @returns All GPU resources needed for rendering
 */
export async function createSchrodingerPipeline(
  device: GPUDevice,
  rendererConfig: SchrodingerRendererConfig,
  shaderConfig: SchroedingerWGSLShaderConfig,
  modeSetup: ModeSetupResult,
  boundingRadius: number,
  deps: PipelineCreationDeps
): Promise<SchrodingerPipelineResources> {
  try {
    return await createSchrodingerPipelineImpl(
      device,
      rendererConfig,
      shaderConfig,
      modeSetup,
      boundingRadius,
      deps
    )
  } catch (err) {
    logger.error('[SchrodingerRenderer] Pipeline creation failed, clearing all caches:', err)
    pipelineCache.clear()
    DensityGridComputePass.clearPipelineCache()
    EigenfunctionCacheComputePass.clearPipelineCache()
    throw err
  }
}

async function createSchrodingerPipelineImpl(
  device: GPUDevice,
  rendererConfig: SchrodingerRendererConfig,
  shaderConfig: SchroedingerWGSLShaderConfig,
  modeSetup: ModeSetupResult,
  boundingRadius: number,
  deps: PipelineCreationDeps
): Promise<SchrodingerPipelineResources> {
  const dim = rendererConfig.dimension ?? 3
  const isComputeMode = isComputeQuantumMode(rendererConfig)
  const pipelineIs2D = !isComputeMode && (dim === 2 || rendererConfig.representation === 'wigner')

  // =====================================================================
  // Phase 3: Render pipeline — check cache or start async compilation
  // =====================================================================

  const cacheKey = computePipelineCacheKey(shaderConfig, rendererConfig)
  const cachedPipeline = pipelineCache.get(cacheKey)

  logger.log(
    `[SchrodingerRenderer] Pipeline ${cachedPipeline ? 'CACHE HIT' : 'CACHE MISS'} dim=${dim} key=${cacheKey}`
  )

  // Always create bind group layouts (cheap, needed for bind groups regardless of cache)
  const cameraBindGroupLayout = device.createBindGroupLayout({
    label: 'schroedinger-camera-bgl',
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        buffer: { type: 'uniform' as const },
      },
    ],
  })

  const combinedBindGroupLayout = device.createBindGroupLayout({
    label: 'schroedinger-combined-bgl',
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' as const } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' as const } },
    ],
  })

  const objectBindGroupLayoutEntries: GPUBindGroupLayoutEntry[] = [
    { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' as const } },
    { binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' as const } },
    ...modeSetup.additionalLayoutEntries,
  ]
  const objectBindGroupLayout = device.createBindGroupLayout({
    label: 'schroedinger-object-bgl',
    entries: objectBindGroupLayoutEntries,
  })

  let renderPipelinePromise: Promise<GPURenderPipeline> | null = null
  let renderPipeline: GPURenderPipeline | null = null

  if (cachedPipeline) {
    renderPipeline = cachedPipeline
    // LRU: move to end of map
    pipelineCache.delete(cacheKey)
    pipelineCache.set(cacheKey, cachedPipeline)
  } else {
    const { wgsl: fragmentShader } = composeSchroedingerShader(shaderConfig)
    const vertexShader = pipelineIs2D
      ? composeSchroedingerVertexShader2D()
      : composeSchroedingerVertexShader()

    const vertexModule = deps.createShaderModule(device, vertexShader, 'schroedinger-vertex')
    const fragmentModule = deps.createShaderModule(device, fragmentShader, 'schroedinger-fragment')

    const pipelineLayout = device.createPipelineLayout({
      label: 'schroedinger-pipeline-layout',
      bindGroupLayouts: [cameraBindGroupLayout, combinedBindGroupLayout, objectBindGroupLayout],
    })

    renderPipelinePromise = device.createRenderPipelineAsync({
      label: 'schroedinger-pipeline',
      layout: pipelineLayout,
      vertex: {
        module: vertexModule,
        entryPoint: 'main',
        buffers: pipelineIs2D
          ? []
          : [
              {
                arrayStride: 12,
                attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' as const }],
              },
            ],
      },
      fragment: {
        module: fragmentModule,
        entryPoint: 'fragmentMain',
        targets: pipelineIs2D
          ? [
              {
                format: 'rgba16float' as GPUTextureFormat,
                blend: {
                  color: {
                    srcFactor: 'src-alpha' as const,
                    dstFactor: 'one-minus-src-alpha' as const,
                    operation: 'add' as const,
                  },
                  alpha: {
                    srcFactor: 'one' as const,
                    dstFactor: 'one-minus-src-alpha' as const,
                    operation: 'add' as const,
                  },
                },
              },
            ]
          : rendererConfig.temporal
            ? [
                {
                  format: 'rgba16float' as GPUTextureFormat,
                  ...(rendererConfig.isosurface
                    ? {}
                    : {
                        blend: {
                          color: {
                            srcFactor: 'src-alpha' as const,
                            dstFactor: 'one-minus-src-alpha' as const,
                            operation: 'add' as const,
                          },
                          alpha: {
                            srcFactor: 'one' as const,
                            dstFactor: 'one-minus-src-alpha' as const,
                            operation: 'add' as const,
                          },
                        },
                      }),
                },
                {
                  format: 'rgba32float' as GPUTextureFormat,
                },
              ]
            : rendererConfig.isosurface
              ? [{ format: 'rgba16float' as GPUTextureFormat }]
              : [
                  {
                    format: 'rgba16float' as GPUTextureFormat,
                    blend: {
                      color: {
                        srcFactor: 'src-alpha' as const,
                        dstFactor: 'one-minus-src-alpha' as const,
                        operation: 'add' as const,
                      },
                      alpha: {
                        srcFactor: 'one' as const,
                        dstFactor: 'one-minus-src-alpha' as const,
                        operation: 'add' as const,
                      },
                    },
                  },
                ],
      },
      primitive: {
        topology: 'triangle-list' as const,
        cullMode: pipelineIs2D ? ('none' as const) : ('front' as const),
      },
    })
  }

  // =====================================================================
  // Phase 4: Wait for all pending compilations in parallel
  // =====================================================================

  const pendingWork: Promise<void>[] = [...modeSetup.initPromises]

  if (renderPipelinePromise) {
    pendingWork.push(
      renderPipelinePromise.then((pipeline) => {
        renderPipeline = pipeline
        if (pipelineCache.size >= MAX_CACHE_SIZE) {
          const oldest = pipelineCache.keys().next().value!
          pipelineCache.delete(oldest)
        }
        pipelineCache.set(cacheKey, pipeline)
      })
    )
  }

  if (pendingWork.length > 0) {
    await Promise.all(pendingWork)
  }

  if (!renderPipeline) {
    throw new Error(
      `[SchrodingerRenderer] Render pipeline is null after Phase 4 (dim=${dim}, cacheHit=${!!cachedPipeline})`
    )
  }

  logger.log(`[SchrodingerRenderer] Phase 4 complete: pipeline=${!!renderPipeline}`)

  // =====================================================================
  // Phase 5: Create uniform buffers, bind groups, geometry
  // =====================================================================

  const cameraUniformBuffer = deps.createUniformBuffer(
    device,
    CAMERA_UNIFORMS_SIZE,
    'schroedinger-camera'
  )
  const lightingUniformBuffer = deps.createUniformBuffer(
    device,
    LIGHTING_UNIFORMS_SIZE,
    'schroedinger-lighting'
  )
  const materialUniformBuffer = deps.createUniformBuffer(
    device,
    MATERIAL_UNIFORMS_SIZE,
    'schroedinger-material'
  )
  const schroedingerUniformBuffer = deps.createUniformBuffer(
    device,
    SCHROEDINGER_UNIFORM_SIZE,
    'schroedinger-uniforms'
  )
  const basisUniformBuffer = deps.createUniformBuffer(
    device,
    BASIS_UNIFORMS_SIZE,
    'schroedinger-basis'
  )

  const cameraBindGroup = device.createBindGroup({
    label: 'schroedinger-camera-bg',
    layout: cameraBindGroupLayout,
    entries: [{ binding: 0, resource: { buffer: cameraUniformBuffer } }],
  })

  const lightingBindGroup = device.createBindGroup({
    label: 'schroedinger-combined-bg',
    layout: combinedBindGroupLayout,
    entries: [
      { binding: 0, resource: { buffer: lightingUniformBuffer } },
      { binding: 1, resource: { buffer: materialUniformBuffer } },
    ],
  })

  const objectBindGroup = device.createBindGroup({
    label: 'schroedinger-object-bg',
    layout: objectBindGroupLayout,
    entries: [
      { binding: 0, resource: { buffer: schroedingerUniformBuffer } },
      { binding: 1, resource: { buffer: basisUniformBuffer } },
      ...modeSetup.getBindGroupEntries(),
    ],
  })

  // Create bounding geometry — not needed for 2D fullscreen triangle
  let vertexBuffer: GPUBuffer | null = null
  let indexBuffer: GPUBuffer | null = null
  let indexCount = 0

  if (!pipelineIs2D) {
    const geometry = createBoundingGeometry(device, boundingRadius)
    vertexBuffer = geometry.vertexBuffer
    indexBuffer = geometry.indexBuffer
    indexCount = geometry.indexCount
  }

  return {
    renderPipeline,
    cameraUniformBuffer,
    lightingUniformBuffer,
    materialUniformBuffer,
    schroedingerUniformBuffer,
    basisUniformBuffer,
    cameraBindGroup,
    lightingBindGroup,
    objectBindGroup,
    objectBindGroupLayout,
    vertexBuffer,
    indexBuffer,
    indexCount,
  }
}
