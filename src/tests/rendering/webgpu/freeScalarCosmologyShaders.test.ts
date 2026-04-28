/**
 * Static source-inspection tests pinning the canonical δφ integrator's
 * shader contracts:
 *
 * - The write-grid energy density view must consume the physical
 *   Hamiltonian (aKinetic/aPotential/aFull-weighted) so the on-screen
 *   density matches the solver's instantaneous total energy under every
 *   cosmology preset.
 * - The init shader's singleMode / gaussianPacket initializers must use
 *   the same canonical oscillator coefficients as evolution.
 *
 * Shader sources are plain template literals, so we can grep their text
 * without spinning up WebGPU. These assertions fail if a future edit
 * reintroduces the old Mukhanov-Sasaki `mEffSq`/`z''/z` path.
 */

import { describe, expect, it } from 'vitest'

import { freeScalarInitBlock } from '@/rendering/webgpu/shaders/schroedinger/compute/freeScalarInit.wgsl'
import { freeScalarWriteGridBlock } from '@/rendering/webgpu/shaders/schroedinger/compute/freeScalarWriteGrid.wgsl'

describe('free scalar canonical δφ integrator shader contracts', () => {
  it('writeGrid shader energy density uses the three cosmology coefficients', () => {
    // The energy density view must mirror the solver's canonical Hamiltonian
    // so the rendered scalar tracks ½·aKinetic·π² + ½·aPotential·(∇φ)²
    // + ½·m²·aFull·φ² + aFull·V(φ). Any reappearance of the old mEffSq
    // path would indicate the bridge was reverted.
    expect(freeScalarWriteGridBlock).not.toContain('params.mEffSq')
    expect(freeScalarWriteGridBlock).toContain('params.aKinetic')
    expect(freeScalarWriteGridBlock).toContain('params.aPotential')
    expect(freeScalarWriteGridBlock).toContain('params.aFull')
  })

  it('writeGrid shader applies Bianchi-I axis ratios to gradient energy', () => {
    // The integrator and CPU diagnostics weight axes 1 and 2 by the
    // Bianchi-I potential ratios. Rendered energy density and K/G/V/E
    // analysis must use the same axis-weighted stiffness, not the
    // isotropic `aPotential * sum(grad^2)` shortcut.
    expect(freeScalarWriteGridBlock).toContain('axisPotential *= params.aPotentialRatio1')
    expect(freeScalarWriteGridBlock).toContain('axisPotential *= params.aPotentialRatio2')
    expect(freeScalarWriteGridBlock).toContain('gradEnergy += axisPotential * fwdDiff * fwdDiff;')
    expect(freeScalarWriteGridBlock).not.toContain('params.aPotential * gradEnergy')
  })

  it('writeGrid shader uses bond-gradient energy so Nyquist modes are visible', () => {
    expect(freeScalarWriteGridBlock).toContain('let fwdBondIdx = select(')
    expect(freeScalarWriteGridBlock).toContain('let fwdDiff = (phi[fwdBondIdx] - nnPhiVal) * invA;')
    expect(freeScalarWriteGridBlock).not.toContain(
      'gradEnergy += axisPotential * gradPhi[d] * gradPhi[d];'
    )
  })

  it('init shader single-mode + gaussian-packet branches use the canonical oscillator', () => {
    // The initial conjugate-momentum kick for singleMode and gaussianPacket
    // starts with `omegaSq = aKinetic·m²aFull`, then adds axis-weighted
    // lattice stiffness. Both branches must consume the shared helper.
    expect(freeScalarInitBlock).not.toContain('params.mEffSq')
    expect(freeScalarInitBlock).toContain(
      'let massStiffness = params.mass * params.mass * params.aFull * params.massSquaredScale;'
    )
    const massTermMatches =
      freeScalarInitBlock.match(/omegaSq: f32 = safeAKinetic \* massStiffness/g) ?? []
    expect(massTermMatches.length).toBe(2)
  })

  it('init shader guards aKinetic before dividing the initial π kick', () => {
    expect(freeScalarInitBlock).toContain(
      'let safeAKinetic = select(1.0, params.aKinetic, params.aKinetic > 0.0);'
    )
  })

  it('init shader uses Bianchi-I axis ratios and π = δφ prime / aKinetic', () => {
    expect(freeScalarInitBlock).toContain('axisPotential *= params.aPotentialRatio1')
    expect(freeScalarInitBlock).toContain('axisPotential *= params.aPotentialRatio2')
    const piKickMatches = freeScalarInitBlock.match(/piVal = \(omega \/ safeAKinetic\)/g) ?? []
    expect(piKickMatches.length).toBe(2)
  })

  it('init shader guards sqrt against negative omega²', () => {
    // Belt-and-braces guard against pathological configs where
    // `aFull/aPotential` underflows in extreme de Sitter futures.
    expect(freeScalarInitBlock).toContain('sqrt(max(omegaSq, 0.0))')
  })
})
