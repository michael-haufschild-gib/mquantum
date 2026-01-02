/**
 * SMAA Pass
 *
 * Render graph pass for Subpixel Morphological Anti-Aliasing.
 * Provides high-quality edge smoothing.
 *
 * @module rendering/graph/passes/SMAAPass
 */

import * as THREE from 'three';
import { SMAAPass as ThreeSMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';

import { BasePass } from '../BasePass';
import type { RenderContext, RenderPassConfig } from '../types';

/**
 * Configuration for SMAAPass.
 */
export interface SMAAPassConfig extends Omit<RenderPassConfig, 'inputs' | 'outputs'> {
  /** Input color resource */
  colorInput: string;
  /** Output resource */
  outputResource: string;
}

/**
 * Subpixel Morphological Anti-Aliasing pass.
 *
 * Wraps Three.js SMAAPass for use in render graph.
 *
 * @example
 * ```typescript
 * const smaaPass = new SMAAPass({
 *   id: 'smaa',
 *   colorInput: 'sceneColor',
 *   outputResource: 'antialiasedOutput',
 * });
 * ```
 */
export class SMAAPass extends BasePass {
  private smaaPass: ThreeSMAAPass | null = null;
  private copyMaterial: THREE.ShaderMaterial;
  private copyMesh: THREE.Mesh;
  private copyScene: THREE.Scene;
  private copyCamera: THREE.OrthographicCamera;

  private colorInputId: string;
  private outputId: string;

  private lastWidth = 0;
  private lastHeight = 0;

  // Only need readTarget - we render SMAA directly to outputTarget to avoid redundant copy
  private readTarget: THREE.WebGLRenderTarget | null = null;

  constructor(config: SMAAPassConfig) {
    super({
      id: config.id,
      name: config.name ?? 'SMAA Pass',
      inputs: [{ resourceId: config.colorInput, access: 'read' }],
      outputs: [{ resourceId: config.outputResource, access: 'write' }],
      enabled: config.enabled,
      priority: config.priority,
      skipPassthrough: config.skipPassthrough,
    });

    this.colorInputId = config.colorInput;
    this.outputId = config.outputResource;

    // Create copy material for texture transfer
    this.copyMaterial = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: { tDiffuse: { value: null } },
      vertexShader: `
        out vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: `
        precision highp float;
        in vec2 vUv;
        uniform sampler2D tDiffuse;
        layout(location = 0) out vec4 fragColor;
        void main() {
          fragColor = texture(tDiffuse, vUv);
        }
      `,
      depthTest: false,
      depthWrite: false,
    });

    const geometry = new THREE.PlaneGeometry(2, 2);
    this.copyMesh = new THREE.Mesh(geometry, this.copyMaterial);
    this.copyMesh.frustumCulled = false;

    this.copyScene = new THREE.Scene();
    this.copyScene.add(this.copyMesh);

    this.copyCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }

  private ensureInitialized(width: number, height: number): void {
    if (!this.smaaPass || width !== this.lastWidth || height !== this.lastHeight) {
      this.smaaPass?.dispose?.();
      this.readTarget?.dispose();

      // Create SMAA pass (r181+ takes no constructor args)
      this.smaaPass = new ThreeSMAAPass();

      // Create read target for SMAA input
      // Note: We render SMAA output directly to the graph's outputTarget to avoid
      // a redundant copy pass, saving ~1-1.5ms GPU time per frame.
      this.readTarget = new THREE.WebGLRenderTarget(width, height, {
        format: THREE.RGBAFormat,
        type: THREE.UnsignedByteType,
      });

      this.lastWidth = width;
      this.lastHeight = height;
    }
  }

  execute(ctx: RenderContext): void {
    const { renderer, size } = ctx;

    if (size.width < 1 || size.height < 1) {
      return;
    }

    this.ensureInitialized(size.width, size.height);

    if (!this.smaaPass || !this.readTarget) {
      return;
    }

    // Get textures
    const colorTex = ctx.getReadTexture(this.colorInputId);
    const outputTarget = ctx.getWriteTarget(this.outputId);

    if (!colorTex || !outputTarget) {
      return;
    }

    // Copy input to read target (required because SMAA needs a render target as input)
    this.copyMaterial.uniforms['tDiffuse']!.value = colorTex;
    renderer.setRenderTarget(this.readTarget);
    renderer.render(this.copyScene, this.copyCamera);

    // Run SMAA directly to outputTarget (eliminates redundant copy)
    // Both targets use identical formats (RGBA, UnsignedByteType), so this is safe.
    this.smaaPass.render(renderer, outputTarget, this.readTarget, 0, false);

    renderer.setRenderTarget(null);
  }

  /**
   * Release internal GPU resources when pass is disabled.
   *
   * Called by RenderGraph when this pass has been disabled for the grace period.
   * Disposes of render targets and the SMAAPass (which has internal textures),
   * but keeps materials and geometry to avoid shader recompilation on re-enable.
   */
  releaseInternalResources(): void {
    // Dispose SMAAPass (has internal textures for edge/blend)
    this.smaaPass?.dispose?.();
    this.smaaPass = null;

    // Dispose our read target
    this.readTarget?.dispose();
    this.readTarget = null;

    // Reset size tracking to trigger reallocation on next execute()
    this.lastWidth = 0;
    this.lastHeight = 0;

    // Keep copyMaterial, copyMesh, copyScene, copyCamera - they're cheap
    // and keeping them avoids shader recompilation on re-enable
  }

  dispose(): void {
    this.smaaPass?.dispose?.();
    this.smaaPass = null;
    this.readTarget?.dispose();
    this.readTarget = null;
    this.copyMaterial.dispose();
    this.copyMesh.geometry.dispose();
    // Remove mesh from scene to ensure proper cleanup
    this.copyScene.remove(this.copyMesh);
  }
}
