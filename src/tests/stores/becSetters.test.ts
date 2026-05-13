/**
 * Tests for BEC (Bose-Einstein Condensate) setter functions.
 *
 * Validates clamping of physical parameters, NaN rejection,
 * CFL-limited dt adjustment, and vortex/soliton constraints.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useExtendedObjectStore } from '@/stores/scene/extendedObjectStore'

describe('BEC setters', () => {
  beforeEach(() => {
    useExtendedObjectStore.getState().reset()
  })

  const getBec = () => useExtendedObjectStore.getState().schroedinger.bec

  it('clamps interactionStrength to [-1000, 10000]', () => {
    const s = useExtendedObjectStore.getState()
    s.setBecInteractionStrength(-2000)
    expect(getBec().interactionStrength).toBe(-1000)
    s.setBecInteractionStrength(20000)
    expect(getBec().interactionStrength).toBe(10000)
    s.setBecInteractionStrength(500)
    expect(getBec().interactionStrength).toBe(500)
  })

  it('clamps trapOmega to [0.01, 10]', () => {
    const s = useExtendedObjectStore.getState()
    s.setBecTrapOmega(0)
    expect(getBec().trapOmega).toBe(0.01)
    s.setBecTrapOmega(100)
    expect(getBec().trapOmega).toBe(10)
  })

  it('clamps mass to [0.1, 10]', () => {
    const s = useExtendedObjectStore.getState()
    s.setBecMass(0)
    expect(getBec().mass).toBe(0.1)
    s.setBecMass(200)
    expect(getBec().mass).toBe(10)
  })

  it('rejects NaN for interactionStrength', () => {
    const s = useExtendedObjectStore.getState()
    const before = getBec().interactionStrength
    s.setBecInteractionStrength(NaN)
    expect(getBec().interactionStrength).toBe(before)
  })

  it('rejects NaN for trapOmega', () => {
    const s = useExtendedObjectStore.getState()
    const before = getBec().trapOmega
    s.setBecTrapOmega(NaN)
    expect(getBec().trapOmega).toBe(before)
  })

  it('clamps stepsPerFrame to integer [1, 16]', () => {
    const s = useExtendedObjectStore.getState()
    s.setBecStepsPerFrame(0)
    expect(getBec().stepsPerFrame).toBe(1)
    s.setBecStepsPerFrame(500)
    expect(getBec().stepsPerFrame).toBe(16)
    s.setBecStepsPerFrame(5.7)
    expect(getBec().stepsPerFrame).toBe(6)
  })

  it('clamps trapAnisotropy per-axis to [0.1, 10]', () => {
    const s = useExtendedObjectStore.getState()
    s.setBecTrapAnisotropy(0, -1)
    expect(getBec().trapAnisotropy[0]).toBe(0.1)
    s.setBecTrapAnisotropy(0, 200)
    expect(getBec().trapAnisotropy[0]).toBe(10)
  })

  it('clamps vortexCharge to integer [-4, 4]', () => {
    const s = useExtendedObjectStore.getState()
    s.setBecVortexCharge(-10)
    expect(getBec().vortexCharge).toBe(-4)
    s.setBecVortexCharge(10)
    expect(getBec().vortexCharge).toBe(4)
    s.setBecVortexCharge(2.7)
    expect(getBec().vortexCharge).toBe(3)
  })

  it('rejects malformed discrete vortex controls', () => {
    const s = useExtendedObjectStore.getState()
    s.setBecVortexCharge(2)
    s.setBecVortexCharge(NaN)
    expect(getBec().vortexCharge).toBe(2)

    s.setBecVortexLatticeCount(5)
    s.setBecVortexLatticeCount(Infinity)
    expect(getBec().vortexLatticeCount).toBe(5)

    s.setBecVortexPairCount(2)
    s.setBecVortexPairCount(NaN)
    expect(getBec().vortexPairCount).toBe(2)

    const planeBefore = getBec().vortexPlane1
    s.setBecVortexPlane1([NaN, 1])
    expect(getBec().vortexPlane1).toEqual(planeBefore)
  })

  it('rejects malformed BEC enums and boolean controls', () => {
    const s = useExtendedObjectStore.getState()
    s.setBecInitialCondition('blackHoleAnalog')
    s.setBecInitialCondition('bogus' as unknown as Parameters<typeof s.setBecInitialCondition>[0])
    expect(getBec().initialCondition).toBe('blackHoleAnalog')

    s.setBecFieldView('phase')
    s.setBecFieldView('bogus' as unknown as Parameters<typeof s.setBecFieldView>[0])
    expect(getBec().fieldView).toBe('phase')

    s.setBecDisorderDistribution('gaussian')
    s.setBecDisorderDistribution(
      'bogus' as unknown as Parameters<typeof s.setBecDisorderDistribution>[0]
    )
    expect(getBec().disorderDistribution).toBe('gaussian')

    s.setBecAutoScale(false)
    s.setBecAutoScale('yes' as unknown as Parameters<typeof s.setBecAutoScale>[0])
    expect(getBec().autoScale).toBe(false)

    s.setBecHawkingPairInjection(false)
    s.setBecHawkingPairInjection(
      'yes' as unknown as Parameters<typeof s.setBecHawkingPairInjection>[0]
    )
    expect(getBec().hawkingPairInjection).toBe(false)
  })

  it('clamps solitonDepth to [0, 1]', () => {
    const s = useExtendedObjectStore.getState()
    s.setBecSolitonDepth(-0.5)
    expect(getBec().solitonDepth).toBe(0)
    s.setBecSolitonDepth(1.5)
    expect(getBec().solitonDepth).toBe(1)
  })

  it('clamps solitonVelocity to [-1, 1]', () => {
    const s = useExtendedObjectStore.getState()
    s.setBecSolitonVelocity(-2)
    expect(getBec().solitonVelocity).toBe(-1)
    s.setBecSolitonVelocity(2)
    expect(getBec().solitonVelocity).toBe(1)
  })

  it('clamps absorberWidth to [0.05, 0.5]', () => {
    const s = useExtendedObjectStore.getState()
    s.setBecAbsorberWidth(0)
    expect(getBec().absorberWidth).toBe(0.05)
    s.setBecAbsorberWidth(1)
    expect(getBec().absorberWidth).toBe(0.5)
  })

  it('clamps pmlTargetReflection to [1e-12, 0.999]', () => {
    const s = useExtendedObjectStore.getState()
    s.setBecPmlTargetReflection(0)
    expect(getBec().pmlTargetReflection).toBe(1e-12)
    s.setBecPmlTargetReflection(2)
    expect(getBec().pmlTargetReflection).toBe(0.999)
  })

  it('clamps hbar to [0.1, 10]', () => {
    const s = useExtendedObjectStore.getState()
    s.setBecHbar(0)
    expect(getBec().hbar).toBe(0.1)
    s.setBecHbar(100)
    expect(getBec().hbar).toBe(10)
  })

  it('CFL-limits dt when mass changes', () => {
    const s = useExtendedObjectStore.getState()
    s.setBecMass(0.1) // lighter mass → tighter CFL → possibly smaller dt
    const dtAfter = getBec().dt
    // dt should still be positive and bounded
    expect(dtAfter).toBeGreaterThan(0)
    expect(dtAfter).toBeLessThanOrEqual(0.05)
    // Verify dtAfter is a finite positive number (not NaN/Infinity)
    expect(Number.isFinite(dtAfter)).toBe(true)
  })

  it('setBecDt CFL bound respects effective spacing under compactification', () => {
    const s = useExtendedObjectStore.getState()
    // Tight compactification: R = 0.05, gridSize ≈ 32 → effective spacing
    // 2π·0.05/32 ≈ 0.0098, ~10× tighter than the 0.1 raw spacing default.
    // The setter must clamp dt against the EFFECTIVE-spacing CFL bound, not
    // the raw-spacing one — otherwise the slider can drive the GP integrator
    // unstable when a compact dim is switched on.
    s.setBecCompactDim(0, true)
    s.setBecCompactRadius(0, 0.05)

    const bec = getBec()
    // Sanity: compactRadii actually got set (may be clamped, but should be
    // far below the raw-spacing equivalent of 0.1·N/(2π)).
    expect(bec.compactDims[0]).toBe(true)

    // Drive dt above what raw-spacing CFL alone would have permitted.
    s.setBecDt(0.02)
    const dtAfter = getBec().dt
    expect(Number.isFinite(dtAfter)).toBe(true)
    expect(dtAfter).toBeGreaterThan(0)
    // Effective CFL with compact spacing ≈ 0.0098 across one axis caps dt
    // strictly below 0.02 (the slider's hard ceiling). Concrete bound:
    // omega_max ≥ 2/0.0098 → cflLimit ≤ ~0.0098, so 0.9·cflLimit < 0.009.
    expect(dtAfter).toBeLessThan(0.015)
  })

  describe('applyBecPreset — stale rendering field regression', () => {
    // Regression: BEC presets had heterogeneous renderingOverrides keys. Some
    // set autoScaleMaxGain explicitly, others omitted it. Switching from the
    // first to the second left the stale value on schroedinger.autoScaleMaxGain.
    // Defaults merge via getBecPreset now ensures every switch rebuilds all
    // fields. groundState explicitly sets 15 and singleVortex omits it, so
    // this pair exercises the explicit → default fallback.
    it('resets autoScaleMaxGain when switching to a preset without it', async () => {
      const s = useExtendedObjectStore.getState()
      // groundState → autoScaleMaxGain = 15 (explicit in renderingOverrides).
      // applyBecPreset is async (dynamic import); `vi.waitFor` polls until
      // the expected state appears, instead of racing a fixed 10ms sleep.
      await s.applyBecPreset('groundState')
      await vi.waitFor(() => {
        expect(useExtendedObjectStore.getState().schroedinger.autoScaleMaxGain).toBe(15)
      })

      // singleVortex does NOT declare autoScaleMaxGain — should fall back to
      // BEC_DEFAULT_RENDERING (20), not carry the stale 15 from groundState.
      await s.applyBecPreset('singleVortex')
      await vi.waitFor(() => {
        expect(useExtendedObjectStore.getState().schroedinger.autoScaleMaxGain).toBe(20)
      })
    })

    it('resets densityGain and densityContrast to preset values', async () => {
      const s = useExtendedObjectStore.getState()
      await s.applyBecPreset('singleVortex')
      await vi.waitFor(() => {
        const sc = useExtendedObjectStore.getState().schroedinger
        expect(sc.densityGain).toBe(0.2)
        expect(sc.densityContrast).toBe(2.6)
      })
    })
  })

  describe('disorder overlay (cross-mode port from TDSE)', () => {
    it('defaults to strength=0, seed=42, uniform distribution', () => {
      const bec = getBec()
      expect(bec.disorderStrength).toBe(0)
      expect(bec.disorderSeed).toBe(42)
      expect(bec.disorderDistribution).toBe('uniform')
    })

    it('clamps disorderStrength to [0, 100]', () => {
      const s = useExtendedObjectStore.getState()
      s.setBecDisorderStrength(-5)
      expect(getBec().disorderStrength).toBe(0)
      s.setBecDisorderStrength(500)
      expect(getBec().disorderStrength).toBe(100)
      s.setBecDisorderStrength(2.5)
      expect(getBec().disorderStrength).toBe(2.5)
    })

    it('rejects NaN for disorderStrength', () => {
      const s = useExtendedObjectStore.getState()
      s.setBecDisorderStrength(5)
      s.setBecDisorderStrength(NaN)
      expect(getBec().disorderStrength).toBe(5)
    })

    it('floors disorderSeed to non-negative integer', () => {
      const s = useExtendedObjectStore.getState()
      s.setBecDisorderSeed(1234.7)
      expect(getBec().disorderSeed).toBe(1234)
      s.setBecDisorderSeed(-50)
      expect(getBec().disorderSeed).toBe(0)
      s.setBecDisorderSeed(2 ** 40)
      expect(getBec().disorderSeed).toBe(0xffffffff)
    })

    it('accepts both uniform and gaussian distributions', () => {
      const s = useExtendedObjectStore.getState()
      s.setBecDisorderDistribution('gaussian')
      expect(getBec().disorderDistribution).toBe('gaussian')
      s.setBecDisorderDistribution('uniform')
      expect(getBec().disorderDistribution).toBe('uniform')
    })

    it('bumps schroedingerVersion on disorder change for renderer dirty-flag', () => {
      const s = useExtendedObjectStore.getState()
      const beforeVersion = useExtendedObjectStore.getState().schroedingerVersion
      s.setBecDisorderStrength(10)
      const afterVersion = useExtendedObjectStore.getState().schroedingerVersion
      expect(afterVersion).toBeGreaterThan(beforeVersion)
    })
  })
})
