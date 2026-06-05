import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { ExportPresetCard } from '@/components/ui/ExportPresetCard'

vi.mock('@/lib/audio/SoundManager', () => ({
  soundManager: {
    playClick: vi.fn(),
    playHover: vi.fn(),
  },
}))

describe('ExportPresetCard', () => {
  it('does not submit an ancestor form when clicked', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn((event: Event) => event.preventDefault())

    render(
      <form
        onSubmit={(event) => {
          event.preventDefault()
          onSubmit(event.nativeEvent)
        }}
      >
        <ExportPresetCard
          id="instagram"
          label="Instagram"
          description="1080x1080 • 1:1 Square"
          isActive={false}
          onClick={vi.fn()}
        />
      </form>
    )

    await user.click(screen.getByRole('button'))

    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('does not duplicate the preset label in the button accessible name', () => {
    render(
      <ExportPresetCard
        id="instagram"
        label="Instagram"
        description="1080x1080 • 1:1 Square"
        isActive={false}
        onClick={vi.fn()}
      />
    )

    expect(screen.getByRole('button')).not.toHaveAccessibleName(/Instagram Instagram/)
  })

  it('exposes active preset state to assistive tech', () => {
    render(
      <ExportPresetCard
        id="instagram"
        label="Instagram"
        description="1080x1080 • 1:1 Square"
        isActive={true}
        onClick={vi.fn()}
      />
    )

    expect(
      screen.getByRole('button', { name: 'Instagram: 1080x1080 • 1:1 Square' })
    ).toHaveAttribute('aria-pressed', 'true')
  })

  it('renders preset icon as a current-color mask instead of a standalone image', () => {
    render(
      <ExportPresetCard
        id="high-q"
        label="High quality"
        description="Maximum quality export"
        isActive={true}
        onClick={vi.fn()}
      />
    )

    const icon = screen.getByTestId('export-preset-icon-high-q')
    const style = icon.getAttribute('style') ?? ''

    expect(icon).toHaveAttribute('aria-hidden', 'true')
    expect(icon).toHaveClass('bg-current')
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(style).toContain('mask:')
    expect(style).toContain('center / contain no-repeat')
  })
})
