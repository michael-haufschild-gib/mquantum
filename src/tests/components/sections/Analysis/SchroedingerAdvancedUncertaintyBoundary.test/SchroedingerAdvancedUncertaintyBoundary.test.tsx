import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { SchroedingerQuantumEffectsSection } from '@/components/sections/Analysis/SchroedingerQuantumEffectsSection'
import { useExtendedObjectStore } from '@/stores/scene/extendedObjectStore'

describe('SchroedingerQuantumEffectsSection uncertainty boundary controls', () => {
  beforeEach(() => {
    useExtendedObjectStore.getState().reset()
  })

  it('toggles uncertainty boundary and exposes physically meaningful controls', () => {
    render(<SchroedingerQuantumEffectsSection />)

    const toggle = screen.getByTestId('schroedinger-uncertainty-boundary-toggle')
    fireEvent.click(toggle)

    const state = useExtendedObjectStore.getState().schroedinger as unknown as Record<
      string,
      unknown
    >
    expect(state.uncertaintyBoundaryEnabled).toBe(true)

    expect(screen.getByTestId('schroedinger-uncertainty-boundary-strength')).toBeInTheDocument()
    expect(screen.getByTestId('schroedinger-uncertainty-confidence')).toBeInTheDocument()
    expect(screen.getByTestId('schroedinger-uncertainty-boundary-width')).toBeInTheDocument()
  })
})
