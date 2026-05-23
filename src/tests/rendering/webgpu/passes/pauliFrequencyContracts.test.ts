import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const HERE = dirname(fileURLToPath(import.meta.url))
const root = resolve(HERE, '../../../../..')
const pauliComputePass = readFileSync(
  resolve(root, 'src/rendering/webgpu/passes/PauliComputePass.ts'),
  'utf8'
)
const pauliUniformStaging = readFileSync(
  resolve(root, 'src/rendering/webgpu/passes/PauliComputePassUniformStaging.ts'),
  'utf8'
)
const pauliPotentialHalf = readFileSync(
  resolve(root, 'src/rendering/webgpu/shaders/schroedinger/compute/pauliPotentialHalf.wgsl.ts'),
  'utf8'
)
const pauliKinetic = readFileSync(
  resolve(root, 'src/rendering/webgpu/shaders/schroedinger/compute/pauliKinetic.wgsl.ts'),
  'utf8'
)

describe('Pauli spin frequency contracts', () => {
  it('documents Pauli mode as Zeeman-only, not charged orbital Pauli dynamics', () => {
    expect(pauliComputePass).toContain('Zeeman-only Pauli approximation')
    expect(pauliKinetic).toContain('Orbital magnetic coupling `(p - qA)^2/(2m)` is not')
  })

  it('reports Larmor frequency for H = sigma dot B, not half the Bloch rate', () => {
    expect(pauliPotentialHalf).toContain('U_half = exp(-i [V(x) + μ_B σ·B(x)] dt/(2ℏ))')
    expect(pauliPotentialHalf).toContain('θ_B = |B(x)| dt / (2ℏ)')
    expect(pauliComputePass).toContain(
      'const larmorFrequency = (2 * this.cachedFieldStrength) / safeHbar'
    )
  })

  it('copies per-substep uniform snapshots before each Pauli Strang pass', () => {
    expect(pauliPotentialHalf).toContain('params.rotatingFrequency * params.simTime')
    // Snapshot pre-packing lives in the dedicated staging helper module;
    // per-substep GPU copies stay in PauliComputePass alongside the Strang loop.
    expect(pauliUniformStaging).toContain('params.simTime + (step + 0.5) * params.config.dt')
    expect(pauliUniformStaging).toContain(
      'params.simTime + params.stepsThisFrame * params.config.dt'
    )
    expect(pauliUniformStaging).toContain("label: 'pauli-step-uniform-staging'")
    expect(pauliComputePass).toContain('ctx.encoder.copyBufferToBuffer(')
    expect(pauliComputePass).toContain('step * PAULI_UNIFORM_SIZE')
  })
})
