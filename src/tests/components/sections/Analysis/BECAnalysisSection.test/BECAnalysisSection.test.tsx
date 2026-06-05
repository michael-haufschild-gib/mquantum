/**
 * Tests for BECAnalysisContent and BECDiagnosticsInline.
 *
 * Covers: diagnostics interval slider, awaiting placeholder, live observable
 * values when hasData=true, norm drift warning class, trap diagram render.
 */

import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import { BECAnalysisContent } from '@/components/sections/Analysis/BECAnalysisSection'
import {
  asymptoticSoundSpeed,
  hawkingReadout,
  type WaterfallParams,
} from '@/lib/physics/bec/sonicHorizon'
import {
  computeWaterfallBackgroundDensity,
  resolveBecMass,
} from '@/lib/physics/bec/waterfallParams'
import { useDiagnosticsStore } from '@/stores/diagnostics/diagnosticsStore'
import { useExtendedObjectStore } from '@/stores/scene/extendedObjectStore'

function setLiveBecDiagnostics(
  overrides: Partial<ReturnType<typeof useDiagnosticsStore.getState>['bec']> = {}
) {
  useDiagnosticsStore.setState((s) => ({
    bec: {
      ...s.bec,
      hasData: true,
      chemicalPotential: 1.23,
      healingLength: 0.456,
      soundSpeed: 0.78,
      thomasFermiRadius: 2.34,
      maxDensity: 0.1234,
      totalNorm: 0.9999,
      normDrift: 0.005,
      ...overrides,
    },
  }))
}

function currentWaterfallParams(): WaterfallParams {
  const bec = useExtendedObjectStore.getState().schroedinger.bec
  return {
    vMax: bec.hawkingVmax,
    lh: bec.hawkingLh,
    n0: computeWaterfallBackgroundDensity({
      interactionStrength: bec.interactionStrength,
    }),
    deltaN: bec.hawkingDeltaN,
    g: bec.interactionStrength,
    mass: resolveBecMass({ mass: bec.mass }),
    lBox: (bec.gridSize[0] ?? 64) * (bec.spacing[0] ?? 0.15),
  }
}

describe('BECAnalysisContent — diagnostics interval slider', () => {
  beforeEach(() => {
    useExtendedObjectStore.getState().reset()
    useDiagnosticsStore.getState().resetBec()
  })

  it('renders the diagnostics interval slider', () => {
    render(<BECAnalysisContent />)
    // The Slider renders two inputs: a range and a number value input
    expect(screen.getByTestId('bec-diagnostics-interval')).toBeInTheDocument()
  })

  it('reflects current diagnostics interval value from store', () => {
    useExtendedObjectStore.getState().setBecDiagnosticsInterval(20)
    render(<BECAnalysisContent />)
    // Check the range input which has exact label "Diagnostics Interval (frames)"
    const rangeInput = screen.getByLabelText('Diagnostics Interval (frames)')
    expect(rangeInput).toHaveValue('20')
  })

  it('updates store when number input value changes', async () => {
    const user = userEvent.setup()
    render(<BECAnalysisContent />)
    const numInput = screen.getByLabelText('Diagnostics Interval (frames) value')
    await user.clear(numInput)
    await user.type(numInput, '30')
    await user.tab()
    expect(useExtendedObjectStore.getState().schroedinger.bec.diagnosticsInterval).toBe(30)
  })

  it('clamps number input edits to slider bounds on blur', async () => {
    const user = userEvent.setup()
    render(<BECAnalysisContent />)
    const numInput = screen.getByLabelText('Diagnostics Interval (frames) value')

    await user.clear(numInput)
    await user.type(numInput, '999')
    await user.tab()

    expect(useExtendedObjectStore.getState().schroedinger.bec.diagnosticsInterval).toBe(60)
  })
})

describe('BECAnalysisContent — BEC diagnostics display', () => {
  beforeEach(() => {
    useExtendedObjectStore.getState().reset()
    useDiagnosticsStore.getState().resetBec()
  })

  it('shows awaiting message when hasData is false', () => {
    render(<BECAnalysisContent />)
    expect(screen.getByText(/Awaiting diagnostics/i)).toBeInTheDocument()
  })

  it('does not show chemical potential when hasData is false', () => {
    render(<BECAnalysisContent />)
    // μ label only appears in the readout when hasData=true
    expect(screen.queryByText(/μ=/)).not.toBeInTheDocument()
  })

  it('renders live BEC observables when hasData is true', () => {
    setLiveBecDiagnostics()
    render(<BECAnalysisContent />)
    expect(screen.getByText(/μ=1\.23/)).toBeInTheDocument()
    expect(screen.getByText(/ξ=0\.456/)).toBeInTheDocument()
    expect(screen.getByText(/c_s=0\.78/)).toBeInTheDocument()
    expect(screen.getByText(/R_TF=2\.34/)).toBeInTheDocument()
    expect(screen.getByText(/n_max=0\.1234/)).toBeInTheDocument()
  })

  it('shows μ line marker in SVG when hasData is true', () => {
    setLiveBecDiagnostics({ chemicalPotential: 1.0 })
    render(<BECAnalysisContent />)
    expect(within(screen.getByTestId('bec-trap-svg')).getByText('μ')).toBeInTheDocument()
  })

  it('shows norm drift in danger style when drift > 1%', () => {
    setLiveBecDiagnostics({ totalNorm: 1.05, normDrift: 0.05 })
    render(<BECAnalysisContent />)
    const driftEl = screen.getByText(/Δ=\+5\.00%/)
    expect(driftEl).toHaveClass('text-danger')
  })

  it('shows norm drift without danger when drift <= 1%', () => {
    setLiveBecDiagnostics({ totalNorm: 1.005, normDrift: 0.005 })
    render(<BECAnalysisContent />)
    const driftEl = screen.getByText(/Δ=\+0\.50%/)
    expect(driftEl).not.toHaveClass('text-danger')
  })

  it('renders trap diagram SVG', () => {
    render(<BECAnalysisContent />)
    expect(screen.getByTestId('bec-analysis-inline')).toBeInTheDocument()
    expect(screen.getByTestId('bec-trap-svg')).toBeInTheDocument()
  })

  it('shows Harmonic Trap label', () => {
    render(<BECAnalysisContent />)
    expect(screen.getByText(/Harmonic Trap V\(x\)/i)).toBeInTheDocument()
  })

  it('shows anisotropy suffix in axis label when trapAnisotropy[0] != 1.0', () => {
    useExtendedObjectStore.getState().setBecTrapAnisotropy(0, 1.5)
    render(<BECAnalysisContent />)
    // Check for the ω× label which appears when anisotropy is non-unity
    expect(screen.getByText(/ω×/)).toBeInTheDocument()
  })

  it('shows healing length as ∞ when >= 100', () => {
    setLiveBecDiagnostics({ healingLength: 200 })
    render(<BECAnalysisContent />)
    expect(screen.getByText(/ξ=∞/)).toBeInTheDocument()
  })

  it('renders finite analog Hawking readout for black-hole BEC diagnostics', () => {
    const store = useExtendedObjectStore.getState()
    store.setBecInitialCondition('blackHoleAnalog')
    store.setBecDiagnosticsEnabled(true)

    const params = currentWaterfallParams()
    const readout = hawkingReadout(params)

    render(<BECAnalysisContent />)

    const hud = screen.getByTestId('bec-hawking-hud')
    expect(hud).toHaveTextContent(`x₀=${readout.horizonX0.toFixed(3)}`)
    expect(hud).toHaveTextContent(`κ=${readout.kappa.toFixed(3)}`)
    expect(hud).toHaveTextContent(`T_H=${readout.hawkingTemperature.toFixed(4)}`)
    expect(screen.queryByTestId('bec-hawking-no-horizon-warning')).not.toBeInTheDocument()
  })

  it('warns when analog Hawking parameters cannot form a sonic horizon', () => {
    const store = useExtendedObjectStore.getState()
    store.setBecInitialCondition('blackHoleAnalog')
    store.setBecDiagnosticsEnabled(true)
    store.setBecHawkingVmax(0.5)

    const cs0 = asymptoticSoundSpeed(currentWaterfallParams())

    render(<BECAnalysisContent />)

    expect(screen.getByTestId('bec-hawking-hud')).toHaveTextContent('x₀=—')
    expect(screen.getByTestId('bec-hawking-no-horizon-warning')).toHaveTextContent(
      `No horizon — v_max must exceed local sound speed c_s0 = ${cs0.toFixed(3)}`
    )
  })

  it('hides analog Hawking readout when diagnostics are disabled', () => {
    const store = useExtendedObjectStore.getState()
    store.setBecInitialCondition('blackHoleAnalog')
    store.setBecDiagnosticsEnabled(false)

    render(<BECAnalysisContent />)

    expect(screen.queryByTestId('bec-hawking-hud')).not.toBeInTheDocument()
  })
})
