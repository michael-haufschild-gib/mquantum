/**
 * Bloom Pass
 *
 * Wraps Three.js UnrealBloomPass for the RenderGraph system.
 * Applies HDR bloom/glow effect to bright areas of the scene.
 *
 * HDR-Aware: Uses normalized luminance thresholding so that
 * threshold and smoothing parameters work intuitively with
 * HDR content (luminance values > 1.0).
 *
 * @module rendering/graph/passes/BloomPass
 */

import * as THREE from 'three';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

import { BasePass } from '../BasePass';
import type { RenderContext, RenderPassConfig } from '../types';

/**
 * HDR-aware Luminosity High Pass Shader
 *
 * Modified version of Three.js LuminosityHighPassShader that normalizes
 * luminance by an HDR peak value before thresholding. This makes the
 * threshold and smoothWidth parameters work intuitively with HDR content.
 *
 * Formula: normalizedLuminance = luminance / hdrPeak
 * Then: alpha = smoothstep(threshold, threshold + smoothWidth, normalizedLuminance)
 */
const HDRLuminosityHighPassShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    luminosityThreshold: { value: 1.0 },
    smoothWidth: { value: 1.0 },
    defaultColor: { value: new THREE.Color(0x000000) },
    defaultOpacity: { value: 0.0 },
    hdrPeak: { value: 5.0 },
  },

  glslVersion: THREE.GLSL3,

  vertexShader: /* glsl */ `
    out vec2 vUv;
    void main() {
      vUv = uv;
      // Direct NDC for fullscreen quad (PlaneGeometry(2,2)) - avoids DPR issues
      gl_Position = vec4(position.xy, 0.0, 1.0);
    }
  `,

  fragmentShader: /* glsl */ `
    precision highp float;

    uniform sampler2D tDiffuse;
    uniform vec3 defaultColor;
    uniform float defaultOpacity;
    uniform float luminosityThreshold;
    uniform float smoothWidth;
    uniform float hdrPeak;

    in vec2 vUv;
    layout(location = 0) out vec4 fragColor;

    void main() {
      vec4 texel = texture(tDiffuse, vUv);

      // Calculate luminance (Rec. 709 coefficients)
      float v = dot(texel.rgb, vec3(0.2126, 0.7152, 0.0722));

      // Normalize luminance by HDR peak for intuitive thresholding
      // This makes threshold=0.8 mean "80% of peak brightness"
      float normalizedV = v / hdrPeak;

      vec4 outputColor = vec4(defaultColor, defaultOpacity);

      // Apply threshold with smoothing on normalized luminance
      float alpha = smoothstep(luminosityThreshold, luminosityThreshold + smoothWidth, normalizedV);

      fragColor = mix(outputColor, texel, alpha);
    }
  `,
};

/**
 * Configuration for BloomPass.
 */
export interface BloomPassConfig extends Omit<RenderPassConfig, 'inputs' | 'outputs'> {
  /** Input resource to apply bloom to */
  inputResource: string;

  /** Output resource (can be same as input for in-place) */
  outputResource: string;

  /** Bloom strength (default: 0.5) */
  strength?: number;

  /** Bloom radius (default: 0.4) */
  radius?: number;

  /** Luminance threshold for bloom, normalized 0-1 (default: 0.8) */
  threshold?: number;

  /** Luminance smoothing - softens threshold transition (default: 0.1) */
  smoothing?: number;

  /** Number of blur levels to use 1-5 (default: 5) */
  levels?: number;

  /** HDR peak luminance for normalization (default: 5.0) */
  hdrPeak?: number;
}

/**
 * Applies bloom effect to input texture.
 *
 * Uses Three.js UnrealBloomPass internally with selective bloom
 * based on luminance threshold.
 *
 * @example
 * ```typescript
 * const bloom = new BloomPass({
 *   id: 'bloom',
 *   inputResource: 'sceneColor',
 *   outputResource: 'bloomedColor',
 *   strength: 1.5,
 *   radius: 0.4,
 *   threshold: 0.8,
 * });
 *
 * graph.addPass(bloom);
 * ```
 */
export class BloomPass extends BasePass {
  private bloomPass: UnrealBloomPass | null = null;
  private inputResourceId: string;
  private outputResourceId: string;

  // Bloom parameters
  private strength: number;
  private radius: number;
  private threshold: number;
  private smoothing: number;
  private levels: number;
  private hdrPeak: number;

  // Custom HDR-aware high pass material (replaces UnrealBloomPass's default)
  private hdrHighPassMaterial: THREE.ShaderMaterial | null = null;

  // Cached size for resize detection
  private lastWidth = 0;
  private lastHeight = 0;

  // Reusable render targets for bloom processing (avoids per-frame allocation)
  private bloomReadTarget: THREE.WebGLRenderTarget | null = null;
  private bloomWriteTarget: THREE.WebGLRenderTarget | null = null;

  // Fullscreen quad for copying result
  private copyMaterial: THREE.ShaderMaterial;
  private copyMesh: THREE.Mesh;
  private copyScene: THREE.Scene;
  private copyCamera: THREE.OrthographicCamera;

  // Cached bloom factors to avoid per-frame array allocation
  private cachedBloomFactors: number[] = [1.0, 0.8, 0.6, 0.4, 0.2];
  private cachedLevels = 5;

  // Cached WebGL2 context for hardware blit
  private gl: WebGL2RenderingContext | null = null;

  constructor(config: BloomPassConfig) {
    super({
      id: config.id,
      name: config.name,
      inputs: [{ resourceId: config.inputResource, access: 'read' }],
      outputs: [{ resourceId: config.outputResource, access: 'write' }],
      enabled: config.enabled,
      priority: config.priority,
      skipPassthrough: config.skipPassthrough,
    });

    this.inputResourceId = config.inputResource;
    this.outputResourceId = config.outputResource;
    this.strength = config.strength ?? 0.5;
    this.radius = config.radius ?? 0.4;
    this.threshold = config.threshold ?? 0.8;
    this.smoothing = config.smoothing ?? 0.1;
    this.levels = config.levels ?? 5;
    this.hdrPeak = config.hdrPeak ?? 5.0;

    // Create copy material for transferring bloom result
    this.copyMaterial = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        tDiffuse: { value: null },
      },
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

  /**
   * Ensure bloom pass and render targets are initialized with correct size.
   * @param width
   * @param height
   */
  private ensureInitialized(width: number, height: number): void {
    if (!this.bloomPass || width !== this.lastWidth || height !== this.lastHeight) {
      // Dispose old resources
      this.bloomPass?.dispose();
      this.hdrHighPassMaterial?.dispose();
      this.bloomReadTarget?.dispose();
      this.bloomWriteTarget?.dispose();

      // Create new bloom pass with current size
      this.bloomPass = new UnrealBloomPass(
        new THREE.Vector2(width, height),
        this.strength,
        this.radius,
        this.threshold
      );

      // Create HDR-aware high pass material to replace the default one
      // This normalizes luminance by hdrPeak before thresholding, making
      // the threshold and smoothing parameters work intuitively with HDR content
      this.hdrHighPassMaterial = new THREE.ShaderMaterial({
        glslVersion: HDRLuminosityHighPassShader.glslVersion,
        uniforms: THREE.UniformsUtils.clone(HDRLuminosityHighPassShader.uniforms),
        vertexShader: HDRLuminosityHighPassShader.vertexShader,
        fragmentShader: HDRLuminosityHighPassShader.fragmentShader,
      });

      // Replace UnrealBloomPass's default high pass material with our HDR-aware version
      // CRITICAL: Must also update highPassUniforms reference - UnrealBloomPass uses this
      // internally to set tDiffuse during render. If we only replace materialHighPassFilter,
      // highPassUniforms still points to the old material's uniforms and nothing renders!
      const oldMaterial = this.bloomPass.materialHighPassFilter;
      this.bloomPass.materialHighPassFilter = this.hdrHighPassMaterial;
      (this.bloomPass as unknown as { highPassUniforms: THREE.ShaderMaterial['uniforms'] }).highPassUniforms = this.hdrHighPassMaterial.uniforms;
      oldMaterial.dispose();

      // Create reusable render targets for bloom processing
      // CRITICAL: Must use LinearSRGBColorSpace to match pipeline targets
      this.bloomReadTarget = new THREE.WebGLRenderTarget(width, height, {
        format: THREE.RGBAFormat,
        type: THREE.HalfFloatType,
      });
      this.bloomReadTarget.texture.colorSpace = THREE.LinearSRGBColorSpace;

      this.bloomWriteTarget = new THREE.WebGLRenderTarget(width, height, {
        format: THREE.RGBAFormat,
        type: THREE.HalfFloatType,
      });
      this.bloomWriteTarget.texture.colorSpace = THREE.LinearSRGBColorSpace;

      this.lastWidth = width;
      this.lastHeight = height;
    }
  }

  /**
   * Hardware-accelerated framebuffer copy using glBlitFramebuffer.
   * Falls back to shader-based copy if blit fails.
   *
   * OPTIMIZATION: glBlitFramebuffer is faster than shader-based copy
   * because it uses dedicated hardware paths and avoids shader overhead.
   *
   * @returns true if blit succeeded, false if fallback is needed
   */
  private blitFramebuffer(
    renderer: THREE.WebGLRenderer,
    source: THREE.WebGLRenderTarget,
    dest: THREE.WebGLRenderTarget | null
  ): boolean {
    // Cache WebGL2 context on first use
    if (!this.gl) {
      this.gl = renderer.getContext() as WebGL2RenderingContext;
    }
    const gl = this.gl;

    // Get framebuffer properties from Three.js
    const props = renderer.properties;
    const srcProps = props.get(source) as { __webglFramebuffer?: WebGLFramebuffer } | undefined;
    const srcFbo = srcProps?.__webglFramebuffer;

    if (!srcFbo) {
      return false; // Source not initialized, fall back to shader copy
    }

    // Determine destination framebuffer (null = default/screen)
    let dstFbo: WebGLFramebuffer | null = null;
    let dstWidth = gl.drawingBufferWidth;
    let dstHeight = gl.drawingBufferHeight;

    if (dest) {
      const dstProps = props.get(dest) as { __webglFramebuffer?: WebGLFramebuffer } | undefined;
      dstFbo = dstProps?.__webglFramebuffer ?? null;
      if (!dstFbo) {
        return false; // Dest not initialized, fall back to shader copy
      }
      dstWidth = dest.width;
      dstHeight = dest.height;
    }

    // Perform the blit
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, srcFbo);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, dstFbo);
    gl.blitFramebuffer(
      0, 0, source.width, source.height,
      0, 0, dstWidth, dstHeight,
      gl.COLOR_BUFFER_BIT,
      gl.LINEAR
    );

    // Restore Three.js state
    renderer.setRenderTarget(dest);

    return true;
  }

  execute(ctx: RenderContext): void {
    const { renderer, size } = ctx;

    // Skip if size is invalid (can happen on first frames before canvas is sized)
    if (size.width < 1 || size.height < 1) {
      return;
    }

    // Ensure bloom pass exists
    this.ensureInitialized(size.width, size.height);

    if (!this.bloomPass) {
      console.warn('BloomPass: Failed to initialize bloom pass');
      return;
    }

    // Get input texture
    const inputTexture = ctx.getReadTexture(this.inputResourceId);
    if (!inputTexture) {
      console.warn(`BloomPass: Input texture '${this.inputResourceId}' not found`);
      return;
    }

    // Get output target
    const outputTarget = ctx.getWriteTarget(this.outputResourceId);

    // Update bloom pass parameters
    this.bloomPass.strength = this.strength;
    this.bloomPass.radius = this.radius;
    this.bloomPass.threshold = this.threshold;

    // Update HDR high pass material uniforms
    // Our custom material normalizes luminance by hdrPeak before thresholding
    if (this.hdrHighPassMaterial) {
      this.hdrHighPassMaterial.uniforms['luminosityThreshold']!.value = this.threshold;
      this.hdrHighPassMaterial.uniforms['smoothWidth']!.value = this.smoothing;
      this.hdrHighPassMaterial.uniforms['hdrPeak']!.value = this.hdrPeak;
    }

    // Adjust bloomFactors based on levels (1-5)
    // Lower levels = tighter bloom (reduce contribution of larger mips)
    // OPTIMIZATION: Only recompute when levels changes (avoids per-frame array allocation)
    if (this.levels !== this.cachedLevels) {
      const levelScale = this.levels / 5; // 1.0 when levels=5, 0.2 when levels=1
      const baseFactors = [1.0, 0.8, 0.6, 0.4, 0.2];
      for (let i = 0; i < 5; i++) {
        const mipScale = i < this.levels ? 1.0 : 0.0;
        this.cachedBloomFactors[i] = baseFactors[i]! * mipScale * (i === 0 ? 1.0 : levelScale);
      }
      this.cachedLevels = this.levels;
    }
    // Cast to access internal uniforms
    const compositeUniforms = this.bloomPass.compositeMaterial.uniforms as {
      bloomFactors: { value: number[] };
    };
    compositeUniforms.bloomFactors.value = this.cachedBloomFactors;

    // The UnrealBloomPass needs to work with its own read/write buffers
    // We need to:
    // 1. Set the input texture as the read buffer
    // 2. Render bloom to its write buffer
    // 3. Copy result to our output target

    // Use reusable render targets (created in ensureInitialized)
    if (!this.bloomReadTarget || !this.bloomWriteTarget) {
      console.warn('BloomPass: Render targets not initialized');
      return;
    }

    // Copy input to bloom read target
    this.copyMaterial.uniforms['tDiffuse']!.value = inputTexture;
    renderer.setRenderTarget(this.bloomReadTarget);
    renderer.render(this.copyScene, this.copyCamera);

    // Run bloom pass
    // NOTE: UnrealBloomPass has needsSwap=false and writes back to readBuffer!
    this.bloomPass.render(
      renderer,
      this.bloomWriteTarget,
      this.bloomReadTarget,
      0, // delta not used
      false // maskActive
    );

    // Copy bloom result to output using hardware blit when possible
    // BUG FIX: UnrealBloomPass writes to readBuffer (not writeBuffer) due to needsSwap=false
    // OPTIMIZATION: Use glBlitFramebuffer for hardware-accelerated copy
    if (!outputTarget || !this.blitFramebuffer(renderer, this.bloomReadTarget, outputTarget)) {
      // Fallback to shader-based copy if blit fails
      this.copyMaterial.uniforms['tDiffuse']!.value = this.bloomReadTarget.texture;
      renderer.setRenderTarget(outputTarget);
      renderer.render(this.copyScene, this.copyCamera);
    }

    renderer.setRenderTarget(null);
  }

  /**
   * Set bloom strength.
   * @param strength
   */
  setStrength(strength: number): void {
    this.strength = strength;
  }

  /**
   * Set bloom radius.
   * @param radius
   */
  setRadius(radius: number): void {
    this.radius = radius;
  }

  /**
   * Set luminance threshold.
   * @param threshold
   */
  setThreshold(threshold: number): void {
    this.threshold = threshold;
  }

  /**
   * Set luminance smoothing (softens threshold transition).
   * @param smoothing
   */
  setSmoothing(smoothing: number): void {
    this.smoothing = smoothing;
  }

  /**
   * Set number of blur levels (1-5).
   * @param levels
   */
  setLevels(levels: number): void {
    this.levels = Math.max(1, Math.min(5, Math.round(levels)));
  }

  /**
   * Set HDR peak luminance for normalization.
   * This controls what luminance value is considered "maximum brightness".
   * Higher values = more gradual bloom transition for HDR content.
   * @param hdrPeak
   */
  setHdrPeak(hdrPeak: number): void {
    this.hdrPeak = Math.max(1.0, hdrPeak);
  }

  /**
   * Get current bloom parameters.
   * @returns Object with bloom parameters
   */
  getParameters(): {
    strength: number;
    radius: number;
    threshold: number;
    smoothing: number;
    levels: number;
    hdrPeak: number;
  } {
    return {
      strength: this.strength,
      radius: this.radius,
      threshold: this.threshold,
      smoothing: this.smoothing,
      levels: this.levels,
      hdrPeak: this.hdrPeak,
    };
  }

  /**
   * Release internal GPU resources when pass is disabled.
   *
   * Called by RenderGraph when this pass has been disabled for the grace period.
   * Disposes of render targets and the UnrealBloomPass (which has internal MIP chain),
   * but keeps materials and geometry to avoid shader recompilation on re-enable.
   */
  releaseInternalResources(): void {
    // Dispose UnrealBloomPass (has internal render targets for MIP chain)
    this.bloomPass?.dispose();
    this.bloomPass = null;

    // Dispose HDR high pass material (will be recreated in ensureInitialized)
    this.hdrHighPassMaterial?.dispose();
    this.hdrHighPassMaterial = null;

    // Dispose our read/write targets
    this.bloomReadTarget?.dispose();
    this.bloomReadTarget = null;
    this.bloomWriteTarget?.dispose();
    this.bloomWriteTarget = null;

    // Reset size tracking to trigger reallocation on next execute()
    this.lastWidth = 0;
    this.lastHeight = 0;

    // Keep copyMaterial, copyMesh, copyScene, copyCamera - they're cheap
    // and keeping them avoids shader recompilation on re-enable
  }

  dispose(): void {
    this.bloomPass?.dispose();
    this.bloomPass = null;
    this.hdrHighPassMaterial?.dispose();
    this.hdrHighPassMaterial = null;
    this.bloomReadTarget?.dispose();
    this.bloomReadTarget = null;
    this.bloomWriteTarget?.dispose();
    this.bloomWriteTarget = null;
    this.copyMaterial.dispose();
    this.copyMesh.geometry.dispose();
    // Remove mesh from scene to ensure proper cleanup
    this.copyScene.remove(this.copyMesh);
  }
}
