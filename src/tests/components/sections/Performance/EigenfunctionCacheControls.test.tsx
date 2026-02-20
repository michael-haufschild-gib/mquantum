import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EigenfunctionCacheControls } from '@/components/sections/Performance/EigenfunctionCacheControls'
import { usePerformanceStore } from '@/stores/performanceStore'

describe('EigenfunctionCacheControls', () => {
  beforeEach(() => {
    usePerformanceStore.getState().reset()
  })

  it('renders cache, analytical gradient, and robust interpolation toggles', () => {
    render(<EigenfunctionCacheControls />)

    const cacheToggle = screen.getByRole('switch', { name: 'Eigenfunction Cache' })
    const analyticalToggle = screen.getByRole('switch', { name: 'Analytical Gradient' })
    const robustToggle = screen.getByRole('switch', { name: 'Robust Eigen Interpolation' })

    expect(cacheToggle).toBeChecked()
    expect(analyticalToggle).toBeChecked()
    expect(robustToggle).toBeChecked()
    expect(analyticalToggle).not.toBeDisabled()
    expect(robustToggle).not.toBeDisabled()
  })

  it('disables subordinate toggles when cache is off and preserves their values', async () => {
    const user = userEvent.setup()
    render(<EigenfunctionCacheControls />)

    const cacheToggle = screen.getByRole('switch', { name: 'Eigenfunction Cache' })
    const analyticalToggle = screen.getByRole('switch', { name: 'Analytical Gradient' })
    const robustToggle = screen.getByRole('switch', { name: 'Robust Eigen Interpolation' })

    await user.click(analyticalToggle)
    await user.click(robustToggle)
    expect(analyticalToggle).not.toBeChecked()
    expect(robustToggle).not.toBeChecked()

    await user.click(cacheToggle)
    expect(cacheToggle).not.toBeChecked()
    expect(analyticalToggle).toBeDisabled()
    expect(robustToggle).toBeDisabled()
    expect(analyticalToggle).not.toBeChecked()
    expect(robustToggle).not.toBeChecked()

    await user.click(cacheToggle)
    expect(cacheToggle).toBeChecked()
    expect(analyticalToggle).not.toBeDisabled()
    expect(robustToggle).not.toBeDisabled()
    expect(analyticalToggle).not.toBeChecked()
    expect(robustToggle).not.toBeChecked()
  })
})
