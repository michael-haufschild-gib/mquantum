import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Icon } from '@/components/ui/Icon'

describe('Icon', () => {
  it('treats unlabeled icons as decorative by default', () => {
    render(<Icon name="warning" role="img" />)

    const icon = screen.getByRole('img', { hidden: true })
    expect(icon).toHaveAttribute('aria-hidden', 'true')
    expect(icon).toHaveAttribute('focusable', 'false')
  })

  it('allows callers to provide a semantic SVG label', () => {
    render(<Icon name="warning" role="img" aria-label="Warning" />)

    const icon = screen.getByRole('img', { name: 'Warning' })
    expect(icon).not.toHaveAttribute('aria-hidden')
    expect(icon).toHaveAttribute('focusable', 'false')
  })

  it('respects explicit aria-hidden overrides', () => {
    render(<Icon name="warning" role="img" aria-hidden={false} />)

    const icon = screen.getByRole('img')
    expect(icon).toHaveAttribute('aria-hidden', 'false')
  })
})
