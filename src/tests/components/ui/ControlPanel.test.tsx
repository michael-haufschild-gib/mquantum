import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { ControlPanel } from '@/components/sections/ControlPanel'
import { useLayoutStore } from '../../../stores/layoutStore'

describe('ControlPanel', () => {
  // Reset store before each test
  beforeEach(() => {
    useLayoutStore.getState().setCollapsed(false)
  })

  it('reflects collapsed state from the layout store', () => {
    useLayoutStore.getState().setCollapsed(true)

    render(
      <ControlPanel>
        <div data-testid="panel-content">Content</div>
      </ControlPanel>
    )

    const button = screen.getByRole('button', { name: /expand control panel/i })
    expect(button).toHaveAttribute('aria-expanded', 'false')
    // Avoid brittle style/class assertions; aria-expanded is the contract.
    expect(screen.getByTestId('control-panel-content')).toBeInTheDocument()
  })

  it('toggles collapsed state on button click (updates store + aria)', async () => {
    const user = userEvent.setup()

    render(
      <ControlPanel>
        <div data-testid="panel-content">Content</div>
      </ControlPanel>
    )

    expect(useLayoutStore.getState().isCollapsed).toBe(false)

    // Click to collapse
    const collapseButton = screen.getByRole('button', { name: /collapse control panel/i })
    await user.click(collapseButton)

    await waitFor(() => {
      expect(useLayoutStore.getState().isCollapsed).toBe(true)
      expect(screen.getByRole('button', { name: /expand control panel/i })).toBeInTheDocument()
    })

    // Click to expand
    const expandButton = screen.getByRole('button', { name: /expand control panel/i })
    await user.click(expandButton)

    await waitFor(() => {
      expect(useLayoutStore.getState().isCollapsed).toBe(false)
    })
  })
})
