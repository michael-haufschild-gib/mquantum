import { beforeEach, describe, expect, it } from 'vitest'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'
import { DEFAULT_FREE_SCALAR_CONFIG } from '@/lib/geometry/extended/types'

describe('extendedObjectStore — free scalar field actions', () => {
  beforeEach(() => {
    useExtendedObjectStore.getState().reset()
  })

  it('has correct default freeScalar config', () => {
    const fs = useExtendedObjectStore.getState().schroedinger.freeScalar
    expect(fs).toEqual(DEFAULT_FREE_SCALAR_CONFIG)
  })

  it('setFreeScalarLatticeDim updates latticeDim and adjusts gridSize', () => {
    useExtendedObjectStore.getState().setFreeScalarLatticeDim(2)
    const fs = useExtendedObjectStore.getState().schroedinger.freeScalar
    expect(fs.latticeDim).toBe(2)
    expect(fs.gridSize[2]).toBe(1)
    expect(fs.needsReset).toBe(true)
  })

  it('setFreeScalarLatticeDim(1) collapses Y and Z', () => {
    useExtendedObjectStore.getState().setFreeScalarLatticeDim(1)
    const fs = useExtendedObjectStore.getState().schroedinger.freeScalar
    expect(fs.latticeDim).toBe(1)
    expect(fs.gridSize[1]).toBe(1)
    expect(fs.gridSize[2]).toBe(1)
  })

  it('setFreeScalarGridSize sets grid and triggers reset', () => {
    useExtendedObjectStore.getState().setFreeScalarGridSize([64, 64, 64])
    const fs = useExtendedObjectStore.getState().schroedinger.freeScalar
    expect(fs.gridSize).toEqual([64, 64, 64])
    expect(fs.needsReset).toBe(true)
  })

  it('setFreeScalarMass updates mass parameter', () => {
    useExtendedObjectStore.getState().setFreeScalarMass(2.5)
    expect(useExtendedObjectStore.getState().schroedinger.freeScalar.mass).toBe(2.5)
  })

  it('setFreeScalarDt updates time step', () => {
    useExtendedObjectStore.getState().setFreeScalarDt(0.005)
    expect(useExtendedObjectStore.getState().schroedinger.freeScalar.dt).toBe(0.005)
  })

  it('setFreeScalarStepsPerFrame updates steps count', () => {
    useExtendedObjectStore.getState().setFreeScalarStepsPerFrame(8)
    expect(useExtendedObjectStore.getState().schroedinger.freeScalar.stepsPerFrame).toBe(8)
  })

  it('setFreeScalarInitialCondition updates condition and triggers reset', () => {
    useExtendedObjectStore.getState().setFreeScalarInitialCondition('singleMode')
    const fs = useExtendedObjectStore.getState().schroedinger.freeScalar
    expect(fs.initialCondition).toBe('singleMode')
    expect(fs.needsReset).toBe(true)
  })

  it('setFreeScalarFieldView updates field view', () => {
    useExtendedObjectStore.getState().setFreeScalarFieldView('energyDensity')
    expect(useExtendedObjectStore.getState().schroedinger.freeScalar.fieldView).toBe('energyDensity')
  })

  it('setFreeScalarPacketWidth updates packet width', () => {
    useExtendedObjectStore.getState().setFreeScalarPacketWidth(0.5)
    expect(useExtendedObjectStore.getState().schroedinger.freeScalar.packetWidth).toBe(0.5)
  })

  it('setFreeScalarPacketAmplitude updates amplitude', () => {
    useExtendedObjectStore.getState().setFreeScalarPacketAmplitude(2.0)
    expect(useExtendedObjectStore.getState().schroedinger.freeScalar.packetAmplitude).toBe(2.0)
  })

  it('setFreeScalarModeK updates wave vector', () => {
    useExtendedObjectStore.getState().setFreeScalarModeK([3, -1, 2])
    expect(useExtendedObjectStore.getState().schroedinger.freeScalar.modeK).toEqual([3, -1, 2])
  })

  it('setFreeScalarAutoScale toggles auto-scale', () => {
    useExtendedObjectStore.getState().setFreeScalarAutoScale(false)
    expect(useExtendedObjectStore.getState().schroedinger.freeScalar.autoScale).toBe(false)
  })

  it('resetFreeScalarField sets needsReset flag', () => {
    useExtendedObjectStore.getState().resetFreeScalarField()
    expect(useExtendedObjectStore.getState().schroedinger.freeScalar.needsReset).toBe(true)
  })

  it('setFreeScalarSpacing updates spacing', () => {
    useExtendedObjectStore.getState().setFreeScalarSpacing([0.2, 0.2, 0.2])
    expect(useExtendedObjectStore.getState().schroedinger.freeScalar.spacing).toEqual([0.2, 0.2, 0.2])
  })

  it('setFreeScalarPacketCenter updates center', () => {
    useExtendedObjectStore.getState().setFreeScalarPacketCenter([1, 0.5, -0.5])
    expect(useExtendedObjectStore.getState().schroedinger.freeScalar.packetCenter).toEqual([1, 0.5, -0.5])
  })

  it('all setters increment schroedingerVersion', () => {
    const v0 = useExtendedObjectStore.getState().schroedingerVersion
    useExtendedObjectStore.getState().setFreeScalarMass(3.0)
    const v1 = useExtendedObjectStore.getState().schroedingerVersion
    expect(v1).toBeGreaterThan(v0)

    useExtendedObjectStore.getState().setFreeScalarFieldView('pi')
    const v2 = useExtendedObjectStore.getState().schroedingerVersion
    expect(v2).toBeGreaterThan(v1)
  })

  it('clearFreeScalarNeedsReset clears flag without bumping version', () => {
    // First, set the flag
    useExtendedObjectStore.getState().resetFreeScalarField()
    expect(useExtendedObjectStore.getState().schroedinger.freeScalar.needsReset).toBe(true)

    const vBefore = useExtendedObjectStore.getState().schroedingerVersion
    useExtendedObjectStore.getState().clearFreeScalarNeedsReset()
    const vAfter = useExtendedObjectStore.getState().schroedingerVersion

    expect(useExtendedObjectStore.getState().schroedinger.freeScalar.needsReset).toBe(false)
    expect(vAfter).toBe(vBefore)
  })

  describe('mode-switch normalization (Fix 1)', () => {
    it('forces representation to position when switching to freeScalarField from wigner', () => {
      // Set representation to wigner first
      useExtendedObjectStore.getState().setSchroedingerRepresentation('wigner')
      expect(useExtendedObjectStore.getState().schroedinger.representation).toBe('wigner')

      // Switch to freeScalarField — representation must normalize to position
      useExtendedObjectStore.getState().setSchroedingerQuantumMode('freeScalarField')
      const state = useExtendedObjectStore.getState().schroedinger
      expect(state.quantumMode).toBe('freeScalarField')
      expect(state.representation).toBe('position')
    })

    it('keeps position representation when switching to freeScalarField', () => {
      useExtendedObjectStore.getState().setSchroedingerRepresentation('position')
      useExtendedObjectStore.getState().setSchroedingerQuantumMode('freeScalarField')
      expect(useExtendedObjectStore.getState().schroedinger.representation).toBe('position')
    })

    it('does not touch representation for non-freeScalarField modes', () => {
      useExtendedObjectStore.getState().setSchroedingerRepresentation('wigner')
      useExtendedObjectStore.getState().setSchroedingerQuantumMode('hydrogenND')
      expect(useExtendedObjectStore.getState().schroedinger.representation).toBe('wigner')
    })
  })

  describe('grid-size dimension enforcement (Fix 6)', () => {
    it('forces Y and Z to 1 when latticeDim is 1', () => {
      useExtendedObjectStore.getState().setFreeScalarLatticeDim(1)
      useExtendedObjectStore.getState().setFreeScalarGridSize([32, 64, 64])
      const fs = useExtendedObjectStore.getState().schroedinger.freeScalar
      expect(fs.gridSize).toEqual([32, 1, 1])
    })

    it('forces Z to 1 when latticeDim is 2', () => {
      useExtendedObjectStore.getState().setFreeScalarLatticeDim(2)
      useExtendedObjectStore.getState().setFreeScalarGridSize([32, 32, 64])
      const fs = useExtendedObjectStore.getState().schroedinger.freeScalar
      expect(fs.gridSize).toEqual([32, 32, 1])
    })

    it('allows all dims when latticeDim is 3', () => {
      useExtendedObjectStore.getState().setFreeScalarLatticeDim(3)
      useExtendedObjectStore.getState().setFreeScalarGridSize([32, 32, 32])
      const fs = useExtendedObjectStore.getState().schroedinger.freeScalar
      expect(fs.gridSize).toEqual([32, 32, 32])
    })

    it('spacing setter clamps all dimensions uniformly regardless of latticeDim', () => {
      useExtendedObjectStore.getState().setFreeScalarLatticeDim(1)
      useExtendedObjectStore.getState().setFreeScalarSpacing([0.5, 0.3, 0.3])
      const fs = useExtendedObjectStore.getState().schroedinger.freeScalar
      expect(fs.spacing[0]).toBe(0.5)
      expect(fs.spacing[1]).toBe(0.3)
      expect(fs.spacing[2]).toBe(0.3)
    })
  })

  describe('CFL stability enforcement', () => {
    it('clamps dt to CFL limit for default 3D spacing', () => {
      // Default: spacing=[0.1, 0.1, 0.1], latticeDim=3
      // CFL limit = 0.1 / sqrt(3) ≈ 0.0577
      // With 0.9 safety factor: max ≈ 0.0520
      useExtendedObjectStore.getState().setFreeScalarDt(0.1)
      const fs = useExtendedObjectStore.getState().schroedinger.freeScalar
      expect(fs.dt).toBeLessThan(0.06)
      expect(fs.dt).toBeGreaterThan(0.04)
    })

    it('allows small dt values within CFL limit', () => {
      useExtendedObjectStore.getState().setFreeScalarDt(0.005)
      expect(useExtendedObjectStore.getState().schroedinger.freeScalar.dt).toBe(0.005)
    })

    it('re-clamps dt when spacing decreases', () => {
      // Start with large spacing and large dt
      useExtendedObjectStore.getState().setFreeScalarSpacing([1.0, 1.0, 1.0])
      useExtendedObjectStore.getState().setFreeScalarDt(0.1)
      expect(useExtendedObjectStore.getState().schroedinger.freeScalar.dt).toBe(0.1)

      // Reduce spacing — CFL limit shrinks, dt should be re-clamped
      useExtendedObjectStore.getState().setFreeScalarSpacing([0.02, 0.02, 0.02])
      const fs = useExtendedObjectStore.getState().schroedinger.freeScalar
      // CFL limit = 0.02 / sqrt(3) ≈ 0.01155, * 0.9 ≈ 0.0104
      expect(fs.dt).toBeLessThanOrEqual(0.012)
    })

    it('re-clamps dt when latticeDim increases', () => {
      // Start in 1D with dt near the 1D CFL limit
      useExtendedObjectStore.getState().setFreeScalarLatticeDim(1)
      useExtendedObjectStore.getState().setFreeScalarDt(0.08)
      // 1D CFL = 0.1 / sqrt(1) = 0.1, * 0.9 = 0.09. dt=0.08 is fine.
      expect(useExtendedObjectStore.getState().schroedinger.freeScalar.dt).toBe(0.08)

      // Switch to 3D — CFL limit drops to 0.1/sqrt(3)*0.9 ≈ 0.052
      useExtendedObjectStore.getState().setFreeScalarLatticeDim(3)
      const fs = useExtendedObjectStore.getState().schroedinger.freeScalar
      expect(fs.dt).toBeLessThan(0.06)
    })

    it('CFL limit accounts for mass term', () => {
      // With large mass (m=10) and spacing=0.1, 1D:
      // omega_max = sqrt(m^2 + (2/a)^2) = sqrt(100 + 400) = sqrt(500) ≈ 22.36
      // dt_max = 2/22.36 ≈ 0.0894, * 0.9 ≈ 0.0805
      useExtendedObjectStore.getState().setFreeScalarLatticeDim(1)
      useExtendedObjectStore.getState().setFreeScalarMass(10.0)
      useExtendedObjectStore.getState().setFreeScalarDt(0.1)
      const fs = useExtendedObjectStore.getState().schroedinger.freeScalar
      // dt should be clamped below 0.09 (which the massless CFL would have allowed)
      expect(fs.dt).toBeLessThan(0.09)
      expect(fs.dt).toBeGreaterThan(0.07)
    })

    it('setFreeScalarMass re-clamps dt when mass increases', () => {
      // Start with small mass, large dt
      useExtendedObjectStore.getState().setFreeScalarLatticeDim(1)
      useExtendedObjectStore.getState().setFreeScalarMass(0.0)
      useExtendedObjectStore.getState().setFreeScalarDt(0.085)
      expect(useExtendedObjectStore.getState().schroedinger.freeScalar.dt).toBe(0.085)

      // Increase mass to 10 — CFL limit shrinks, dt must be re-clamped
      useExtendedObjectStore.getState().setFreeScalarMass(10.0)
      const fs = useExtendedObjectStore.getState().schroedinger.freeScalar
      expect(fs.dt).toBeLessThan(0.085)
    })

    it('massless CFL matches spatial-only formula a/sqrt(d)', () => {
      // With mass=0, the CFL should be 2/sqrt(d*(2/a)^2) = a/sqrt(d)
      // For a=0.1, d=3: 0.1/sqrt(3) ≈ 0.0577, *0.9 ≈ 0.0520
      useExtendedObjectStore.getState().setFreeScalarMass(0.0)
      useExtendedObjectStore.getState().setFreeScalarDt(0.1)
      const fs = useExtendedObjectStore.getState().schroedinger.freeScalar
      expect(fs.dt).toBeCloseTo(0.0577 * 0.9, 3)
    })
  })
})
