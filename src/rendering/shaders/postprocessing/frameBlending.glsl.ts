/**
 * Frame Blending Shader
 *
 * Blends current frame with previous frame for smoother motion at low frame rates.
 * Uses simple linear interpolation (mix) for temporal accumulation.
 *
 * @module rendering/shaders/postprocessing/frameBlending
 */

export const frameBlendingFragmentShader = /* glsl */ `
precision highp float;

uniform sampler2D uCurrentFrame;
uniform sampler2D uPreviousFrame;
uniform float uBlendFactor;

in vec2 vUv;
layout(location = 0) out vec4 fragColor;

void main() {
  vec4 current = texture(uCurrentFrame, vUv);
  vec4 previous = texture(uPreviousFrame, vUv);

  // Linear blend between current and previous frame
  // blendFactor 0 = fully current, 1 = fully previous
  // Defensive clamp to ensure valid range
  fragColor = mix(current, previous, clamp(uBlendFactor, 0.0, 1.0));
}
`
