/**
 * Tests for TDSEPotentialControls — potential type selection and conditional parameter panels.
 */

import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { TDSEPotentialControls } from '@/components/sections/Geometry/SchroedingerControls/TDSEPotentialControls'
import { DEFAULT_TDSE_CONFIG } from '@/lib/geometry/extended/types'

function makeMockActions() {
  return {
    setLatticeDim: vi.fn(),
    setGridSize: vi.fn(),
    setSpacing: vi.fn(),
    setMass: vi.fn(),
    setHbar: vi.fn(),
    setDt: vi.fn(),
    setStepsPerFrame: vi.fn(),
    setInitialCondition: vi.fn(),
    setPacketCenter: vi.fn(),
    setPacketWidth: vi.fn(),
    setPacketAmplitude: vi.fn(),
    setPacketMomentum: vi.fn(),
    setPotentialType: vi.fn(),
    setBarrierHeight: vi.fn(),
    setBarrierWidth: vi.fn(),
    setBarrierCenter: vi.fn(),
    setWellDepth: vi.fn(),
    setWellWidth: vi.fn(),
    setHarmonicOmega: vi.fn(),
    setStepHeight: vi.fn(),
    setSlitSeparation: vi.fn(),
    setSlitWidth: vi.fn(),
    setWallThickness: vi.fn(),
    setWallHeight: vi.fn(),
    setLatticeDepth: vi.fn(),
    setLatticePeriod: vi.fn(),
    setDoubleWellLambda: vi.fn(),
    setDoubleWellSeparation: vi.fn(),
    setDoubleWellAsymmetry: vi.fn(),
    setRadialWellInner: vi.fn(),
    setRadialWellOuter: vi.fn(),
    setRadialWellDepth: vi.fn(),
    setRadialWellTilt: vi.fn(),
    setAnharmonicLambda: vi.fn(),
    setBhMass: vi.fn(),
    setBhMultipoleL: vi.fn(),
    setBhSpin: vi.fn(),
    setDisorderStrength: vi.fn(),
    setDisorderSeed: vi.fn(),
    setDriveEnabled: vi.fn(),
    setDriveWaveform: vi.fn(),
    setDriveFrequency: vi.fn(),
    setDriveAmplitude: vi.fn(),
    setDisorderDistribution: vi.fn(),
    setFieldView: vi.fn(),
    setAutoScale: vi.fn(),
    setShowPotential: vi.fn(),
    setDiagnosticsEnabled: vi.fn(),
    setDiagnosticsInterval: vi.fn(),
    setSlicePosition: vi.fn(),
    setCustomPotentialExpression: vi.fn(),
    setImaginaryTimeEnabled: vi.fn(),
    applyPreset: vi.fn(),
    resetField: vi.fn(),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('TDSEPotentialControls', () => {
  it('renders potential type select', () => {
    render(
      <TDSEPotentialControls td={DEFAULT_TDSE_CONFIG} activeDims={3} actions={makeMockActions()} />
    )
    expect(screen.getByTestId('tdse-potential-type')).toBeInTheDocument()
  })

  it('shows barrier controls for default barrier potential', () => {
    render(
      <TDSEPotentialControls
        td={{ ...DEFAULT_TDSE_CONFIG, potentialType: 'barrier' }}
        activeDims={3}
        actions={makeMockActions()}
      />
    )
    expect(screen.getByTestId('tdse-barrier-height')).toBeInTheDocument()
    expect(screen.getByTestId('tdse-barrier-width')).toBeInTheDocument()
    expect(screen.getByTestId('tdse-barrier-center')).toBeInTheDocument()
  })

  it('shows harmonic trap omega slider for harmonicTrap potential', () => {
    render(
      <TDSEPotentialControls
        td={{ ...DEFAULT_TDSE_CONFIG, potentialType: 'harmonicTrap' }}
        activeDims={3}
        actions={makeMockActions()}
      />
    )
    expect(screen.getByTestId('tdse-harmonic-omega')).toBeInTheDocument()
  })

  it('shows well controls for finiteWell potential', () => {
    render(
      <TDSEPotentialControls
        td={{ ...DEFAULT_TDSE_CONFIG, potentialType: 'finiteWell' }}
        activeDims={3}
        actions={makeMockActions()}
      />
    )
    expect(screen.getByTestId('tdse-well-depth')).toBeInTheDocument()
    expect(screen.getByTestId('tdse-well-width')).toBeInTheDocument()
  })

  it('shows step height slider for step potential', () => {
    render(
      <TDSEPotentialControls
        td={{ ...DEFAULT_TDSE_CONFIG, potentialType: 'step' }}
        activeDims={3}
        actions={makeMockActions()}
      />
    )
    expect(screen.getByTestId('tdse-step-height')).toBeInTheDocument()
  })

  it('shows disorder controls with randomize button for andersonDisorder potential', () => {
    render(
      <TDSEPotentialControls
        td={{ ...DEFAULT_TDSE_CONFIG, potentialType: 'andersonDisorder' }}
        activeDims={3}
        actions={makeMockActions()}
      />
    )
    expect(screen.getByTestId('tdse-disorder-strength')).toBeInTheDocument()
    expect(screen.getByTestId('tdse-randomize-seed')).toBeInTheDocument()
  })

  it('shows disorder overlay slider for non-disorder potentials when disorderStrength is 0', () => {
    render(
      <TDSEPotentialControls
        td={{ ...DEFAULT_TDSE_CONFIG, potentialType: 'barrier', disorderStrength: 0 }}
        activeDims={3}
        actions={makeMockActions()}
      />
    )
    // The disorder overlay slider is always shown when not in andersonDisorder mode
    expect(screen.getByTestId('tdse-disorder-strength')).toBeInTheDocument()
    // Disorder seed slider is NOT shown when disorderStrength === 0
    expect(screen.queryByTestId('tdse-disorder-seed')).not.toBeInTheDocument()
  })

  it('shows disorder seed slider when disorderStrength > 0 in non-disorder mode', () => {
    render(
      <TDSEPotentialControls
        td={{ ...DEFAULT_TDSE_CONFIG, potentialType: 'barrier', disorderStrength: 5 }}
        activeDims={3}
        actions={makeMockActions()}
      />
    )
    expect(screen.getByTestId('tdse-disorder-seed')).toBeInTheDocument()
  })

  it('hides generic disorder overlay controls for black-hole ringdown', () => {
    render(
      <TDSEPotentialControls
        td={{ ...DEFAULT_TDSE_CONFIG, potentialType: 'blackHoleRingdown', disorderStrength: 5 }}
        activeDims={3}
        actions={makeMockActions()}
      />
    )
    expect(screen.getByTestId('tdse-bh-mass')).toBeInTheDocument()
    expect(screen.queryByTestId('tdse-disorder-strength')).not.toBeInTheDocument()
    expect(screen.queryByTestId('tdse-disorder-seed')).not.toBeInTheDocument()
  })

  it('shows custom expression input for custom potential', () => {
    render(
      <TDSEPotentialControls
        td={{ ...DEFAULT_TDSE_CONFIG, potentialType: 'custom' }}
        activeDims={3}
        actions={makeMockActions()}
      />
    )
    expect(screen.getByTestId('tdse-custom-expression')).toBeInTheDocument()
  })
})
