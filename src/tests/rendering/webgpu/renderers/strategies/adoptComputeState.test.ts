/**
 * Tests for compute state adoption / reverse adoption.
 *
 * The warm-swap flow in scenePassSetup.ts transfers compute state from an
 * old renderer to a new one via strategy.adoptComputeState(). If the swap
 * aborts, the new renderer must transfer state BACK to the old one before
 * dispose, otherwise strategy.dispose() destroys GPU state the old renderer
 * (still active in the graph) depends on.
 *
 * These tests verify the source→target→source round trip at the strategy
 * level, which is the invariant the fix relies on.
 */

import { beforeEach, describe, expect, it } from 'vitest'

import { DiracStrategy } from '@/rendering/webgpu/renderers/strategies/DiracStrategy'
import { FreeScalarFieldStrategy } from '@/rendering/webgpu/renderers/strategies/FreeScalarFieldStrategy'
import { PauliStrategy } from '@/rendering/webgpu/renderers/strategies/PauliStrategy'
import { QuantumWalkStrategy } from '@/rendering/webgpu/renderers/strategies/QuantumWalkStrategy'
import { TdseBecStrategy } from '@/rendering/webgpu/renderers/strategies/TdseBecStrategy'

interface FakeComputePass {
  id: string
  disposed: boolean
  dispose: () => void
}

function makeFakePass(id: string): FakeComputePass {
  const pass: FakeComputePass = {
    id,
    disposed: false,
    dispose: () => {
      pass.disposed = true
    },
  }
  return pass
}

describe('QuantumWalkStrategy.adoptComputeState', () => {
  let source: QuantumWalkStrategy
  let target: QuantumWalkStrategy
  let fakePass: FakeComputePass

  beforeEach(() => {
    source = new QuantumWalkStrategy()
    target = new QuantumWalkStrategy()
    fakePass = makeFakePass('qw')
    ;(source as unknown as { qwPass: FakeComputePass }).qwPass = fakePass
  })

  it('transfers compute pass ownership from source to target', () => {
    const ok = target.adoptComputeState(source)
    expect(ok).toBe(true)
    expect((target as unknown as { qwPass: unknown }).qwPass).toBe(fakePass)
    expect((source as unknown as { qwPass: unknown }).qwPass).toBeNull()
  })

  it('source dispose is a no-op after transfer (ownership moved)', () => {
    target.adoptComputeState(source)
    source.dispose()
    expect(fakePass.disposed).toBe(false)
  })

  it('target dispose destroys the transferred pass', () => {
    target.adoptComputeState(source)
    target.dispose()
    expect(fakePass.disposed).toBe(true)
  })

  it('reverse adoption restores the pass to the original source', () => {
    target.adoptComputeState(source)
    // Warm-swap abort path: reverse the transfer
    const reverted = source.adoptComputeState(target)
    expect(reverted).toBe(true)
    expect((source as unknown as { qwPass: unknown }).qwPass).toBe(fakePass)
    expect((target as unknown as { qwPass: unknown }).qwPass).toBeNull()
    // Target dispose is now a no-op — pass survived the round trip
    target.dispose()
    expect(fakePass.disposed).toBe(false)
  })

  it('returns false when source has no compute state', () => {
    const emptySource = new QuantumWalkStrategy()
    expect(target.adoptComputeState(emptySource)).toBe(false)
  })

  it('returns false when source is a different strategy type', () => {
    const wrongType = new DiracStrategy()
    expect(target.adoptComputeState(wrongType)).toBe(false)
  })
})

describe('TdseBecStrategy.adoptComputeState', () => {
  it('round-trips compute state on abort-like sequences', () => {
    const source = new TdseBecStrategy()
    const target = new TdseBecStrategy()
    const fake = makeFakePass('tdse')
    ;(source as unknown as { tdsePass: FakeComputePass }).tdsePass = fake

    expect(target.adoptComputeState(source)).toBe(true)
    expect((target as unknown as { tdsePass: unknown }).tdsePass).toBe(fake)
    expect((source as unknown as { tdsePass: unknown }).tdsePass).toBeNull()

    // Reverse (warm swap aborted)
    expect(source.adoptComputeState(target)).toBe(true)
    expect((source as unknown as { tdsePass: unknown }).tdsePass).toBe(fake)
    target.dispose()
    expect(fake.disposed).toBe(false)
  })
})

describe('FreeScalarFieldStrategy.adoptComputeState', () => {
  it('round-trips compute state on abort-like sequences', () => {
    const source = new FreeScalarFieldStrategy()
    const target = new FreeScalarFieldStrategy()
    const fake = makeFakePass('fsf')
    ;(source as unknown as { freeScalarFieldPass: FakeComputePass }).freeScalarFieldPass = fake

    expect(target.adoptComputeState(source)).toBe(true)
    expect(source.adoptComputeState(target)).toBe(true)
    expect((source as unknown as { freeScalarFieldPass: unknown }).freeScalarFieldPass).toBe(fake)
    target.dispose()
    expect(fake.disposed).toBe(false)
  })
})

describe('DiracStrategy.adoptComputeState', () => {
  it('round-trips compute state on abort-like sequences', () => {
    const source = new DiracStrategy()
    const target = new DiracStrategy()
    const fake = makeFakePass('dirac')
    ;(source as unknown as { diracPass: FakeComputePass }).diracPass = fake

    expect(target.adoptComputeState(source)).toBe(true)
    expect(source.adoptComputeState(target)).toBe(true)
    expect((source as unknown as { diracPass: unknown }).diracPass).toBe(fake)
    target.dispose()
    expect(fake.disposed).toBe(false)
  })
})

describe('PauliStrategy.adoptComputeState', () => {
  it('round-trips compute state on abort-like sequences', () => {
    const source = new PauliStrategy()
    const target = new PauliStrategy()
    const fake = makeFakePass('pauli')
    ;(source as unknown as { pauliPass: FakeComputePass }).pauliPass = fake

    expect(target.adoptComputeState(source)).toBe(true)
    expect(source.adoptComputeState(target)).toBe(true)
    expect((source as unknown as { pauliPass: unknown }).pauliPass).toBe(fake)
    target.dispose()
    expect(fake.disposed).toBe(false)
  })
})
