/**
 * Temporal Cloud Depth Pass
 *
 * Extracts depth from the temporal cloud accumulation buffer's world position data.
 * This enables post-processing effects (SSR, Bokeh, Refraction) to work with
 * Schroedinger when temporal cloud accumulation is active.
 *
 * The temporal accumulation buffer stores world position in attachment [1].
 * This pass converts world position to NDC depth for compatibility with
 * standard depth-based post-processing effects.
 *
 * @module rendering/graph/passes/TemporalCloudDepthPass
 */

import * as THREE from 'three';

import { BasePass } from '../BasePass';
import type { RenderContext, RenderPassConfig } from '../types';

/**
 * Uniforms interface for TemporalCloudDepthPass shader.
 */
interface TemporalCloudDepthUniforms {
  uWorldPosition: THREE.IUniform<THREE.Texture | null>;
  uViewProjectionMatrix: THREE.IUniform<THREE.Matrix4>;
  uNear: THREE.IUniform<number>;
  uFar: THREE.IUniform<number>;
}

/**
 * Configuration for TemporalCloudDepthPass.
 */
export interface TemporalCloudDepthPassConfig extends Omit<RenderPassConfig, 'inputs' | 'outputs'> {
  /** World position input resource (temporal accumulation buffer) */
  positionInput: string;
  /** Attachment index for world position (default: 1) */
  positionAttachment?: number;
  /** Output depth resource */
  outputResource: string;
}

/**
 * Vertex shader for fullscreen quad.
 * Uses direct NDC coordinates for PlaneGeometry(2, 2).
 */
const vertexShader = /* glsl */ `
out vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

/**
 * Fragment shader that converts world position to NDC depth.
 * Reads world position from temporal accumulation buffer and outputs depth.
 */
const fragmentShader = /* glsl */ `
precision highp float;

uniform sampler2D uWorldPosition;
uniform mat4 uViewProjectionMatrix;
uniform float uNear;
uniform float uFar;

in vec2 vUv;
layout(location = 0) out vec4 fragColor;

void main() {
  // Sample world position from temporal accumulation buffer
  vec4 worldPosSample = texture(uWorldPosition, vUv);
  vec3 worldPos = worldPosSample.xyz;

  // Check if we have valid position data (alpha > 0 means valid sample)
  // The temporal accumulation stores alpha as accumulated weight
  float validity = worldPosSample.w;

  if (validity < 0.001 || length(worldPos) < 0.001) {
    // No valid data - output far depth (1.0)
    fragColor = vec4(1.0, 0.0, 0.0, 0.0);
    return;
  }

  // Transform world position to clip space
  vec4 clipPos = uViewProjectionMatrix * vec4(worldPos, 1.0);

  // Convert to NDC depth (0-1 range)
  // clipPos.z is in [-near, -far] for view space, but after projection
  // it's in [-w, w] range. Dividing by w gives NDC in [-1, 1].
  // We then remap to [0, 1] for depth buffer compatibility.
  float ndcDepth = (clipPos.z / clipPos.w) * 0.5 + 0.5;

  // Clamp to valid depth range
  ndcDepth = clamp(ndcDepth, 0.0, 1.0);

  // Output depth in red channel (matches how depth textures are read)
  // Also store in all channels for flexibility
  fragColor = vec4(ndcDepth, ndcDepth, ndcDepth, 1.0);
}
`;

/**
 * Extracts depth from temporal cloud accumulation's world position buffer.
 *
 * This pass is needed because when Schroedinger uses temporal cloud accumulation,
 * it renders to the VOLUMETRIC layer at 1/4 resolution and doesn't write to the
 * standard depth buffer. Post-processing effects that need depth (SSR, Bokeh,
 * Refraction) can use the output of this pass instead.
 *
 * @example
 * ```typescript
 * const temporalCloudDepth = new TemporalCloudDepthPass({
 *   id: 'temporalCloudDepth',
 *   positionInput: 'temporalAccumulation',
 *   positionAttachment: 1,
 *   outputResource: 'temporalCloudDepth',
 *   enabled: () => isSchroedingerTemporalActive,
 * });
 * ```
 */
export class TemporalCloudDepthPass extends BasePass {
  private material: THREE.ShaderMaterial;
  private mesh: THREE.Mesh;
  private scene: THREE.Scene;
  private camera: THREE.OrthographicCamera;

  private positionInputId: string;
  private positionAttachment: number;
  private outputId: string;

  // Reusable matrix to avoid per-frame allocation
  private viewProjectionMatrix = new THREE.Matrix4();

  constructor(config: TemporalCloudDepthPassConfig) {
    const positionAttachment = config.positionAttachment ?? 1;

    super({
      ...config,
      inputs: [
        {
          resourceId: config.positionInput,
          access: 'read',
          attachment: positionAttachment,
        },
      ],
      outputs: [{ resourceId: config.outputResource, access: 'write' }],
    });

    this.positionInputId = config.positionInput;
    this.positionAttachment = positionAttachment;
    this.outputId = config.outputResource;

    // Create shader material
    this.material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader,
      fragmentShader,
      uniforms: {
        uWorldPosition: { value: null },
        uViewProjectionMatrix: { value: new THREE.Matrix4() },
        uNear: { value: 0.1 },
        uFar: { value: 1000.0 },
      },
      depthTest: false,
      depthWrite: false,
      blending: THREE.NoBlending,
    });

    // Create fullscreen quad
    const geometry = new THREE.PlaneGeometry(2, 2);
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.frustumCulled = false;

    // Create dedicated scene and camera
    this.scene = new THREE.Scene();
    this.scene.add(this.mesh);
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }

  execute(ctx: RenderContext): void {
    const { renderer, camera } = ctx;

    // Get input texture (world position from temporal accumulation)
    const positionTexture = ctx.getReadTexture(this.positionInputId, this.positionAttachment);
    if (!positionTexture) {
      return;
    }

    // Get output target
    const outputTarget = ctx.getWriteTarget(this.outputId);
    if (!outputTarget) {
      return;
    }

    // Update uniforms
    const uniforms = this.material.uniforms as unknown as TemporalCloudDepthUniforms;
    uniforms.uWorldPosition.value = positionTexture;

    // Compute view-projection matrix
    this.viewProjectionMatrix.multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse
    );
    uniforms.uViewProjectionMatrix.value.copy(this.viewProjectionMatrix);

    // Get near/far from camera if it's a perspective camera
    if ((camera as THREE.PerspectiveCamera).isPerspectiveCamera) {
      const perspCam = camera as THREE.PerspectiveCamera;
      uniforms.uNear.value = perspCam.near;
      uniforms.uFar.value = perspCam.far;
    }

    // Render
    renderer.setRenderTarget(outputTarget);
    renderer.setClearColor(0xffffff, 1); // Clear to far depth (white)
    renderer.clear(true, false, false);
    renderer.render(this.scene, this.camera);
    renderer.setRenderTarget(null);
  }

  dispose(): void {
    this.material.dispose();
    this.mesh.geometry.dispose();
    this.scene.remove(this.mesh);
  }
}
