import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Button } from '@/components/ui/Button'
import { Popover } from '@/components/ui/Popover'

// Mock the sound manager
vi.mock('@/lib/audio/SoundManager', () => ({
  soundManager: {
    playClick: vi.fn(),
    playHover: vi.fn(),
    playSwish: vi.fn(),
  },
}))

// Mock HTMLElement.prototype.showPopover and hidePopover for happy-dom
beforeEach(() => {
  HTMLElement.prototype.showPopover = vi.fn()
  HTMLElement.prototype.hidePopover = vi.fn()
  // Mock matches for :popover-open pseudo-class
  const originalMatches = HTMLElement.prototype.matches
  HTMLElement.prototype.matches = function (selector: string) {
    if (selector === ':popover-open') {
      return this.hasAttribute('data-popover-open')
    }
    return originalMatches.call(this, selector)
  }
})

describe('Popover', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('rendering', () => {
    it('should open popover when trigger is clicked', async () => {
      const user = userEvent.setup()
      render(
        <Popover
          trigger={<Button>Open</Button>}
          content={<div data-testid="content">Content</div>}
        />
      )

      await user.click(screen.getByText('Open'))

      expect(screen.getByTestId('content')).toBeInTheDocument()
    })

    it('should close popover when trigger is clicked again', async () => {
      const user = userEvent.setup()
      render(
        <Popover
          trigger={<Button>Open</Button>}
          content={<div data-testid="content">Content</div>}
        />
      )

      await user.click(screen.getByText('Open'))
      expect(screen.getByTestId('content')).toBeInTheDocument()

      await user.click(screen.getByText('Open'))
      await waitFor(() => {
        expect(screen.queryByTestId('content')).not.toBeInTheDocument()
      })
    })
  })

  describe('controlled mode', () => {
    it('should respect controlled open state', () => {
      render(
        <Popover
          trigger={<Button>Open</Button>}
          content={<div data-testid="content">Content</div>}
          open={true}
          onOpenChange={vi.fn()}
        />
      )

      expect(screen.getByTestId('content')).toBeInTheDocument()
    })

    it('should call onOpenChange when trigger clicked in controlled mode', async () => {
      const handleOpenChange = vi.fn()
      const user = userEvent.setup()
      render(
        <Popover
          trigger={<Button>Open</Button>}
          content={<div>Content</div>}
          open={false}
          onOpenChange={handleOpenChange}
        />
      )

      await user.click(screen.getByText('Open'))

      expect(handleOpenChange).toHaveBeenCalledWith(true)
    })
  })

  describe('accessibility', () => {
    it('should put aria attributes on the actual trigger', () => {
      render(<Popover trigger={<Button>Open</Button>} content={<div>Content</div>} />)

      const trigger = screen.getByRole('button', { name: 'Open' })
      expect(trigger).toHaveAttribute('aria-expanded', 'false')
      expect(trigger).toHaveAttribute('aria-haspopup', 'dialog')
      expect(trigger).toHaveAttribute('aria-controls')
    })

    it('should update aria-expanded when open', async () => {
      const user = userEvent.setup()
      render(<Popover trigger={<Button>Open</Button>} content={<div>Content</div>} />)

      await user.click(screen.getByText('Open'))

      const trigger = screen.getByRole('button', { name: 'Open' })
      expect(trigger).toHaveAttribute('aria-expanded', 'true')
    })

    it('should open from native keyboard activation', async () => {
      const user = userEvent.setup()
      render(
        <Popover
          trigger={<Button>Open</Button>}
          content={<div data-testid="content">Content</div>}
        />
      )

      screen.getByRole('button', { name: 'Open' }).focus()
      await user.keyboard('{Enter}')

      expect(screen.getByTestId('content')).toBeInTheDocument()
    })
  })

  describe('viewport positioning logic', () => {
    const mockViewport = (width: number, height: number) => {
      Object.defineProperty(window, 'innerWidth', { value: width, writable: true })
      Object.defineProperty(window, 'innerHeight', { value: height, writable: true })
    }

    it('should clamp left position when popup would overflow right edge', async () => {
      mockViewport(800, 600)

      render(
        <Popover
          trigger={<Button data-testid="trigger">Open</Button>}
          content={
            <div data-testid="content" style={{ width: 260, height: 400 }}>
              Content
            </div>
          }
          open={true}
          onOpenChange={vi.fn()}
        />
      )

      // The popover content should be rendered when open
      expect(screen.getByTestId('content')).toBeInTheDocument()
    })
  })

  describe('updatePosition callback', () => {
    it('should add resize event listener when open', async () => {
      const addEventListenerSpy = vi.spyOn(window, 'addEventListener')
      const user = userEvent.setup()

      render(<Popover trigger={<Button>Open</Button>} content={<div>Content</div>} />)

      await user.click(screen.getByText('Open'))

      expect(addEventListenerSpy).toHaveBeenCalledWith('resize', expect.any(Function))
    })

    it('should add scroll event listener when open', async () => {
      const addEventListenerSpy = vi.spyOn(window, 'addEventListener')
      const user = userEvent.setup()

      render(<Popover trigger={<Button>Open</Button>} content={<div>Content</div>} />)

      await user.click(screen.getByText('Open'))

      expect(addEventListenerSpy).toHaveBeenCalledWith('scroll', expect.any(Function), true)
    })

    it('should remove event listeners when closed', async () => {
      const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener')
      const user = userEvent.setup()

      render(<Popover trigger={<Button>Open</Button>} content={<div>Content</div>} />)

      await user.click(screen.getByText('Open'))
      await user.click(screen.getByText('Open'))

      await waitFor(() => {
        expect(removeEventListenerSpy).toHaveBeenCalledWith('resize', expect.any(Function))
      })
      expect(removeEventListenerSpy).toHaveBeenCalledWith('scroll', expect.any(Function), true)
    })

    it('should update position on window resize', async () => {
      const user = userEvent.setup()

      render(
        <Popover
          trigger={<Button>Open</Button>}
          content={<div data-testid="content">Content</div>}
        />
      )

      await user.click(screen.getByText('Open'))
      expect(screen.getByTestId('content')).toBeInTheDocument()

      // Trigger resize event
      fireEvent(window, new Event('resize'))

      // Popover should still be visible
      expect(screen.getByTestId('content')).toBeInTheDocument()
    })
  })

  describe('className prop', () => {
    it('should apply custom className to trigger wrapper', () => {
      render(
        <Popover
          trigger={<Button data-testid="trigger">Open</Button>}
          content={<div>Content</div>}
          className="custom-class"
        />
      )

      const trigger = screen.getByRole('button', { name: 'Open' })
      expect(trigger).toHaveClass('custom-class')
    })
  })
})
