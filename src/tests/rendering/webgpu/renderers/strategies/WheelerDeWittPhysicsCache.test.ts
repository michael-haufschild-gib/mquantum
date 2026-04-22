/**
 * `WheelerDeWittPhysicsCache` trajectory-integration contract tests.
 *
 * Covers the regression chain:
 *   1. Static streamline overlay enabled (baseline) — trajectories are
 *      populated.
 *   2. Static streamlines disabled AND worldline pulse disabled —
 *      trajectories must be `null` (we do not pay the WKB-integration
 *      cost on every solver re-run for an invisible overlay).
 *   3. Static streamlines disabled AND worldline pulse enabled —
 *      trajectories MUST be populated, otherwise the pulse overlay has
 *      no data and silently renders as nothing. This is the specific
 *      bug the trajectory-hash regression test guards at the hash
 *      level; this file asserts the actual integration path.
 *   4. Toggling `worldlineEnabled` on a stable solver output only
 *      rebuilds trajectories — the solver output is reused, so
 *      `solverDirty` stays false.
 */

import { describe, expect, it } from 'vitest'

import { DEFAULT_WHEELER_DEWITT_CONFIG } from '@/lib/geometry/extended/wheelerDeWitt'
import { WheelerDeWittPhysicsCache } from '@/rendering/webgpu/renderers/strategies/WheelerDeWittPhysicsCache'

/** Build a smaller-than-default config so the solver finishes quickly. */
function smallConfig(
  overrides: Partial<typeof DEFAULT_WHEELER_DEWITT_CONFIG> = {}
): typeof DEFAULT_WHEELER_DEWITT_CONFIG {
  return {
    ...DEFAULT_WHEELER_DEWITT_CONFIG,
    gridNa: 24,
    gridNphi: 12,
    needsReset: false,
    ...overrides,
  }
}

describe('WheelerDeWittPhysicsCache trajectory integration', () => {
  it('populates trajectories when the static streamline overlay is enabled', () => {
    const cache = new WheelerDeWittPhysicsCache()
    const tick = cache.update(smallConfig({ streamlinesEnabled: true, worldlineEnabled: false }))
    expect(tick.solverDirty).toBe(true)
    expect(tick.trajectoryDirty).toBe(true)
    expect(tick.trajectories?.length ?? 0).toBeGreaterThan(0)
  })

  it('leaves trajectories null when both overlay consumers are off', () => {
    const cache = new WheelerDeWittPhysicsCache()
    const tick = cache.update(smallConfig({ streamlinesEnabled: false, worldlineEnabled: false }))
    expect(tick.solverDirty).toBe(true)
    expect(tick.trajectoryDirty).toBe(true)
    expect(tick.trajectories).toBeNull()
  })

  it('populates trajectories when only the worldline pulse is enabled', () => {
    // Regression guard: prior implementation gated trajectory
    // integration on `streamlinesEnabled` alone, so a user enabling
    // the worldline pulse with the static overlay off got a null
    // trajectory list and the pulse silently never rendered. The
    // pulse overlay also consumes `WkbTrajectory[]`, so the cache
    // must integrate whenever either consumer is on.
    const cache = new WheelerDeWittPhysicsCache()
    const tick = cache.update(smallConfig({ streamlinesEnabled: false, worldlineEnabled: true }))
    expect(tick.solverDirty).toBe(true)
    expect(tick.trajectoryDirty).toBe(true)
    expect(tick.trajectories?.length ?? 0).toBeGreaterThan(0)
  })

  it('rebuilds trajectories without re-solving when `worldlineEnabled` toggles', () => {
    const cache = new WheelerDeWittPhysicsCache()
    const baseConfig = smallConfig({ streamlinesEnabled: false, worldlineEnabled: false })
    // Warm the cache.
    const warm = cache.update(baseConfig)
    expect(warm.solverDirty).toBe(true)
    expect(warm.trajectories).toBeNull()

    // Same physics, worldline flipped on. Solver must NOT rerun
    // (solverDirty=false), and trajectories must be populated.
    const tick = cache.update({ ...baseConfig, worldlineEnabled: true })
    expect(tick.solverDirty).toBe(false)
    expect(tick.trajectoryDirty).toBe(true)
    expect(tick.trajectories?.length ?? 0).toBeGreaterThan(0)
  })

  it('drops trajectories when both consumers disable after being enabled', () => {
    const cache = new WheelerDeWittPhysicsCache()
    cache.update(smallConfig({ streamlinesEnabled: true, worldlineEnabled: true }))
    const tick = cache.update(smallConfig({ streamlinesEnabled: false, worldlineEnabled: false }))
    expect(tick.solverDirty).toBe(false)
    expect(tick.trajectoryDirty).toBe(true)
    expect(tick.trajectories).toBeNull()
  })
})
