/**
 * WebGPU Light Gizmo Render Pass
 *
 * Renders light position indicators, direction arrows, and spot cones
 * into a transparent debug texture. The DebugOverlayPass composites this
 * onto the canvas after all post-processing.
 *
 * Visual elements per light type (matching the original Three.js gizmos):
 * - Point: wireframe icosahedron
 * - Directional: wireframe octahedron + yellow direction arrow
 * - Spot: wireframe sphere apex + wireframe cone
 * - Selected: green billboard selection ring
 *
 * @module rendering/webgpu/passes/LightGizmoPass
 */

import { WebGPUBasePass } from '../core/WebGPUBasePass'
import type { WebGPUSetupContext, WebGPURenderContext } from '../core/types'
import { rotationToDirection } from '@/rendering/lights/types'
import type { LightSource, TransformMode } from '@/rendering/lights/types'
import {
  generateIcosahedronWireframe,
  generateOctahedronWireframe,
  generateArrow,
  generateConeWireframe,
  generateSphereWireframe,
  generateSelectionRing,
  generateDashedLine,
  generateGroundEllipse,
  generateGroundCircle,
  generateGroundTarget,
  generateTranslateGizmo,
  generateRotateGizmo,
  calculateGroundIntersection,
  calculateSphereGroundIntersection,
  transformAndAppend,
  transformBillboardAndAppend,
} from './gizmoGeometry'

// ==========================================================================
// Constants
// ==========================================================================

/** Base gizmo size (matches Three.js BASE_GIZMO_SIZE) */
const BASE_GIZMO_SIZE = 0.3

/** Minimum camera-distance scale */
const MIN_SCALE = 0.1

/** Maximum camera-distance scale */
const MAX_SCALE = 2.0

/** Maximum vertex buffer size in bytes (ground vis + transform gizmo need more) */
const MAX_VERTEX_BUFFER_BYTES = 262144

/** Floats per vertex: x, y, z, r, g, b, a */
const VERTEX_STRIDE = 7

/** Bytes per vertex */
const VERTEX_STRIDE_BYTES = VERTEX_STRIDE * 4

/** Directional light arrow color when enabled */
const ARROW_COLOR_ENABLED = '#ffff00'

/** Directional light arrow color when disabled */
const ARROW_COLOR_DISABLED = '#666666'

// ==========================================================================
// WGSL Shaders
// ==========================================================================

const GIZMO_VERTEX_SHADER = /* wgsl */ `
struct Uniforms {
  viewProjectionMatrix: mat4x4f,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;

struct VertexInput {
  @location(0) position: vec3f,
  @location(1) color: vec4f,
}

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) color: vec4f,
}

@vertex
fn main(input: VertexInput) -> VertexOutput {
  var output: VertexOutput;
  output.position = uniforms.viewProjectionMatrix * vec4f(input.position, 1.0);
  output.color = input.color;
  return output;
}
`

const GIZMO_FRAGMENT_SHADER = /* wgsl */ `
struct FragInput {
  @location(0) color: vec4f,
}

@fragment
fn main(input: FragInput) -> @location(0) vec4f {
  if (input.color.a < 0.001) {
    discard;
  }
  return input.color;
}
`

// ==========================================================================
// Pre-generated geometry templates (reused each frame)
// ==========================================================================

const selectionRingTemplate = generateSelectionRing()
const translateGizmoTemplate = generateTranslateGizmo()
const rotateGizmoTemplate = generateRotateGizmo()

// ==========================================================================
// Helpers
// ==========================================================================

/**
 * Compute quaternion that rotates default direction (0, -1, 0) to target direction.
 * @param dx - Target direction x
 * @param dy - Target direction y
 * @param dz - Target direction z
 * @returns Quaternion [x, y, z, w]
 */
function quaternionFromDefaultToDirection(
  dx: number,
  dy: number,
  dz: number
): [number, number, number, number] {
  // from = (0, -1, 0), to = (dx, dy, dz)
  // cross(from, to) = (-1*dz - 0, 0*dx - 0*dz, 0*dy - (-1)*dx) = (-dz, 0, dx)
  // dot(from, to) = -dy
  const crossX = -dz
  const crossY = 0
  const crossZ = dx
  const dot = -dy

  let qx = crossX
  let qy = crossY
  let qz = crossZ
  let qw = 1 + dot

  // Handle 180-degree case (direction is exactly (0, 1, 0))
  if (qw < 0.0001) {
    // Use orthogonal axis (1, 0, 0)
    qx = 1
    qy = 0
    qz = 0
    qw = 0
  }

  // Normalize
  const len = Math.sqrt(qx * qx + qy * qy + qz * qz + qw * qw)
  if (len > 0.0001) {
    qx /= len
    qy /= len
    qz /= len
    qw /= len
  }

  return [qx, qy, qz, qw]
}

/**
 * Compute camera-distance-based scale factor.
 * Matches the original Three.js formula: clamp(distance * 0.1, MIN, MAX) * BASE_SIZE.
 */
function computeGizmoScale(
  lightPos: [number, number, number],
  camPos: [number, number, number]
): number {
  const dx = lightPos[0] - camPos[0]
  const dy = lightPos[1] - camPos[1]
  const dz = lightPos[2] - camPos[2]
  const distance = Math.sqrt(dx * dx + dy * dy + dz * dz)
  return Math.max(MIN_SCALE, Math.min(MAX_SCALE, distance * 0.1)) * BASE_GIZMO_SIZE
}

/**
 * Extract camera right and up vectors from the inverse view matrix.
 * @param invViewElements - 16-element column-major inverse view matrix
 * @returns [right, up] vectors
 */
function extractCameraBasis(
  invViewElements: number[] | Float32Array
): [[number, number, number], [number, number, number]] {
  // Column-major: column 0 = right, column 1 = up
  return [
    [invViewElements[0]!, invViewElements[1]!, invViewElements[2]!],
    [invViewElements[4]!, invViewElements[5]!, invViewElements[6]!],
  ]
}

// ==========================================================================
// LightGizmoPass
// ==========================================================================

/**
 * Configuration for LightGizmoPass.
 */
export interface LightGizmoPassConfig {
  /** Resource ID for the output gizmo texture. */
  outputResource: string
}

/**
 * WebGPU render pass that draws light gizmos into a debug texture.
 *
 * @example
 * ```typescript
 * const gizmoPass = new LightGizmoPass({ outputResource: 'gizmo-texture' })
 * await graph.addPass(gizmoPass)
 * ```
 */
export class LightGizmoPass extends WebGPUBasePass {
  private passConfig: LightGizmoPassConfig

  // GPU resources
  private renderPipeline: GPURenderPipeline | null = null
  private uniformBuffer: GPUBuffer | null = null
  private vertexBuffer: GPUBuffer | null = null
  private gizmoBGL: GPUBindGroupLayout | null = null
  private bindGroup: GPUBindGroup | null = null

  // Frame state
  private vertexCount = 0

  constructor(config: LightGizmoPassConfig) {
    super({
      id: 'lightGizmo',
      priority: 9000, // After all post-processing, before DebugOverlayPass (10000)
      inputs: [],
      outputs: [
        {
          resourceId: config.outputResource,
          access: 'write' as const,
          binding: 0,
        },
      ],
      enabled: (frame) => {
        const lighting = frame?.stores?.['lighting'] as { showLightGizmos?: boolean } | undefined
        return lighting?.showLightGizmos === true
      },
    })

    this.passConfig = config
  }

  /**
   * Create the gizmo rendering pipeline.
   */
  protected async createPipeline(ctx: WebGPUSetupContext): Promise<void> {
    const { device } = ctx

    // Bind group layout: one uniform buffer for VP matrix
    this.gizmoBGL = device.createBindGroupLayout({
      label: 'light-gizmo-bgl',
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX,
          buffer: { type: 'uniform' as const },
        },
      ],
    })

    const pipelineLayout = device.createPipelineLayout({
      label: 'light-gizmo-pipeline-layout',
      bindGroupLayouts: [this.gizmoBGL],
    })
    this.pipelineLayout = pipelineLayout

    // Shader modules
    const vertexModule = this.createShaderModule(device, GIZMO_VERTEX_SHADER, 'light-gizmo-vert')
    const fragmentModule = this.createShaderModule(
      device,
      GIZMO_FRAGMENT_SHADER,
      'light-gizmo-frag'
    )

    // Vertex buffer layout: position (vec3f) + color (vec4f)
    const vertexBufferLayout: GPUVertexBufferLayout = {
      arrayStride: VERTEX_STRIDE_BYTES,
      attributes: [
        { shaderLocation: 0, offset: 0, format: 'float32x3' as const }, // position
        { shaderLocation: 1, offset: 12, format: 'float32x4' as const }, // color
      ],
    }

    // Render pipeline: line-list topology, alpha blending, no depth test
    this.renderPipeline = device.createRenderPipeline({
      label: 'light-gizmo-pipeline',
      layout: pipelineLayout,
      vertex: {
        module: vertexModule,
        entryPoint: 'main',
        buffers: [vertexBufferLayout],
      },
      fragment: {
        module: fragmentModule,
        entryPoint: 'main',
        targets: [
          {
            format: 'rgba8unorm' as const,
            blend: {
              color: {
                srcFactor: 'src-alpha',
                dstFactor: 'one-minus-src-alpha',
                operation: 'add',
              },
              alpha: {
                srcFactor: 'one',
                dstFactor: 'one-minus-src-alpha',
                operation: 'add',
              },
            },
          },
        ],
      },
      primitive: {
        topology: 'line-list',
      },
      // No depth/stencil — gizmos always render on top
    })

    // Uniform buffer: mat4x4f = 64 bytes
    this.uniformBuffer = this.createUniformBuffer(device, 64, 'light-gizmo-uniform')

    // Dynamic vertex buffer
    this.vertexBuffer = device.createBuffer({
      label: 'light-gizmo-vertex',
      size: MAX_VERTEX_BUFFER_BYTES,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    })

    // Bind group
    this.bindGroup = device.createBindGroup({
      label: 'light-gizmo-bg',
      layout: this.gizmoBGL,
      entries: [{ binding: 0, resource: { buffer: this.uniformBuffer } }],
    })
  }

  /**
   * Execute the gizmo render pass.
   */
  execute(ctx: WebGPURenderContext): void {
    if (
      !this.device ||
      !this.renderPipeline ||
      !this.uniformBuffer ||
      !this.vertexBuffer ||
      !this.bindGroup
    ) {
      return
    }

    // ---- Read stores ----
    const lighting = ctx.frame?.stores?.['lighting'] as
      | {
          lights?: LightSource[]
          showLightGizmos?: boolean
          selectedLightId?: string | null
          transformMode?: TransformMode
        }
      | undefined

    if (!lighting?.showLightGizmos || !lighting.lights?.length) return

    const camera = ctx.frame?.stores?.['camera'] as
      | {
          viewProjectionMatrix?: { elements: number[] | Float32Array }
          inverseViewMatrix?: { elements: number[] | Float32Array }
          position?: { x: number; y: number; z: number } | [number, number, number]
        }
      | undefined

    if (!camera?.viewProjectionMatrix?.elements) return

    // ---- Extract camera data ----
    const vpElements = camera.viewProjectionMatrix.elements
    let camPos: [number, number, number]
    if (Array.isArray(camera.position)) {
      camPos = camera.position as [number, number, number]
    } else if (camera.position && 'x' in camera.position) {
      camPos = [camera.position.x, camera.position.y, camera.position.z]
    } else {
      camPos = [0, 3, 8] // fallback
    }

    const invViewElements = camera.inverseViewMatrix?.elements
    let camRight: [number, number, number] = [1, 0, 0]
    let camUp: [number, number, number] = [0, 1, 0]
    if (invViewElements && invViewElements.length >= 8) {
      ;[camRight, camUp] = extractCameraBasis(invViewElements)
    }

    // ---- Generate vertex data for all lights ----
    const allVertices: number[] = []

    for (const light of lighting.lights) {
      const alpha = light.enabled ? 1.0 : 0.3
      const pos = light.position
      const scale = computeGizmoScale(pos, camPos)
      const isSelected = lighting.selectedLightId === light.id

      if (light.type === 'point') {
        // Wireframe icosahedron in light color
        const ico = generateIcosahedronWireframe(light.color, alpha)
        transformAndAppend(ico, allVertices, scale, 0, 0, 0, 1, pos[0], pos[1], pos[2])
      } else if (light.type === 'directional') {
        // Wireframe octahedron in light color
        const oct = generateOctahedronWireframe(light.color, alpha)
        transformAndAppend(oct, allVertices, scale, 0, 0, 0, 1, pos[0], pos[1], pos[2])

        // Direction arrow (yellow when enabled, grey when disabled)
        const arrowColor = light.enabled ? ARROW_COLOR_ENABLED : ARROW_COLOR_DISABLED
        const arrow = generateArrow(arrowColor, alpha)
        const dir = rotationToDirection(light.rotation)
        const [qx, qy, qz, qw] = quaternionFromDefaultToDirection(dir[0], dir[1], dir[2])
        transformAndAppend(arrow, allVertices, scale, qx, qy, qz, qw, pos[0], pos[1], pos[2])
      } else if (light.type === 'spot') {
        // Small sphere at apex
        const sphere = generateSphereWireframe(light.color, alpha)
        transformAndAppend(sphere, allVertices, scale, 0, 0, 0, 1, pos[0], pos[1], pos[2])

        // Wireframe cone showing beam
        const cone = generateConeWireframe(light.coneAngle, light.color, alpha * 0.5)
        const dir = rotationToDirection(light.rotation)
        const [qx, qy, qz, qw] = quaternionFromDefaultToDirection(dir[0], dir[1], dir[2])
        transformAndAppend(cone, allVertices, scale, qx, qy, qz, qw, pos[0], pos[1], pos[2])
      }

      // Selection ring (billboarded)
      if (isSelected) {
        transformBillboardAndAppend(
          selectionRingTemplate,
          allVertices,
          scale,
          camRight,
          camUp,
          pos[0],
          pos[1],
          pos[2]
        )
      }

      // ---- Ground visualizations ----
      const groundColor = light.enabled ? light.color : '#666666'
      const groundAlpha = light.enabled ? 0.6 : 0.3

      if (light.type === 'spot' || light.type === 'directional') {
        const dir = rotationToDirection(light.rotation)
        const groundHit = calculateGroundIntersection(pos, dir)

        if (groundHit) {
          // Dashed ray from light to ground
          const dashVerts = generateDashedLine(
            pos[0], pos[1], pos[2],
            groundHit[0], groundHit[1], groundHit[2],
            groundColor, groundAlpha
          )
          for (let i = 0; i < dashVerts.length; i++) allVertices.push(dashVerts[i]!)

          // Spot: cone ellipse on ground
          if (light.type === 'spot') {
            const ellipseVerts = generateGroundEllipse(
              pos, dir, light.coneAngle, groundHit,
              groundColor, light.enabled ? 0.8 : 0.4
            )
            for (let i = 0; i < ellipseVerts.length; i++) allVertices.push(ellipseVerts[i]!)
          }

          // Draggable ground target
          const targetColor = isSelected ? '#00ff00' : groundColor
          const targetAlpha = isSelected ? 0.7 : 0.5
          const targetVerts = generateGroundTarget(groundHit[0], groundHit[2], targetColor, targetAlpha)
          for (let i = 0; i < targetVerts.length; i++) allVertices.push(targetVerts[i]!)
        }
      } else if (light.type === 'point') {
        const sphereHit = calculateSphereGroundIntersection(pos, light.range)

        if (sphereHit) {
          // Circle outline on ground
          const circleVerts = generateGroundCircle(
            sphereHit.center[0], sphereHit.center[2], sphereHit.radius,
            groundColor, light.enabled ? 0.8 : 0.4
          )
          for (let i = 0; i < circleVerts.length; i++) allVertices.push(circleVerts[i]!)

          // Draggable ground target at center
          const targetColor = isSelected ? '#00ff00' : groundColor
          const targetAlpha = isSelected ? 0.7 : 0.5
          const targetVerts = generateGroundTarget(
            sphereHit.center[0], sphereHit.center[2], targetColor, targetAlpha
          )
          for (let i = 0; i < targetVerts.length; i++) allVertices.push(targetVerts[i]!)
        }
      }
    }

    // ---- Transform gizmo for selected light ----
    const selectedLight = lighting.lights.find((l) => l.id === lighting.selectedLightId)
    if (selectedLight) {
      const selScale = computeGizmoScale(selectedLight.position, camPos)
      const sp = selectedLight.position
      const mode = lighting.transformMode ?? 'translate'

      if (mode === 'translate') {
        transformAndAppend(translateGizmoTemplate, allVertices, selScale, 0, 0, 0, 1, sp[0], sp[1], sp[2])
      } else if (mode === 'rotate') {
        transformAndAppend(rotateGizmoTemplate, allVertices, selScale, 0, 0, 0, 1, sp[0], sp[1], sp[2])
      }
    }

    this.vertexCount = allVertices.length / VERTEX_STRIDE
    if (this.vertexCount === 0) return

    // ---- Upload to GPU ----
    const vertexData = new Float32Array(allVertices)
    const byteSize = vertexData.byteLength
    if (byteSize > MAX_VERTEX_BUFFER_BYTES) {
      // Truncate if somehow too large
      this.vertexCount = Math.floor(MAX_VERTEX_BUFFER_BYTES / VERTEX_STRIDE_BYTES)
    }
    this.device.queue.writeBuffer(this.vertexBuffer, 0, vertexData, 0, this.vertexCount * VERTEX_STRIDE)

    // Upload VP matrix
    const vpData = new Float32Array(16)
    for (let i = 0; i < 16; i++) {
      vpData[i] = (vpElements[i] as number) ?? 0
    }
    this.device.queue.writeBuffer(this.uniformBuffer, 0, vpData)

    // ---- Render ----
    const outputView = ctx.getWriteTarget(this.passConfig.outputResource)
    if (!outputView) return

    const passEncoder = ctx.beginRenderPass({
      label: 'light-gizmo-render',
      colorAttachments: [
        {
          view: outputView,
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
          loadOp: 'clear' as const,
          storeOp: 'store' as const,
        },
      ],
    })

    passEncoder.setPipeline(this.renderPipeline)
    passEncoder.setBindGroup(0, this.bindGroup)
    passEncoder.setVertexBuffer(0, this.vertexBuffer)
    passEncoder.draw(this.vertexCount)
    passEncoder.end()
  }

  /**
   * Dispose GPU resources.
   */
  dispose(): void {
    this.renderPipeline = null
    this.uniformBuffer?.destroy()
    this.uniformBuffer = null
    this.vertexBuffer?.destroy()
    this.vertexBuffer = null
    this.gizmoBGL = null
    this.bindGroup = null

    super.dispose()
  }
}
