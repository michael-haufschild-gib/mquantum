import { SchroedingerAdvanced } from '@/components/sections/Advanced/SchroedingerAdvanced'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

describe('SchroedingerAdvanced probability current controls', () => {
  beforeEach(() => {
    useExtendedObjectStore.getState().reset()
  })

  it('renders probability current control group and updates mode controls', () => {
    render(<SchroedingerAdvanced />)

    const toggle = screen.getByTestId('schroedinger-probability-current-toggle')
    fireEvent.click(toggle)

    expect(useExtendedObjectStore.getState().schroedinger.probabilityCurrentEnabled).toBe(true)
    expect(screen.getByTestId('schroedinger-probability-current-style')).toBeInTheDocument()
    expect(screen.getByTestId('schroedinger-probability-current-placement')).toBeInTheDocument()
    expect(screen.getByTestId('schroedinger-probability-current-color-mode')).toBeInTheDocument()
    expect(
      screen.getByTestId('schroedinger-probability-current-density-threshold')
    ).toBeInTheDocument()
    expect(
      screen.getByTestId('schroedinger-probability-current-magnitude-threshold')
    ).toBeInTheDocument()

    fireEvent.change(screen.getByTestId('schroedinger-probability-current-style'), {
      target: { value: 'arrows' },
    })
    expect(useExtendedObjectStore.getState().schroedinger.probabilityCurrentStyle).toBe('arrows')
    expect(screen.getByTestId('schroedinger-probability-current-opacity')).toBeInTheDocument()

    fireEvent.change(screen.getByTestId('schroedinger-probability-current-style'), {
      target: { value: 'surfaceLIC' },
    })
    expect(screen.getByTestId('schroedinger-probability-current-step-size')).toBeInTheDocument()

    fireEvent.change(screen.getByTestId('schroedinger-probability-current-style'), {
      target: { value: 'streamlines' },
    })
    expect(screen.getByTestId('schroedinger-probability-current-steps')).toBeInTheDocument()
  })
})
