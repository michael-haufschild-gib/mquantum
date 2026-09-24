import { describe, expect, it } from 'vitest'

import { VORTEX_VACUUM_DENSITY_FRACTION } from '@/rendering/webgpu/passes/TDSEVortexDetect'
import { vortexDetectReduceBlock } from '@/rendering/webgpu/shaders/schroedinger/compute/vortexDetect.wgsl'

describe('vortexDetect shader physics contracts', () => {
  it('accumulates signed topological charge magnitude, not just plaquette count', () => {
    expect(vortexDetectReduceBlock).toContain('let q = u32(abs(windingSum));')
    expect(vortexDetectReduceBlock).toContain('posCount += q;')
    expect(vortexDetectReduceBlock).toContain('negCount += q;')
    expect(vortexDetectReduceBlock).not.toContain('posCount += 1u;')
    expect(vortexDetectReduceBlock).not.toContain('negCount += 1u;')
  })

  it('does not gate plaquette winding on one corner density', () => {
    expect(vortexDetectReduceBlock).toContain('Plaquette winding is topological')
    expect(vortexDetectReduceBlock).not.toContain('density < threshold')
  })

  it('wraps plaquette neighbors across periodic seams', () => {
    expect(vortexDetectReduceBlock).toContain('fn vortexPlusOneIndex')
    expect(vortexDetectReduceBlock).toContain('return idx - (n - 1u) * stride;')
    expect(vortexDetectReduceBlock).toContain('Boundary plaquettes wrap')
    expect(vortexDetectReduceBlock).not.toContain("Skip if at boundary (can't form plaquette)")
  })
})

// Regression: with no cut at all, the random round-off phases in the empty
// halo around a vortex-free Thomas-Fermi ground state were counted as ~10⁴
// vortices (GPU-observed vortexCount 25 059 on the default 64³ BEC).
describe('vortexDetect vacuum floor', () => {
  it('skips a plaquette only when all four corners are vacuum', () => {
    expect(vortexDetectReduceBlock).toContain(
      'if (max(max(rho00, rho11), max(rhoDim[da], rhoDim[db])) <= vacuumFloor) {'
    )
    expect(vortexDetectReduceBlock).toContain(
      'let vacuumFloor = vdParams.densityThreshold * max(vdParams.maxDensity, 0.0);'
    )
  })

  it('uses a floor far below any resolved core-corner density (≥ 0.2·n)', () => {
    expect(VORTEX_VACUUM_DENSITY_FRACTION).toBeGreaterThan(0)
    expect(VORTEX_VACUUM_DENSITY_FRACTION).toBeLessThanOrEqual(1e-2)
  })
})
