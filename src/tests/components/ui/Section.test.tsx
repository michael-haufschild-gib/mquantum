import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Section } from '@/components/sections/Section'

describe('Section', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('toggles open/closed on click', async () => {
    const user = userEvent.setup()

    render(
      <Section title="Settings" defaultOpen={true}>
        <div data-testid="section-content">Content</div>
      </Section>
    )

    const button = screen.getByRole('button', { name: /settings/i })

    // Initially open
    expect(button).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByTestId('section-content')).toBeInTheDocument()

    // Click to close
    await user.click(button)
    await waitFor(() => {
      expect(button).toHaveAttribute('aria-expanded', 'false')
      expect(screen.queryByTestId('section-content')).not.toBeInTheDocument()
    })

    // Click to open
    await user.click(button)
    await waitFor(() => {
      expect(button).toHaveAttribute('aria-expanded', 'true')
      expect(screen.getByTestId('section-content')).toBeInTheDocument()
    })
  })

  it('toggles on keyboard interaction (Enter)', async () => {
    const user = userEvent.setup()
    render(
      <Section title="Settings" defaultOpen={false}>
        <div>Content</div>
      </Section>
    )

    const button = screen.getByRole('button', { name: /settings/i })

    expect(button).toHaveAttribute('aria-expanded', 'false')
    button.focus()

    await user.keyboard('{Enter}')

    await waitFor(() => {
      expect(button).toHaveAttribute('aria-expanded', 'true')
    })
  })

  it('falls back to defaultOpen when persisted state is non-boolean JSON', () => {
    localStorage.setItem('section-state-settings', JSON.stringify('false'))

    render(
      <Section title="Settings" defaultOpen={false}>
        <div data-testid="section-content">Content</div>
      </Section>
    )

    const button = screen.getByRole('button', { name: /settings/i })
    expect(button).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByTestId('section-content')).not.toBeInTheDocument()
  })

  it('keeps toggling when persisted storage writes fail', async () => {
    const user = userEvent.setup()
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })

    render(
      <Section title="Settings" defaultOpen={false}>
        <div data-testid="section-content">Content</div>
      </Section>
    )

    const button = screen.getByRole('button', { name: /settings/i })
    expect(button).toHaveAttribute('aria-expanded', 'false')

    await user.click(button)

    await waitFor(() => {
      expect(button).toHaveAttribute('aria-expanded', 'true')
      expect(screen.getByTestId('section-content')).toBeInTheDocument()
    })
  })

  it('uses unique content ids for duplicate section titles', () => {
    render(
      <>
        <Section title="Settings" defaultOpen={true}>
          <div>First</div>
        </Section>
        <Section title="Settings" defaultOpen={true}>
          <div>Second</div>
        </Section>
      </>
    )

    const buttons = screen.getAllByRole('button', { name: /settings/i })
    expect(buttons).toHaveLength(2)
    const [firstButton, secondButton] = buttons
    if (!firstButton || !secondButton) {
      throw new Error('Expected two section buttons')
    }
    const firstControl = firstButton.getAttribute('aria-controls')
    const secondControl = secondButton.getAttribute('aria-controls')

    expect(firstControl).toEqual(expect.stringMatching(/^.+$/))
    expect(secondControl).toEqual(expect.stringMatching(/^.+$/))
    expect(firstControl).not.toBe(secondControl)
    // ARIA references are id-based; resolving aria-controls is the only way to
    // prove the relationship is real and not a pair of dangling strings.
    // eslint-disable-next-line testing-library/no-node-access, project-rules/no-dom-node-access -- verifying aria-controls id resolution
    expect(document.getElementById(firstControl as string)).toBeInTheDocument()
    // eslint-disable-next-line testing-library/no-node-access, project-rules/no-dom-node-access -- verifying aria-controls id resolution
    expect(document.getElementById(secondControl as string)).toBeInTheDocument()
    expect(screen.getByText('First')).toBeInTheDocument()
    expect(screen.getByText('Second')).toBeInTheDocument()
  })

  it('rehydrates persisted state when the section title changes', async () => {
    localStorage.setItem('section-state-tdse-analysis', JSON.stringify(false))
    localStorage.setItem('section-state-bec-analysis', JSON.stringify(true))
    const onOpenChange = vi.fn()

    const { rerender } = render(
      <Section title="TDSE Analysis" defaultOpen={true} onOpenChange={onOpenChange}>
        <div data-testid="section-content">Content</div>
      </Section>
    )

    expect(screen.getByRole('button', { name: /tdse analysis/i })).toHaveAttribute(
      'aria-expanded',
      'false'
    )

    rerender(
      <Section title="BEC Analysis" defaultOpen={true} onOpenChange={onOpenChange}>
        <div data-testid="section-content">Content</div>
      </Section>
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /bec analysis/i })).toHaveAttribute(
        'aria-expanded',
        'true'
      )
    })
    expect(screen.getByTestId('section-content')).toBeInTheDocument()
    expect(onOpenChange).toHaveBeenLastCalledWith(true)
  })
})
