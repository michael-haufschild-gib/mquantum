import { describe, expect, it } from 'vitest'
import { freeScalarInitBlock, freeScalarUniformsBlock } from '@/rendering/webgpu/shaders/schroedinger/compute/freeScalarInit.wgsl'
import { freeScalarUpdatePiBlock } from '@/rendering/webgpu/shaders/schroedinger/compute/freeScalarUpdatePi.wgsl'
import { freeScalarUpdatePhiBlock } from '@/rendering/webgpu/shaders/schroedinger/compute/freeScalarUpdatePhi.wgsl'
import { freeScalarWriteGridBlock } from '@/rendering/webgpu/shaders/schroedinger/compute/freeScalarWriteGrid.wgsl'
import { WebGPUSchrodingerRenderer } from '@/rendering/webgpu/renderers/WebGPUSchrodingerRenderer'

describe('Free Scalar Field WGSL Shaders', () => {
  describe('uniforms block', () => {
    it('declares FreeScalarUniforms struct', () => {
      expect(freeScalarUniformsBlock).toContain('struct FreeScalarUniforms')
    })

    it('contains required uniform fields', () => {
      expect(freeScalarUniformsBlock).toContain('gridSize: vec3u')
      expect(freeScalarUniformsBlock).toContain('latticeDim: u32')
      expect(freeScalarUniformsBlock).toContain('mass: f32')
      expect(freeScalarUniformsBlock).toContain('dt: f32')
      expect(freeScalarUniformsBlock).toContain('totalSites: u32')
      expect(freeScalarUniformsBlock).toContain('maxFieldValue: f32')
    })
  })

  describe('init shader', () => {
    it('declares compute entry point', () => {
      expect(freeScalarInitBlock).toContain('@compute @workgroup_size(64)')
      expect(freeScalarInitBlock).toContain('fn main(')
    })

    it('handles all three initial conditions', () => {
      // vacuumNoise = 0
      expect(freeScalarInitBlock).toContain('params.initCondition == 0u')
      // singleMode = 1
      expect(freeScalarInitBlock).toContain('params.initCondition == 1u')
      // gaussianPacket = 2 (else branch)
      expect(freeScalarInitBlock).toContain('gaussian')
    })

    it('writes to both phi and pi buffers', () => {
      expect(freeScalarInitBlock).toContain('phi[idx]')
      expect(freeScalarInitBlock).toContain('pi[idx]')
    })

    it('gates Gaussian packet dx by latticeDim to avoid stale Y/Z center values', () => {
      // The envelope distance dx must zero out inactive dimensions so that
      // residual packetCenter.y/z from 3D mode don't kill the Gaussian in 1D/2D
      expect(freeScalarInitBlock).toContain('select(0.0, worldPos.y - params.packetCenter.y, params.latticeDim >= 2u)')
      expect(freeScalarInitBlock).toContain('select(0.0, worldPos.z - params.packetCenter.z, params.latticeDim >= 3u)')
    })

    it('gates kPhys by latticeDim to zero inactive wave vector components', () => {
      // kPhys must be zeroed for inactive dimensions — both in single-mode and Gaussian
      expect(freeScalarInitBlock).toContain('params.latticeDim >= 2u && latticeL.y > 0.0')
      expect(freeScalarInitBlock).toContain('params.latticeDim >= 3u && latticeL.z > 0.0')
    })
  })

  describe('updatePi shader', () => {
    it('declares compute entry point', () => {
      expect(freeScalarUpdatePiBlock).toContain('@compute @workgroup_size(64)')
      expect(freeScalarUpdatePiBlock).toContain('fn main(')
    })

    it('references FreeScalarUniforms without defining it (struct in shared block)', () => {
      expect(freeScalarUpdatePiBlock).toContain('var<uniform> params: FreeScalarUniforms')
      expect(freeScalarUpdatePiBlock).not.toContain('struct FreeScalarUniforms')
    })

    it('computes discrete Laplacian', () => {
      expect(freeScalarUpdatePiBlock).toContain('laplacian')
    })

    it('uses periodic boundary conditions', () => {
      expect(freeScalarUpdatePiBlock).toContain('fn wrap(')
    })

    it('implements Klein-Gordon update equation', () => {
      // pi[idx] += dt * (laplacian - mass^2 * phi)
      expect(freeScalarUpdatePiBlock).toContain('params.mass * params.mass')
      expect(freeScalarUpdatePiBlock).toContain('params.dt')
    })

    it('composes correctly with uniforms block', () => {
      const composed = freeScalarUniformsBlock + freeScalarUpdatePiBlock
      expect(composed).toContain('struct FreeScalarUniforms')
      expect(composed).toContain('fn main(')
    })
  })

  describe('updatePhi shader', () => {
    it('declares compute entry point', () => {
      expect(freeScalarUpdatePhiBlock).toContain('@compute @workgroup_size(64)')
      expect(freeScalarUpdatePhiBlock).toContain('fn main(')
    })

    it('references FreeScalarUniforms without defining it (struct in shared block)', () => {
      expect(freeScalarUpdatePhiBlock).toContain('var<uniform> params: FreeScalarUniforms')
      expect(freeScalarUpdatePhiBlock).not.toContain('struct FreeScalarUniforms')
    })

    it('implements Hamilton equation: dphi/dt = pi', () => {
      expect(freeScalarUpdatePhiBlock).toContain('params.dt * pi[idx]')
    })

    it('composes correctly with uniforms block', () => {
      const composed = freeScalarUniformsBlock + freeScalarUpdatePhiBlock
      expect(composed).toContain('struct FreeScalarUniforms')
      expect(composed).toContain('fn main(')
    })
  })

  describe('renderer temporal + free scalar interaction', () => {
    it('disables temporal outputs when quantumMode is freeScalarField even if temporal flag is true', () => {
      const renderer = new WebGPUSchrodingerRenderer({
        temporal: true,
        quantumMode: 'freeScalarField',
        dimension: 3,
      })
      const outputIds = renderer.config.outputs.map((o) => o.resourceId)
      expect(outputIds).not.toContain('quarter-color')
      expect(outputIds).not.toContain('quarter-position')
      expect(outputIds).toContain('object-color')
    })

    it('allows temporal outputs for non-free-scalar modes when temporal is true', () => {
      const renderer = new WebGPUSchrodingerRenderer({
        temporal: true,
        quantumMode: 'harmonicOscillator',
        dimension: 3,
      })
      const outputIds = renderer.config.outputs.map((o) => o.resourceId)
      expect(outputIds).toContain('quarter-color')
      expect(outputIds).toContain('quarter-position')
    })
  })

  describe('writeGrid shader', () => {
    it('declares 3D workgroup compute entry point', () => {
      expect(freeScalarWriteGridBlock).toContain('@compute @workgroup_size(4, 4, 4)')
      expect(freeScalarWriteGridBlock).toContain('fn main(')
    })

    it('references FreeScalarUniforms without defining it (struct in shared block)', () => {
      expect(freeScalarWriteGridBlock).toContain('var<uniform> params: FreeScalarUniforms')
      expect(freeScalarWriteGridBlock).not.toContain('struct FreeScalarUniforms')
    })

    it('writes to 3D storage texture', () => {
      expect(freeScalarWriteGridBlock).toContain('textureStore(outputTex')
    })

    it('supports all three field views', () => {
      // phi = 0, pi = 1, energyDensity = 2
      expect(freeScalarWriteGridBlock).toContain('params.fieldView == 0u')
      expect(freeScalarWriteGridBlock).toContain('params.fieldView == 1u')
    })

    it('encodes sign as phase in B channel', () => {
      // phase = select(0.0, PI, value < 0)
      expect(freeScalarWriteGridBlock).toContain('3.14159')
      expect(freeScalarWriteGridBlock).toContain('fieldValue < 0.0')
    })

    it('computes logRho from normalized density, not raw field value', () => {
      // logRho must use normRho (not rho) for consistency with raymarcher color mapping
      expect(freeScalarWriteGridBlock).toContain('log(normRho + 1e-10)')
      expect(freeScalarWriteGridBlock).not.toContain('log(rho + 1e-10)')
    })

    it('computes energy density with forward-difference gradient matching lattice Hamiltonian', () => {
      expect(freeScalarWriteGridBlock).toContain('gradEnergy')
      expect(freeScalarWriteGridBlock).toContain('params.mass * params.mass')
      // Forward difference: (phi[n+1] - phiVal), not central (phi[n+1] - phi[n-1])/(2a)
      expect(freeScalarWriteGridBlock).toContain('phiVal')
    })

    it('composes correctly with uniforms block', () => {
      const composed = freeScalarUniformsBlock + freeScalarWriteGridBlock
      expect(composed).toContain('struct FreeScalarUniforms')
      expect(composed).toContain('fn main(')
    })
  })
})
