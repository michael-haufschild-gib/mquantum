/**
 * Tests for DiracAnalysisContent, DiracDispersionDiagram, and DiracDiagnosticsInline.
 *
 * Covers: diagnostics interval slider, dispersion diagram SVG, awaiting placeholder,
 * live observable readout, norm drift warning, characteristic scales.
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import { DiracAnalysisContent } from '@/components/sections/Analysis/DiracAnalysisSection'
import { useDiagnosticsStore } from '@/stores/diagnosticsStore'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'

describe('DiracAnalysisContent — diagnostics interval slider', () => {
  beforeEach(() => {
    useExtendedObjectStore.getState().reset()
    useDiagnosticsStore.getState().resetDirac()
  })

  it('renders the diagnostics interval slider', () => {
    render(<DiracAnalysisContent />)
    expect(screen.getByTestId('dirac-diagnostics-interval')).toBeInTheDocument()
  })

  it('reflects current diagnostics interval from store', () => {
    useExtendedObjectStore.getState().setDiracDiagnosticsInterval(15)
    render(<DiracAnalysisContent />)
    const rangeInput = screen.getByLabelText('Diagnostics Interval (frames)')
    expect(rangeInput).toHaveValue('15')
  })

  it('updates store when number input value changes', async () => {
    const user = userEvent.setup()
    render(<DiracAnalysisContent />)
    const numInput = screen.getByLabelText('Diagnostics Interval (frames) value')
    await user.clear(numInput)
    await user.type(numInput, '25')
    await user.tab()
    const interval = useExtendedObjectStore.getState().schroedinger.dirac.diagnosticsInterval
    expect(interval).toBeGreaterThanOrEqual(1)
    expect(interval).toBeLessThanOrEqual(60)
  })
})

describe('DiracAnalysisContent — dispersion diagram', () => {
  beforeEach(() => {
    useExtendedObjectStore.getState().reset()
    useDiagnosticsStore.getState().resetDirac()
  })

  it('renders the dispersion diagram container', () => {
    render(<DiracAnalysisContent />)
    expect(screen.getByTestId('dirac-dispersion')).toBeInTheDocument()
  })

  it('renders an SVG element for E(k) dispersion', () => {
    render(<DiracAnalysisContent />)
    expect(screen.getByTestId('dirac-dispersion-svg')).toBeInTheDocument()
  })

  it('renders the dispersion title text', () => {
    render(<DiracAnalysisContent />)
    expect(screen.getByText(/Dirac Dispersion E\(k\)/i)).toBeInTheDocument()
  })

  it('renders positive and negative energy branch polylines', () => {
    render(<DiracAnalysisContent />)
    // Two branches: particle + antiparticle
    expect(screen.getByTestId('dirac-branch-positive')).toBeInTheDocument()
    expect(screen.getByTestId('dirac-branch-negative')).toBeInTheDocument()
  })

  it('renders k axis label', () => {
    render(<DiracAnalysisContent />)
    const kLabels = screen.getAllByText('k')
    expect(kLabels.length).toBeGreaterThan(0)
  })

  it('renders E(k) axis label', () => {
    render(<DiracAnalysisContent />)
    expect(screen.getByText('E(k)')).toBeInTheDocument()
  })

  it('renders V_K Klein threshold label', () => {
    render(<DiracAnalysisContent />)
    expect(screen.getByText('V_K')).toBeInTheDocument()
  })

  it('renders 2mc² mass gap label', () => {
    render(<DiracAnalysisContent />)
    expect(screen.getByText(/2mc²/)).toBeInTheDocument()
  })
})

describe('DiracAnalysisContent — diagnostics readout', () => {
  beforeEach(() => {
    useExtendedObjectStore.getState().reset()
    useDiagnosticsStore.getState().resetDirac()
  })

  it('shows awaiting message when hasData is false', () => {
    render(<DiracAnalysisContent />)
    expect(screen.getByText(/Awaiting diagnostics/i)).toBeInTheDocument()
  })

  it('does not show spinor fractions when hasData is false', () => {
    render(<DiracAnalysisContent />)
    expect(screen.queryByText(/Upper=/)).not.toBeInTheDocument()
  })

  it('renders live Dirac observables when hasData is true', () => {
    useDiagnosticsStore.setState((s) => ({
      dirac: {
        ...s.dirac,
        hasData: true,
        particleFraction: 0.75,
        antiparticleFraction: 0.25,
        totalNorm: 0.9998,
        normDrift: 0.002,
        maxDensity: 0.0345,
        comptonWavelength: 0.628,
        zitterbewegungFreq: 3.14,
        kleinThreshold: 2.0,
      },
    }))
    render(<DiracAnalysisContent />)
    expect(screen.getByText(/Upper=75\.0%/)).toBeInTheDocument()
    expect(screen.getByText(/Lower=25\.0%/)).toBeInTheDocument()
    expect(screen.getByText(/λ_C=0\.628/)).toBeInTheDocument()
    expect(screen.getByText(/ω_Z=3\.14/)).toBeInTheDocument()
    expect(screen.getByText(/V_K=2\.00/)).toBeInTheDocument()
    expect(screen.getByText(/n_max=0\.0345/)).toBeInTheDocument()
  })

  it('shows norm drift in danger style when |drift| > 1%', () => {
    useDiagnosticsStore.setState((s) => ({
      dirac: {
        ...s.dirac,
        hasData: true,
        particleFraction: 0.9,
        antiparticleFraction: 0.1,
        totalNorm: 0.95,
        normDrift: -0.05,
        maxDensity: 0.01,
        comptonWavelength: 0.5,
        zitterbewegungFreq: 1.0,
        kleinThreshold: 1.0,
      },
    }))
    render(<DiracAnalysisContent />)
    const driftEl = screen.getByText(/Δ=-5\.00%/)
    expect(driftEl).toHaveClass('text-danger')
  })

  it('shows norm drift without danger when |drift| <= 1%', () => {
    useDiagnosticsStore.setState((s) => ({
      dirac: {
        ...s.dirac,
        hasData: true,
        particleFraction: 0.9,
        antiparticleFraction: 0.1,
        totalNorm: 1.005,
        normDrift: 0.005,
        maxDensity: 0.01,
        comptonWavelength: 0.5,
        zitterbewegungFreq: 1.0,
        kleinThreshold: 1.0,
      },
    }))
    render(<DiracAnalysisContent />)
    const driftEl = screen.getByText(/Δ=\+0\.50%/)
    expect(driftEl).not.toHaveClass('text-danger')
  })

  it('renders the diagnostics inline container', () => {
    render(<DiracAnalysisContent />)
    expect(screen.getByTestId('dirac-analysis-inline')).toBeInTheDocument()
  })
})
