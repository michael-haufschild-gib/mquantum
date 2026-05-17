/**
 * Smoke + slider-wiring tests for BellPairControls (Geometry-tab Bell
 * configuration panel).
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import { BellPairControls } from '@/components/sections/Geometry/BellPairControls'
import { useExtendedObjectStore } from '@/stores/scene/extendedObjectStore'

beforeEach(() => {
  useExtendedObjectStore.getState().reset()
})

describe('BellPairControls', () => {
  it('renders the four measurement axis blocks and state-noise sliders', () => {
    render(<BellPairControls />)
    expect(screen.getByTestId('bell-pair-controls')).toBeInTheDocument()
    expect(screen.getByTestId('bell-axis-alice')).toBeInTheDocument()
    expect(screen.getByTestId('bell-axis-alice-prime')).toBeInTheDocument()
    expect(screen.getByTestId('bell-axis-bob')).toBeInTheDocument()
    expect(screen.getByTestId('bell-axis-bob-prime')).toBeInTheDocument()
    expect(screen.getByTestId('bell-geom-visibility')).toBeInTheDocument()
    expect(screen.getByTestId('bell-geom-eta')).toBeInTheDocument()
    expect(screen.getByTestId('bell-geom-analysis')).toBeInTheDocument()
  })

  it('renders precession field blocks for both Alice and Bob when expanded', async () => {
    const user = userEvent.setup()
    render(<BellPairControls />)
    // Precession Fields section defaults to collapsed; clicking the header
    // reveals the field sliders.
    const header = screen.getByRole('button', { name: /Precession Fields/i })
    await user.click(header)
    expect(screen.getByTestId('bell-field-alice')).toBeInTheDocument()
    expect(screen.getByTestId('bell-field-bob')).toBeInTheDocument()
  })

  it('mounts with the canonical CHSH defaults already in the store', () => {
    render(<BellPairControls />)
    const cfg = useExtendedObjectStore.getState().bellPair
    // Defaults: axes lie in the xy plane (θ = π/2), φ runs through canonical CHSH angles.
    expect(cfg.aliceAxis[0]).toBeCloseTo(Math.PI / 2, 6)
    expect(cfg.bobAxisPrime[1]).toBeCloseTo((3 * Math.PI) / 4, 6)
    expect(cfg.visibility).toBe(1)
    expect(cfg.detectionEfficiency).toBe(1)
    expect(cfg.analysisMode).toBe('fairSampling')
  })
})
