/**
 * Static source-inspection tests pinning the canonical δφ integrator's
 * shader contracts:
 *
 * - The write-grid energy density view must consume the physical
 *   Hamiltonian (aKinetic/aPotential/aFull-weighted) so the on-screen
 *   density matches the solver's instantaneous total energy under every
 *   cosmology preset.
 * - The init shader's singleMode / gaussianPacket initializers must use
 *   the physical dispersion `ω² = k_lat² + m²·a²` for their initial
 *   conjugate-momentum kick, reconstructing `a²` from `aFull/aPotential`.
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

  it('init shader single-mode + gaussian-packet branches use the physical dispersion', () => {
    // The initial conjugate-momentum kick for singleMode and gaussianPacket
    // starts with `omegaSq = massTerm` where `massTerm = mass² · a²`, then
    // adds the lattice k² contributions on top. Both branches must consume
    // the shared `massTerm` helper — pin the count.
    expect(freeScalarInitBlock).not.toContain('params.mEffSq')
    expect(freeScalarInitBlock).toContain('let massTerm = params.mass * params.mass * aSq;')
    const massTermMatches = freeScalarInitBlock.match(/omegaSq: f32 = massTerm/g) ?? []
    expect(massTermMatches.length).toBe(2)
  })

  it('init shader reconstructs a² from aFull / aPotential (safe against divide-by-zero)', () => {
    // The dispersion helper must guard aPotential > 0 so degenerate configs
    // fall through to `aSq = 1` instead of producing NaN. Pin the exact
    // select statement so a future edit doesn't silently drop the guard.
    expect(freeScalarInitBlock).toContain(
      'let aSq = select(1.0, params.aFull / params.aPotential, params.aPotential > 0.0);'
    )
  })

  it('init shader scales the initial π kick by aPotential (canonical conjugate momentum)', () => {
    // π_δφ = a^(n−2) · δφ' = aPotential · A · ω · sin(phase). Both
    // single-mode and gaussian-packet branches apply this factor so the
    // leapfrog state starts in the right canonical basis.
    const piKickMatches =
      freeScalarInitBlock.match(/piVal = params\.aPotential \*/g) ?? []
    expect(piKickMatches.length).toBe(2)
  })

  it('init shader guards sqrt against negative omega²', () => {
    // Belt-and-braces guard against pathological configs where
    // `aFull/aPotential` underflows in extreme de Sitter futures.
    expect(freeScalarInitBlock).toContain('sqrt(max(omegaSq, 0.0))')
  })
})
