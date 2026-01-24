import * as THREE from 'three'

/**
 * Buffer Preview Shader
 *
 * specialized shader for debugging and visualizing various G-buffers
 * (Depth, Normal, Temporal Depth, etc.)
 *
 * This isolates debug logic from production shaders like BokehShader.
 */

export const BufferPreviewShader = {
  name: 'BufferPreviewShader',

  glslVersion: THREE.GLSL3,

  uniforms: {
    tInput: { value: null as THREE.Texture | null },
    type: { value: 0 }, // 0=Generic/Copy, 1=Depth, 2=Normal, 3=TemporalDepth
    nearClip: { value: 0.1 },
    farClip: { value: 1000.0 },
    debugMode: { value: 0 }, // 0=Raw, 1=Linear, 2=FocusZones (for Depth)
    focus: { value: 10.0 },
    focusRange: { value: 5.0 },
  },

  vertexShader: /* glsl */ `
    out vec2 vUv;

    void main() {
      vUv = uv;
      // Use direct NDC coordinates for fullscreen quad (avoids DPR issues)
      gl_Position = vec4(position.xy, 0.0, 1.0);
    }
  `,

  fragmentShader: /* glsl */ `
    precision highp float;

    #include <packing>

    uniform sampler2D tInput;
    uniform int type;
    uniform float nearClip;
    uniform float farClip;

    // Depth specific
    uniform int debugMode;
    uniform float focus;
    uniform float focusRange;

    in vec2 vUv;

    // WebGL2 GLSL ES 3.00 output declaration
    layout(location = 0) out vec4 fragColor;

    float getDepth(float depth) {
      return depth;
    }

    float getViewZ(float depth) {
      return perspectiveDepthToViewZ(depth, nearClip, farClip);
    }

    void main() {
      vec4 texel = texture(tInput, vUv);

      // Type 1: Depth Buffer
      if (type == 1) {
        float depth = texel.x; // Depth is usually in the red channel or single channel
        
        // Mode 0: Raw Depth (Inverted so near=white, far=black)
        if (debugMode == 0) {
          fragColor = vec4(vec3(1.0 - depth), 1.0);
          return;
        }

        float viewZ = -getViewZ(depth);

        // Mode 1: Linear Depth (normalized)
        if (debugMode == 1) {
          float normalized = (viewZ - nearClip) / (farClip - nearClip);
          fragColor = vec4(vec3(clamp(normalized, 0.0, 1.0)), 1.0);
          return;
        }

        // Mode 2: Focus Zones (Green=In Focus, Red=Behind, Blue=In Front)
        if (debugMode == 2) {
          float diff = viewZ - focus;
          float absDiff = abs(diff);

          // Guard against focusRange = 0
          float safeFocusRange = max(focusRange, 0.0001);

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
      if (type == 2) {
        vec3 normal = texel.rgb;
        
        // Check if there is valid data (assuming 0,0,0 is empty/background)
        float hasNormal = step(0.01, length(normal));
        
        fragColor = vec4(normal, 1.0);
        
        if (hasNormal < 0.5) {
          fragColor = vec4(0.05, 0.05, 0.1, 1.0);
        }
        return;
      }

      // Type 3: Temporal Depth
      if (type == 3) {
        float temporalDepth = texel.r;
        
        // 0.0 indicates invalid/empty data (cleared buffer)
        if (temporalDepth < 0.0001) {
          fragColor = vec4(0.0, 0.0, 0.0, 1.0);
          return;
        }

        // Normalize linear ray distance to 0-1 range
        float normalized = (temporalDepth - nearClip) / (farClip - nearClip);
        
        // Invert: Near=White, Far=Black
        fragColor = vec4(vec3(1.0 - clamp(normalized, 0.0, 1.0)), 1.0);
        return;
      }

      // Default: Just copy
      fragColor = texel;
    }
  `,
}
