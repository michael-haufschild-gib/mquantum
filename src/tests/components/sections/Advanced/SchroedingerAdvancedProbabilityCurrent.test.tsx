import { SchroedingerAdvanced } from '@/components/sections/Advanced/SchroedingerAdvanced'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

describe('SchroedingerAdvanced probability current controls', () => {
  beforeEach(() => {
    useExtendedObjectStore.getState().reset()
  })

  it('does not render probability current controls in the right editor panel', () => {
    render(<SchroedingerAdvanced />)

    expect(screen.queryByTestId('schroedinger-probability-current-toggle')).not.toBeInTheDocument()
    expect(screen.queryByTestId('schroedinger-probability-current-style')).not.toBeInTheDocument()
    expect(
      screen.queryByTestId('schroedinger-probability-current-placement')
    ).not.toBeInTheDocument()
    expect(
      screen.queryByTestId('schroedinger-probability-current-color-mode')
    ).not.toBeInTheDocument()
  })
})
