/**
 * Buffer Preview Pass (Render Graph)
 *
 * Debug visualization pass for viewing various G-buffer contents:
 * - Depth buffer (raw, linear, focus zones)
 * - Normal buffer
 * - Temporal depth buffer
 * - Generic texture copy
 *
 * @module rendering/graph/passes/BufferPreviewPass
 */

import * as THREE from 'three';

import { BasePass } from '../BasePass';
import type { RenderContext, RenderPassConfig } from '../types';

/**
 * Buffer types that can be previewed.
 */
export type BufferType = 'copy' | 'depth' | 'normal' | 'temporalDepth';

/**
 * Depth visualization modes.
 */
export type DepthMode = 'raw' | 'linear' | 'focusZones';

/**
 * Configuration for BufferPreviewPass.
 */
export interface BufferPreviewPassConfig extends Omit<RenderPassConfig, 'inputs' | 'outputs'> {
  /** Input resource to preview */
  bufferInput: string;
  /** Additional input resources (for dynamic switching without recompiling) */
  additionalInputs?: string[];
  /** Output resource */
  outputResource: string;
  /** Type of buffer being previewed */
  bufferType?: BufferType;
  /** Depth visualization mode (for depth buffers) */
  depthMode?: DepthMode;
  /** Camera near plane (for depth linearization) */
  nearClip?: number;
  /** Camera far plane (for depth linearization) */
  farClip?: number;
  /** Focus distance (for focus zones visualization) */
  focus?: number;
  /** Focus range (for focus zones visualization) */
  focusRange?: number;
}

/**
 * Buffer preview shader (GLSL ES 3.00)
 */
const bufferPreviewShader = {
  vertexShader: /* glsl */ `
    out vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position.xy, 0.0, 1.0);
    }
  `,

  fragmentShader: /* glsl */ `
    precision highp float;

    uniform sampler2D tInput;
    uniform int uType;         // 0=Copy, 1=Depth, 2=Normal, 3=TemporalDepth
    uniform int uDepthMode;    // 0=Raw, 1=Linear, 2=FocusZones
    uniform float uNearClip;
    uniform float uFarClip;
    uniform float uFocus;
    uniform float uFocusRange;

    in vec2 vUv;
    layout(location = 0) out vec4 fragColor;

    float perspectiveDepthToViewZ(float depth, float near, float far) {
      return (near * far) / ((far - near) * depth - far);
    }

    void main() {
      vec4 texel = texture(tInput, vUv);

      // Type 1: Depth Buffer
      if (uType == 1) {
        float depth = texel.x;

        // Mode 0: Raw Depth (Inverted: near=white, far=black)
        if (uDepthMode == 0) {
          fragColor = vec4(vec3(1.0 - depth), 1.0);
          return;
        }

        float viewZ = -perspectiveDepthToViewZ(depth, uNearClip, uFarClip);

        // Mode 1: Linear Depth (normalized)
        if (uDepthMode == 1) {
          float normalized = (viewZ - uNearClip) / (uFarClip - uNearClip);
          fragColor = vec4(vec3(clamp(normalized, 0.0, 1.0)), 1.0);
          return;
        }

        // Mode 2: Focus Zones (Green=In Focus, Red=Behind, Blue=In Front)
        if (uDepthMode == 2) {
          float diff = viewZ - uFocus;
          float absDiff = abs(diff);
          float safeFocusRange = max(uFocusRange, 0.0001);

          // Green: In Focus
          float inFocus = 1.0 - clamp(absDiff / safeFocusRange, 0.0, 1.0);
          // Red: Behind focus
          float behind = clamp(diff / (safeFocusRange * 3.0), 0.0, 1.0);
          // Blue: In front of focus
          float infront = clamp(-diff / (safeFocusRange * 3.0), 0.0, 1.0);

          fragColor = vec4(behind, inFocus, infront, 1.0);
          return;
        }
      }

      // Type 2: Normal Buffer
      if (uType == 2) {
        vec3 normal = texel.rgb;

        // Check for valid data (empty/background = near-zero)
        float hasNormal = step(0.01, length(normal));

        if (hasNormal < 0.5) {
          fragColor = vec4(0.05, 0.05, 0.1, 1.0);
        } else {
          // Map from [-1, 1] to [0, 1] for visualization
          vec3 displayNormal = normal * 0.5 + 0.5;
          fragColor = vec4(displayNormal, 1.0);
        }
        return;
      }

      // Type 3: Temporal Depth
      // gPosition buffer: xyz = model-space position, w = model-space ray distance
      if (uType == 3) {
        float temporalDepth = texel.w;  // Use .w (ray distance), NOT .r (X position)!

        // 0.0 indicates invalid/empty data (no hit)
        if (temporalDepth < 0.0001) {
          fragColor = vec4(0.0, 0.0, 0.0, 1.0);
          return;
        }

        // Normalize linear ray distance to 0-1 range
        float normalized = (temporalDepth - uNearClip) / (uFarClip - uNearClip);

        // Invert: Near=White, Far=Black
        fragColor = vec4(vec3(1.0 - clamp(normalized, 0.0, 1.0)), 1.0);
        return;
      }

      // Type 0: Default - just copy
      fragColor = texel;
    }
  `,
};

/**
 * Buffer preview pass for render graph.
 *
 * Provides debug visualization of various G-buffer contents.
 * Useful for debugging depth, normals, and other intermediate buffers.
 *
 * @example
 * ```typescript
 * const depthPreview = new BufferPreviewPass({
 *   id: 'depthPreview',
 *   bufferInput: 'sceneDepth',
 *   outputResource: 'previewOutput',
 *   bufferType: 'depth',
 *   depthMode: 'linear',
 *   nearClip: 0.1,
 *   farClip: 1000.0,
 * });
 * ```
 */
export class BufferPreviewPass extends BasePass {
  private material: THREE.ShaderMaterial;
  private mesh: THREE.Mesh;
  private scene: THREE.Scene;
  private camera: THREE.OrthographicCamera;

  private bufferInputId: string;
  private outputId: string;
  private externalTexture: THREE.Texture | null = null;

  constructor(config: BufferPreviewPassConfig) {
    const inputIds = [config.bufferInput, ...(config.additionalInputs ?? [])];
    const uniqueInputs = Array.from(new Set(inputIds));

    super({
      id: config.id,
      name: config.name ?? 'Buffer Preview Pass',
      inputs: uniqueInputs.map((resourceId) => ({ resourceId, access: 'read' as const })),
      outputs: [{ resourceId: config.outputResource, access: 'write' }],
      enabled: config.enabled,
      priority: config.priority,
      skipPassthrough: config.skipPassthrough,
    });

    this.bufferInputId = config.bufferInput;
    this.outputId = config.outputResource;

    // Map buffer type to int
    const typeMap: Record<BufferType, number> = {
      copy: 0,
      depth: 1,
      normal: 2,
      temporalDepth: 3,
    };

    // Map depth mode to int
    const depthModeMap: Record<DepthMode, number> = {
      raw: 0,
      linear: 1,
      focusZones: 2,
    };

    // Create material
    this.material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        tInput: { value: null },
        uType: { value: typeMap[config.bufferType ?? 'copy'] },
        uDepthMode: { value: depthModeMap[config.depthMode ?? 'raw'] },
        uNearClip: { value: config.nearClip ?? 0.1 },
        uFarClip: { value: config.farClip ?? 1000.0 },
        uFocus: { value: config.focus ?? 10.0 },
        uFocusRange: { value: config.focusRange ?? 5.0 },
      },
      vertexShader: bufferPreviewShader.vertexShader,
      fragmentShader: bufferPreviewShader.fragmentShader,
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

  execute(ctx: RenderContext): void {
    const { renderer, camera } = ctx;

    // Get textures
    const inputTex = this.externalTexture ?? ctx.getReadTexture(this.bufferInputId);
    const outputTarget = ctx.getWriteTarget(this.outputId);

    if (!inputTex) {
      return;
    }

    // Update camera clip planes if using depth visualization
    const perspCam = camera as THREE.PerspectiveCamera;
    if (perspCam.near !== undefined) {
      this.material.uniforms['uNearClip']!.value = perspCam.near;
      this.material.uniforms['uFarClip']!.value = perspCam.far;
    }

    // Update uniforms
    this.material.uniforms['tInput']!.value = inputTex;

    // Render
    renderer.setRenderTarget(outputTarget);
    renderer.render(this.scene, this.camera);
    renderer.setRenderTarget(null);
  }

  /**
   * Set buffer type to preview
   * @param type
   */
  setBufferType(type: BufferType): void {
    const typeMap: Record<BufferType, number> = {
      copy: 0,
      depth: 1,
      normal: 2,
      temporalDepth: 3,
    };
    this.material.uniforms['uType']!.value = typeMap[type];
  }

  /**
   * Set which resource ID to preview
   * @param resourceId
   */
  setBufferInput(resourceId: string): void {
    this.bufferInputId = resourceId;
  }

  /**
   * Provide an external texture (bypasses resource lookup)
   * @param texture
   */
  setExternalTexture(texture: THREE.Texture | null): void {
    this.externalTexture = texture;
  }

  /**
   * Set depth visualization mode
   * @param mode
   */
  setDepthMode(mode: DepthMode): void {
    const modeMap: Record<DepthMode, number> = {
      raw: 0,
      linear: 1,
      focusZones: 2,
    };
    this.material.uniforms['uDepthMode']!.value = modeMap[mode];
  }

  /**
   * Set focus parameters for focus zones visualization
   * @param focus
   * @param focusRange
   */
  setFocusParams(focus: number, focusRange: number): void {
    this.material.uniforms['uFocus']!.value = focus;
    this.material.uniforms['uFocusRange']!.value = focusRange;
  }

  dispose(): void {
    this.material.dispose();
    this.mesh.geometry.dispose();
    // Remove mesh from scene to ensure proper cleanup
    this.scene.remove(this.mesh);
  }
}
