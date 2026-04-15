/**
 * CPU reference implementation of the 3D voxel-in-island test used by the
 * TDSE write-grid shader for the Page-curve / island-formula overlay.
 *
 * Matches the WGSL `voxelIsInIsland` logic in `tdseWriteGrid.wgsl.ts` bit for
 * bit. Kept in pure TypeScript so unit tests can pin the membership rule
 * without invoking a GPU.
 *
 * Membership rule (for a voxel at world-space coordinates `wx = [x, y, z]`
 * and horizon centroid along axis 0 at `centerX0`):
 *
 * 1. **Supersonic gate**: the island only lives on the supersonic side of the
 *    horizon. Concretely — `wx[0]` and `centerX0` must share a sign (so the
 *    voxel is on the same half-axis as the horizon), and `|wx[0]| ≥ |centerX0|`
 *    (so the voxel is downstream of it). When `centerX0 == 0` (degenerate "no
 *    horizon") the supersonic gate is permissive — every voxel passes — so the
 *    ball collapses to a sphere centred on the origin.
 * 2. **Ball**: `(wx - [centerX0, 0, 0])² ≤ radius²`.
 *
 * @module lib/physics/bec/islandMask
 */

/** Numerical fuzz used when comparing `|wx[0]|` against `|centerX0|`. Mirrors the shader constant. */
const SUPERSONIC_SIGN_EPSILON = 1e-6

/**
 * Point-in-island test for the analog-Hawking quantum-extremal island.
 *
 * @param wx - Voxel world-space coordinates `[x, y, z]` in the same units as
 *   `centerX0` and `radius`.
 * @param centerX0 - Horizon centroid along axis 0 in world units. Sign encodes
 *   which side of the origin the black-hole horizon lives on; `0` denotes a
 *   degenerate "no-horizon" case where the ball centres at the origin.
 * @param radius - Island radius `d*(t)` in world units. `0` denotes "no island"
 *   and always yields `false`.
 * @returns `true` iff the voxel lies inside the island ball and on the
 *   supersonic side of the horizon.
 */
export function isVoxelInIsland(
  wx: readonly [number, number, number],
  centerX0: number,
  radius: number
): boolean {
  if (!Number.isFinite(radius) || radius <= 0) return false
  if (!Number.isFinite(centerX0)) return false
  if (!Number.isFinite(wx[0]) || !Number.isFinite(wx[1]) || !Number.isFinite(wx[2])) return false

  // Supersonic-side gate. When centerX0 == 0 the gate is permissive; otherwise
  // wx[0] must share the sign of centerX0 AND |wx[0]| must exceed |centerX0|
  // (modulo numerical fuzz).
  const onSupersonicSide =
    centerX0 === 0 ||
    (wx[0] * centerX0 >= 0 && Math.abs(wx[0]) >= Math.abs(centerX0) - SUPERSONIC_SIGN_EPSILON)
  if (!onSupersonicSide) return false

  const dx0 = wx[0] - centerX0
  const dy = wx[1]
  const dz = wx[2]
  const r2 = dx0 * dx0 + dy * dy + dz * dz
  return r2 <= radius * radius
}
