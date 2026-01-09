/**
 * Event Horizon
 *
 * Handles ray-horizon intersection.
 *
 * Uses uVisualEventHorizon for the actual event horizon check (shrinks with spin),
 * while uHorizonRadius remains the Schwarzschild radius (rs = 2M) for scale reference.
 */

export const horizonBlock = /* glsl */ `
//----------------------------------------------
// EVENT HORIZON
//----------------------------------------------

/**
 * Check if ray has crossed the event horizon.
 * Uses uVisualEventHorizon which accounts for Kerr spin:
 * - For spin=0 (Schwarzschild): equals uHorizonRadius
 * - For spin=0.9: ~72% of uHorizonRadius
 * This creates a smaller visual black sphere for spinning black holes.
 */
bool isInsideHorizon(float ndRadius) {
  // Check if ray position is inside the visual event horizon.
  // Any ray crossing this boundary has its light fully absorbed.
  return ndRadius < uVisualEventHorizon;
}
`
