/**
 * Tests for useUrlState hook
 */

import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useUrlState } from '@/hooks/useUrlState'
import { applySceneExample, findSceneByName } from '@/lib/sceneExamples'
import type { ShareableState } from '@/lib/url/state-serializer'
import { parseCurrentUrl } from '@/lib/url/state-serializer'
import { useSrmtSweepStore } from '@/stores/diagnostics/srmtSweepStore'
import { usePresetManagerStore } from '@/stores/runtime/presetManagerStore'
import { useAppearanceStore } from '@/stores/scene/appearanceStore'
import { useExtendedObjectStore } from '@/stores/scene/extendedObjectStore'
import { useGeometryStore } from '@/stores/scene/geometryStore'

vi.mock('@/lib/url/state-serializer', async () => {
  const actual = await vi.importActual<typeof import('@/lib/url/state-serializer')>(
    '@/lib/url/state-serializer'
  )

  return {
    ...actual,
    parseCurrentUrl: vi.fn(),
  }
})

vi.mock('@/lib/sceneExamples', () => ({
  findSceneByName: vi.fn(),
  applySceneExample: vi.fn(),
}))

describe('useUrlState', () => {
  const mockedParseCurrentUrl = vi.mocked(parseCurrentUrl)
  const mockedFindSceneByName = vi.mocked(findSceneByName)
  const mockedApplySceneExample = vi.mocked(applySceneExample)

  beforeEach(() => {
    mockedParseCurrentUrl.mockReset()
    mockedFindSceneByName.mockReset()
    mockedApplySceneExample.mockReset()
    useGeometryStore.getState().reset()
    useExtendedObjectStore.getState().reset()
    useAppearanceStore.getState().setColorAlgorithm('mixed')
    useSrmtSweepStore.getState().setPendingSweep(null)
    useSrmtSweepStore.getState().reset()
  })

  it('applies dimension and objectType from parsed URL state', async () => {
    const parsedState: Partial<ShareableState> = {
      dimension: 5,
      objectType: 'schroedinger',
    }

    mockedParseCurrentUrl.mockReturnValue(parsedState)

    renderHook(() => useUrlState())

    await waitFor(() => {
      expect(useGeometryStore.getState().dimension).toBe(5)
      expect(useGeometryStore.getState().objectType).toBe('schroedinger')
    })
  })

  it('applies quantumMode and enforces minimum dimension for compute modes', async () => {
    const parsedState: Partial<ShareableState> = {
      objectType: 'schroedinger',
      dimension: 2,
      quantumMode: 'becDynamics',
    }

    mockedParseCurrentUrl.mockReturnValue(parsedState)

    renderHook(() => useUrlState())

    await waitFor(() => {
      expect(useGeometryStore.getState().dimension).toBe(3)
      expect(useExtendedObjectStore.getState().schroedinger.quantumMode).toBe('becDynamics')
    })
  })

  it('TDSE at dimension 2 clamps to 3', async () => {
    const parsedState: Partial<ShareableState> = {
      objectType: 'schroedinger',
      dimension: 2,
      quantumMode: 'tdseDynamics',
    }

    mockedParseCurrentUrl.mockReturnValue(parsedState)

    renderHook(() => useUrlState())

    await waitFor(() => {
      expect(useGeometryStore.getState().dimension).toBe(3)
      expect(useExtendedObjectStore.getState().schroedinger.quantumMode).toBe('tdseDynamics')
    })
  })

  it('does nothing when no URL params are present', async () => {
    mockedParseCurrentUrl.mockReturnValue({})

    const initialDimension = useGeometryStore.getState().dimension

    renderHook(() => useUrlState())

    await waitFor(() => {
      expect(useGeometryStore.getState().dimension).toBe(initialDimension)
    })
  })

  it('?abs=0 disables PML at the rendering level by writing the SHARED schroedinger field', async () => {
    // Regression: routing absorberEnabled through setTdseAbsorberEnabled (the
    // pre-fix wiring) wrote to state.schroedinger.tdse.absorberEnabled, which
    // is shadowed by state.schroedinger.absorberEnabled (default true) inside
    // applySharedPml. The url param had no observable effect — sharing a link
    // with PML disabled left PML enabled. The fix routes it to the top-level
    // shared setter so applySharedPml actually sees the false.
    const parsedState: Partial<ShareableState> = {
      objectType: 'schroedinger',
      dimension: 3,
      quantumMode: 'tdseDynamics',
      absorberEnabled: false,
    }

    mockedParseCurrentUrl.mockReturnValue(parsedState)

    renderHook(() => useUrlState())

    await waitFor(() => {
      // The SHARED field — what applySharedPml actually consumes — must be false.
      expect(useExtendedObjectStore.getState().schroedinger.absorberEnabled).toBe(false)
    })
  })

  it('?abs=1 re-enables PML via the shared field', async () => {
    // Start with PML disabled so we can prove the URL parameter actually
    // toggles the shared field rather than relying on its default.
    useExtendedObjectStore.getState().setSchroedingerAbsorberEnabled(false)

    const parsedState: Partial<ShareableState> = {
      objectType: 'schroedinger',
      dimension: 3,
      quantumMode: 'tdseDynamics',
      absorberEnabled: true,
    }
    mockedParseCurrentUrl.mockReturnValue(parsedState)
    renderHook(() => useUrlState())

    await waitFor(() => {
      expect(useExtendedObjectStore.getState().schroedinger.absorberEnabled).toBe(true)
    })
  })

  it('applies extended Open Quantum URL fields through the hook path', async () => {
    const parsedState: Partial<ShareableState> = {
      objectType: 'schroedinger',
      dimension: 4,
      quantumMode: 'harmonicOscillator',
      openQuantumEnabled: true,
      openQuantumDephasingRate: 0.5,
      openQuantumRelaxationRate: 1.2,
      openQuantumThermalUpRate: 0.4,
      openQuantumDephasingEnabled: false,
      openQuantumRelaxationEnabled: true,
      openQuantumThermalEnabled: true,
      openQuantumDt: 0.025,
      openQuantumSubsteps: 7,
      openQuantumBathTemperature: 420,
      openQuantumCouplingScale: 2.25,
      openQuantumHydrogenBasisMaxN: 3,
      openQuantumDephasingModel: 'none',
      openQuantumVisualizationMode: 'entropyMap',
    }
    mockedParseCurrentUrl.mockReturnValue(parsedState)

    renderHook(() => useUrlState())

    await waitFor(() => {
      const oq = useExtendedObjectStore.getState().schroedinger.openQuantum
      expect(oq.enabled).toBe(true)
      expect(oq.dephasingRate).toBeCloseTo(0.5)
      expect(oq.relaxationRate).toBeCloseTo(1.2)
      expect(oq.thermalUpRate).toBeCloseTo(0.4)
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
      expect(useAppearanceStore.getState().colorAlgorithm).toBe('entropyMap')
    })
  })

  it('brc+brc_p URL params route into tdse branching state', async () => {
    // Regression guard for the branching URL pipeline: `brc` and `brc_p`
    // must land on `schroedinger.tdse.branchingEnabled` /
    // `branchPlanePosition` so the TDSE diagnostics dispatcher can choose
    // the branch plane over the default `barrierCenter`. Without this
    // wiring, the branch visualization is unreachable from a shared URL.
    const parsedState: Partial<ShareableState> = {
      objectType: 'schroedinger',
      dimension: 3,
      quantumMode: 'tdseDynamics',
      branchingEnabled: true,
      branchPlanePosition: 0.42,
    }
    mockedParseCurrentUrl.mockReturnValue(parsedState)

    renderHook(() => useUrlState())

    await waitFor(() => {
      const tdse = useExtendedObjectStore.getState().schroedinger.tdse
      expect(tdse.branchingEnabled).toBe(true)
      expect(tdse.branchPlanePosition).toBeCloseTo(0.42, 4)
    })
  })

  it('brc_p without brc does nothing (guard against stray param)', async () => {
    // `applyBranchingParams` short-circuits when `branchingEnabled` is
    // undefined, so a lone `brc_p` must not mutate the store. Verifies the
    // guard in applyBranchingParams matches the deserializer, which only
    // sets branchPlanePosition when `brc` is present.
    const initialPos = useExtendedObjectStore.getState().schroedinger.tdse.branchPlanePosition
    const parsedState: Partial<ShareableState> = {
      objectType: 'schroedinger',
      dimension: 3,
      quantumMode: 'tdseDynamics',
      branchPlanePosition: 0.8,
    }
    mockedParseCurrentUrl.mockReturnValue(parsedState)

    renderHook(() => useUrlState())

    await waitFor(() => {
      expect(useExtendedObjectStore.getState().schroedinger.tdse.branchPlanePosition).toBe(
        initialPos
      )
    })
  })

  it('applies the full SRMT block when qm=wheelerDeWitt', async () => {
    // Regression guard for the SRMT URL pipeline: `srmt`, `srmt_c`, `srmt_x`,
    // `srmt_r`, `srmt_h` must land on `schroedinger.wheelerDeWitt.srmt*` so a
    // shared link reconstructs the clock/cut/rank config the sender saw.
    const parsedState: Partial<ShareableState> = {
      objectType: 'schroedinger',
      dimension: 3,
      quantumMode: 'wheelerDeWitt',
      wdwSrmtEnabled: true,
      wdwSrmtClock: 'phi1',
      wdwSrmtCutNormalized: 0.6,
      wdwSrmtRankCap: 96,
      wdwSrmtHeatmapIntensity: 0.75,
    }
    mockedParseCurrentUrl.mockReturnValue(parsedState)

    renderHook(() => useUrlState())

    await waitFor(() => {
      const wdw = useExtendedObjectStore.getState().schroedinger.wheelerDeWitt
      expect(wdw.srmtEnabled).toBe(true)
      expect(wdw.srmtClock).toBe('phi1')
      expect(wdw.srmtCutNormalized).toBeCloseTo(0.6, 2)
      expect(wdw.srmtRankCap).toBe(96)
      expect(wdw.srmtHeatmapIntensity).toBeCloseTo(0.75, 2)
    })
  })

  it('applies Dirac URL fields through the hook path', async () => {
    const parsedState: Partial<ShareableState> = {
      objectType: 'schroedinger',
      dimension: 4,
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
    }
    mockedParseCurrentUrl.mockReturnValue(parsedState)

    renderHook(() => useUrlState())

    await waitFor(() => {
      const dirac = useExtendedObjectStore.getState().schroedinger.dirac
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
  })

  it('loads scene examples when scene parameter is present', async () => {
    const hasHydratedSpy = vi
      .spyOn(usePresetManagerStore.persist, 'hasHydrated')
      .mockReturnValue(true)
    mockedParseCurrentUrl.mockReturnValue({ scene: 'schroedinger bloom' })
    mockedFindSceneByName.mockReturnValue({ id: 'schroedinger-bloom', source: 'example' })

    renderHook(() => useUrlState())

    await waitFor(() => {
      expect(mockedFindSceneByName).toHaveBeenCalledWith('schroedinger bloom')
      expect(mockedApplySceneExample).toHaveBeenCalledWith('schroedinger-bloom')
    })

    hasHydratedSpy.mockRestore()
  })

  it('loads deferred scene once and unregisters hydration listener', async () => {
    let hydrationCallback: (() => void) | null = null
    const unsubscribe = vi.fn()
    const hasHydratedSpy = vi
      .spyOn(usePresetManagerStore.persist, 'hasHydrated')
      .mockReturnValue(false)
    const onFinishHydrationSpy = vi
      .spyOn(usePresetManagerStore.persist, 'onFinishHydration')
      .mockImplementation((cb) => {
        hydrationCallback = () => cb(usePresetManagerStore.getState())
        return unsubscribe
      })

    mockedParseCurrentUrl.mockReturnValue({ scene: 'schroedinger bloom' })
    mockedFindSceneByName.mockReturnValue({ id: 'schroedinger-bloom', source: 'example' })
    mockedApplySceneExample.mockResolvedValue(true)

    renderHook(() => useUrlState())

    expect(mockedFindSceneByName).not.toHaveBeenCalled()
    expect(unsubscribe).not.toHaveBeenCalled()

    hasHydratedSpy.mockReturnValue(true)
    hydrationCallback!()

    await waitFor(() => {
      expect(mockedFindSceneByName).toHaveBeenCalledWith('schroedinger bloom')
      expect(mockedApplySceneExample).toHaveBeenCalledWith('schroedinger-bloom')
    })
    expect(unsubscribe).toHaveBeenCalledTimes(1)

    hasHydratedSpy.mockRestore()
    onFinishHydrationSpy.mockRestore()
  })

  it('queues SRMT sweep params only when qm=wheelerDeWitt', async () => {
    mockedParseCurrentUrl.mockReturnValue({
      objectType: 'schroedinger',
      dimension: 3,
      quantumMode: 'wheelerDeWitt',
      srmtSweepKind: 'gridNphi',
      srmtSweepPoints: 5,
      srmtSweepMin: 32,
      srmtSweepMax: 64,
      srmtSweepPhiRef: -0.5,
      srmtSweepCutAnchor: 0.5,
    })

    renderHook(() => useUrlState())

    await waitFor(() => {
      expect(useSrmtSweepStore.getState().pendingSweep).toMatchObject({
        kind: 'gridNphi',
        points: 5,
        sweepMin: 32,
        sweepMax: 64,
        phiRef: -0.5,
        cutAnchor: 0.5,
      })
    })
  })

  it('ignores orphan SRMT sweep params when qm is not wheelerDeWitt', async () => {
    mockedParseCurrentUrl.mockReturnValue({
      objectType: 'schroedinger',
      dimension: 3,
      quantumMode: 'tdseDynamics',
      srmtSweepKind: 'gridNphi',
      srmtSweepPoints: 5,
      srmtSweepMin: 32,
      srmtSweepMax: 64,
    })

    renderHook(() => useUrlState())

    await waitFor(() => {
      expect(useExtendedObjectStore.getState().schroedinger.quantumMode).toBe('tdseDynamics')
    })
    expect(useSrmtSweepStore.getState().pendingSweep).toBeNull()
  })
})
