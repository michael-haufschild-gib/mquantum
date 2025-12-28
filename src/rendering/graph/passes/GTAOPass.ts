/**
 * GTAO Pass (Render Graph)
 *
 * Wraps Three.js GTAOPass for integration with the RenderGraph system.
 * Provides Ground Truth Ambient Occlusion for mesh-based objects (polytopes).
 *
 * OPTIMIZATION: Supports half-resolution rendering with bilateral upsampling
 * for 50-75% performance improvement with minimal visual quality loss.
 *
 * @module rendering/graph/passes/GTAOPass
 */

import * as THREE from 'three';
import { GTAOPass as ThreeGTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';

import { BasePass } from '../BasePass';

/**
 * Type augmentation for Three.js GTAOPass internal properties.
 * These are accessed to properly configure external G-buffer usage.
 *
 * NOTE: Three.js internal API - may change between versions.
 * Current implementation based on Three.js r181.
 */
declare module 'three/examples/jsm/postprocessing/GTAOPass.js' {
  interface GTAOPass {
    /** Internal flag controlling whether to render G-buffer or use external textures */
    _renderGBuffer: boolean;
    /** GTAO computation shader material */
    gtaoMaterial: THREE.ShaderMaterial;
    /** Poisson denoise shader material */
    pdMaterial: THREE.ShaderMaterial;
  }
}

import type { RenderContext, RenderPassConfig } from '../types';
import {
  GTAOBilateralUpsampleShader,
  type GTAOBilateralUpsampleUniforms,
} from '@/rendering/shaders/postprocessing/GTAOBilateralUpsampleShader';
import {
  getFullscreenQuadGeometry,
  releaseFullscreenQuadGeometry,
} from '@/rendering/core/FullscreenQuad';

/**
 * Configuration for GTAOPass.
 */
export interface GTAOPassConfig extends Omit<RenderPassConfig, 'inputs' | 'outputs'> {
  /** Input color resource */
  colorInput: string;
  /** Input normal resource (world-space normals) */
  normalInput: string;
  /** Input depth resource */
  depthInput: string;
  /** Depth input attachment (for depth textures on render targets) */
  depthInputAttachment?: number | 'depth';
  /** Output resource */
  outputResource: string;
  /**
   * Enable half-resolution rendering with bilateral upsampling.
   * OPTIMIZATION: Reduces GTAO cost by 50-75% with minimal quality loss.
   * @default true
   */
  halfResolution?: boolean;
  /**
   * Depth threshold for bilateral upsampling.
   * Lower values = sharper edges but potential artifacts.
   * @default 0.02
   */
  bilateralDepthThreshold?: number;
}

/**
 * Fullscreen copy shader for transferring textures between targets.
 */
const copyVertexShader = /* glsl */ `
out vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const copyFragmentShader = /* glsl */ `
precision highp float;
in vec2 vUv;
uniform sampler2D tDiffuse;
layout(location = 0) out vec4 fragColor;
void main() {
  fragColor = texture(tDiffuse, vUv);
}
`;

/**
 * GTAO (Ground Truth Ambient Occlusion) pass for render graph.
 *
 * Uses Three.js GTAOPass internally to compute AO from scene geometry.
 * Optimized to reuse G-buffer from earlier passes rather than re-rendering.
 *
 * Supports half-resolution rendering with bilateral upsampling for improved
 * performance with minimal quality loss.
 *
 * @example
 * ```typescript
 * const gtaoPass = new GTAOPass({
 *   id: 'gtao',
 *   colorInput: 'sceneColor',
 *   normalInput: 'sceneNormals',
 *   depthInput: 'sceneDepth',
 *   outputResource: 'aoOutput',
 *   halfResolution: true, // Enable half-res optimization
 * });
 * ```
 */
export class GTAOPass extends BasePass {
  private gtaoPass: ThreeGTAOPass | null = null;

  private colorInputId: string;
  private normalInputId: string;
  private depthInputId: string;
  private depthInputAttachment?: number | 'depth';
  private outputId: string;

  // Cached size for resize detection
  private lastWidth = 0;
  private lastHeight = 0;

  // Render targets for GTAO processing (full-res mode)
  private readTarget: THREE.WebGLRenderTarget | null = null;
  private writeTarget: THREE.WebGLRenderTarget | null = null;

  // Copy material for transferring results
  private copyMaterial: THREE.ShaderMaterial;
  private copyMesh: THREE.Mesh;
  private copyScene: THREE.Scene;
  private copyCamera: THREE.OrthographicCamera;

  // Scene/camera references (needed for GTAOPass initialization)
  private sceneRef: THREE.Scene | null = null;
  private cameraRef: THREE.Camera | null = null;

  // Half-resolution pipeline
  private useHalfRes: boolean;
  private halfResReadTarget: THREE.WebGLRenderTarget | null = null;
  private halfResWriteTarget: THREE.WebGLRenderTarget | null = null;
  private upsampleMaterial: THREE.ShaderMaterial | null = null;
  private upsampleMesh: THREE.Mesh | null = null;
  private upsampleScene: THREE.Scene | null = null;
  private bilateralDepthThreshold: number;

  // Track half-res GTAOPass separately (different size than full-res)
  private halfResGtaoPass: ThreeGTAOPass | null = null;
  private lastHalfWidth = 0;
  private lastHalfHeight = 0;

  constructor(config: GTAOPassConfig) {
    super({
      id: config.id,
      name: config.name ?? 'GTAO Pass',
      inputs: [
        { resourceId: config.colorInput, access: 'read' },
        { resourceId: config.normalInput, access: 'read' },
        {
          resourceId: config.depthInput,
          access: 'read',
          attachment: config.depthInputAttachment,
        },
      ],
      outputs: [{ resourceId: config.outputResource, access: 'write' }],
      enabled: config.enabled,
      priority: config.priority,
      skipPassthrough: config.skipPassthrough,
    });

    this.colorInputId = config.colorInput;
    this.normalInputId = config.normalInput;
    this.depthInputId = config.depthInput;
    this.depthInputAttachment = config.depthInputAttachment;
    this.outputId = config.outputResource;

    // Create copy material
    this.copyMaterial = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        tDiffuse: { value: null },
      },
      vertexShader: copyVertexShader,
      fragmentShader: copyFragmentShader,
      depthTest: false,
      depthWrite: false,
    });

    const geometry = new THREE.PlaneGeometry(2, 2);
    this.copyMesh = new THREE.Mesh(geometry, this.copyMaterial);
    this.copyMesh.frustumCulled = false;

    this.copyScene = new THREE.Scene();
    this.copyScene.add(this.copyMesh);

    this.copyCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    // Half-resolution pipeline setup
    this.useHalfRes = config.halfResolution ?? true;
    this.bilateralDepthThreshold = config.bilateralDepthThreshold ?? 0.02;

    if (this.useHalfRes) {
      this.initHalfResPipeline();
    }
  }

  /**
   * Initialize the half-resolution rendering pipeline.
   */
  private initHalfResPipeline(): void {
    // Create upsample material for bilateral upsampling
    this.upsampleMaterial = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: GTAOBilateralUpsampleShader.vertexShader,
      fragmentShader: GTAOBilateralUpsampleShader.fragmentShader,
      uniforms: THREE.UniformsUtils.clone(
        GTAOBilateralUpsampleShader.uniforms as unknown as Record<string, THREE.IUniform>
      ),
      depthTest: false,
      depthWrite: false,
    });

    const upsampleUniforms = this.upsampleMaterial
      .uniforms as unknown as GTAOBilateralUpsampleUniforms;
    upsampleUniforms.uDepthThreshold.value = this.bilateralDepthThreshold;

    this.upsampleMesh = new THREE.Mesh(getFullscreenQuadGeometry(), this.upsampleMaterial);
    this.upsampleMesh.frustumCulled = false;
    this.upsampleScene = new THREE.Scene();
    this.upsampleScene.add(this.upsampleMesh);
  }

  /**
   * Ensure half-res targets match current size.
   * @param width - Full resolution width
   * @param height - Full resolution height
   */
  private ensureHalfResTarget(width: number, height: number): void {
    const halfWidth = Math.max(1, Math.floor(width / 2));
    const halfHeight = Math.max(1, Math.floor(height / 2));

    if (
      this.halfResReadTarget &&
      this.halfResWriteTarget &&
      this.halfResReadTarget.width === halfWidth &&
      this.halfResReadTarget.height === halfHeight
    ) {
      return;
    }

    // Dispose old targets
    if (this.halfResReadTarget) {
      this.halfResReadTarget.dispose();
    }
    if (this.halfResWriteTarget) {
      this.halfResWriteTarget.dispose();
    }

    // Create new half-res targets
    this.halfResReadTarget = new THREE.WebGLRenderTarget(halfWidth, halfHeight, {
      format: THREE.RGBAFormat,
      type: THREE.HalfFloatType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
    });

    this.halfResWriteTarget = new THREE.WebGLRenderTarget(halfWidth, halfHeight, {
      format: THREE.RGBAFormat,
      type: THREE.HalfFloatType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
    });
  }

  /**
   * Ensure GTAO pass and targets are initialized with correct size (full-res mode).
   * @param width - Target width
   * @param height - Target height
   * @param scene - The scene to render
   * @param camera - The camera to use
   */
  private ensureInitialized(
    width: number,
    height: number,
    scene: THREE.Scene,
    camera: THREE.Camera
  ): void {
    const needsRecreate =
      !this.gtaoPass ||
      width !== this.lastWidth ||
      height !== this.lastHeight ||
      scene !== this.sceneRef ||
      camera !== this.cameraRef;

    if (needsRecreate) {
      // Dispose old resources
      this.gtaoPass?.dispose?.();
      this.readTarget?.dispose();
      this.writeTarget?.dispose();

      // Store references
      this.sceneRef = scene;
      this.cameraRef = camera;

      // Create GTAOPass
      this.gtaoPass = new ThreeGTAOPass(scene, camera, width, height);
      this.gtaoPass.output = ThreeGTAOPass.OUTPUT.Default; // Blend AO with scene

      // Create render targets
      this.readTarget = new THREE.WebGLRenderTarget(width, height, {
        format: THREE.RGBAFormat,
        type: THREE.HalfFloatType,
      });
      this.writeTarget = new THREE.WebGLRenderTarget(width, height, {
        format: THREE.RGBAFormat,
        type: THREE.HalfFloatType,
      });

      this.lastWidth = width;
      this.lastHeight = height;
    }
  }

  /**
   * Ensure half-res GTAOPass is initialized with correct size.
   * @param halfWidth - Half resolution width
   * @param halfHeight - Half resolution height
   * @param scene - The scene to render
   * @param camera - The camera to use
   */
  private ensureHalfResGtaoInitialized(
    halfWidth: number,
    halfHeight: number,
    scene: THREE.Scene,
    camera: THREE.Camera
  ): void {
    const needsRecreate =
      !this.halfResGtaoPass ||
      halfWidth !== this.lastHalfWidth ||
      halfHeight !== this.lastHalfHeight ||
      scene !== this.sceneRef ||
      camera !== this.cameraRef;

    if (needsRecreate) {
      // Dispose old half-res GTAO pass
      this.halfResGtaoPass?.dispose?.();

      // Store references
      this.sceneRef = scene;
      this.cameraRef = camera;

      // Create half-res GTAOPass with AO-only output
      this.halfResGtaoPass = new ThreeGTAOPass(scene, camera, halfWidth, halfHeight);
      // Use Denoise output to get denoised AO-only (no scene compositing)
      this.halfResGtaoPass.output = ThreeGTAOPass.OUTPUT.Denoise;

      this.lastHalfWidth = halfWidth;
      this.lastHalfHeight = halfHeight;
    }
  }

  /**
   * Configure GTAOPass to use external G-buffer textures.
   *
   * CRITICAL: This method replicates Three.js GTAOPass.setGBuffer() behavior
   * to properly integrate external normal/depth textures. Without this:
   * 1. _renderGBuffer remains true, causing GTAOPass to re-render normals
   * 2. scene.overrideMaterial breaks raymarched objects (hypercube, fractals)
   * 3. Shader uniforms aren't bound, causing incorrect/missing AO
   *
   * @param gtaoPass - The Three.js GTAOPass instance to configure
   * @param normalTex - External normal texture ([0,1] encoded world-space normals)
   * @param depthTex - External depth texture
   */
  private configureExternalGBuffer(
    gtaoPass: ThreeGTAOPass,
    normalTex: THREE.Texture,
    depthTex: THREE.Texture
  ): void {
    // 1. CRITICAL: Disable internal G-buffer rendering
    // Without this, GTAOPass renders its own normals with scene.overrideMaterial
    // which breaks raymarched objects that compute normals in fragment shaders
    gtaoPass._renderGBuffer = false;

    // 2. Set texture references on the pass
    gtaoPass.normalTexture = normalTex;
    gtaoPass.depthTexture = depthTex as unknown as THREE.DepthTexture;

    // 3. Update shader defines for texture interpretation
    // NORMAL_VECTOR_TYPE = 1: Use unpackRGBToNormal() for [0,1] encoded normals
    // (NormalPass outputs: normal * 0.5 + 0.5)
    gtaoPass.gtaoMaterial.defines.NORMAL_VECTOR_TYPE = 1;
    // DEPTH_SWIZZLING = 'x': Read depth from .r channel (separate depth texture)
    gtaoPass.gtaoMaterial.defines.DEPTH_SWIZZLING = 'x';
    gtaoPass.gtaoMaterial.needsUpdate = true;

    gtaoPass.pdMaterial.defines.NORMAL_VECTOR_TYPE = 1;
    gtaoPass.pdMaterial.defines.DEPTH_SWIZZLING = 'x';
    gtaoPass.pdMaterial.needsUpdate = true;

    // 4. CRITICAL: Bind textures to shader uniforms
    // This was the missing step causing the "rectangular shadow" bug
    // Note: These uniforms are guaranteed to exist in Three.js GTAOPass
    const gtaoUniforms = gtaoPass.gtaoMaterial.uniforms as Record<string, THREE.IUniform>;
    const pdUniforms = gtaoPass.pdMaterial.uniforms as Record<string, THREE.IUniform>;

    if (gtaoUniforms['tNormal']) gtaoUniforms['tNormal'].value = normalTex;
    if (gtaoUniforms['tDepth']) gtaoUniforms['tDepth'].value = depthTex;
    if (pdUniforms['tNormal']) pdUniforms['tNormal'].value = normalTex;
    if (pdUniforms['tDepth']) pdUniforms['tDepth'].value = depthTex;
  }

  execute(ctx: RenderContext): void {
    const { size } = ctx;

    // Skip if size is invalid
    if (size.width < 1 || size.height < 1) {
      return;
    }

    // Use half-resolution pipeline if enabled
    if (this.useHalfRes && this.upsampleMaterial && this.upsampleScene) {
      this.executeHalfRes(ctx);
    } else {
      this.executeFullRes(ctx);
    }
  }

  /**
   * Execute GTAO at full resolution (original behavior).
   * @param ctx - Render context from the render graph
   */
  private executeFullRes(ctx: RenderContext): void {
    const { renderer, size, scene, camera } = ctx;

    // Ensure GTAO is initialized at full resolution
    this.ensureInitialized(size.width, size.height, scene, camera);

    if (!this.gtaoPass || !this.readTarget || !this.writeTarget) {
      console.warn('GTAOPass: Failed to initialize');
      return;
    }

    // Get input textures
    const colorTex = ctx.getReadTexture(this.colorInputId);
    const normalTex = ctx.getReadTexture(this.normalInputId);
    const depthTex = ctx.getReadTexture(this.depthInputId, this.depthInputAttachment);
    const outputTarget = ctx.getWriteTarget(this.outputId);

    if (!colorTex || !normalTex || !depthTex) {
      console.warn('GTAOPass: Missing input textures');
      return;
    }

    // Configure external G-buffer textures (disables internal rendering)
    this.configureExternalGBuffer(this.gtaoPass, normalTex, depthTex);

    // Ensure output mode is Default (composited) for full-res
    this.gtaoPass.output = ThreeGTAOPass.OUTPUT.Default;

    // Copy input color to read buffer
    this.copyMaterial.uniforms['tDiffuse']!.value = colorTex;
    renderer.setRenderTarget(this.readTarget);
    renderer.render(this.copyScene, this.copyCamera);

    // Run GTAO pass
    this.gtaoPass.render(
      renderer,
      this.writeTarget,
      this.readTarget,
      0, // delta
      false // maskActive
    );

    // Copy result to output
    this.copyMaterial.uniforms['tDiffuse']!.value = this.writeTarget.texture;
    renderer.setRenderTarget(outputTarget);
    renderer.render(this.copyScene, this.copyCamera);

    renderer.setRenderTarget(null);
  }

  /**
   * Execute GTAO at half resolution with bilateral upsampling.
   * OPTIMIZATION: Reduces GTAO cost by 50-75% (4x fewer pixels).
   * @param ctx - Render context from the render graph
   */
  private executeHalfRes(ctx: RenderContext): void {
    const { renderer, size, scene, camera } = ctx;

    // Get half-res dimensions
    const halfWidth = Math.max(1, Math.floor(size.width / 2));
    const halfHeight = Math.max(1, Math.floor(size.height / 2));

    // Ensure half-res targets exist
    this.ensureHalfResTarget(size.width, size.height);

    // Ensure half-res GTAOPass is initialized
    this.ensureHalfResGtaoInitialized(halfWidth, halfHeight, scene, camera);

    if (
      !this.halfResGtaoPass ||
      !this.halfResReadTarget ||
      !this.halfResWriteTarget ||
      !this.upsampleMaterial ||
      !this.upsampleScene
    ) {
      // Fallback to full-res
      this.executeFullRes(ctx);
      return;
    }

    // Get input textures
    const colorTex = ctx.getReadTexture(this.colorInputId);
    const normalTex = ctx.getReadTexture(this.normalInputId);
    const depthTex = ctx.getReadTexture(this.depthInputId, this.depthInputAttachment);
    const outputTarget = ctx.getWriteTarget(this.outputId);

    if (!colorTex || !normalTex || !depthTex) {
      console.warn('GTAOPass: Missing input textures');
      return;
    }

    // Configure external G-buffer textures for half-res pass
    this.configureExternalGBuffer(this.halfResGtaoPass, normalTex, depthTex);

    // Ensure output mode is Denoise (AO-only) for half-res
    this.halfResGtaoPass.output = ThreeGTAOPass.OUTPUT.Denoise;

    // Step 1: Copy input color to half-res read buffer (downsampled via GPU linear filter)
    this.copyMaterial.uniforms['tDiffuse']!.value = colorTex;
    this.halfResReadTarget.viewport.set(0, 0, halfWidth, halfHeight);
    renderer.setRenderTarget(this.halfResReadTarget);
    renderer.render(this.copyScene, this.copyCamera);

    // Step 2: Run GTAOPass at half resolution - outputs AO-only
    this.halfResWriteTarget.viewport.set(0, 0, halfWidth, halfHeight);
    this.halfResGtaoPass.render(
      renderer,
      this.halfResWriteTarget,
      this.halfResReadTarget,
      0, // delta
      false // maskActive
    );

    // Step 3: Bilateral upsample to full resolution with scene color compositing
    const upsampleUniforms = this.upsampleMaterial
      .uniforms as unknown as GTAOBilateralUpsampleUniforms;
    upsampleUniforms.tAO.value = this.halfResWriteTarget.texture;
    upsampleUniforms.tColor.value = colorTex; // Full-res scene color
    upsampleUniforms.tDepth.value = depthTex; // Full-res depth
    upsampleUniforms.uResolution.value.set(size.width, size.height);

    // Set camera parameters for depth linearization
    // Note: Bilateral upsampling uses perspective depth formula.
    // For orthographic cameras, the depth is linear but we use the same near/far
    // to maintain consistency with the depth buffer values.
    if (camera instanceof THREE.PerspectiveCamera) {
      upsampleUniforms.uNearClip.value = camera.near;
      upsampleUniforms.uFarClip.value = camera.far;
    } else if (camera instanceof THREE.OrthographicCamera) {
      upsampleUniforms.uNearClip.value = camera.near;
      upsampleUniforms.uFarClip.value = camera.far;
    }

    renderer.setRenderTarget(outputTarget);
    renderer.render(this.upsampleScene, this.copyCamera);
    renderer.setRenderTarget(null);
  }

  /**
   * Set the AO radius.
   * @param radius - The AO sampling radius
   */
  setRadius(radius: number): void {
    if (this.gtaoPass) {
      // @ts-expect-error - GTAOPass params may vary by Three.js version
      this.gtaoPass.radius = radius;
    }
    if (this.halfResGtaoPass) {
      // @ts-expect-error - GTAOPass params may vary by Three.js version
      this.halfResGtaoPass.radius = radius;
    }
  }

  /**
   * Set the AO intensity using blendIntensity.
   * blendIntensity controls how strongly the AO effect blends with the scene.
   * @param intensity - The AO blend intensity (0-1)
   */
  setIntensity(intensity: number): void {
    if (this.gtaoPass) {
      this.gtaoPass.blendIntensity = intensity;
    }
    if (this.halfResGtaoPass) {
      this.halfResGtaoPass.blendIntensity = intensity;
    }
    // Also update the upsample shader's AO intensity
    if (this.upsampleMaterial) {
      (
        this.upsampleMaterial.uniforms as unknown as GTAOBilateralUpsampleUniforms
      ).uAOIntensity.value = intensity;
    }
  }

  /**
   * Enable or disable half-resolution rendering at runtime.
   * @param enabled - Whether to enable half-resolution rendering
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
   * Lower values = sharper edges but potential artifacts.
   * @param threshold - Depth threshold value
   */
  setBilateralDepthThreshold(threshold: number): void {
    this.bilateralDepthThreshold = threshold;
    if (this.upsampleMaterial) {
      (
        this.upsampleMaterial.uniforms as unknown as GTAOBilateralUpsampleUniforms
      ).uDepthThreshold.value = threshold;
    }
  }

  /**
   * Check if half-resolution mode is enabled.
   * @returns True if half-resolution mode is enabled
   */
  isHalfResolution(): boolean {
    return this.useHalfRes;
  }

  /**
   * Release internal GPU resources when pass is disabled.
   *
   * Called by RenderGraph when this pass has been disabled for the grace period.
   * Disposes of render targets and GTAOPass instances (which have internal buffers),
   * but keeps materials and geometry to avoid shader recompilation on re-enable.
   */
  releaseInternalResources(): void {
    // Dispose full-res resources
    this.gtaoPass?.dispose?.();
    this.gtaoPass = null;
    this.readTarget?.dispose();
    this.readTarget = null;
    this.writeTarget?.dispose();
    this.writeTarget = null;

    // Dispose half-res resources
    this.halfResGtaoPass?.dispose?.();
    this.halfResGtaoPass = null;
    this.halfResReadTarget?.dispose();
    this.halfResReadTarget = null;
    this.halfResWriteTarget?.dispose();
    this.halfResWriteTarget = null;

    // Reset size tracking to trigger reallocation on next execute()
    this.lastWidth = 0;
    this.lastHeight = 0;
    this.lastHalfWidth = 0;
    this.lastHalfHeight = 0;

    // Clear scene/camera references to allow garbage collection
    this.sceneRef = null;
    this.cameraRef = null;

    // Keep copyMaterial, copyMesh, copyScene, copyCamera - they're cheap
    // Keep upsampleMaterial, upsampleMesh, upsampleScene - also cheap
  }

  dispose(): void {
    // Dispose full-res resources
    this.gtaoPass?.dispose?.();
    this.gtaoPass = null;
    this.readTarget?.dispose();
    this.readTarget = null;
    this.writeTarget?.dispose();
    this.writeTarget = null;

    // Dispose copy resources
    this.copyMaterial.dispose();
    this.copyMesh.geometry.dispose();
    this.copyScene.remove(this.copyMesh);

    // Dispose half-res resources
    this.halfResGtaoPass?.dispose?.();
    this.halfResGtaoPass = null;
    this.halfResReadTarget?.dispose();
    this.halfResReadTarget = null;
    this.halfResWriteTarget?.dispose();
    this.halfResWriteTarget = null;

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

    // Clear scene/camera references to allow garbage collection
    this.sceneRef = null;
    this.cameraRef = null;
  }
}
