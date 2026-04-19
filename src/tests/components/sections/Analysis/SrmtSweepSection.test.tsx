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

import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  computeChampionFlips,
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
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
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
    clickSpy.mockRestore()
    revokeSpy.mockRestore()
    createUrlSpy.mockRestore()
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
        'q_a,q_a_sigma,q_a_rigid,q_a_rigid_sigma,' +
        'q_phi1,q_phi1_sigma,q_phi1_rigid,q_phi1_rigid_sigma,' +
        'q_phi2,q_phi2_sigma,q_phi2_rigid,q_phi2_rigid_sigma,' +
        'computeMs'
    )
    expect(lines).toHaveLength(5)
    expect(lines[3]!).toMatch(/^0,/)
    expect(lines[4]!).toMatch(/^1,/)
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
    // One data row at the end.
    expect(lines.at(-1)!).toMatch(/^0,/)
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
    const dataRow = csv.trim().split('\n').at(-1)!
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
    const dataRow = csv.trim().split('\n').at(-1)!
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
