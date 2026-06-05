import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { SchroedingerConfig } from '@/lib/geometry/extended/types'
import type { SetterContext } from '@/stores/slices/geometry/setters/sliceSetterUtils'

const colorImportControl = vi.hoisted(() => {
  let markStarted: () => void = () => {}
  let releaseImport: () => void = () => {}

  const control = {
    released: Promise.resolve(),
    started: Promise.resolve(),
    markStarted: () => markStarted(),
    release: () => releaseImport(),
    reset: () => {
      control.started = new Promise<void>((resolve) => {
        markStarted = resolve
      })
      control.released = new Promise<void>((resolve) => {
        releaseImport = resolve
      })
    },
  }

  control.reset()
  return control
})

const appearanceStoreMock = vi.hoisted(() => ({
  colorAlgorithm: 'blackbody',
  setColorAlgorithmCalls: [] as string[],
  reset: () => {
    appearanceStoreMock.colorAlgorithm = 'blackbody'
    appearanceStoreMock.setColorAlgorithmCalls = []
  },
  setColorAlgorithm: (algorithm: string) => {
    appearanceStoreMock.colorAlgorithm = algorithm
    appearanceStoreMock.setColorAlgorithmCalls.push(algorithm)
  },
}))

vi.mock('@/stores/scene/appearanceStore', () => ({
  useAppearanceStore: {
    getState: () => appearanceStoreMock,
  },
}))

vi.mock('@/lib/colors/palette/types', async () => {
  colorImportControl.markStarted()
  await colorImportControl.released
  return {
    DIRAC_FIELD_VIEW_TO_COLOR_ALGO: {
      particleAntiparticleSplit: 'particleAntiparticle',
      totalDensity: 'blackbody',
    },
  }
})

type TestSchroedingerState = Partial<SchroedingerConfig> &
  Pick<SchroedingerConfig, 'dirac' | 'quantumMode'>

type TestStoreState = {
  schroedinger: TestSchroedingerState
}

function applyPartialState(
  current: TestStoreState,
  update: Partial<TestStoreState>
): TestStoreState {
  return {
    ...current,
    ...update,
    schroedinger: {
      ...current.schroedinger,
      ...update.schroedinger,
    },
  }
}

function createTestContext(initialSchroedinger: TestSchroedingerState): {
  ctx: SetterContext
  getState: () => TestStoreState
} {
  let state: TestStoreState = { schroedinger: initialSchroedinger }

  const setState = (updater: unknown) => {
    const update =
      typeof updater === 'function'
        ? (updater as (current: TestStoreState) => Partial<TestStoreState>)(state)
        : (updater as Partial<TestStoreState>)
    state = applyPartialState(state, update)
  }

  const ctx = {
    get: () => state,
    hasOnlyFinite: (values: number[]) => values.every(Number.isFinite),
    isFinite: Number.isFinite,
    set: setState,
    setWithVersion: setState,
    warnNonFinite: vi.fn(),
  } as unknown as SetterContext

  return { ctx, getState: () => state }
}

describe('Dirac preset async races', () => {
  beforeEach(() => {
    appearanceStoreMock.reset()
    colorImportControl.reset()
    vi.resetModules()
  })

  it('skips delayed color sync after expected quantum mode changes', async () => {
    const { DEFAULT_DIRAC_CONFIG } = await import('@/lib/geometry/extended/dirac')
    const { createDiracSetters } = await import('@/stores/slices/geometry/setters/diracSetters')
    const { ctx, getState } = createTestContext({
      dirac: { ...DEFAULT_DIRAC_CONFIG, fieldView: 'totalDensity' },
      quantumMode: 'diracEquation',
    })
    const setters = createDiracSetters(ctx)

    const applyPreset = setters.applyDiracPreset('kleinParadox', {
      expectedQuantumMode: 'diracEquation',
    })

    await colorImportControl.started

    expect(getState().schroedinger.dirac.fieldView).toBe('particleAntiparticleSplit')

    getState().schroedinger.quantumMode = 'harmonicOscillator'
    colorImportControl.release()

    await applyPreset

    expect(appearanceStoreMock.colorAlgorithm).toBe('blackbody')
    expect(appearanceStoreMock.setColorAlgorithmCalls).toEqual([])
  })
})
