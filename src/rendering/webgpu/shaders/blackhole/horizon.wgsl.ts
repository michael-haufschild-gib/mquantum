/**
 * WGSL Event Horizon
 *
 * Port of GLSL blackhole/gravity/horizon.glsl to WGSL.
 * Handles ray-horizon intersection.
 *
 * @module rendering/webgpu/shaders/blackhole/horizon.wgsl
 */

export const horizonBlock = /* wgsl */ `
// ============================================
// Event Horizon
// ============================================

// Check if ray has crossed the event horizon.
// Uses visualEventHorizon which accounts for Kerr spin:
// - For spin=0 (Schwarzschild): equals horizonRadius
// - For spin=0.9: ~72% of horizonRadius
fn isInsideHorizon(ndRadius: f32) -> bool {
  return ndRadius < blackhole.visualEventHorizon;
}
`
