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
    const shaders = [composeTdsePotentialShader(), composeTdsePotential3DShader()]

    for (const wgsl of shaders) {
      expect(wgsl).not.toContain('wallStrength')
      expect(wgsl).not.toContain('quartic')
      expect(wgsl).not.toContain('params.potentialType <= 3u')
      expect(wgsl).toContain('if (params.potentialType == 0u)')
      expect(wgsl).toContain('V = 0.0;')
    }
  })
})
