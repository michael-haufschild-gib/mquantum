/**
 * Regression tests for TDSE potential shader physics invariants.
 *
 * The GPU potential shader is the Hamiltonian source of truth for TDSE/BEC
 * evolution. Hidden terms here change the simulated physics even when the UI
 * and CPU diagnostics report a different V(x).
 */
import { describe, expect, it } from 'vitest'

import {
  composeTdsePotential3DShader,
  composeTdsePotentialShader,
} from '@/rendering/webgpu/passes/TDSEComputePassSetup'

describe('TDSE potential shader', () => {
  it('does not add implicit transverse confinement to selected potentials', () => {
    const shader1D = composeTdsePotentialShader()
    const shader3D = composeTdsePotential3DShader()
    const shaders = [shader1D, shader3D]

    for (const wgsl of shaders) {
      expect(wgsl).not.toContain('wallStrength')
      expect(wgsl).not.toContain('quartic')
      expect(wgsl).not.toContain('params.potentialType <= 3u')
      expect(wgsl).toContain('if (params.potentialType == 0u)')
      expect(wgsl).toContain('V = 0.0;')
    }
  })

  it('keeps the 3D fast path on direct gid.xyz coords', () => {
    // The 3D variant exists specifically to skip the linearToND coordinate
    // decomposition. A future refactor that re-introduced linearToND there
    // would silently regress this perf invariant on the most common config.
    // Both shaders share the prelude that *defines* linearToND, so we
    // check for the actual *call* instead — `coords = linearToND(`.
    const shader1D = composeTdsePotentialShader()
    const shader3D = composeTdsePotential3DShader()

    expect(shader1D).toContain('coords = linearToND(')
    expect(shader3D).not.toContain('coords = linearToND(')
    expect(shader3D).toContain('coords[0] = gid.x;')
    expect(shader3D).toContain('coords[1] = gid.y;')
    expect(shader3D).toContain('coords[2] = gid.z;')
  })
})
