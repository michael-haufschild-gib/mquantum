/**
 * Unit tests for {@link SrmtSweepSection}.
 *
 * Covers:
 *  - Unavailable placeholder outside Wheeler–DeWitt mode.
 *  - Start button queues a PendingSrmtSweep on the store.
 *  - Abort button returns store status to idle.
 *  - Running status renders a progress indicator.
 *  - CSV export produces headers + rows + landmark metadata.
 *  - Champion-flip computation picks the index where the winner changes.
 */

import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  clampUiStateToPhiExtent,
  computeChampionFlips,
  SRMT_SWEEP_SPECTRA_TAIL_HEADER,
  SRMT_SWEEP_SPECTRA_TAIL_MARKER,
  sweepPointsToCsv,
} from '@/components/sections/Analysis/srmtSweepHelpers'
import { SrmtSweepSection } from '@/components/sections/Analysis/SrmtSweepSection'
import type { SrmtSweepPoint } from '@/lib/physics/srmt/sweepTypes'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'
import { useSrmtSweepStore } from '@/stores/srmtSweepStore'

function resetStores(): void {
  localStorage.clear()
  act(() => {
    useSrmtSweepStore.getState().reset()
    useExtendedObjectStore.setState(useExtendedObjectStore.getInitialState())
  })
}

function setQuantumMode(mode: 'wheelerDeWitt' | 'harmonicOscillator'): void {
  useExtendedObjectStore.getState().setSchroedingerQuantumMode(mode)
}

async function openSection(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(screen.getByTestId('srmt-sweep-section-header'))
}

function mkPoint(
  index: number,
  quality: { a?: number; phi1?: number; phi2?: number }
): SrmtSweepPoint {
  return {
    index,
    sweepValue: 0.1 + index * 0.1,
    cutNormalized: 0.1 + index * 0.1,
    quality,
    kSpectrumByClock: {},
    hjSpectrumByClock: {},
    computeMs: 15,
  }
}

describe('clampUiStateToPhiExtent', () => {
  it('preserves negative phiRef values inside the symmetric phi domain', () => {
    const state = {
      kind: 'cut' as const,
      points: 17,
      sweepMin: 0.1,
      sweepMax: 0.9,
      phiRef: -0.75,
      cutAnchor: 0.5,
    }

    expect(clampUiStateToPhiExtent(state, 1.0)).toBe(state)
  })

  it('clamps negative phiRef to -phiExtent after the phi window shrinks', () => {
    const clamped = clampUiStateToPhiExtent(
      {
        kind: 'cut',
        points: 17,
        sweepMin: 0.1,
        sweepMax: 0.9,
        phiRef: -1.4,
        cutAnchor: 0.5,
      },
      1.0
    )

    expect(clamped.phiRef).toBe(-1)
  })

  it('clamps phiRef sweep bounds symmetrically around zero', () => {
    const clamped = clampUiStateToPhiExtent(
      {
        kind: 'phiRef',
        points: 11,
        sweepMin: -1.4,
        sweepMax: 1.3,
        phiRef: -1.2,
        cutAnchor: 0.5,
      },
      1.0
    )

    expect(clamped.sweepMin).toBe(-1)
    expect(clamped.sweepMax).toBe(1)
    expect(clamped.phiRef).toBe(-1)
  })
})

describe('SrmtSweepSection visibility', () => {
  beforeEach(() => {
    resetStores()
  })

  it('renders unavailable placeholder outside Wheeler–DeWitt', () => {
    setQuantumMode('harmonicOscillator')
    render(<SrmtSweepSection />)
    expect(screen.getByTestId('srmt-sweep-section-unavailable')).toBeInTheDocument()
  })

  it('renders the full section when mode is Wheeler–DeWitt', async () => {
    setQuantumMode('wheelerDeWitt')
    const user = userEvent.setup()
    render(<SrmtSweepSection />)
    expect(screen.getByTestId('srmt-sweep-section')).toBeInTheDocument()
    await openSection(user)
    expect(screen.getByTestId('srmt-sweep-kind-selector')).toBeInTheDocument()
    expect(screen.getByTestId('srmt-sweep-start')).toBeInTheDocument()
  })
})

describe('SrmtSweepSection behaviour', () => {
  beforeEach(() => {
    resetStores()
    setQuantumMode('wheelerDeWitt')
  })
  // Guaranteed spy cleanup: if an assertion throws, direct .mockRestore()
  // calls at the end of a test would be skipped and bleed into the next.
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('Start button writes a pending sweep to the store', async () => {
    const user = userEvent.setup()
    render(<SrmtSweepSection />)
    await openSection(user)
    await user.click(screen.getByTestId('srmt-sweep-start'))
    const pending = useSrmtSweepStore.getState().pendingSweep
    expect(pending?.kind).toBe('cut')
    expect(pending?.points).toBe(17)
  })

  it('Abort button appears while running and returns status to idle', async () => {
    const user = userEvent.setup()
    render(<SrmtSweepSection />)
    await openSection(user)
    act(() => {
      useSrmtSweepStore.getState().startSweep(
        {
          kind: 'cut',
          points: 5,
          clocks: ['a'],
          rankCap: 12,
          cutNormalized: 0.5,
          phiRef: 1,
          sweepMin: 0.1,
          sweepMax: 0.9,
        },
        useExtendedObjectStore.getState().schroedinger.wheelerDeWitt,
        []
      )
    })
    await user.click(await screen.findByTestId('srmt-sweep-abort'))
    expect(useSrmtSweepStore.getState().status).toBe('idle')
  })

  it('shows progress count while running', async () => {
    const user = userEvent.setup()
    render(<SrmtSweepSection />)
    await openSection(user)
    act(() => {
      useSrmtSweepStore.getState().startSweep(
        {
          kind: 'cut',
          points: 5,
          clocks: ['a'],
          rankCap: 12,
          cutNormalized: 0.5,
          phiRef: 1,
          sweepMin: 0.1,
          sweepMax: 0.9,
        },
        useExtendedObjectStore.getState().schroedinger.wheelerDeWitt,
        []
      )
      useSrmtSweepStore.getState().appendPoint(mkPoint(0, { a: 0.02, phi1: 0.3, phi2: 0.4 }))
    })
    const progress = screen.getByTestId('srmt-sweep-progress')
    expect(progress).toHaveTextContent(/1\s*\/\s*5/)
  })

  it('renders the plot once two or more points arrive', async () => {
    const user = userEvent.setup()
    render(<SrmtSweepSection />)
    await openSection(user)
    act(() => {
      useSrmtSweepStore.getState().startSweep(
        {
          kind: 'cut',
          points: 5,
          clocks: ['a', 'phi1', 'phi2'],
          rankCap: 12,
          cutNormalized: 0.5,
          phiRef: 1,
          sweepMin: 0.1,
          sweepMax: 0.9,
        },
        useExtendedObjectStore.getState().schroedinger.wheelerDeWitt,
        []
      )
      useSrmtSweepStore.getState().appendPoint(mkPoint(0, { a: 0.02, phi1: 0.3, phi2: 0.4 }))
      useSrmtSweepStore.getState().appendPoint(mkPoint(1, { a: 0.04, phi1: 0.35, phi2: 0.5 }))
    })
    expect(screen.getByTestId('srmt-sweep-plot')).toBeInTheDocument()
    expect(screen.getByTestId('srmt-sweep-line-a')).toBeInTheDocument()
  })

  it('shows CSV export button after completion and triggers a download on click with a reproducibility manifest', async () => {
    const user = userEvent.setup()
    render(<SrmtSweepSection />)
    await openSection(user)
    act(() => {
      useSrmtSweepStore.getState().startSweep(
        {
          kind: 'cut',
          points: 3,
          clocks: ['a'],
          rankCap: 12,
          cutNormalized: 0.5,
          phiRef: 1,
          sweepMin: 0.1,
          sweepMax: 0.9,
        },
        useExtendedObjectStore.getState().schroedinger.wheelerDeWitt,
        []
      )
      useSrmtSweepStore.getState().appendPoint(mkPoint(0, { a: 0.02 }))
      useSrmtSweepStore.getState().appendPoint(mkPoint(1, { a: 0.03 }))
      useSrmtSweepStore.getState().completeSweep()
    })
    // Capture the Blob content that the download helper passes through
    // URL.createObjectURL so we can assert the manifest round-tripped.
    // Store the Promise<string> from blob.text() and await it explicitly
    // below — polling with `await Promise.resolve()` makes the assertion
    // order-dependent on happy-dom's microtask scheduler.
    let capturedCsvPromise: Promise<string> | null = null
    const createUrlSpy = vi.spyOn(URL, 'createObjectURL').mockImplementation((obj: unknown) => {
      const blob = obj as Blob
      capturedCsvPromise = blob.text()
      return 'blob:stub'
    })
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    await user.click(screen.getByTestId('srmt-sweep-export-csv'))
    expect(createUrlSpy).toHaveBeenCalled()
    expect(clickSpy).toHaveBeenCalled()
    if (!capturedCsvPromise) {
      throw new Error('createObjectURL spy never captured a Blob promise')
    }
    const capturedCsv = await capturedCsvPromise
    expect(capturedCsv).toContain('# SRMT sweep, kind=cut')
    expect(capturedCsv).toContain('# git: ')
    expect(capturedCsv).toContain('# solver: wdw=')
    expect(capturedCsv).toContain('# wdw: boundaryCondition=')
    expect(capturedCsv).toContain('# srmt: kind=cut')
    expect(capturedCsv).toContain('# grid: Na=')
  })
})

describe('sweepPointsToCsv', () => {
  it('emits a stable header and one row per point', () => {
    const csv = sweepPointsToCsv(
      [mkPoint(0, { a: 0.02, phi1: 0.3, phi2: 0.4 }), mkPoint(1, { a: 0.04 })],
      'cut',
      [
        {
          kind: 'a_turn',
          clock: 'a',
          phiRef: 1,
          sweepValueAtLandmark: 0.72,
          absoluteCoordinate: 1.13,
        },
      ]
    )
    const lines = csv.trim().split('\n')
    expect(lines[0]).toBe('# SRMT sweep, kind=cut')
    // Legacy (manifest-less) call: landmark follows directly, then
    // column header, then data rows. 1 kind + 1 landmark + 1 columns + 2 data = 5.
    expect(lines[1]).toMatch(/# landmark clock=a/)
    expect(lines[2]).toBe(
      'index,sweepValue,sweepValueBc,cutNormalized,' +
        'q_a,q_a_sigma,q_a_rigid,q_a_rigid_sigma,alpha_a,beta_a,rEff_a,floorFrac_a,' +
        'q_phi1,q_phi1_sigma,q_phi1_rigid,q_phi1_rigid_sigma,alpha_phi1,beta_phi1,' +
        'rEff_phi1,floorFrac_phi1,' +
        'q_phi2,q_phi2_sigma,q_phi2_rigid,q_phi2_rigid_sigma,alpha_phi2,beta_phi2,' +
        'rEff_phi2,floorFrac_phi2,' +
        'computeMs,coupledGridNa'
    )
    // Main block: 1 kind + 1 landmark + 1 header + 2 data = 5 lines.
    // Tail block: blank + marker + sub-header (no data since the test
    // points have empty spectra) = 3 more lines. Total = 8.
    expect(lines).toHaveLength(8)
    expect(lines[3]!).toMatch(/^0,/)
    expect(lines[4]!).toMatch(/^1,/)
    expect(lines[5]).toBe('')
    expect(lines[6]).toBe(SRMT_SWEEP_SPECTRA_TAIL_MARKER)
    expect(lines[7]).toBe(SRMT_SWEEP_SPECTRA_TAIL_HEADER)
  })

  it('inserts supplied manifest lines between the kind header and the landmark block', () => {
    const manifest = [
      '# generated: 2026-04-19T10:00:00.000Z',
      '# git: abc1234',
      '# solver: wdw=1.0.0 srmt=1.0.0',
      '# wdw: boundaryCondition=noBoundary inflatonMass=0.300000 cosmologicalConstant=0.000000 aMin=0.100000 aMax=1.50000 gridNa=128 gridNphi=32 phiExtent=2.00000',
      '# srmt: kind=cut points=2 clocks=a+phi1+phi2 rankCap=12 cutNormalized=0.500000 phiRef=1.00000 sweepMin=0.100000 sweepMax=0.900000',
      '# grid: Na=128 Nphi=32 da=0.0110236 dphi=0.129032',
    ]
    const csv = sweepPointsToCsv(
      [mkPoint(0, { a: 0.02 })],
      'cut',
      [
        {
          kind: 'a_turn',
          clock: 'a',
          phiRef: 1,
          sweepValueAtLandmark: 0.72,
          absoluteCoordinate: 1.13,
        },
      ],
      manifest
    )
    const lines = csv.trim().split('\n')
    expect(lines[0]).toBe('# SRMT sweep, kind=cut')
    // Manifest lines occupy positions 1..6 in insertion order.
    for (let i = 0; i < manifest.length; i++) {
      expect(lines[i + 1]).toBe(manifest[i])
    }
    // Landmark comment follows the manifest.
    expect(lines[manifest.length + 1]).toMatch(/# landmark clock=a/)
    // Column header next.
    expect(lines[manifest.length + 2]).toMatch(/^index,sweepValue,/)
    // One data row follows the main header.
    expect(lines[manifest.length + 3]!).toMatch(/^0,/)
    // The CSV ends with the (spectra-less) tail marker + sub-header.
    expect(lines.at(-2)).toBe(SRMT_SWEEP_SPECTRA_TAIL_MARKER)
    expect(lines.at(-1)).toBe(SRMT_SWEEP_SPECTRA_TAIL_HEADER)
  })

  it('does not escape legitimate negative numeric cells', () => {
    // `-0.123` in a CSV cell is treated by Excel as the number −0.123,
    // not a formula. Keeping it un-escaped preserves numeric analysis.
    const point: SrmtSweepPoint = {
      index: 0,
      sweepValue: -0.123,
      cutNormalized: -0.5,
      quality: { a: -1.2e-3, phi1: 0.3, phi2: 0.4 },
      kSpectrumByClock: {},
      hjSpectrumByClock: {},
      computeMs: 15,
    }
    const csv = sweepPointsToCsv([point], 'mass', [])
    const dataRow = csv
      .trim()
      .split('\n')
      .find((l) => l.startsWith('0,'))!
    const cells = dataRow.split(',')
    expect(cells[1]).toBe('-0.123')
    expect(cells[3]).toBe('-0.5')
    expect(cells[4]).toBe('-0.00120000')
  })

  it('defuses formula-injection triggers by prefixing an apostrophe', () => {
    // If an attacker ever smuggles a formula-like string into the bc enum
    // (e.g. via a broken upstream validator) Excel must NOT treat it as
    // a live formula on CSV import. Force a scenario by constructing a
    // point with a trigger in the bc slot; the cell must start with `'`.
    const point: SrmtSweepPoint = {
      index: 0,
      sweepValue: 0.5,
      sweepValueBc: '=cmd|/c calc' as unknown as SrmtSweepPoint['sweepValueBc'],
      cutNormalized: 0.5,
      quality: { a: 0.02, phi1: 0.3, phi2: 0.4 },
      kSpectrumByClock: {},
      hjSpectrumByClock: {},
      computeMs: 15,
    }
    const csv = sweepPointsToCsv([point], 'bc', [])
    const dataRow = csv
      .trim()
      .split('\n')
      .find((l) => l.startsWith('0,'))!
    const cells = dataRow.split(',')
    expect(cells[2]).toBe(`'=cmd|/c calc`)
  })

  it('wraps cells containing commas in RFC-4180 double quotes', () => {
    const point: SrmtSweepPoint = {
      index: 0,
      sweepValue: 0.5,
      sweepValueBc: 'no,Boundary' as unknown as SrmtSweepPoint['sweepValueBc'],
      cutNormalized: 0.5,
      quality: { a: 0.02, phi1: 0.3, phi2: 0.4 },
      kSpectrumByClock: {},
      hjSpectrumByClock: {},
      computeMs: 15,
    }
    const csv = sweepPointsToCsv([point], 'bc', [])
    expect(csv).toContain('"no,Boundary"')
  })

  it('emits pipe-delimited K and E spectra in the tail block for each populated clock', () => {
    const kA0 = new Float32Array([-8.247689, -6.620331, -5.835303, -4.712001])
    const eA0 = new Float32Array([0.512, 1.487, 2.602, 3.711])
    const kA1 = new Float32Array([-7.0, -5.5, -4.2, -3.0])
    const eA1 = new Float32Array([0.6, 1.5, 2.4, 3.5])
    const p0: SrmtSweepPoint = {
      index: 0,
      sweepValue: 0.1,
      cutNormalized: 0.1,
      quality: { a: 0.02 },
      kSpectrumByClock: { a: kA0 },
      hjSpectrumByClock: { a: eA0 },
      computeMs: 15,
    }
    const p1: SrmtSweepPoint = {
      index: 1,
      sweepValue: 0.2,
      cutNormalized: 0.2,
      quality: { a: 0.03 },
      kSpectrumByClock: { a: kA1 },
      hjSpectrumByClock: { a: eA1 },
      computeMs: 16,
    }
    const csv = sweepPointsToCsv([p0, p1], 'cut', [])
    const lines = csv.trim().split('\n')

    // Main 30-col block intact.
    const headerLine = lines.findIndex((l) => l.startsWith('index,'))
    expect(headerLine).toBeGreaterThanOrEqual(0)
    expect(lines[headerLine + 1]!.split(',')).toHaveLength(30)
    expect(lines[headerLine + 2]!.split(',')).toHaveLength(30)

    // Tail marker + sub-header present.
    const markerLine = lines.indexOf(SRMT_SWEEP_SPECTRA_TAIL_MARKER)
    expect(markerLine).toBeGreaterThan(headerLine + 2)
    expect(lines[markerLine + 1]).toBe(SRMT_SWEEP_SPECTRA_TAIL_HEADER)

    const tailRows = lines.slice(markerLine + 2)
    // Two points, one clock ('a'), two kinds (K + E) = 4 tail rows.
    expect(tailRows).toHaveLength(4)

    const kRow0 = tailRows.find((r) => r.startsWith('0,a,K,'))
    if (!kRow0) throw new Error('missing tail row for point=0 clock=a kind=K')
    const kValues0 = kRow0.slice('0,a,K,'.length).split('|')
    expect(kValues0).toHaveLength(kA0.length)
    // Each formatted float is toPrecision(7); round-trip within 1e-5.
    expect(Number(kValues0[0])).toBeCloseTo(kA0[0]!, 5)
    expect(Number(kValues0[3])).toBeCloseTo(kA0[3]!, 5)

    const eRow1 = tailRows.find((r) => r.startsWith('1,a,E,'))
    if (!eRow1) throw new Error('missing tail row for point=1 clock=a kind=E')
    const eValues1 = eRow1.slice('1,a,E,'.length).split('|')
    expect(eValues1).toHaveLength(eA1.length)
    expect(Number(eValues1[2])).toBeCloseTo(eA1[2]!, 5)
  })

  it('emits the tail marker + sub-header even when no spectra are populated', () => {
    const csv = sweepPointsToCsv([mkPoint(0, { a: 0.02 })], 'cut', [])
    const lines = csv.trim().split('\n')
    expect(lines.indexOf(SRMT_SWEEP_SPECTRA_TAIL_MARKER)).toBeGreaterThan(0)
    const sub = lines.indexOf(SRMT_SWEEP_SPECTRA_TAIL_HEADER)
    expect(sub).toBeGreaterThan(0)
    // No tail data rows should follow the sub-header.
    expect(lines.slice(sub + 1).filter((l) => l.length > 0)).toHaveLength(0)
  })
})

describe('SrmtSweepSection kind selector coverage', () => {
  beforeEach(() => {
    resetStores()
    setQuantumMode('wheelerDeWitt')
  })

  // The authoritative order: cut/mass/lambda/bc first, then phiRef/rankCap/
  // phiExtent, then the three grid-convergence kinds (gridNa, gridNphi,
  // gridNphiCoupled). Changing this order is a user-visible UI shuffle;
  // update the spec before the test.
  const EXPECTED_KIND_ORDER: readonly string[] = [
    'cut',
    'mass',
    'lambda',
    'bc',
    'phiRef',
    'rankCap',
    'phiExtent',
    'gridNa',
    'gridNphi',
    'gridNphiCoupled',
  ]

  it('exposes all 10 sweep kinds in the toggle group in the expected order', async () => {
    const user = userEvent.setup()
    render(<SrmtSweepSection />)
    await openSection(user)
    const selector = screen.getByTestId('srmt-sweep-kind-selector')
    const radios = within(selector).getAllByRole('radio')
    expect(radios).toHaveLength(EXPECTED_KIND_ORDER.length)
    for (const [i, kind] of EXPECTED_KIND_ORDER.entries()) {
      // Each radio carries `srmt-sweep-kind-selector-<kind>` — stable
      // test contract emitted by ToggleGroup.
      expect(radios[i]).toBe(screen.getByTestId(`srmt-sweep-kind-selector-${kind}`))
    }
  })

  // Selecting a kind resets the UI to its default, which then drives the
  // sweep dispatched by Start. Read the default back through the store's
  // pendingSweep to avoid coupling to slider DOM shapes.
  async function readDefaultsForKind(kind: 'gridNa' | 'gridNphi' | 'gridNphiCoupled'): Promise<{
    points: number | undefined
    sweepMin: number | undefined
    sweepMax: number | undefined
  }> {
    const user = userEvent.setup()
    render(<SrmtSweepSection />)
    await openSection(user)
    await user.click(screen.getByTestId(`srmt-sweep-kind-selector-${kind}`))
    await user.click(screen.getByTestId('srmt-sweep-start'))
    const pending = useSrmtSweepStore.getState().pendingSweep
    if (!pending) throw new Error(`pendingSweep not set for kind=${kind}`)
    return { points: pending.points, sweepMin: pending.sweepMin, sweepMax: pending.sweepMax }
  }

  it('gridNa default UI state: points=3, sweepMin=128, sweepMax=384', async () => {
    const defaults = await readDefaultsForKind('gridNa')
    expect(defaults).toEqual({ points: 3, sweepMin: 128, sweepMax: 384 })
  })

  it('gridNphi default UI state: points=3, sweepMin=32, sweepMax=64', async () => {
    const defaults = await readDefaultsForKind('gridNphi')
    expect(defaults).toEqual({ points: 3, sweepMin: 32, sweepMax: 64 })
  })

  it('gridNphiCoupled default UI state: points=5, sweepMin=32, sweepMax=64', async () => {
    const defaults = await readDefaultsForKind('gridNphiCoupled')
    expect(defaults).toEqual({ points: 5, sweepMin: 32, sweepMax: 64 })
  })
})

describe('computeChampionFlips', () => {
  it('returns no flip when the same clock wins at every index', () => {
    const points = [
      mkPoint(0, { a: 0.01, phi1: 0.3, phi2: 0.3 }),
      mkPoint(1, { a: 0.02, phi1: 0.3, phi2: 0.3 }),
    ]
    expect(computeChampionFlips(points)).toHaveLength(0)
  })

  it('detects the index where the champion changes', () => {
    const points = [
      mkPoint(0, { a: 0.01, phi1: 0.3, phi2: 0.3 }),
      mkPoint(1, { a: 0.4, phi1: 0.02, phi2: 0.3 }),
    ]
    const flips = computeChampionFlips(points)
    expect(flips).toHaveLength(1)
    expect(flips[0]!.index).toBe(1)
    expect(flips[0]!.newChampion).toBe('phi1')
  })
})
