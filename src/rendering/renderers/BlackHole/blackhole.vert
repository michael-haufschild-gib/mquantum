/**
 * Black Hole Vertex Shader
 *
 * Standard raymarching vertex shader using box geometry with BackSide.
 * Passes world-space position for ray direction calculation in fragment shader.
 */

out vec3 vPosition;

void main() {
  // Transform to world space for ray direction calculation
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vPosition = worldPosition.xyz;

  // Standard MVP transformation
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
