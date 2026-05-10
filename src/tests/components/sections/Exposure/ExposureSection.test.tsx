/**
 * Regression test for ExposureSection's gain indicator.
 *
 * The gain indicator was hardcoded to read `s.tdse.maxDensity` regardless
 * of the active quantum mode, so the displayed "Current gain" was stale
 * TDSE data when the user was in BEC/Dirac/FSF/Pauli sessions and was
 * locked at "—" for QW. The fix reads the active mode's channel.
 *
 * @module tests/components/sections/Exposure/ExposureSection
 */

import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { ExposureSection } from '@/components/sections/Exposure/ExposureSection'
import { useDiagnosticsStore } from '@/stores/diagnostics/diagnosticsStore'
import { useExtendedObjectStore } from '@/stores/scene/extendedObjectStore'
import { useGeometryStore } from '@/stores/scene/geometryStore'

beforeEach(() => {
  useExtendedObjectStore.setState(useExtendedObjectStore.getInitialState())
  useDiagnosticsStore.setState(useDiagnosticsStore.getInitialState())
  useGeometryStore.setState(useGeometryStore.getInitialState())
})

describe('ExposureSection gain indicator — channel routing', () => {
  it('reads BEC channel maxDensity in becDynamics mode', () => {
    useGeometryStore.setState({ objectType: 'schroedinger' })
    useExtendedObjectStore.setState((s) => ({
      schroedinger: {
        ...s.schroedinger,
        quantumMode: 'becDynamics',
        bec: { ...s.schroedinger.bec, autoScale: true },
      },
    }))
    useDiagnosticsStore.setState((s) => ({
      tdse: { ...s.tdse, maxDensity: 0.001, hasData: true },
      bec: { ...s.bec, maxDensity: 0.5, hasData: true },
    }))

    render(<ExposureSection defaultOpen={true} />)
    const indicator = screen.getByTestId('exposure-gain-indicator')
    // BEC: 1/0.5 = 2.0x. TDSE would be 1/0.001 = 1000x → '1000x' (capped).
    // The presence of "2.0x" confirms the BEC channel was read.
    expect(indicator).toHaveTextContent('2.0x')
    expect(indicator).not.toHaveTextContent('1000x')
  })

  it('reads Dirac channel maxDensity in diracEquation mode', () => {
    useGeometryStore.setState({ objectType: 'schroedinger' })
    useExtendedObjectStore.setState((s) => ({
      schroedinger: {
        ...s.schroedinger,
        quantumMode: 'diracEquation',
        dirac: { ...s.schroedinger.dirac, autoScale: true },
      },
    }))
    useDiagnosticsStore.setState((s) => ({
      tdse: { ...s.tdse, maxDensity: 0.0001, hasData: true },
      dirac: { ...s.dirac, maxDensity: 0.25, hasData: true },
    }))

    render(<ExposureSection defaultOpen={true} />)
    const indicator = screen.getByTestId('exposure-gain-indicator')
    // Dirac: 1/0.25 = 4.0x.
    expect(indicator).toHaveTextContent('4.0x')
  })

  it('reads FSF channel maxPhi in freeScalarField mode', () => {
    useGeometryStore.setState({ objectType: 'schroedinger' })
    useExtendedObjectStore.setState((s) => ({
      schroedinger: {
        ...s.schroedinger,
        quantumMode: 'freeScalarField',
        freeScalar: { ...s.schroedinger.freeScalar, autoScale: true },
      },
    }))
    useDiagnosticsStore.setState((s) => ({
      tdse: { ...s.tdse, maxDensity: 0.0001, hasData: true },
      fsf: { ...s.fsf, maxPhi: 0.125, hasData: true },
    }))

    render(<ExposureSection defaultOpen={true} />)
    const indicator = screen.getByTestId('exposure-gain-indicator')
    // FSF: 1/0.125 = 8.0x.
    expect(indicator).toHaveTextContent('8.0x')
  })

  it('reads Pauli channel maxDensity in pauliSpinor object type', () => {
    useGeometryStore.setState({ objectType: 'pauliSpinor' })
    useExtendedObjectStore.setState((s) => ({
      pauliSpinor: { ...s.pauliSpinor!, autoScale: true },
    }))
    useDiagnosticsStore.setState((s) => ({
      tdse: { ...s.tdse, maxDensity: 0.0001, hasData: true },
      pauli: { ...s.pauli, maxDensity: 0.2, hasData: true },
    }))

    render(<ExposureSection defaultOpen={true} />)
    const indicator = screen.getByTestId('exposure-gain-indicator')
    // Pauli: 1/0.2 = 5.0x.
    expect(indicator).toHaveTextContent('5.0x')
  })

  it('still reads TDSE channel in tdseDynamics mode', () => {
    useGeometryStore.setState({ objectType: 'schroedinger' })
    useExtendedObjectStore.setState((s) => ({
      schroedinger: {
        ...s.schroedinger,
        quantumMode: 'tdseDynamics',
        tdse: { ...s.schroedinger.tdse, autoScale: true },
      },
    }))
    useDiagnosticsStore.setState((s) => ({
      tdse: { ...s.tdse, maxDensity: 0.4, hasData: true },
    }))

    render(<ExposureSection defaultOpen={true} />)
    const indicator = screen.getByTestId('exposure-gain-indicator')
    // TDSE: 1/0.4 = 2.5x.
    expect(indicator).toHaveTextContent('2.5x')
  })

  it('shows placeholder for QW mode (no maxDensity in QwChannelData)', () => {
    useGeometryStore.setState({ objectType: 'schroedinger' })
    useExtendedObjectStore.setState((s) => ({
      schroedinger: {
        ...s.schroedinger,
        quantumMode: 'quantumWalk',
        quantumWalk: { ...s.schroedinger.quantumWalk, autoScale: true },
      },
    }))
    useDiagnosticsStore.setState((s) => ({
      tdse: { ...s.tdse, maxDensity: 0.001, hasData: true },
    }))

    render(<ExposureSection defaultOpen={true} />)
    const indicator = screen.getByTestId('exposure-gain-indicator')
    expect(indicator).toHaveTextContent('—')
    // Critically: must NOT show TDSE-derived gain ("1000x" from 1/0.001).
    expect(indicator).not.toHaveTextContent('1000x')
  })
})
