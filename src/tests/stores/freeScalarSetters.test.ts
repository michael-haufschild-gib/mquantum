/**
 * Tests for free scalar field setter functions.
 *
 * Validates latticeDim resizing, mass/coupling clamping, grid constraints,
 * initial condition configuration, and absorber parameter clamping.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useExtendedObjectStore } from '@/stores/scene/extendedObjectStore'
import { useGeometryStore } from '@/stores/scene/geometryStore'

describe('free scalar field setters', () => {
  beforeEach(() => {
    useExtendedObjectStore.getState().reset()
  })

  const getFSF = () => useExtendedObjectStore.getState().schroedinger.freeScalar
  const patchFreeScalar = (
    patch: Partial<ReturnType<typeof getFSF>>,
    cosmologyPatch: Partial<ReturnType<typeof getFSF>['cosmology']> = {}
  ) => {
    useExtendedObjectStore.setState((state) => {
      const fs = state.schroedinger.freeScalar
      return {
        ...state,
        schroedinger: {
          ...state.schroedinger,
          freeScalar: {
            ...fs,
            ...patch,
            cosmology: {
              ...fs.cosmology,
              ...cosmologyPatch,
            },
          },
        },
      }
    })
  }

  it('clamps latticeDim to [1, 11]', () => {
    const s = useExtendedObjectStore.getState()
    s.setFreeScalarLatticeDim(0)
    expect(getFSF().latticeDim).toBe(1)
    s.setFreeScalarLatticeDim(20)
    expect(getFSF().latticeDim).toBe(11)
  })

  it('clamps mass to [0, 10]', () => {
    const s = useExtendedObjectStore.getState()
    s.setFreeScalarMass(-1)
    expect(getFSF().mass).toBe(0)
    s.setFreeScalarMass(100)
    expect(getFSF().mass).toBe(10)
  })

  it('clamps selfInteractionLambda to [0.01, 10]', () => {
    const s = useExtendedObjectStore.getState()
    s.setFreeScalarSelfInteractionLambda(0)
    expect(getFSF().selfInteractionLambda).toBe(0.01)
    s.setFreeScalarSelfInteractionLambda(2000)
    expect(getFSF().selfInteractionLambda).toBe(10)
  })

  it('clamps selfInteractionVev to [0.1, 5]', () => {
    const s = useExtendedObjectStore.getState()
    s.setFreeScalarSelfInteractionVev(0)
    expect(getFSF().selfInteractionVev).toBe(0.1)
    s.setFreeScalarSelfInteractionVev(100)
    expect(getFSF().selfInteractionVev).toBe(5)
  })

  it('clamps stepsPerFrame to integer [1, 16]', () => {
    const s = useExtendedObjectStore.getState()
    s.setFreeScalarStepsPerFrame(0)
    expect(getFSF().stepsPerFrame).toBe(1)
    s.setFreeScalarStepsPerFrame(500)
    expect(getFSF().stepsPerFrame).toBe(16)
  })

  it('clamps packetWidth to [0.01, 5]', () => {
    const s = useExtendedObjectStore.getState()
    s.setFreeScalarPacketWidth(0)
    expect(getFSF().packetWidth).toBe(0.01)
    s.setFreeScalarPacketWidth(10)
    expect(getFSF().packetWidth).toBe(5)
  })

  it('clamps absorberWidth to [0.05, 0.5]', () => {
    const s = useExtendedObjectStore.getState()
    s.setFreeScalarAbsorberWidth(0)
    expect(getFSF().absorberWidth).toBe(0.05)
    s.setFreeScalarAbsorberWidth(1)
    expect(getFSF().absorberWidth).toBe(0.5)
  })

  it('clamps pmlTargetReflection to [1e-12, 0.999]', () => {
    const s = useExtendedObjectStore.getState()
    s.setFreeScalarPmlTargetReflection(0)
    expect(getFSF().pmlTargetReflection).toBe(1e-12)
    s.setFreeScalarPmlTargetReflection(2)
    expect(getFSF().pmlTargetReflection).toBe(0.999)
  })

  it('rejects malformed free-scalar enum setters without dirtying compute state', () => {
    const s = useExtendedObjectStore.getState()
    s.setFreeScalarInitialCondition('singleMode')
    s.setFreeScalarFieldView('pi')
    s.clearComputeNeedsReset('freeScalar')

    const before = useExtendedObjectStore.getState()
    const beforeVersion = before.schroedingerVersion

    s.setFreeScalarInitialCondition('bogus' as never)
    s.setFreeScalarFieldView('bogus' as never)

    const after = useExtendedObjectStore.getState()
    expect(after.schroedingerVersion).toBe(beforeVersion)
    expect(after.schroedinger.freeScalar.initialCondition).toBe('singleMode')
    expect(after.schroedinger.freeScalar.fieldView).toBe('pi')
    expect(after.schroedinger.freeScalar.needsReset).toBe(false)
  })

  it('rejects non-finite free-scalar init vectors before they reach WGSL uniforms', () => {
    const s = useExtendedObjectStore.getState()
    s.setFreeScalarPacketCenter([1, 2, 3])
    s.setFreeScalarModeK([1, 0, -1])
    s.clearComputeNeedsReset('freeScalar')

    const before = useExtendedObjectStore.getState()
    const beforeVersion = before.schroedingerVersion

    s.setFreeScalarPacketCenter([4, Number.NaN, 6])
    s.setFreeScalarModeK([2, Number.POSITIVE_INFINITY, 0])

    const after = useExtendedObjectStore.getState()
    expect(after.schroedingerVersion).toBe(beforeVersion)
    expect(after.schroedinger.freeScalar.packetCenter).toEqual([1, 2, 3])
    expect(after.schroedinger.freeScalar.modeK).toEqual([1, 0, -1])
    expect(after.schroedinger.freeScalar.needsReset).toBe(false)
  })

  it('creates slice positions for dims > 3', () => {
    const s = useExtendedObjectStore.getState()
    s.setFreeScalarLatticeDim(5)
    expect(getFSF().slicePositions).toHaveLength(2) // 5 - 3 = 2
  })

  describe('cosmology invariants (Finding 3)', () => {
    it('soft-disables cosmology when latticeDim change takes spacetimeDim out of [3, 7]', () => {
      // Finding 3: changing latticeDim to an out-of-range value (e.g. 1)
      // leaves spacetimeDim=2, which is outside the cosmology bridge's
      // [3, 7] support window. The step path would then silently fall
      // back to mass² while the reset path would throw; reconcile helper
      // must force-disable cosmology and mark the field for reset.
      const s = useExtendedObjectStore.getState()
      // Enable cosmology at a supported latticeDim=3 first
      s.setFreeScalarLatticeDim(3)
      s.setFreeScalarCosmologyEnabled(true)
      expect(getFSF().cosmology.enabled).toBe(true)

      // Change to latticeDim=1 — spacetimeDim=2, out of range
      s.setFreeScalarLatticeDim(1)
      expect(getFSF().cosmology.enabled).toBe(false)
      expect(getFSF().needsReset).toBe(true)
    })

    it('cosmology preset enables cosmology sub-config when applied at supported dim', async () => {
      // The de Sitter Bunch–Davies preset enables deSitter cosmology.
      // Loading it while globalDim is in the supported range must leave
      // `cosmology.enabled=true` with the preset's hubble and eta0.
      const s = useExtendedObjectStore.getState()
      await s.applyFreeScalarPreset('deSitterVacuum')
      // applyFreeScalarPreset does a dynamic import → wait for it to settle.
      await vi.waitFor(() => {
        expect(getFSF().cosmology.enabled).toBe(true)
      })
      const fs = getFSF()
      expect(fs.cosmology.preset).toBe('deSitter')
      expect(fs.cosmology.hubble).toBe(1.0)
      expect(fs.initialCondition).toBe('vacuumNoise')
      expect(fs.needsReset).toBe(true)
    })

    it('re-clamps cosmology.eta0 when global dimension changes via the dimension slider', () => {
      // The user-facing dimension slider goes through geometryStore and the
      // compute-mode sync path (syncActiveComputeModeLatticeDim), NOT the
      // freeScalar-specific setter. Regression guard: dimension changes must
      // still run reconcileCosmologyInvariants so eta0 stays clamped to the
      // per-lattice safe threshold and spacetimeDim is kept in bounds.
      const ext = useExtendedObjectStore.getState()
      ext.setSchroedingerQuantumMode('freeScalarField')
      useGeometryStore.getState().setDimension(6)
      useExtendedObjectStore.getState().setFreeScalarCosmologyPreset('deSitter')
      useExtendedObjectStore.getState().setFreeScalarCosmologyEnabled(true)
      const eta0AtDim6 = getFSF().cosmology.eta0

      // Switch to dimension=3 via the geometry store. This triggers the
      // compute-mode sync path; without the reconcile fix, eta0 would stay
      // at its dim=6 value even though safeEta0 at dim=3 is larger (bigger
      // default grid → larger L → smaller k_min → larger safeEta0).
      useGeometryStore.getState().setDimension(3)
      const fsAfter = getFSF()
      expect(fsAfter.latticeDim).toBe(3)
      // Cosmology stays enabled because dim=3 is still in [3, 7].
      expect(fsAfter.cosmology.enabled).toBe(true)
      // |eta0| must be at least as large as it was at dim=6 — safeEta0 grew.
      expect(Math.abs(fsAfter.cosmology.eta0)).toBeGreaterThanOrEqual(Math.abs(eta0AtDim6) - 1e-9)
      // The sync path sets needsReset on the freeScalar sub-config.
      expect(fsAfter.needsReset).toBe(true)
    })

    it('refuses to enable cosmology when the current preset params are invalid', () => {
      // Regression: previously setFreeScalarCosmologyEnabled would flip the
      // flag to true even when `clampEta0` threw — leaving the compute pass
      // to crash on the next reset. Put the store into a state where the
      // de Sitter preset is selected but the `hubble` would make it fail
      // `isValidPreset` by setting hubble out of the valid range via the
      // setter first (which clamps), so we simulate an invalid state by
      // directly constructing an ekpyrotic preset with sub-critical steepness.
      const s = useExtendedObjectStore.getState()
      s.setFreeScalarLatticeDim(3)
      // ekpyrotic at steepness = sc is exactly on the boundary → invalid.
      // The preset setter auto-bumps steepness above sc, so we need to bypass
      // by setting preset to ekpyrotic first (which bumps), then driving
      // steepness back down — the steepness setter clamps to sMin = sc*1.0001
      // which is still valid. That means the only reachable "invalid" user
      // state is the de Sitter hubble=0 case. Simulate the crash path by
      // mocking the store cosmology slice into an invalid ekpyrotic state.
      s.setFreeScalarCosmologyPreset('ekpyrotic')
      // Drive cosmology into an invalid state by reaching into the store
      // directly (mirrors what a corrupted preset load could do).
      useExtendedObjectStore.setState((state) => ({
        ...state,
        schroedinger: {
          ...state.schroedinger,
          freeScalar: {
            ...state.schroedinger.freeScalar,
            cosmology: {
              ...state.schroedinger.freeScalar.cosmology,
              enabled: false,
              preset: 'ekpyrotic' as const,
              steepness: 0.5, // < s_c(4) ≈ 3.464 — invalid
            },
          },
        },
      }))

      // Calling the setter must refuse to enable.
      s.setFreeScalarCosmologyEnabled(true)
      expect(getFSF().cosmology.enabled).toBe(false)
    })

    it('does not throw from setFreeScalarCosmologySteepness on a 1D lattice', () => {
      // Regression: the steepness setter used to call sCritical(latticeDim+1)
      // unconditionally. On a 1D lattice (spacetimeDim = 2), sCritical
      // throws because its formula √(8·(n−1)/(n−2)) divides by zero. The
      // setter must soft-fail like the other cosmology setters — store the
      // value verbatim and let the next lattice reconcile revalidate.
      const s = useExtendedObjectStore.getState()
      s.setFreeScalarLatticeDim(1)
      expect(() => s.setFreeScalarCosmologySteepness(5)).not.toThrow()
      expect(getFSF().cosmology.steepness).toBe(5)
    })

    it('preserves self-interaction state when enable is refused', () => {
      // Regression: the v1 mutex (cosmology on ⟹ self-interaction off) used
      // to derive its new value from the *raw* enable flag, so a refused
      // toggle still cleared self-interaction as a silent side effect. Must
      // key off the validated nextEnabled instead.
      const s = useExtendedObjectStore.getState()
      s.setFreeScalarLatticeDim(3)
      // Turn self-interaction on first so we can observe whether the
      // refused toggle clobbers it.
      s.setFreeScalarSelfInteractionEnabled(true)
      expect(getFSF().selfInteractionEnabled).toBe(true)
      // Corrupt cosmology state into an invalid ekpyrotic config that will
      // be rejected by isValidPreset.
      useExtendedObjectStore.setState((state) => ({
        ...state,
        schroedinger: {
          ...state.schroedinger,
          freeScalar: {
            ...state.schroedinger.freeScalar,
            cosmology: {
              ...state.schroedinger.freeScalar.cosmology,
              enabled: false,
              preset: 'ekpyrotic' as const,
              steepness: 0.5, // < s_c(4)
            },
          },
        },
      }))

      s.setFreeScalarCosmologyEnabled(true)
      // Refused — cosmology stays off AND self-interaction is untouched.
      expect(getFSF().cosmology.enabled).toBe(false)
      expect(getFSF().selfInteractionEnabled).toBe(true)
    })

    it('rejects malformed cosmology preset strings without dirtying compute state', () => {
      const s = useExtendedObjectStore.getState()
      s.setFreeScalarCosmologyPreset('deSitter')
      s.clearComputeNeedsReset('freeScalar')

      const before = useExtendedObjectStore.getState()
      const beforeVersion = before.schroedingerVersion

      s.setFreeScalarCosmologyPreset('bogus' as never)

      const after = useExtendedObjectStore.getState()
      expect(after.schroedingerVersion).toBe(beforeVersion)
      expect(after.schroedinger.freeScalar.cosmology.preset).toBe('deSitter')
      expect(after.schroedinger.freeScalar.needsReset).toBe(false)
    })

    it('soft-disables cosmology when reconcile hits an invalid preset combo', () => {
      // Regression: reconcileCosmologyInvariants previously returned {} when
      // `isValidPreset` was false, leaving cosmology enabled in a state that
      // would crash the compute pass on reset.
      const s = useExtendedObjectStore.getState()
      s.setFreeScalarLatticeDim(3)
      s.setFreeScalarCosmologyPreset('deSitter')
      s.setFreeScalarCosmologyEnabled(true)
      expect(getFSF().cosmology.enabled).toBe(true)

      // Corrupt hubble to a value isValidPreset will reject, then trigger
      // reconcile via a lattice change.
      useExtendedObjectStore.setState((state) => ({
        ...state,
        schroedinger: {
          ...state.schroedinger,
          freeScalar: {
            ...state.schroedinger.freeScalar,
            cosmology: {
              ...state.schroedinger.freeScalar.cosmology,
              hubble: 0, // invalid for deSitter
            },
          },
        },
      }))

      // Triggering reconcile via a setter that calls it.
      s.setFreeScalarLatticeDim(4)
      expect(getFSF().cosmology.enabled).toBe(false)
      expect(getFSF().needsReset).toBe(true)
    })

    it('marks needsReset when a spacing change triggers reconcile', () => {
      // `safeEta0` is now a constant (`DEFAULT_SAFE_ETA0 = 0.1`), so lattice
      // geometry changes no longer move the clamp floor. What this test
      // actually verifies is that `setFreeScalarSpacing` triggers
      // `reconcileCosmologyInvariants`, which calls `clampEta0` again and
      // marks `needsReset: true` on any lattice-affecting edit — even when
      // the clamp is a no-op and `eta0` comes back unchanged.
      const s = useExtendedObjectStore.getState()
      s.setFreeScalarLatticeDim(3)
      s.setFreeScalarCosmologyPreset('deSitter')
      s.setFreeScalarCosmologyEnabled(true)
      const baseline = getFSF().cosmology.eta0

      const fs = getFSF()
      s.setFreeScalarSpacing(fs.spacing.map((a) => a * 2))
      const reclamped = getFSF().cosmology.eta0
      // The clamp floor is constant, so eta0 should come back equal within
      // floating-point tolerance — not strictly greater.
      expect(reclamped).toBeCloseTo(baseline, 12)
      expect(getFSF().needsReset).toBe(true)
    })

    it('stores Bianchi exponents but resets only for vacuum Kasner triples on Bianchi preset', () => {
      const s = useExtendedObjectStore.getState()
      patchFreeScalar({ needsReset: false }, { preset: 'bianchiKasner' })

      s.setFreeScalarCosmologyBianchiExponents(0.2, 0.3, 0.4)
      expect(getFSF().cosmology.kasnerExponents).toEqual({ p1: 0.2, p2: 0.3, p3: 0.4 })
      expect(getFSF().needsReset).toBe(false)

      s.setFreeScalarCosmologyBianchiExponents(-1 / 3, 2 / 3, 2 / 3)
      expect(getFSF().cosmology.kasnerExponents).toEqual({
        p1: -1 / 3,
        p2: 2 / 3,
        p3: 2 / 3,
      })
      expect(getFSF().needsReset).toBe(true)
    })

    it('rejects non-finite Bianchi exponents without clobbering the current triple', () => {
      const s = useExtendedObjectStore.getState()
      const before = getFSF().cosmology.kasnerExponents

      s.setFreeScalarCosmologyBianchiExponents(Number.NaN, 2 / 3, 2 / 3)
      expect(getFSF().cosmology.kasnerExponents).toEqual(before)
      expect(getFSF().needsReset).toBe(false)
    })

    it('clamps Hubble to the physical slider range and only resets de Sitter fields', () => {
      const s = useExtendedObjectStore.getState()

      patchFreeScalar({ needsReset: false }, { preset: 'minkowski' })
      s.setFreeScalarCosmologyHubble(0)
      expect(getFSF().cosmology.hubble).toBe(0.01)
      expect(getFSF().needsReset).toBe(false)

      s.setFreeScalarCosmologyHubble(200)
      expect(getFSF().cosmology.hubble).toBe(100)

      s.setFreeScalarCosmologyHubble(Number.POSITIVE_INFINITY)
      expect(getFSF().cosmology.hubble).toBe(100)

      patchFreeScalar({ needsReset: false }, { preset: 'deSitter' })
      s.setFreeScalarCosmologyHubble(2)
      expect(getFSF().cosmology.hubble).toBe(2)
      expect(getFSF().needsReset).toBe(true)
    })

    it('rejects zero and non-finite eta0 but stores eta0 verbatim outside cosmology dims', () => {
      const s = useExtendedObjectStore.getState()
      const before = getFSF().cosmology.eta0

      s.setFreeScalarCosmologyEta0(0)
      expect(getFSF().cosmology.eta0).toBe(before)

      s.setFreeScalarCosmologyEta0(Number.NaN)
      expect(getFSF().cosmology.eta0).toBe(before)

      s.setFreeScalarLatticeDim(1)
      s.setFreeScalarCosmologyEta0(0.25)
      expect(getFSF().cosmology.eta0).toBe(0.25)
      expect(getFSF().needsReset).toBe(true)
    })

    it('switches eta0 gauge when moving between LQC/Bianchi and FLRW presets', () => {
      const s = useExtendedObjectStore.getState()

      s.setFreeScalarCosmologyEta0(-200)
      s.setFreeScalarCosmologyPreset('lqcBounce')
      expect(getFSF().cosmology.eta0).toBe(19)

      s.setFreeScalarCosmologyPreset('deSitter')
      expect(getFSF().cosmology.eta0).toBeLessThan(0)

      s.setFreeScalarCosmologyEta0(-0.2)
      s.setFreeScalarCosmologyPreset('lqcBounce')
      expect(getFSF().cosmology.eta0).toBe(1)
    })

    it('clamps LQC bounce parameters and resets only while LQC is active', () => {
      const s = useExtendedObjectStore.getState()

      patchFreeScalar({ needsReset: false }, { preset: 'minkowski' })
      s.setFreeScalarCosmologyLqcRhoCritical(2)
      expect(getFSF().cosmology.lqcRhoCritical).toBe(2)
      expect(getFSF().needsReset).toBe(false)

      patchFreeScalar({ needsReset: false }, { preset: 'lqcBounce' })
      s.setFreeScalarCosmologyLqcRhoCritical(0)
      expect(getFSF().cosmology.lqcRhoCritical).toBe(0.1)
      expect(getFSF().needsReset).toBe(true)

      patchFreeScalar({ needsReset: false })
      s.setFreeScalarCosmologyLqcRhoCritical(20)
      expect(getFSF().cosmology.lqcRhoCritical).toBe(10)

      s.setFreeScalarCosmologyLqcEquationOfState(-1)
      expect(getFSF().cosmology.lqcEquationOfState).toBe(0)
      s.setFreeScalarCosmologyLqcEquationOfState(2)
      expect(getFSF().cosmology.lqcEquationOfState).toBe(1)

      s.setFreeScalarCosmologyLqcInitialRhoRatio(0)
      expect(getFSF().cosmology.lqcInitialRhoRatio).toBe(0.001)
      s.setFreeScalarCosmologyLqcInitialRhoRatio(1)
      expect(getFSF().cosmology.lqcInitialRhoRatio).toBe(0.999)
    })

    it('ignores non-finite LQC parameter edits', () => {
      const s = useExtendedObjectStore.getState()
      patchFreeScalar(
        { needsReset: false },
        {
          lqcRhoCritical: 3,
          lqcEquationOfState: 0.25,
          lqcInitialRhoRatio: 0.2,
        }
      )

      s.setFreeScalarCosmologyLqcRhoCritical(Number.NaN)
      s.setFreeScalarCosmologyLqcEquationOfState(Number.POSITIVE_INFINITY)
      s.setFreeScalarCosmologyLqcInitialRhoRatio(Number.NEGATIVE_INFINITY)

      expect(getFSF().cosmology.lqcRhoCritical).toBe(3)
      expect(getFSF().cosmology.lqcEquationOfState).toBe(0.25)
      expect(getFSF().cosmology.lqcInitialRhoRatio).toBe(0.2)
      expect(getFSF().needsReset).toBe(false)
    })
  })
})
