import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EigenfunctionCacheControls } from '@/components/sections/Performance/EigenfunctionCacheControls'
import { usePerformanceStore } from '@/stores/performanceStore'

describe('EigenfunctionCacheControls', () => {
  beforeEach(() => {
    usePerformanceStore.getState().reset()
  })

  it('renders cache, analytical gradient, and fast interpolation toggles', () => {
    render(<EigenfunctionCacheControls />)

    const cacheToggle = screen.getByRole('switch', { name: 'Eigenfunction Cache' })
    const analyticalToggle = screen.getByRole('switch', { name: 'Analytical Gradient' })
    const fastToggle = screen.getByRole('switch', { name: 'Fast Eigen Interpolation' })

    expect(cacheToggle).toBeChecked()
    expect(analyticalToggle).toBeChecked()
    expect(fastToggle).toBeChecked()
    expect(analyticalToggle).not.toBeDisabled()
    expect(fastToggle).not.toBeDisabled()
  })

  it('disables subordinate toggles when cache is off and preserves their values', async () => {
    const user = userEvent.setup()
    render(<EigenfunctionCacheControls />)

    const cacheToggle = screen.getByRole('switch', { name: 'Eigenfunction Cache' })
    const analyticalToggle = screen.getByRole('switch', { name: 'Analytical Gradient' })
    const fastToggle = screen.getByRole('switch', { name: 'Fast Eigen Interpolation' })

    await user.click(analyticalToggle)
    await user.click(fastToggle)
    expect(analyticalToggle).not.toBeChecked()
    expect(fastToggle).not.toBeChecked()

    await user.click(cacheToggle)
    expect(cacheToggle).not.toBeChecked()
    expect(analyticalToggle).toBeDisabled()
    expect(fastToggle).toBeDisabled()
    expect(analyticalToggle).not.toBeChecked()
    expect(fastToggle).not.toBeChecked()

    await user.click(cacheToggle)
    expect(cacheToggle).toBeChecked()
    expect(analyticalToggle).not.toBeDisabled()
    expect(fastToggle).not.toBeDisabled()
    expect(analyticalToggle).not.toBeChecked()
    expect(fastToggle).not.toBeChecked()
  })
})
