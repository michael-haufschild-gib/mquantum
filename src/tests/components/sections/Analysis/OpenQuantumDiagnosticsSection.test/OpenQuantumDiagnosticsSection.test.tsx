/**
 * OpenQuantumDiagnosticsSection gating.
 *
 * Regression: the section gated on "any analytic mode", while only the
 * harmonic oscillator and hydrogen modes run the Lindblad executor. Because
 * `openQuantum.enabled` persists across mode switches, the section showed the
 * previous HO session's purity/entropy as live metrics in e.g. riemannZeta.
 *
 * @module tests/components/sections/Analysis/OpenQuantumDiagnosticsSection
 */

import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { OpenQuantumDiagnosticsSection } from '@/components/sections/Analysis/OpenQuantumDiagnosticsSection'
import type { SchroedingerQuantumMode } from '@/lib/geometry/extended/types'
import { useExtendedObjectStore } from '@/stores/scene/extendedObjectStore'

function setMode(quantumMode: SchroedingerQuantumMode) {
  useExtendedObjectStore.setState((state) => ({
    ...state,
    schroedinger: {
      ...state.schroedinger,
      quantumMode,
      representation: 'position',
      openQuantum: { ...state.schroedinger.openQuantum, enabled: true },
    },
  }))
}

beforeEach(() => {
  useExtendedObjectStore.getState().reset()
  localStorage.clear()
})

describe('OpenQuantumDiagnosticsSection', () => {
  it('shows live diagnostics for the harmonic oscillator', () => {
    setMode('harmonicOscillator')
    render(<OpenQuantumDiagnosticsSection />)
    expect(screen.queryByText(/Enable open quantum in/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /open quantum diagnostics/i })).toBeInTheDocument()
  })

  it('stays unavailable in analytic modes without an open-quantum executor', () => {
    setMode('riemannZeta')
    render(<OpenQuantumDiagnosticsSection />)
    expect(
      screen.getByText(/Enable open quantum in the harmonic-oscillator or hydrogen modes/)
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /open quantum diagnostics/i })).toBeNull()
  })
})
