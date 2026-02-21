import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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
    const onSubmit = vi.fn((event: SubmitEvent) => event.preventDefault())

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
})
