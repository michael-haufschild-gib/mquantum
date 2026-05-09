/**
 * Tests for HydrogenNDCoupledControls — quantum numbers and angular chain.
 */

import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { HydrogenNDCoupledControls } from '@/components/sections/Geometry/SchroedingerControls/HydrogenNDCoupledControls'
import { DEFAULT_SCHROEDINGER_CONFIG } from '@/lib/geometry/extended/schroedinger'

function makeMockActions() {
  return {
    setPrincipalQuantumNumber: vi.fn(),
    setAzimuthalQuantumNumber: vi.fn(),
    setMagneticQuantumNumber: vi.fn(),
    setUseRealOrbitals: vi.fn(),
    setBohrRadiusScale: vi.fn(),
    setAngularChainValue: vi.fn(),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('HydrogenNDCoupledControls', () => {
  it('renders quantum number controls', () => {
    render(
      <HydrogenNDCoupledControls
        config={DEFAULT_SCHROEDINGER_CONFIG}
        dimension={3}
        actions={makeMockActions()}
      />
    )
    expect(screen.getByText('Quantum Numbers')).toBeInTheDocument()
    expect(screen.getByText(/n \(principal\)/)).toBeInTheDocument()
    expect(screen.getByText(/l₁ \(angular momentum\)/)).toBeInTheDocument()
    expect(screen.getByText(/m \(magnetic\)/)).toBeInTheDocument()
  })

  it('renders Display group with Real orbitals switch', () => {
    render(
      <HydrogenNDCoupledControls
        config={DEFAULT_SCHROEDINGER_CONFIG}
        dimension={3}
        actions={makeMockActions()}
      />
    )
    expect(screen.getByText('Display')).toBeInTheDocument()
    expect(screen.getByText('Real orbitals')).toBeInTheDocument()
    expect(screen.getByText(/Bohr radius/)).toBeInTheDocument()
  })

  it('does NOT render Angular Momentum Chain for dimension 3', () => {
    render(
      <HydrogenNDCoupledControls
        config={DEFAULT_SCHROEDINGER_CONFIG}
        dimension={3}
        actions={makeMockActions()}
      />
    )
    expect(screen.queryByText('Angular Momentum Chain')).not.toBeInTheDocument()
  })

  it('renders Angular Momentum Chain for dimension 4', () => {
    const config = {
      ...DEFAULT_SCHROEDINGER_CONFIG,
      principalQuantumNumber: 3,
      azimuthalQuantumNumber: 2,
      magneticQuantumNumber: 0,
      angularChain: [1, 0, 0, 0, 0, 0, 0, 0],
    }
    render(<HydrogenNDCoupledControls config={config} dimension={4} actions={makeMockActions()} />)
    expect(screen.getByText('Angular Momentum Chain')).toBeInTheDocument()
  })

  it('renders chain sliders for each extra dimension', () => {
    const config = {
      ...DEFAULT_SCHROEDINGER_CONFIG,
      principalQuantumNumber: 3,
      azimuthalQuantumNumber: 2,
      magneticQuantumNumber: 0,
      angularChain: [1, 0, 0, 0, 0, 0, 0, 0],
    }
    render(<HydrogenNDCoupledControls config={config} dimension={5} actions={makeMockActions()} />)
    // dimension=5 → chainLength = 5-3 = 2 sliders
    const chainLabels = screen.getAllByText(/l[₂₃]/)
    expect(chainLabels.length).toBeGreaterThanOrEqual(2)
  })

  it('uses |m| as the lower bound for angular-chain sliders', () => {
    const config = {
      ...DEFAULT_SCHROEDINGER_CONFIG,
      principalQuantumNumber: 5,
      azimuthalQuantumNumber: 3,
      magneticQuantumNumber: -2,
      angularChain: [0, 0, 0, 0, 0, 0, 0, 0],
    }
    render(<HydrogenNDCoupledControls config={config} dimension={4} actions={makeMockActions()} />)
    expect(screen.getByText('l₂ (2–3)')).toBeInTheDocument()
  })

  it('renders orbital shape letters in the angular momentum select', () => {
    render(
      <HydrogenNDCoupledControls
        config={{
          ...DEFAULT_SCHROEDINGER_CONFIG,
          principalQuantumNumber: 3,
          azimuthalQuantumNumber: 1,
        }}
        dimension={3}
        actions={makeMockActions()}
      />
    )
    // l₁ = 1 corresponds to 'p' orbital
    expect(screen.getByText(/l₁ = 1 \(p\)/)).toBeInTheDocument()
  })
})
