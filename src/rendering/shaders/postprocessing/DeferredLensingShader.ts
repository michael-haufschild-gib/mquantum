/**
 * Deferred Lensing Post-Processing Shader
 *
 * Applies gravitational lensing distortion to the rendered scene
 * as a screen-space post-processing effect. This allows background
 * objects to be affected by the black hole's gravitational field.
 *
 * The shader takes the black hole's screen position and radius,
 * then computes UV distortion for each pixel based on distance
 * from the center using gravitational lensing formulas.
 */

import * as THREE from 'three'

/**
 * Vertex shader for fullscreen quad
 */
const vertexShader = /* glsl */ `
precision highp float;

out vec2 vUv;

void main() {
  vUv = uv;
  // Direct NDC for fullscreen quad (PlaneGeometry(2, 2))
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

/**
 * Fragment shader for deferred lensing
 */
const fragmentShader = /* glsl */ `
precision highp float;

in vec2 vUv;

// Scene input
uniform sampler2D uSceneTexture;

// Black hole parameters
uniform vec2 uBlackHoleCenter;      // Center in UV space (0-1)
uniform float uHorizonRadiusUV;     // Horizon radius in UV space
uniform float uLensingStrength;     // Overall distortion strength
uniform float uLensingFalloff;      // Distance falloff exponent
uniform float uChromaticAmount;     // Chromatic aberration strength

// Output
layout(location = 0) out vec4 fragColor;

/**
 * Compute lensing displacement for a UV coordinate.
 */
vec2 computeDisplacement(vec2 uv, vec2 center, float strength, float falloff) {
  vec2 toCenter = center - uv;
  float r = length(toCenter);

  // Skip if very close to center
  if (r < 0.001) {
    return vec2(0.0);
  }

  // Direction toward center
  vec2 dir = normalize(toCenter);

  // Gravitational lensing magnitude
  float safeR = max(r, 0.01);
  float mag = strength / pow(safeR, falloff);
  mag = min(mag, 0.4); // Clamp to prevent extreme distortion

  return dir * mag;
}

/**
 * Sample with chromatic aberration.
 * PERF: Pre-computes UV offsets to avoid redundant multiplications.
 */
vec3 sampleChromatic(vec2 uv, vec2 displacement, float chromatic) {
  // Chromatic separation constant
  const float CHROMATIC_SCALE = 0.015;

  // Pre-compute UV coordinates
  vec2 baseUV = uv + displacement;
  vec2 chromaticOffset = displacement * chromatic * CHROMATIC_SCALE;

  // Sample with offset for each channel (R bends less, B bends more)
  float r = texture(uSceneTexture, baseUV - chromaticOffset).r;
  float g = texture(uSceneTexture, baseUV).g;
  float b = texture(uSceneTexture, baseUV + chromaticOffset).b;

  return vec3(r, g, b);
}

void main() {
  // Skip if lensing is disabled (strength near zero)
  if (uLensingStrength < 0.001) {
    fragColor = texture(uSceneTexture, vUv);
    return;
  }

  // Compute displacement
  vec2 displacement = computeDisplacement(vUv, uBlackHoleCenter, uLensingStrength, uLensingFalloff);

  // Distance from center
  float r = length(vUv - uBlackHoleCenter);

  // Inside event horizon: pure black
  if (r < uHorizonRadiusUV) {
    fragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }

  // Apply displacement
  vec2 distortedUV = vUv + displacement;
  distortedUV = clamp(distortedUV, vec2(0.0), vec2(1.0));

  // Sample with optional chromatic aberration
  vec3 color;
  if (uChromaticAmount > 0.01) {
    color = sampleChromatic(vUv, displacement, uChromaticAmount);
  } else {
    color = texture(uSceneTexture, distortedUV).rgb;
  }

  // Einstein ring brightness boost near photon sphere
  float ringRadius = uHorizonRadiusUV * 1.5;
  float ringWidth = uHorizonRadiusUV * 0.25;
  float diff = abs(r - ringRadius);
  float boost = 1.0 + exp(-diff * diff / (ringWidth * ringWidth * 2.0)) * 0.3;
  color *= boost;

  fragColor = vec4(color, 1.0);
}
`

/**
 * Create deferred lensing uniforms
 * @returns Object containing lensing uniforms
 */
export function createDeferredLensingUniforms(): Record<string, THREE.IUniform> {
  return {
    uSceneTexture: { value: null as THREE.Texture | null },
    uBlackHoleCenter: { value: new THREE.Vector2(0.5, 0.5) },
    uHorizonRadiusUV: { value: 0.05 },
    uLensingStrength: { value: 0.1 },
    uLensingFalloff: { value: 1.5 },
    uChromaticAmount: { value: 0.0 },
  }
}

/**
 * Deferred lensing shader material definition
 */
export const DeferredLensingShader = {
  name: 'DeferredLensingShader',
  vertexShader,
  fragmentShader,
  uniforms: createDeferredLensingUniforms(),
} as const

/**
 * Create a new shader material for deferred lensing
 * @returns New THREE.ShaderMaterial configured for lensing
 */
export function createDeferredLensingMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    name: 'DeferredLensingMaterial',
    uniforms: createDeferredLensingUniforms(),
    vertexShader,
    fragmentShader,
    glslVersion: THREE.GLSL3,
    depthTest: false,
    depthWrite: false,
  })
}

/**
 * Update deferred lensing uniforms from black hole state
 *
 * @param uniforms - Shader uniforms to update
 * @param config - Black hole configuration
 * @param config.deferredLensingEnabled - Whether lensing is enabled
 * @param config.deferredLensingStrength - Intensity of the lensing effect
 * @param config.horizonRadius - Physical radius of the black hole
 * @param blackHolePosition - Black hole world position
 * @param camera - Current camera for projection
 */
export function updateDeferredLensingUniforms(
  uniforms: Record<string, THREE.IUniform>,
  config: {
    deferredLensingEnabled: boolean
    deferredLensingStrength: number
    horizonRadius: number
  },
  blackHolePosition: THREE.Vector3,
  camera: THREE.PerspectiveCamera
): void {
  const lensingStrength = uniforms.uLensingStrength
  const blackHoleCenter = uniforms.uBlackHoleCenter
  const horizonRadiusUV = uniforms.uHorizonRadiusUV
  const lensingFalloff = uniforms.uLensingFalloff

  if (!lensingStrength || !blackHoleCenter || !horizonRadiusUV || !lensingFalloff) {
    return
  }

  if (!config.deferredLensingEnabled) {
    lensingStrength.value = 0
    return
  }

  // Project black hole center to screen space
  const projected = blackHolePosition.clone().project(camera)

  // Convert to UV coordinates (0-1)
  const centerUV = new THREE.Vector2((projected.x + 1) * 0.5, (projected.y + 1) * 0.5)

  blackHoleCenter.value = centerUV

  // Calculate horizon radius in screen space
  // This is an approximation based on distance from camera
  const distance = camera.position.distanceTo(blackHolePosition)
  const fovY = (camera.fov * Math.PI) / 180
  const screenHeight = 2 * distance * Math.tan(fovY / 2)
  const radiusUV = config.horizonRadius / screenHeight

  horizonRadiusUV.value = radiusUV
  lensingStrength.value = config.deferredLensingStrength * 0.1
  lensingFalloff.value = 1.5
}
