export const precisionBlock = `
precision highp float;

// Output declarations for WebGL2 MRT (Multiple Render Targets)
//
// IMPORTANT: When using Three.js ShaderMaterial with glslVersion: GLSL3 and
// WebGLRenderTarget with count > 1, you MUST use explicit layout(location = N)
// qualifiers for EACH output. Three.js will NOT add these automatically.
//
// Layout:
//   location 0 = Color (RGB + alpha)
//   location 1 = Normal (view-space normal * 0.5 + 0.5, metallic in alpha)
//   location 2 = Position (world position for temporal reprojection, when enabled)
//
// Reference: https://github.com/mrdoob/three.js/issues/22920

layout(location = 0) out vec4 gColor;
layout(location = 1) out vec4 gNormal;
// ALWAYS declare gPosition to prevent GL_INVALID_OPERATION when switching layers
// during temporal toggle. Unused outputs are safely ignored by WebGL.
// See: docs/bugfixing/log/2025-12-21-schroedinger-temporal-gl-invalid-operation.md
layout(location = 2) out vec4 gPosition;
`
