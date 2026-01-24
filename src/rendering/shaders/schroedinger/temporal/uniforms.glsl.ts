/**
 * Uniform declarations for temporal cloud accumulation shaders
 *
 * NOTE: This file serves as documentation and a reference for the uniforms
 * used across the temporal accumulation system. The actual uniform declarations
 * are embedded directly in each shader (reprojection.glsl.ts, reconstruction.glsl.ts)
 * to allow per-shader customization.
 *
 * This block is NOT imported by other shaders - it's exported for potential
 * future use (e.g., generating TypeScript interfaces for uniform validation).
 */

export const temporalCloudUniformsBlock = `
// ============================================
// Temporal Cloud Accumulation Uniforms
// ============================================

// Previous frame's accumulated cloud color
uniform sampler2D uPrevAccumulation;

// Previous frame's weighted world positions (for motion vectors)
uniform sampler2D uPrevPositionBuffer;

// Current frame's cloud render (quarter resolution)
uniform sampler2D uCloudRender;

// Current frame's depth buffer
uniform sampler2D uSceneDepth;

// Previous frame's view-projection matrix
uniform mat4 uPrevViewProjectionMatrix;

// Current Bayer offset for this frame (0,0), (1,1), (1,0), or (0,1)
uniform vec2 uBayerOffset;

// Current frame index (0-3)
uniform int uFrameIndex;

// Whether temporal cloud accumulation is enabled
uniform bool uTemporalCloudEnabled;

// Resolution of the quarter-res cloud render target
uniform vec2 uCloudResolution;

// Resolution of the full accumulation buffer
uniform vec2 uAccumulationResolution;

// History blend weight (0.0 = all new, 1.0 = all history)
uniform float uHistoryWeight;

// Disocclusion threshold for depth-based rejection
uniform float uDisocclusionThreshold;
`
