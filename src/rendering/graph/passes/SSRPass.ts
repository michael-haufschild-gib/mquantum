/**
 * SSR Pass (Screen-Space Reflections)
 *
 * Render graph pass for screen-space reflections.
 * Uses ray marching in screen space to find reflections.
 *
 * OPTIMIZATION: Supports half-resolution rendering with bilateral upsampling
 * for 50-75% performance improvement with minimal visual quality loss.
 *
 * @module rendering/graph/passes/SSRPass
 */

import * as THREE from 'three';

import { BasePass } from '../BasePass';
import type { RenderContext, RenderPassConfig } from '../types';
import { SSRShader, type SSRUniforms } from '@/rendering/shaders/postprocessing/SSRShader';
import {
  BilateralUpsampleShader,
  type BilateralUpsampleUniforms,
} from '@/rendering/shaders/postprocessing/BilateralUpsampleShader';
import {
  getFullscreenQuadGeometry,
  releaseFullscreenQuadGeometry,
} from '@/rendering/core/FullscreenQuad';

/**
 * Configuration for SSRPass.
 */
export interface SSRPassConfig extends Omit<RenderPassConfig, 'inputs' | 'outputs'> {
  /** Scene color input resource */
  colorInput: string;
  /** Normal buffer input resource */
  normalInput: string;
  /** Depth buffer input resource */
  depthInput: string;
  /** Depth input attachment (for depth textures on render targets) */
  depthInputAttachment?: number | 'depth';
  /** Alternate depth input resource (optional) */
  alternateDepthInput?: string;
  /** Alternate depth input attachment */
  alternateDepthInputAttachment?: number | 'depth';
  /** Optional selector for choosing depth input at runtime */
  depthInputSelector?: () => string;
  /** Output resource */
  outputResource: string;

  /** Reflection intensity (0-1) */
  intensity?: number;
  /** Max ray distance */
  maxDistance?: number;
  /** Depth thickness for hit detection */
  thickness?: number;
  /** Fade start distance */
  fadeStart?: number;
  /** Fade end distance */
  fadeEnd?: number;
  /** Max ray march steps */
  maxSteps?: number;
  /**
   * Enable half-resolution rendering with bilateral upsampling.
   * OPTIMIZATION: Reduces SSR cost by 50-75% with minimal quality loss.
   * @default true
   */
  halfResolution?: boolean;
  /**
   * Depth threshold for bilateral upsampling.
   * Lower values = sharper edges but potential artifacts.
   * @default 0.01
   */
  bilateralDepthThreshold?: number;
}

/**
 * Screen-space reflections pass.
 *
 * @example
 * ```typescript
 * const ssrPass = new SSRPass({
 *   id: 'ssr',
 *   colorInput: 'sceneColor',
 *   normalInput: 'normalBuffer',
 *   depthInput: 'sceneDepth',
 *   outputResource: 'ssrOutput',
 *   intensity: 0.8,
 *   maxSteps: 64,
 *   halfResolution: true, // Enable half-res optimization
 * });
 * ```
 */
export class SSRPass extends BasePass {
  private material: THREE.ShaderMaterial;
  private mesh: THREE.Mesh;
  private scene: THREE.Scene;
  private camera: THREE.OrthographicCamera;

  // Copy material for passthrough
  private copyMaterial: THREE.ShaderMaterial;
  private copyMesh: THREE.Mesh;
  private copyScene: THREE.Scene;

  // Half-resolution pipeline
  private useHalfRes: boolean;
  private halfResTarget: THREE.WebGLRenderTarget | null = null;
  private upsampleMaterial: THREE.ShaderMaterial | null = null;
  private upsampleMesh: THREE.Mesh | null = null;
  private upsampleScene: THREE.Scene | null = null;
  private bilateralDepthThreshold: number;

  private colorInputId: string;
  private normalInputId: string;
  private depthInputId: string;
  private depthInputAttachment?: number | 'depth';
  private alternateDepthInputId?: string;
  private alternateDepthInputAttachment?: number | 'depth';
  private depthInputSelector?: () => string;
  private outputId: string;

  constructor(config: SSRPassConfig) {
    const inputs = [
      { resourceId: config.colorInput, access: 'read' as const },
      { resourceId: config.normalInput, access: 'read' as const },
      {
        resourceId: config.depthInput,
        access: 'read' as const,
        attachment: config.depthInputAttachment,
      },
    ];

    if (config.alternateDepthInput && config.alternateDepthInput !== config.depthInput) {
      inputs.push({
        resourceId: config.alternateDepthInput,
        access: 'read' as const,
        attachment: config.alternateDepthInputAttachment,
      });
    }

    super({
      id: config.id,
      name: config.name ?? 'SSR Pass',
      inputs,
      outputs: [{ resourceId: config.outputResource, access: 'write' }],
      enabled: config.enabled,
      priority: config.priority,
      skipPassthrough: config.skipPassthrough,
    });

    this.colorInputId = config.colorInput;
    this.normalInputId = config.normalInput;
    this.depthInputId = config.depthInput;
    this.depthInputAttachment = config.depthInputAttachment;
    this.alternateDepthInputId = config.alternateDepthInput;
    this.alternateDepthInputAttachment = config.alternateDepthInputAttachment;
    this.depthInputSelector = config.depthInputSelector;
    this.outputId = config.outputResource;

    // Create material from SSRShader
    this.material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: SSRShader.vertexShader,
      fragmentShader: SSRShader.fragmentShader,
      uniforms: THREE.UniformsUtils.clone(SSRShader.uniforms as unknown as Record<string, THREE.IUniform>),
      depthTest: false,
      depthWrite: false,
    });

    // Set initial parameters
    const uniforms = this.material.uniforms as unknown as SSRUniforms;
    uniforms.intensity.value = config.intensity ?? 0.8;
    uniforms.maxDistance.value = config.maxDistance ?? 10;
    uniforms.thickness.value = config.thickness ?? 0.5;
    uniforms.fadeStart.value = config.fadeStart ?? 0.3;
    uniforms.fadeEnd.value = config.fadeEnd ?? 0.8;
    uniforms.maxSteps.value = config.maxSteps ?? 64;

    // Create fullscreen quad
    const geometry = new THREE.PlaneGeometry(2, 2);
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.frustumCulled = false;

    this.scene = new THREE.Scene();
    this.scene.add(this.mesh);

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    // Create copy material for passthrough
    this.copyMaterial = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: { tDiffuse: { value: null } },
      vertexShader: /* glsl */ `
        out vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
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
    this.copyMesh = new THREE.Mesh(geometry.clone(), this.copyMaterial);
    this.copyMesh.frustumCulled = false;
    this.copyScene = new THREE.Scene();
    this.copyScene.add(this.copyMesh);

    // Half-resolution pipeline setup
    this.useHalfRes = config.halfResolution ?? true;
    this.bilateralDepthThreshold = config.bilateralDepthThreshold ?? 0.01;

    if (this.useHalfRes) {
      this.initHalfResPipeline();
    }
  }

  /**
   * Initialize the half-resolution rendering pipeline.
   */
  private initHalfResPipeline(): void {
    // Upsample material for bilateral upsampling
    this.upsampleMaterial = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: BilateralUpsampleShader.vertexShader,
      fragmentShader: BilateralUpsampleShader.fragmentShader,
      uniforms: THREE.UniformsUtils.clone(
        BilateralUpsampleShader.uniforms as unknown as Record<string, THREE.IUniform>
      ),
      depthTest: false,
      depthWrite: false,
    });

    const upsampleUniforms = this.upsampleMaterial.uniforms as unknown as BilateralUpsampleUniforms;
    upsampleUniforms.uDepthThreshold.value = this.bilateralDepthThreshold;

    this.upsampleMesh = new THREE.Mesh(getFullscreenQuadGeometry(), this.upsampleMaterial);
    this.upsampleMesh.frustumCulled = false;
    this.upsampleScene = new THREE.Scene();
    this.upsampleScene.add(this.upsampleMesh);
  }

  /**
   * Ensure half-res target matches current size.
   * @param width
   * @param height
   */
  private ensureHalfResTarget(width: number, height: number): void {
    const halfWidth = Math.max(1, Math.floor(width / 2));
    const halfHeight = Math.max(1, Math.floor(height / 2));

    if (
      this.halfResTarget &&
      this.halfResTarget.width === halfWidth &&
      this.halfResTarget.height === halfHeight
    ) {
      return;
    }

    // Dispose old target
    if (this.halfResTarget) {
      this.halfResTarget.dispose();
    }

    // Create new half-res target
    this.halfResTarget = new THREE.WebGLRenderTarget(halfWidth, halfHeight, {
      format: THREE.RGBAFormat,
      type: THREE.HalfFloatType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
    });
  }

  execute(ctx: RenderContext): void {
    const { renderer, camera, size } = ctx;

    // Get textures
    const colorTex = ctx.getReadTexture(this.colorInputId);
    const outputTarget = ctx.getWriteTarget(this.outputId);

    // Passthrough if camera is not perspective or required inputs missing
    if (!(camera instanceof THREE.PerspectiveCamera)) {
      this.copyToOutput(renderer, colorTex, outputTarget);
      return;
    }

    const normalTex = ctx.getReadTexture(this.normalInputId);
    const depthResourceId = this.depthInputSelector ? this.depthInputSelector() : this.depthInputId;
    const depthAttachment =
      depthResourceId === this.depthInputId
        ? this.depthInputAttachment
        : depthResourceId === this.alternateDepthInputId
          ? this.alternateDepthInputAttachment
          : undefined;
    const depthTex = ctx.getReadTexture(depthResourceId, depthAttachment);

    // Passthrough if required inputs missing
    if (!colorTex || !normalTex || !depthTex) {
      this.copyToOutput(renderer, colorTex, outputTarget);
      return;
    }

    // Use half-resolution pipeline if enabled
    if (this.useHalfRes && this.upsampleMaterial && this.upsampleScene) {
      this.executeHalfRes(ctx, colorTex, normalTex, depthTex, camera, outputTarget);
      return;
    }

    // Full-resolution path
    this.executeFullRes(colorTex, normalTex, depthTex, camera, size, renderer, outputTarget);
  }

  /**
   * Execute SSR at full resolution (original behavior).
   * @param colorTex
   * @param normalTex
   * @param depthTex
   * @param camera
   * @param size
   * @param size.width
   * @param size.height
   * @param renderer
   * @param outputTarget
   */
  private executeFullRes(
    colorTex: THREE.Texture,
    normalTex: THREE.Texture,
    depthTex: THREE.Texture,
    camera: THREE.PerspectiveCamera,
    size: { width: number; height: number },
    renderer: THREE.WebGLRenderer,
    outputTarget: THREE.WebGLRenderTarget | null
  ): void {
    const uniforms = this.material.uniforms as unknown as SSRUniforms;
    uniforms.tDiffuse.value = colorTex;
    uniforms.tNormal.value = normalTex;
    uniforms.tDepth.value = depthTex as unknown as THREE.DepthTexture;
    uniforms.resolution.value.set(size.width, size.height);
    uniforms.projMatrix.value.copy(camera.projectionMatrix);
    uniforms.invProjMatrix.value.copy(camera.projectionMatrixInverse);
    uniforms.uViewMat.value.copy(camera.matrixWorldInverse);
    uniforms.nearClip.value = camera.near;
    uniforms.farClip.value = camera.far;
    // Full-res mode: output composited result directly
    uniforms.uOutputMode.value = 0;

    renderer.setRenderTarget(outputTarget);
    renderer.render(this.scene, this.camera);
    renderer.setRenderTarget(null);
  }

  /**
   * Execute SSR at half resolution with bilateral upsampling.
   * OPTIMIZATION: Reduces SSR cost by 50-75% (4x fewer pixels).
   * @param ctx
   * @param colorTex
   * @param normalTex
   * @param depthTex
   * @param camera
   * @param outputTarget
   */
  private executeHalfRes(
    ctx: RenderContext,
    colorTex: THREE.Texture,
    normalTex: THREE.Texture,
    depthTex: THREE.Texture,
    camera: THREE.PerspectiveCamera,
    outputTarget: THREE.WebGLRenderTarget | null
  ): void {
    const { renderer, size } = ctx;

    // Ensure half-res target is correct size
    this.ensureHalfResTarget(size.width, size.height);

    if (!this.halfResTarget || !this.upsampleMaterial || !this.upsampleScene) {
      // Fallback to full-res
      this.executeFullRes(colorTex, normalTex, depthTex, camera, size, renderer, outputTarget);
      return;
    }

    const halfWidth = this.halfResTarget.width;
    const halfHeight = this.halfResTarget.height;

    // Step 1: Render SSR at half resolution
    const uniforms = this.material.uniforms as unknown as SSRUniforms;
    uniforms.tDiffuse.value = colorTex;
    uniforms.tNormal.value = normalTex;
    uniforms.tDepth.value = depthTex as unknown as THREE.DepthTexture;
    uniforms.resolution.value.set(halfWidth, halfHeight);
    uniforms.projMatrix.value.copy(camera.projectionMatrix);
    uniforms.invProjMatrix.value.copy(camera.projectionMatrixInverse);
    uniforms.uViewMat.value.copy(camera.matrixWorldInverse);
    uniforms.nearClip.value = camera.near;
    uniforms.farClip.value = camera.far;
    // Half-res mode: output reflection-only for bilateral upsampling
    uniforms.uOutputMode.value = 1;

    // Set viewport for half-res target (use target.viewport to avoid DPR issues)
    this.halfResTarget.viewport.set(0, 0, halfWidth, halfHeight);
    renderer.setRenderTarget(this.halfResTarget);
    renderer.render(this.scene, this.camera);

    // Step 2: Bilateral upsample to full resolution
    const upsampleUniforms = this.upsampleMaterial.uniforms as unknown as BilateralUpsampleUniforms;
    upsampleUniforms.tInput.value = this.halfResTarget.texture;
    upsampleUniforms.tColor.value = colorTex;
    upsampleUniforms.tDepth.value = depthTex;
    upsampleUniforms.uResolution.value.set(size.width, size.height);
    upsampleUniforms.uNearClip.value = camera.near;
    upsampleUniforms.uFarClip.value = camera.far;

    renderer.setRenderTarget(outputTarget);
    renderer.render(this.upsampleScene, this.camera);
    renderer.setRenderTarget(null);
  }

  /**
   * Set SSR intensity
   * @param value
   */
  setIntensity(value: number): void {
    (this.material.uniforms as unknown as SSRUniforms).intensity.value = value;
  }

  /**
   * Set max ray distance
   * @param value
   */
  setMaxDistance(value: number): void {
    (this.material.uniforms as unknown as SSRUniforms).maxDistance.value = value;
  }

  /**
   * Set depth thickness
   * @param value
   */
  setThickness(value: number): void {
    (this.material.uniforms as unknown as SSRUniforms).thickness.value = value;
  }

  /**
   * Set max ray march steps
   * @param value
   */
  setMaxSteps(value: number): void {
    (this.material.uniforms as unknown as SSRUniforms).maxSteps.value = value;
  }

  /**
   * Enable or disable half-resolution rendering at runtime.
   * @param enabled
   */
  setHalfResolution(enabled: boolean): void {
    if (this.useHalfRes === enabled) return;

    this.useHalfRes = enabled;

    if (enabled && !this.upsampleMaterial) {
      this.initHalfResPipeline();
    }
  }

  /**
   * Set bilateral depth threshold for upsampling.
   * @param threshold
   */
  setBilateralDepthThreshold(threshold: number): void {
    this.bilateralDepthThreshold = threshold;
    if (this.upsampleMaterial) {
      (this.upsampleMaterial.uniforms as unknown as BilateralUpsampleUniforms).uDepthThreshold.value =
        threshold;
    }
  }

  /**
   * Copy input texture directly to output (passthrough)
   * @param renderer
   * @param inputTex
   * @param outputTarget
   */
  private copyToOutput(
    renderer: THREE.WebGLRenderer,
    inputTex: THREE.Texture | null,
    outputTarget: THREE.WebGLRenderTarget | null
  ): void {
    if (!inputTex) return;

    this.copyMaterial.uniforms['tDiffuse']!.value = inputTex;
    renderer.setRenderTarget(outputTarget);
    renderer.render(this.copyScene, this.camera);
    renderer.setRenderTarget(null);
  }

  /**
   * Release internal GPU resources when pass is disabled.
   *
   * Called by RenderGraph when this pass has been disabled for the grace period.
   * Disposes of the half-resolution render target, but keeps materials and
   * geometry to avoid shader recompilation on re-enable.
   */
  releaseInternalResources(): void {
    // Dispose half-res target (the only significant internal resource)
    if (this.halfResTarget) {
      this.halfResTarget.dispose();
      this.halfResTarget = null;
    }

    // Keep material, mesh, upsampleMaterial, upsampleMesh - they're cheap
    // and keeping them avoids shader recompilation on re-enable
  }

  dispose(): void {
    this.material.dispose();
    this.mesh.geometry.dispose();
    this.copyMaterial.dispose();
    this.copyMesh.geometry.dispose();
    // Remove meshes from scenes to ensure proper cleanup
    this.scene.remove(this.mesh);
    this.copyScene.remove(this.copyMesh);

    // Dispose half-res resources
    if (this.halfResTarget) {
      this.halfResTarget.dispose();
      this.halfResTarget = null;
    }
    if (this.upsampleMaterial) {
      this.upsampleMaterial.dispose();
      this.upsampleMaterial = null;
    }
    if (this.upsampleMesh && this.upsampleScene) {
      this.upsampleScene.remove(this.upsampleMesh);
      releaseFullscreenQuadGeometry();
      this.upsampleMesh = null;
      this.upsampleScene = null;
    }
  }
}
