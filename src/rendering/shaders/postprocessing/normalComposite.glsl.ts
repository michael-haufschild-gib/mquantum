/**
 * Normal Composite Shader (GLSL ES 3.00)
 *
 * Composites environment normals with main object MRT normals, and optionally
 * overlays volumetric normals from the temporal cloud buffer.
 *
 * Note: Depth-based compositing was removed because after the scene pass split
 * for gravitational lensing, the depths from MAIN_OBJECT_MRT and SCENE_COLOR
 * no longer match reliably. Since MAIN_OBJECT_MRT only contains the main object,
 * the presence of a valid normal magnitude is sufficient for compositing.
 */

export const normalCompositeFragmentShader = /* glsl */ `
precision highp float;

uniform sampler2D uNormalEnv;
uniform sampler2D uMainNormal;
uniform sampler2D uCloudNormal;
uniform float uCloudAvailable;

in vec2 vUv;
layout(location = 0) out vec4 fragColor;

float normalMagnitude(vec4 n) {
  return length(n.rgb);
}

void main() {
  vec4 envNormal = texture(uNormalEnv, vUv);
  vec4 mainNormal = texture(uMainNormal, vUv);

  vec4 outNormal = envNormal;

  // Use main object normal if it has valid data
  float hasMainNormal = step(0.001, normalMagnitude(mainNormal));
  if (hasMainNormal > 0.5) {
    outNormal = mainNormal;
  }

  // Overlay cloud normals if available
  if (uCloudAvailable > 0.5) {
    vec4 cloudNormal = texture(uCloudNormal, vUv);
    float hasCloudNormal = step(0.001, normalMagnitude(cloudNormal));
    if (hasCloudNormal > 0.5) {
      outNormal = cloudNormal;
    }
  }

  fragColor = outNormal;
}
`
