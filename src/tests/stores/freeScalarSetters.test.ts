/**
 * Tests for free scalar field setter functions.
 *
 * Validates latticeDim resizing, mass/coupling clamping, grid constraints,
 * initial condition configuration, and absorber parameter clamping.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useExtendedObjectStore } from '@/stores/extendedObjectStore'
import { useGeometryStore } from '@/stores/geometryStore'

describe('free scalar field setters', () => {
  beforeEach(() => {
    useExtendedObjectStore.getState().reset()
  })

  const getFSF = () => useExtendedObjectStore.getState().schroedinger.freeScalar

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
      s.applyFreeScalarPreset('deSitterVacuum')
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

    it('re-clamps eta0 when gridSize change raises the safe threshold', () => {
      // Finding 3: safeEta0 scales with L = N·a, so shrinking the grid
      // (smaller L → larger k_min → actually smaller safeEta0...). Use
      // an opposite case: enable cosmology at a small box where the safe
      // threshold is some value, then double the spacing so L doubles and
      // the safe threshold doubles too. If the stored eta0 is below the
      // new floor, it must be re-clamped.
      const s = useExtendedObjectStore.getState()
      s.setFreeScalarLatticeDim(3)
      s.setFreeScalarCosmologyPreset('deSitter')
      s.setFreeScalarCosmologyEnabled(true)
      // Push eta0 to the current safe threshold at default spacing
      const baseline = getFSF().cosmology.eta0

      // Double the spacing — safeEta0 doubles, so eta0 should be re-clamped
      const fs = getFSF()
      s.setFreeScalarSpacing(fs.spacing.map((a) => a * 2))
      const reclamped = getFSF().cosmology.eta0
      // |eta0| should be at least as large as before, and possibly larger
      // (re-clamped). needsReset should be set.
      expect(Math.abs(reclamped)).toBeGreaterThanOrEqual(Math.abs(baseline) - 1e-9)
      expect(getFSF().needsReset).toBe(true)
    })
  })
})
