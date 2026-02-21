import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { ColorPicker } from '@/components/ui/ColorPicker'

vi.mock('@/components/ui/Popover', () => ({
  Popover: ({ trigger, content }: { trigger: ReactNode; content: ReactNode }) => (
    <div>
      <div>{trigger}</div>
      <div>{content}</div>
    </div>
  ),
}))

describe('ColorPicker', () => {
  const HISTORY_KEY = 'mdimension_color_history'

  beforeEach(() => {
    localStorage.removeItem(HISTORY_KEY)
  })

  it('ignores persisted history payloads that are not arrays', async () => {
    localStorage.setItem(HISTORY_KEY, '"not-an-array"')

    render(<ColorPicker value="#112233" onChange={vi.fn()} />)

    await waitFor(() => {
      expect(screen.queryAllByTitle('History')).toHaveLength(0)
    })
  })

  it('keeps only string entries from persisted history payloads', async () => {
    localStorage.setItem(
      HISTORY_KEY,
      JSON.stringify(['#ff0000', 123, null, 'invalid', '#00ff00', '#abc'])
    )

    render(<ColorPicker value="#112233" onChange={vi.fn()} />)

    await waitFor(() => {
      expect(screen.queryAllByTitle('History')).toHaveLength(4)
    })
  })

  it('clamps external alpha prop values to the [0, 1] range', async () => {
    const { rerender } = render(<ColorPicker value="#112233" onChange={vi.fn()} alpha={2} />)

    const alphaInput = await screen.findByRole('spinbutton')
    expect(alphaInput).toHaveValue(100)

    rerender(<ColorPicker value="#112233" onChange={vi.fn()} alpha={-1} />)

    await waitFor(() => {
      expect(alphaInput).toHaveValue(0)
    })
  })
})
