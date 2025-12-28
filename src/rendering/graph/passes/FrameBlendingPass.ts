/**
 * Frame Blending Pass
 *
 * Blends current frame with previous frame for smoother motion at low frame rates.
 * Uses an internal ping-pong buffer to store frame history.
 *
 * @module rendering/graph/passes/FrameBlendingPass
 */

import * as THREE from 'three';

import { BasePass } from '../BasePass';
import type { RenderContext, RenderPassConfig } from '../types';
import { frameBlendingFragmentShader } from '@/rendering/shaders/postprocessing/frameBlending.glsl';

/**
 * Default vertex shader for fullscreen quad.
 * Uses direct NDC coordinates for PlaneGeometry(2, 2).
 */
const FULLSCREEN_VERTEX_SHADER = /* glsl */ `
out vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

/**
 * Configuration for FrameBlendingPass.
 */
export interface FrameBlendingPassConfig extends Omit<RenderPassConfig, 'inputs' | 'outputs'> {
  /** Input color resource (current frame) */
  colorInput: string;
  /** Output resource (blended frame) */
  outputResource: string;
  /** Blend factor (0 = current only, 1 = previous only) */
  blendFactor?: number;
}

/**
 * Frame blending pass for temporal smoothing.
 *
 * Maintains an internal history buffer and blends the current frame
 * with the previous frame based on the blend factor.
 *
 * @example
 * ```typescript
 * const frameBlendingPass = new FrameBlendingPass({
 *   id: 'frameBlending',
 *   colorInput: 'tonemappedOutput',
 *   outputResource: 'frameBlendingOutput',
 *   blendFactor: 0.3,
 * });
 * ```
 */
export class FrameBlendingPass extends BasePass {
  private material: THREE.ShaderMaterial;
  private copyMaterial: THREE.ShaderMaterial;
  private mesh: THREE.Mesh;
  private scene: THREE.Scene;
  private camera: THREE.OrthographicCamera;

  private colorInputId: string;
  private outputId: string;

  // Internal history buffer (ping-pong)
  private historyBuffer: THREE.WebGLRenderTarget | null = null;
  private historyInitialized = false;
  private lastWidth = 0;
  private lastHeight = 0;

  constructor(config: FrameBlendingPassConfig) {
    super({
      id: config.id,
      name: config.name ?? 'Frame Blending Pass',
      inputs: [{ resourceId: config.colorInput, access: 'read' }],
      outputs: [{ resourceId: config.outputResource, access: 'write' }],
      enabled: config.enabled,
      priority: config.priority,
      skipPassthrough: config.skipPassthrough,
    });

    this.colorInputId = config.colorInput;
    this.outputId = config.outputResource;

    // Create blend material
    this.material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: FULLSCREEN_VERTEX_SHADER,
      fragmentShader: frameBlendingFragmentShader,
      uniforms: {
        uCurrentFrame: { value: null },
        uPreviousFrame: { value: null },
        uBlendFactor: { value: config.blendFactor ?? 0.3 },
      },
      depthTest: false,
      depthWrite: false,
    });

    // Create simple copy material for history update
    this.copyMaterial = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: FULLSCREEN_VERTEX_SHADER,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform sampler2D uSource;
        in vec2 vUv;
        layout(location = 0) out vec4 fragColor;
        void main() {
          fragColor = texture(uSource, vUv);
        }
      `,
      uniforms: {
        uSource: { value: null },
      },
      depthTest: false,
      depthWrite: false,
    });

    // Create fullscreen quad
    const geometry = new THREE.PlaneGeometry(2, 2);
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.frustumCulled = false;

    this.scene = new THREE.Scene();
    this.scene.add(this.mesh);

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }

  /**
   * Create or resize the internal history buffer.
   */
  private ensureHistoryBuffer(width: number, height: number): void {
    if (this.historyBuffer && this.lastWidth === width && this.lastHeight === height) {
      return;
    }

    // Dispose old buffer
    if (this.historyBuffer) {
      this.historyBuffer.dispose();
    }

    // Create new buffer matching output size
    this.historyBuffer = new THREE.WebGLRenderTarget(width, height, {
      format: THREE.RGBAFormat,
      type: THREE.HalfFloatType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      generateMipmaps: false,
      depthBuffer: false,
    });

    this.lastWidth = width;
    this.lastHeight = height;
    this.historyInitialized = false;
  }

  execute(ctx: RenderContext): void {
    const { renderer, size } = ctx;

    // Get current frame texture
    const currentTex = ctx.getReadTexture(this.colorInputId);
    const outputTarget = ctx.getWriteTarget(this.outputId);

    if (!currentTex || !outputTarget) {
      return;
    }

    // Ensure history buffer exists at correct size
    this.ensureHistoryBuffer(size.width, size.height);

    if (!this.historyBuffer) {
      return;
    }

    // If first frame, just copy current to output and initialize history
    if (!this.historyInitialized) {
      // Copy current frame to output
      this.copyMaterial.uniforms['uSource']!.value = currentTex;
      this.mesh.material = this.copyMaterial;
      renderer.setRenderTarget(outputTarget);
      renderer.render(this.scene, this.camera);

      // Copy to history for next frame
      renderer.setRenderTarget(this.historyBuffer);
      renderer.render(this.scene, this.camera);

      renderer.setRenderTarget(null);
      this.mesh.material = this.material;
      this.historyInitialized = true;
      return;
    }

    // Blend current with previous
    this.material.uniforms['uCurrentFrame']!.value = currentTex;
    this.material.uniforms['uPreviousFrame']!.value = this.historyBuffer.texture;
    this.mesh.material = this.material;

    // Render blended result to output
    renderer.setRenderTarget(outputTarget);
    renderer.render(this.scene, this.camera);

    // Copy blended result to history for next frame
    this.copyMaterial.uniforms['uSource']!.value = outputTarget.texture;
    this.mesh.material = this.copyMaterial;
    renderer.setRenderTarget(this.historyBuffer);
    renderer.render(this.scene, this.camera);

    renderer.setRenderTarget(null);
    this.mesh.material = this.material;
  }

  /**
   * Set blend factor.
   * @param value Blend factor (0 = current only, 1 = previous only)
   */
  setBlendFactor(value: number): void {
    this.material.uniforms['uBlendFactor']!.value = value;
  }

  /**
   * Reset history buffer (e.g., on camera teleport or scene change).
   */
  resetHistory(): void {
    this.historyInitialized = false;
  }

  /**
   * Check if pass was previously enabled (for detecting re-enable).
   * Call this to reset history when the pass is re-enabled after being disabled.
   */
  onEnabled(): void {
    // Reset history when pass is re-enabled to avoid stale frame blending
    this.historyInitialized = false;
  }

  dispose(): void {
    this.material.dispose();
    this.copyMaterial.dispose();
    this.mesh.geometry.dispose();
    if (this.historyBuffer) {
      this.historyBuffer.dispose();
      this.historyBuffer = null;
    }
    this.scene.remove(this.mesh);
  }
}
