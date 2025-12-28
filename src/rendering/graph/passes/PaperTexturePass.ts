/**
 * Paper Texture Pass
 *
 * Render graph pass for paper texture effect.
 * Applies realistic paper/cardboard texture overlay to the scene.
 *
 * Features:
 * - Fiber noise for paper grain
 * - Crumple patterns for aged paper look
 * - Fold lines for document feel
 * - Water drop marks
 * - Roughness noise for surface texture
 *
 * @module rendering/graph/passes/PaperTexturePass
 */

import * as THREE from 'three';

import { BasePass } from '../BasePass';
import type { RenderContext, RenderPassConfig } from '../types';
import { PaperTextureShader } from '@/rendering/shaders/postprocessing/PaperTextureShader';
import { getPaperNoiseTexture, disposePaperNoiseTexture } from '@/rendering/utils/PaperNoiseGenerator';
import type { PaperQuality } from '@/stores/defaults/visualDefaults';

/**
 * Configuration for PaperTexturePass.
 */
export interface PaperTexturePassConfig extends Omit<RenderPassConfig, 'inputs' | 'outputs'> {
  /** Input color resource */
  colorInput: string;
  /** Output resource */
  outputResource: string;

  /** Contrast - blending behavior (0-1) */
  contrast?: number;
  /** Roughness - pixel noise intensity (0-1) */
  roughness?: number;
  /** Fiber - curly-shaped noise intensity (0-1) */
  fiber?: number;
  /** Fiber size - curly-shaped noise scale (0.1-2) */
  fiberSize?: number;
  /** Crumples - cell-based crumple pattern intensity (0-1) */
  crumples?: number;
  /** Crumple size - cell-based crumple pattern scale (0.1-2) */
  crumpleSize?: number;
  /** Folds - depth of the folds (0-1) */
  folds?: number;
  /** Fold count - number of folds (1-15) */
  foldCount?: number;
  /** Drops - visibility of speckle pattern (0-1) */
  drops?: number;
  /** Fade - big-scale noise mask (0-1) */
  fade?: number;
  /** Seed - randomization seed (0-1000) */
  seed?: number;
  /** Front color - foreground color (hex) */
  colorFront?: string;
  /** Back color - background color (hex) */
  colorBack?: string;
  /** Quality level - controls feature complexity */
  quality?: PaperQuality;
  /** Effect intensity (0-1) */
  intensity?: number;
}

/**
 * Converts a hex color string to a THREE.Vector4 (RGBA).
 */
function hexToVector4(hex: string, alpha: number = 1.0): THREE.Vector4 {
  const color = new THREE.Color(hex);
  return new THREE.Vector4(color.r, color.g, color.b, alpha);
}

/**
 * Converts quality level to numeric value.
 */
function qualityToNumber(quality: PaperQuality): number {
  switch (quality) {
    case 'low':
      return 0;
    case 'medium':
      return 1;
    case 'high':
      return 2;
    default:
      return 1;
  }
}

/**
 * Paper texture effects pass.
 *
 * @example
 * ```typescript
 * const paperPass = new PaperTexturePass({
 *   id: 'paper',
 *   colorInput: 'tonemappedColor',
 *   outputResource: 'paperOutput',
 *   contrast: 0.5,
 *   roughness: 0.3,
 *   fiber: 0.4,
 *   quality: 'medium',
 * });
 * ```
 */
export class PaperTexturePass extends BasePass {
  private material: THREE.ShaderMaterial;
  private mesh: THREE.Mesh;
  private scene: THREE.Scene;
  private camera: THREE.OrthographicCamera;

  private colorInputId: string;
  private outputId: string;

  private noiseTextureInitialized = false;

  constructor(config: PaperTexturePassConfig) {
    super({
      id: config.id,
      name: config.name ?? 'Paper Texture Pass',
      inputs: [{ resourceId: config.colorInput, access: 'read' }],
      outputs: [{ resourceId: config.outputResource, access: 'write' }],
      enabled: config.enabled,
      priority: config.priority,
      skipPassthrough: config.skipPassthrough,
    });

    this.colorInputId = config.colorInput;
    this.outputId = config.outputResource;

    // Create material from PaperTextureShader
    this.material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: PaperTextureShader.vertexShader,
      fragmentShader: PaperTextureShader.fragmentShader,
      uniforms: THREE.UniformsUtils.clone(PaperTextureShader.uniforms),
      depthTest: false,
      depthWrite: false,
    });

    // Set initial parameters
    this.material.uniforms['uContrast']!.value = config.contrast ?? 0.5;
    this.material.uniforms['uRoughness']!.value = config.roughness ?? 0.3;
    this.material.uniforms['uFiber']!.value = config.fiber ?? 0.4;
    this.material.uniforms['uFiberSize']!.value = config.fiberSize ?? 0.5;
    this.material.uniforms['uCrumples']!.value = config.crumples ?? 0.2;
    this.material.uniforms['uCrumpleSize']!.value = config.crumpleSize ?? 0.5;
    this.material.uniforms['uFolds']!.value = config.folds ?? 0.1;
    this.material.uniforms['uFoldCount']!.value = config.foldCount ?? 5;
    this.material.uniforms['uDrops']!.value = config.drops ?? 0.0;
    this.material.uniforms['uFade']!.value = config.fade ?? 0.0;
    this.material.uniforms['uSeed']!.value = config.seed ?? 42;
    this.material.uniforms['uIntensity']!.value = config.intensity ?? 1.0;

    // Set colors
    if (config.colorFront) {
      this.material.uniforms['uColorFront']!.value = hexToVector4(config.colorFront);
    }
    if (config.colorBack) {
      this.material.uniforms['uColorBack']!.value = hexToVector4(config.colorBack);
    }

    // Set quality
    this.material.uniforms['uQuality']!.value = qualityToNumber(config.quality ?? 'medium');

    // Create fullscreen quad
    const geometry = new THREE.PlaneGeometry(2, 2);
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.frustumCulled = false;

    this.scene = new THREE.Scene();
    this.scene.add(this.mesh);

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }

  /**
   * Initializes the noise texture on first execute (lazy initialization).
   */
  private initNoiseTexture(): void {
    if (!this.noiseTextureInitialized) {
      const noiseTexture = getPaperNoiseTexture();
      this.material.uniforms['tNoiseTexture']!.value = noiseTexture;
      this.noiseTextureInitialized = true;
    }
  }

  execute(ctx: RenderContext): void {
    const { renderer, time, size } = ctx;

    // Get textures
    const colorTex = ctx.getReadTexture(this.colorInputId);
    const outputTarget = ctx.getWriteTarget(this.outputId);

    if (!colorTex) {
      return;
    }

    // Initialize noise texture on first use
    this.initNoiseTexture();

    // Update uniforms
    this.material.uniforms['tDiffuse']!.value = colorTex;
    this.material.uniforms['uTime']!.value = time;
    this.material.uniforms['uResolution']!.value.set(size.width, size.height);
    this.material.uniforms['uPixelRatio']!.value = renderer.getPixelRatio();

    // Render
    renderer.setRenderTarget(outputTarget);
    renderer.render(this.scene, this.camera);
    renderer.setRenderTarget(null);
  }

  // ============================================================================
  // Setter Methods
  // ============================================================================

  setContrast(value: number): void {
    this.material.uniforms['uContrast']!.value = value;
  }

  setRoughness(value: number): void {
    this.material.uniforms['uRoughness']!.value = value;
  }

  setFiber(value: number): void {
    this.material.uniforms['uFiber']!.value = value;
  }

  setFiberSize(value: number): void {
    this.material.uniforms['uFiberSize']!.value = value;
  }

  setCrumples(value: number): void {
    this.material.uniforms['uCrumples']!.value = value;
  }

  setCrumpleSize(value: number): void {
    this.material.uniforms['uCrumpleSize']!.value = value;
  }

  setFolds(value: number): void {
    this.material.uniforms['uFolds']!.value = value;
  }

  setFoldCount(value: number): void {
    this.material.uniforms['uFoldCount']!.value = value;
  }

  setDrops(value: number): void {
    this.material.uniforms['uDrops']!.value = value;
  }

  setFade(value: number): void {
    this.material.uniforms['uFade']!.value = value;
  }

  setSeed(value: number): void {
    this.material.uniforms['uSeed']!.value = value;
  }

  setColorFront(hex: string): void {
    this.material.uniforms['uColorFront']!.value = hexToVector4(hex);
  }

  setColorBack(hex: string): void {
    this.material.uniforms['uColorBack']!.value = hexToVector4(hex);
  }

  setQuality(quality: PaperQuality): void {
    this.material.uniforms['uQuality']!.value = qualityToNumber(quality);
  }

  setIntensity(value: number): void {
    this.material.uniforms['uIntensity']!.value = value;
  }

  dispose(): void {
    this.material.dispose();
    this.mesh.geometry.dispose();
    // Remove mesh from scene to ensure proper cleanup
    this.scene.remove(this.mesh);

    // Dispose the shared noise texture
    // Note: This uses a reference-counted singleton, so it only disposes
    // when no other passes are using it
    if (this.noiseTextureInitialized) {
      disposePaperNoiseTexture();
      this.noiseTextureInitialized = false;
    }
  }
}
