import { describe, expect, it } from 'vitest'

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
