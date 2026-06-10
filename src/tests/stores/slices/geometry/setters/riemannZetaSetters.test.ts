import { beforeEach, describe, expect, it } from 'vitest'

import {
  DEFAULT_RIEMANN_ZETA_CONFIG,
  RIEMANN_ZETA_PRESETS,
} from '@/lib/geometry/extended/riemannZeta'
import { useExtendedObjectStore } from '@/stores/scene/extendedObjectStore'

const getConfig = () => useExtendedObjectStore.getState().schroedinger.riemannZeta

describe('riemannZetaSetters', () => {
  beforeEach(() => {
    useExtendedObjectStore.getState().reset()
  })

  it('starts from the documented defaults (matching the hilbertPolyaShells preset)', () => {
    expect(getConfig()).toEqual(DEFAULT_RIEMANN_ZETA_CONFIG)
    expect({ ...RIEMANN_ZETA_PRESETS.hilbertPolyaShells, preset: 'hilbertPolyaShells' }).toEqual(
      DEFAULT_RIEMANN_ZETA_CONFIG
    )
  })

  it('clamps each numeric field to its documented range and flips preset to custom', () => {
    const s = useExtendedObjectStore.getState()

    s.setRiemannZetaNumZeros(999)
    expect(getConfig().numZeros).toBe(100)
    expect(getConfig().preset).toBe('custom')

    s.setRiemannZetaNumZeros(1)
    expect(getConfig().numZeros).toBe(8)

    s.setRiemannZetaBeta(0.5)
    expect(getConfig().beta).toBe(1.01)

    s.setRiemannZetaBeta(99)
    expect(getConfig().beta).toBe(3)

    s.setRiemannZetaHorizonRadius(2)
    expect(getConfig().horizonRadius).toBe(1)

    s.setRiemannZetaAngularL(9)
    expect(getConfig().angularL).toBe(4)

    s.setRiemannZetaAngularM(-9)
    expect(getConfig().angularM).toBe(-4)

    s.setRiemannZetaFlowRate(5)
    expect(getConfig().flowRate).toBe(1.5)

    s.setRiemannZetaGlow(0)
    expect(getConfig().glow).toBe(0.2)
  })

  it('rounds numZeros, angularL, and angularM to integers', () => {
    const s = useExtendedObjectStore.getState()

    s.setRiemannZetaNumZeros(42.6)
    expect(getConfig().numZeros).toBe(43)

    s.setRiemannZetaAngularL(1.4)
    expect(getConfig().angularL).toBe(1)

    s.setRiemannZetaAngularM(-2.5)
    expect(getConfig().angularM).toBe(-2)
  })

  it('accepts only the two valid sources and flips preset to custom', () => {
    const s = useExtendedObjectStore.getState()

    s.setRiemannZetaSource('primes')
    expect(getConfig().source).toBe('primes')
    expect(getConfig().preset).toBe('custom')

    s.setRiemannZetaSource('zeros')
    expect(getConfig().source).toBe('zeros')

    const before = getConfig()
    s.setRiemannZetaSource('bogus' as never)
    expect(getConfig()).toEqual(before)
  })

  it('toggles the cutaway wedge and flips preset to custom', () => {
    const s = useExtendedObjectStore.getState()

    s.setRiemannZetaCutaway(false)
    expect(getConfig().cutaway).toBe(false)
    expect(getConfig().preset).toBe('custom')

    s.setRiemannZetaCutaway(true)
    expect(getConfig().cutaway).toBe(true)
  })

  it('rejects non-finite values without mutating state', () => {
    const before = getConfig()
    useExtendedObjectStore.getState().setRiemannZetaBeta(Number.NaN)
    useExtendedObjectStore.getState().setRiemannZetaHorizonRadius(Number.POSITIVE_INFINITY)
    expect(getConfig()).toEqual(before)
  })

  it('applies named presets wholesale and tags the preset id', () => {
    useExtendedObjectStore.getState().setRiemannZetaPreset('berryKeatingHorizon')
    const config = getConfig()
    expect(config.preset).toBe('berryKeatingHorizon')
    expect(config.source).toBe(RIEMANN_ZETA_PRESETS.berryKeatingHorizon.source)
    expect(config.numZeros).toBe(RIEMANN_ZETA_PRESETS.berryKeatingHorizon.numZeros)
    expect(config.beta).toBe(RIEMANN_ZETA_PRESETS.berryKeatingHorizon.beta)
    expect(config.horizonRadius).toBe(RIEMANN_ZETA_PRESETS.berryKeatingHorizon.horizonRadius)
    expect(config.flowRate).toBe(RIEMANN_ZETA_PRESETS.berryKeatingHorizon.flowRate)
    expect(config.cutaway).toBe(RIEMANN_ZETA_PRESETS.berryKeatingHorizon.cutaway)
  })

  it('arithmeticChaos preset sets the lobed ℓ=2, m=1 angular factor', () => {
    useExtendedObjectStore.getState().setRiemannZetaPreset('arithmeticChaos')
    expect(getConfig().angularL).toBe(2)
    expect(getConfig().angularM).toBe(1)
  })

  it('an individual edit after a preset flips the tag to custom', () => {
    const s = useExtendedObjectStore.getState()
    s.setRiemannZetaPreset('primonGas')
    expect(getConfig().preset).toBe('primonGas')

    s.setRiemannZetaBeta(2)
    expect(getConfig().preset).toBe('custom')
    expect(getConfig().beta).toBe(2)
    // The other primonGas fields survive the single-field edit.
    expect(getConfig().source).toBe(RIEMANN_ZETA_PRESETS.primonGas.source)
  })

  it('bumps the schroedinger version so the renderer re-packs uniforms', () => {
    const before = useExtendedObjectStore.getState().schroedingerVersion
    useExtendedObjectStore.getState().setRiemannZetaBeta(2.2)
    expect(useExtendedObjectStore.getState().schroedingerVersion).toBeGreaterThan(before)
  })
})
