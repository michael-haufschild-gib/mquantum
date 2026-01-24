/**
 * Cloud Composite Shader (GLSL ES 3.00)
 *
 * Composites premultiplied volumetric cloud color over the scene.
 */

export const cloudCompositeFragmentShader = /* glsl */ `
precision highp float;

uniform sampler2D uSceneColor;
uniform sampler2D uCloud;
uniform float uCloudAvailable;

in vec2 vUv;
layout(location = 0) out vec4 fragColor;

void main() {
  vec4 sceneColor = texture(uSceneColor, vUv);

  if (uCloudAvailable < 0.5) {
    fragColor = sceneColor;
    return;
  }

  vec4 cloudColor = texture(uCloud, vUv);

  // Premultiplied alpha composite: out = cloud + scene * (1 - cloud.a)
  vec3 combined = cloudColor.rgb + sceneColor.rgb * (1.0 - cloudColor.a);
  fragColor = vec4(combined, sceneColor.a);
}
`
