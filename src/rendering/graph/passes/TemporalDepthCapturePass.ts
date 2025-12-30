/**
 * Temporal Position Capture Pass
 *
 * Captures gPosition buffer (world position + model-space ray distance) into a
 * temporal buffer for raymarching acceleration. Uses position-based reprojection
 * instead of depth-only to correctly handle camera rotation.
 *
 * Key improvement over depth-only approach:
 * - gPosition.xyz = actual world position (for accurate reprojection)
 * - gPosition.w = model-space ray distance (for direct use in raymarcher)
 *
 * @module rendering/graph/passes/TemporalDepthCapturePass
 */

import { usePerformanceStore } from '@/stores/performanceStore'
import * as THREE from 'three'
import { BasePass } from '../BasePass'
import type { RenderGraph } from '../RenderGraph'
import type { RenderContext, RenderPassConfig } from '../types'

// =============================================================================
// Temporal Depth Uniforms Interface
// =============================================================================

export interface TemporalDepthUniforms {
  /** Previous frame's depth texture (legacy, kept for compatibility) */
  uPrevDepthTexture: THREE.Texture | null
  /** Previous frame's position texture (xyz=world pos, w=model-space ray distance) */
  uPrevPositionTexture: THREE.Texture | null
  /** Previous frame's view-projection matrix */
  uPrevViewProjectionMatrix: THREE.Matrix4
  /** Previous frame's inverse view-projection matrix */
  uPrevInverseViewProjectionMatrix: THREE.Matrix4
  /** Whether temporal reprojection is enabled and valid */
  uTemporalEnabled: boolean
  /** Buffer resolution for UV calculation */
  uDepthBufferResolution: THREE.Vector2
}

// =============================================================================
// Pass Configuration
// =============================================================================

export interface TemporalDepthCapturePassConfig extends Omit<
  RenderPassConfig,
  'inputs' | 'outputs'
> {
  /** Position input resource ID (MRT with gPosition) */
  positionInput: string
  /**
   * Which attachment to read from the position input resource.
   * Should be 2 for gPosition (attachment index in MRT: 0=gColor, 1=gNormal, 2=gPosition)
   */
  positionAttachment: number
  /** Output resource ID (PingPong) */
  outputResource: string
  /** Force capture even when temporal reprojection is disabled */
  forceCapture?: () => boolean
}

// =============================================================================
// Position Copy Shader
// =============================================================================

/**
 * Simple shader to copy position data from MRT to temporal buffer.
 * Just passes through the RGBA data (xyz=world pos, w=model-space distance).
 */
const PositionCopyShader = {
  vertexShader: /* glsl */ `
    out vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position.xy, 0.0, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    precision highp float;

    uniform sampler2D tPosition;

    in vec2 vUv;
    layout(location = 0) out vec4 fragColor;

    void main() {
      // Direct copy of position data (xyz=world pos, w=model-space ray distance)
      fragColor = texture(tPosition, vUv);
    }
  `,
}

// =============================================================================
// Global Registry for Invalidation
// =============================================================================

/** Registry of all active TemporalDepthCapturePass instances for global invalidation */
const instanceRegistry = new Set<TemporalDepthCapturePass>()

/**
 * Invalidate all registered TemporalDepthCapturePass instances.
 * Called when global state changes require resetting temporal data.
 */
export function invalidateAllTemporalDepth(): void {
  instanceRegistry.forEach((instance) => {
    instance.invalidate()
  })
}

// =============================================================================
// Pass Implementation
// =============================================================================

/**
 * Captures gPosition into a temporal buffer for raymarching acceleration.
 *
 * Self-contained state management (like TemporalCloudPass):
 * - Tracks previous frame's camera matrices internally
 * - Exposes getTemporalUniforms() for shader uniform binding
 * - Graph handles ping-pong buffer swap automatically
 *
 * Position-based approach benefits:
 * - Correct reprojection during camera rotation (uses actual world position)
 * - Direct model-space ray distance (no world→local conversion needed)
 * - Matches proven pattern from TemporalCloudPass
 */
export class TemporalDepthCapturePass extends BasePass {
  private positionInputId: string
  private positionAttachment: number
  private outputResourceId: string
  private forceCapture?: () => boolean

  // Rendering resources
  private material: THREE.ShaderMaterial
  private fsQuad: THREE.Mesh
  private fsScene: THREE.Scene
  private fsCamera: THREE.OrthographicCamera

  // Internal state (self-contained like TemporalCloudPass)
  private hasValidHistory = false
  private prevViewProjectionMatrix = new THREE.Matrix4()
  private prevInverseViewProjectionMatrix = new THREE.Matrix4()
  private resolution = new THREE.Vector2(1, 1)

  // Temp matrices to avoid per-frame allocations
  private tempViewProjMatrix = new THREE.Matrix4()

  constructor(config: TemporalDepthCapturePassConfig) {
    super({
      id: config.id,
      name: config.name ?? 'Temporal Position Capture Pass',
      // Include outputResource as input to force Ping-Pong buffering (Read-While-Write pattern)
      inputs: [
        { resourceId: config.positionInput, access: 'read', attachment: config.positionAttachment },
        { resourceId: config.outputResource, access: 'read' },
      ],
      outputs: [{ resourceId: config.outputResource, access: 'write' }],
      enabled: config.enabled,
      priority: config.priority,
      skipPassthrough: config.skipPassthrough,
    })

    this.positionInputId = config.positionInput
    this.positionAttachment = config.positionAttachment
    this.outputResourceId = config.outputResource
    this.forceCapture = config.forceCapture

    this.material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        tPosition: { value: null },
      },
      vertexShader: PositionCopyShader.vertexShader,
      fragmentShader: PositionCopyShader.fragmentShader,
      depthTest: false,
      depthWrite: false,
    })

    const geometry = new THREE.PlaneGeometry(2, 2)
    this.fsQuad = new THREE.Mesh(geometry, this.material)
    this.fsQuad.frustumCulled = false
    this.fsScene = new THREE.Scene()
    this.fsScene.add(this.fsQuad)
    this.fsCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)

    // Register for global invalidation
    instanceRegistry.add(this)
  }

  /**
   * Check if temporal reprojection is enabled in settings.
   */
  isEnabled(): boolean {
    return usePerformanceStore.getState().temporalReprojectionEnabled
  }

  /**
   * Get the output resource ID for this pass.
   * Used by external code to get the texture from the graph.
   */
  getOutputResourceId(): string {
    return this.outputResourceId
  }

  /**
   * Get temporal uniforms for shader binding.
   *
   * The mesh's useFrame calls this BEFORE graph.execute(), which is correct:
   * - Before execute: READ texture = last frame's data, matrices = last frame's matrices
   * - Both are synchronized from the same frame
   *
   * @param graph - RenderGraph instance to get the read texture from
   * @param forceTexture - Force returning texture even if temporal is disabled
   * @returns Uniforms for temporal reprojection shaders
   */
  getTemporalUniforms(graph: RenderGraph, forceTexture = false): TemporalDepthUniforms {
    const enabled = this.isEnabled() && this.hasValidHistory
    const texture = graph.getReadTexture(this.outputResourceId)
    const hasTexture = (enabled || forceTexture) && texture !== null

    return {
      // Legacy depth texture (same as position for backwards compatibility)
      uPrevDepthTexture: hasTexture ? texture : null,
      // New position texture (xyz=world pos, w=model-space ray distance)
      uPrevPositionTexture: hasTexture ? texture : null,
      uPrevViewProjectionMatrix: this.prevViewProjectionMatrix,
      uPrevInverseViewProjectionMatrix: this.prevInverseViewProjectionMatrix,
      uTemporalEnabled: enabled && texture !== null,
      uDepthBufferResolution: this.resolution,
    }
  }

  /**
   * Invalidate temporal data.
   * Call when scene changes drastically (dimension change, object type change, etc.)
   */
  invalidate(): void {
    this.hasValidHistory = false
    this.prevViewProjectionMatrix.identity()
    this.prevInverseViewProjectionMatrix.identity()
  }

  execute(ctx: RenderContext): void {
    const { renderer, camera } = ctx
    const positionTex = ctx.getReadTexture(this.positionInputId, this.positionAttachment)
    const writeTarget = ctx.getWriteTarget(this.outputResourceId)

    if (!positionTex || !writeTarget) {
      return
    }

    const force = this.forceCapture ? this.forceCapture() : false

    // Skip if disabled (unless forced)
    if (!force && !this.isEnabled()) {
      this.hasValidHistory = false
      return
    }

    // Update resolution from source texture
    const image = positionTex.image as { width?: number; height?: number } | undefined
    if (image && image.width !== undefined && image.height !== undefined) {
      this.resolution.set(image.width, image.height)
    }

    // Set position texture for copy
    if (this.material.uniforms['tPosition']) {
      this.material.uniforms['tPosition'].value = positionTex
    }

    // Render position copy
    const savedAutoClear = renderer.autoClear
    try {
      renderer.autoClear = false
      renderer.setRenderTarget(writeTarget)
      renderer.setClearColor(0, 0)
      renderer.clear(true, false, false)
      renderer.render(this.fsScene, this.fsCamera)
    } finally {
      renderer.setRenderTarget(null)
      renderer.autoClear = savedAutoClear
    }

    // Update internal state for next frame
    // Current matrices become previous after this frame
    this.tempViewProjMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
    this.prevViewProjectionMatrix.copy(this.tempViewProjMatrix)
    this.prevInverseViewProjectionMatrix.copy(this.tempViewProjMatrix).invert()

    this.hasValidHistory = true
  }

  dispose(): void {
    this.material.dispose()
    this.fsQuad.geometry.dispose()
    this.fsScene.remove(this.fsQuad)
    instanceRegistry.delete(this)
  }
}
