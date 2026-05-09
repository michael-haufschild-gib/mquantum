import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Section } from '@/components/sections/Section'

describe('Section', () => {
  beforeEach(() => {
    localStorage.clear()
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
