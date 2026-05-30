/**
 * URL params -> store state integration test.
 *
 * Verifies that deserializing URL params and applying them to stores
 * produces the correct state. This tests the full chain from URL string
 * to Zustand store values, catching bugs where a new URL param is added
 * to the serializer but not wired through to the stores.
 *
 * Uses the production `applyUrlStateParams` — NOT a local copy.
 */

import { beforeEach, describe, expect, it } from 'vitest'

import { applyUrlStateParams } from '@/hooks/useUrlState'
import { deserializeState, serializeState } from '@/lib/url/state-serializer'
import { useExtendedObjectStore } from '@/stores/scene/extendedObjectStore'
import { useGeometryStore } from '@/stores/scene/geometryStore'

/** Deserialize a URL string and apply the result to stores. */
function applyUrlStateToStores(urlString: string): void {
  const urlState = deserializeState(urlString)
  applyUrlStateParams(urlState)
}

describe('URL params -> store state integration', () => {
  beforeEach(() => {
    useGeometryStore.getState().reset()
    useExtendedObjectStore.getState().reset()
  })

  it('applies dimension from URL to geometry store', () => {
    applyUrlStateToStores('d=7&t=schroedinger')
    expect(useGeometryStore.getState().dimension).toBe(7)
  })

  it('applies quantum mode from URL to extended store', () => {
    applyUrlStateToStores('d=3&t=schroedinger&qm=tdseDynamics')
    expect(useExtendedObjectStore.getState().schroedinger.quantumMode).toBe('tdseDynamics')
  })

  it('applies hydrogen quantum numbers from URL', () => {
    applyUrlStateToStores('d=3&t=schroedinger&qm=hydrogenND&hyd_n=4&hyd_l=2&hyd_m=-1')
    const sch = useExtendedObjectStore.getState().schroedinger
    expect(sch.quantumMode).toBe('hydrogenND')
    expect(sch.principalQuantumNumber).toBe(4)
    expect(sch.azimuthalQuantumNumber).toBe(2)
    expect(sch.magneticQuantumNumber).toBe(-1)
  })

  it('applies HO parameters from URL', () => {
    applyUrlStateToStores('d=5&t=schroedinger&tc=6&seed=42')
    const sch = useExtendedObjectStore.getState().schroedinger
    expect(sch.termCount).toBe(6)
    expect(sch.seed).toBe(42)
  })

  it('applies rendering params from URL', () => {
    applyUrlStateToStores('d=4&t=schroedinger&iso=1&iso_t=-3.00&dg=2.50&scale=1.50')
    const sch = useExtendedObjectStore.getState().schroedinger
    expect(sch.isoEnabled).toBe(true)
    expect(sch.isoThreshold).toBeCloseTo(-3.0)
    expect(sch.densityGain).toBeCloseTo(2.5)
    expect(sch.scale).toBeCloseTo(1.5)
  })

  it('rejects isosurface from URL when representation is Wigner', () => {
    applyUrlStateToStores('d=4&t=schroedinger&repr=wigner&iso=1')

    const sch = useExtendedObjectStore.getState().schroedinger
    expect(sch.representation).toBe('wigner')
    expect(sch.isoEnabled).toBe(false)
  })

  it('applies representation param from URL', () => {
    applyUrlStateToStores('d=4&t=schroedinger&repr=momentum')
    expect(useExtendedObjectStore.getState().schroedinger.representation).toBe('momentum')
  })

  it('applies configured Wigner URL controls through production setters', () => {
    const serialized = serializeState({
      dimension: 6,
      objectType: 'schroedinger',
      quantumMode: 'hydrogenNDCoupled',
      representation: 'wigner',
      wignerDimensionIndex: 4,
      wignerAutoRange: false,
      wignerXRange: 3.5,
      wignerPRange: 8.25,
      wignerCrossTermsEnabled: false,
      wignerQuadPoints: 64,
      wignerCacheResolution: 512,
    })

    applyUrlStateToStores(serialized)

    const sch = useExtendedObjectStore.getState().schroedinger
    expect(sch.quantumMode).toBe('hydrogenNDCoupled')
    expect(sch.representation).toBe('wigner')
    expect(sch.wignerDimensionIndex).toBe(4)
    expect(sch.wignerAutoRange).toBe(false)
    expect(sch.wignerXRange).toBeCloseTo(3.5)
    expect(sch.wignerPRange).toBeCloseTo(8.25)
    expect(sch.wignerCrossTermsEnabled).toBe(false)
    expect(sch.wignerQuadPoints).toBe(64)
    expect(sch.wignerCacheResolution).toBe(512)
  })

  it('applies cross-section param from URL', () => {
    applyUrlStateToStores('d=4&t=schroedinger&cs=1')
    expect(useExtendedObjectStore.getState().schroedinger.crossSectionEnabled).toBe(true)
  })

  it('applies TDSE potential type from URL', () => {
    applyUrlStateToStores('d=3&t=schroedinger&qm=tdseDynamics&pot=harmonicTrap')
    const tdse = useExtendedObjectStore.getState().schroedinger.tdse
    expect(tdse.potentialType).toBe('harmonicTrap')
  })

  it('applies black-hole Regge-Wheeler URL params through TDSE setters', () => {
    applyUrlStateToStores(
      'd=3&t=schroedinger&qm=tdseDynamics&pot=blackHoleRingdown&bh_m=1.25&bh_l=3&bh_s=2'
    )
    const tdse = useExtendedObjectStore.getState().schroedinger.tdse
    expect(tdse.potentialType).toBe('blackHoleRingdown')
    expect(tdse.bhMass).toBeCloseTo(1.25, 3)
    expect(tdse.bhMultipoleL).toBe(3)
    expect(tdse.bhSpin).toBe(2)
  })

  it('applies TDSE absorber and diagnostics from URL', () => {
    applyUrlStateToStores('d=3&t=schroedinger&qm=tdseDynamics&abs=1&diag=1&obs=1')
    const tdse = useExtendedObjectStore.getState().schroedinger.tdse
    expect(tdse.absorberEnabled).toBe(true)
    expect(tdse.diagnosticsEnabled).toBe(true)
    expect(tdse.observablesEnabled).toBe(true)
  })

  it('applies open quantum params from URL', () => {
    applyUrlStateToStores(
      'd=4&t=schroedinger&qm=harmonicOscillator&oq=1&oq_dp=0.50&oq_rx=1.20&oq_de=0&oq_re=1&oq_te=1&oq_dt=0.025&oq_sub=7&oq_tmp=420&oq_cpl=2.25&oq_nmax=3&oq_dm=none&oq_viz=entropyMap'
    )
    const oq = useExtendedObjectStore.getState().schroedinger.openQuantum
    expect(oq.enabled).toBe(true)
    expect(oq.dephasingRate).toBeCloseTo(0.5)
    expect(oq.relaxationRate).toBeCloseTo(1.2)
    expect(oq.dephasingEnabled).toBe(false)
    expect(oq.relaxationEnabled).toBe(true)
    expect(oq.thermalEnabled).toBe(true)
    expect(oq.dt).toBeCloseTo(0.025)
    expect(oq.substeps).toBe(7)
    expect(oq.bathTemperature).toBeCloseTo(420)
    expect(oq.couplingScale).toBeCloseTo(2.25)
    expect(oq.hydrogenBasisMaxN).toBe(3)
    expect(oq.dephasingModel).toBe('none')
    expect(oq.visualizationMode).toBe('entropyMap')
  })

  it('applies configured Dirac URL params through production setters', () => {
    const serialized = serializeState({
      dimension: 4,
      objectType: 'schroedinger',
      quantumMode: 'diracEquation',
      diracInitialCondition: 'zitterbewegung',
      diracFieldView: 'axialCharge',
      diracPotentialType: 'barrier',
      diracPotentialStrength: 3.5,
      diracPotentialWidth: 0.7,
      diracPotentialCenter: 0.5,
      diracMass: 1.7,
      diracSpeedOfLight: 2.5,
      diracHbar: 0.8,
      diracDt: 0.006,
      diracStepsPerFrame: 5,
      diracGridSize: [16, 16, 16, 16],
      diracSpacing: [0.12, 0.13, 0.14, 0.15],
      diracPacketCenter: [0.1, -0.2, 0.3, 0.4],
      diracPacketMomentum: [1.5, -2, 0.75, 0.5],
      diracPacketWidth: 0.35,
      diracPositiveEnergyFraction: 0.45,
      diracAutoScale: true,
      diracShowPotential: true,
      diracDiagnosticsEnabled: false,
      diracDiagnosticsInterval: 11,
      diracSlicePositions: [0.25],
    })

    applyUrlStateToStores(serialized)

    const dirac = useExtendedObjectStore.getState().schroedinger.dirac
    expect(useExtendedObjectStore.getState().schroedinger.quantumMode).toBe('diracEquation')
    expect(dirac.initialCondition).toBe('zitterbewegung')
    expect(dirac.fieldView).toBe('axialCharge')
    expect(dirac.potentialType).toBe('barrier')
    expect(dirac.potentialStrength).toBeCloseTo(3.5)
    expect(dirac.potentialWidth).toBeCloseTo(0.7)
    expect(dirac.potentialCenter).toBeCloseTo(0.5)
    expect(dirac.mass).toBeCloseTo(1.7)
    expect(dirac.speedOfLight).toBeCloseTo(2.5)
    expect(dirac.hbar).toBeCloseTo(0.8)
    expect(dirac.dt).toBeCloseTo(0.006)
    expect(dirac.stepsPerFrame).toBe(5)
    expect(dirac.gridSize).toEqual([16, 16, 16, 16])
    expect(dirac.spacing).toEqual([0.12, 0.13, 0.14, 0.15])
    expect(dirac.packetCenter).toEqual([0.1, -0.2, 0.3, 0.4])
    expect(dirac.packetMomentum).toEqual([1.5, -2, 0.75, 0.5])
    expect(dirac.packetWidth).toBeCloseTo(0.35)
    expect(dirac.positiveEnergyFraction).toBeCloseTo(0.45)
    expect(dirac.autoScale).toBe(true)
    expect(dirac.showPotential).toBe(true)
    expect(dirac.diagnosticsEnabled).toBe(false)
    expect(dirac.diagnosticsInterval).toBe(11)
    expect(dirac.slicePositions).toEqual([0.25])
  })

  it('ignores unknown URL params without affecting known ones', () => {
    applyUrlStateToStores('d=5&t=schroedinger&unknown=foo&future_param=bar')
    expect(useGeometryStore.getState().dimension).toBe(5)
  })

  it('clamps out-of-range URL values to valid bounds', () => {
    applyUrlStateToStores('d=99&t=schroedinger&tc=50&hyd_n=-5')
    expect(useGeometryStore.getState().dimension).toBe(11) // clamped to MAX
    expect(useExtendedObjectStore.getState().schroedinger.termCount).toBe(8) // clamped to MAX
    expect(useExtendedObjectStore.getState().schroedinger.principalQuantumNumber).toBe(1) // clamped to MIN
  })

  it('handles empty URL params (all defaults preserved)', () => {
    const dimBefore = useGeometryStore.getState().dimension
    applyUrlStateToStores('')
    expect(useGeometryStore.getState().dimension).toBe(dimBefore)
  })

  it('URL dimension param overrides current dimension for compute mode', () => {
    useGeometryStore.getState().setDimension(2) // Start at 2D
    applyUrlStateToStores('d=3&t=schroedinger&qm=tdseDynamics')

    // URL explicitly sets d=3 — should be 3
    expect(useGeometryStore.getState().dimension).toBe(3)
    expect(useExtendedObjectStore.getState().schroedinger.quantumMode).toBe('tdseDynamics')
  })

  describe('cosmology URL → store flow (Mukhanov-Sasaki bridge)', () => {
    it('applies a deSitter cosmology URL fragment end-to-end', () => {
      // L7 audit: this is the only test that exercises applyCosmologyParams
      // through the real applyUrlStateParams entry point. The URL must
      // activate cosmology, set the preset/Hubble/eta0, and leave the FSF
      // mode in a consistent state ready for the compute pass.
      applyUrlStateToStores(
        'd=3&t=schroedinger&qm=freeScalarField&cos=1&cos_bg=deSitter&cos_h=2.50&cos_eta0=-12'
      )

      const fs = useExtendedObjectStore.getState().schroedinger.freeScalar
      expect(useExtendedObjectStore.getState().schroedinger.quantumMode).toBe('freeScalarField')
      expect(fs.cosmology.enabled).toBe(true)
      expect(fs.cosmology.preset).toBe('deSitter')
      expect(fs.cosmology.hubble).toBeCloseTo(2.5)
      // The eta0 setter clamps to safeEta0 — at the default 32³ grid the
      // clamp is well below 12, so the URL value survives untouched.
      expect(fs.cosmology.eta0).toBe(-12)
      // Mutex with self-interaction holds.
      expect(fs.selfInteractionEnabled).toBe(false)
      // Reset flag is propagated for the compute pass.
      expect(fs.needsReset).toBe(true)
    })

    it('applies an ekpyrotic cosmology URL fragment with steepness clamp', () => {
      applyUrlStateToStores(
        'd=3&t=schroedinger&qm=freeScalarField&cos=1&cos_bg=ekpyrotic&cos_s=7&cos_eta0=-15'
      )

      const fs = useExtendedObjectStore.getState().schroedinger.freeScalar
      expect(fs.cosmology.enabled).toBe(true)
      expect(fs.cosmology.preset).toBe('ekpyrotic')
      // Setter clamps to (s_c, 100]; s_c(4)≈3.46, so s=7 survives.
      expect(fs.cosmology.steepness).toBeCloseTo(7)
      expect(fs.cosmology.eta0).toBe(-15)
    })

    it('drops the cosmology block when cos_eta0 = 0 (singularity)', () => {
      // The deserializer rejects cos_eta0=0 — the cosmology block is dropped.
      applyUrlStateToStores(
        'd=3&t=schroedinger&qm=freeScalarField&cos=1&cos_bg=deSitter&cos_h=1&cos_eta0=0'
      )
      const fs = useExtendedObjectStore.getState().schroedinger.freeScalar
      expect(fs.cosmology.enabled).toBe(false)
    })

    it('drops the cosmology block when ekpyrotic steepness is below s_c', () => {
      // s_c(n=4) = √12 ≈ 3.46. cos_s=2 is sub-critical → block dropped.
      applyUrlStateToStores(
        'd=3&t=schroedinger&qm=freeScalarField&cos=1&cos_bg=ekpyrotic&cos_s=2&cos_eta0=-10'
      )
      const fs = useExtendedObjectStore.getState().schroedinger.freeScalar
      expect(fs.cosmology.enabled).toBe(false)
    })

    it('cosmology URL roundtrips for de Sitter', () => {
      const serialized = serializeState({
        dimension: 3,
        objectType: 'schroedinger',
        quantumMode: 'freeScalarField',
        cosmologyEnabled: true,
        cosmologyPreset: 'deSitter',
        cosmologyHubble: 1.5,
        cosmologyEta0: -8,
      })

      useGeometryStore.getState().reset()
      useExtendedObjectStore.getState().reset()
      applyUrlStateToStores(serialized)

      const fs = useExtendedObjectStore.getState().schroedinger.freeScalar
      expect(fs.cosmology.enabled).toBe(true)
      expect(fs.cosmology.preset).toBe('deSitter')
      expect(fs.cosmology.hubble).toBeCloseTo(1.5)
      expect(fs.cosmology.eta0).toBe(-8)
    })
  })

  it('full serialize -> deserialize -> apply roundtrip preserves state', () => {
    // Set up a specific state
    useGeometryStore.getState().setDimension(6)
    useExtendedObjectStore.getState().setSchroedingerQuantumMode('hydrogenND')
    useExtendedObjectStore.getState().setSchroedingerPrincipalQuantumNumber(3)
    useExtendedObjectStore.getState().setSchroedingerScale(1.8)
    useExtendedObjectStore.getState().setSchroedingerTermCount(5)

    // Serialize to URL
    const serialized = serializeState({
      dimension: 6,
      objectType: 'schroedinger',
      quantumMode: 'hydrogenND',
      hydrogenN: 3,
      scale: 1.8,
      termCount: 5,
    })

    // Reset stores
    useGeometryStore.getState().reset()
    useExtendedObjectStore.getState().reset()

    // Apply from URL
    applyUrlStateToStores(serialized)

    // Verify
    expect(useGeometryStore.getState().dimension).toBe(6)
    expect(useExtendedObjectStore.getState().schroedinger.quantumMode).toBe('hydrogenND')
    expect(useExtendedObjectStore.getState().schroedinger.principalQuantumNumber).toBe(3)
    expect(useExtendedObjectStore.getState().schroedinger.scale).toBeCloseTo(1.8, 1)
    expect(useExtendedObjectStore.getState().schroedinger.termCount).toBe(5)
  })
})
