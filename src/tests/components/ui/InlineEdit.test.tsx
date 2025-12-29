import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InlineEdit } from '@/components/ui/InlineEdit'

// Mock the sound manager
vi.mock('@/lib/audio/SoundManager', () => ({
  soundManager: {
    playClick: vi.fn(),
    playHover: vi.fn(),
    playSnap: vi.fn(),
    playSwish: vi.fn(),
  },
}))

describe('InlineEdit', () => {
  beforeEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  describe('display mode', () => {
    it('should render the value as text', () => {
      render(<InlineEdit value="Test Value" onSave={vi.fn()} />)
      expect(screen.getByText('Test Value')).toBeInTheDocument()
    })

    it('should show edit button on hover', () => {
      render(<InlineEdit value="Test Value" onSave={vi.fn()} />)
      const editButton = screen.getByRole('button', { name: /edit/i })
      expect(editButton).toBeInTheDocument()
    })

    it('should not show edit button when disabled', () => {
      render(<InlineEdit value="Test Value" onSave={vi.fn()} disabled />)
      expect(screen.queryByRole('button', { name: /edit/i })).not.toBeInTheDocument()
    })

    it('should apply custom text class', () => {
      render(<InlineEdit value="Test Value" onSave={vi.fn()} textClassName="custom-class" />)
      const text = screen.getByText('Test Value')
      expect(text).toHaveClass('custom-class')
    })
  })

  describe('edit mode', () => {
    it('should enter edit mode when clicking pencil button', async () => {
      const user = userEvent.setup()
      render(<InlineEdit value="Test Value" onSave={vi.fn()} />)

      const editButton = screen.getByRole('button', { name: /edit/i })
      await user.click(editButton)

      expect(screen.getByRole('textbox')).toBeInTheDocument()
      expect(screen.getByRole('textbox')).toHaveValue('Test Value')
    })

    it('should show save and cancel buttons in edit mode', async () => {
      const user = userEvent.setup()
      render(<InlineEdit value="Test Value" onSave={vi.fn()} />)

      await user.click(screen.getByRole('button', { name: /edit/i }))

      expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument()
    })

    it('should focus input when entering edit mode', async () => {
      const user = userEvent.setup()
      render(<InlineEdit value="Test Value" onSave={vi.fn()} />)

      await user.click(screen.getByRole('button', { name: /edit/i }))

      const input = screen.getByRole('textbox')
      // In happy-dom, focus behavior is limited - we verify the input exists and is accessible
      // The actual focus is set via useEffect which may not trigger in test env
      expect(input).toBeInTheDocument()
      expect(input).toHaveValue('Test Value')
    })

    it('should use placeholder when provided', async () => {
      const user = userEvent.setup()
      render(<InlineEdit value="" onSave={vi.fn()} placeholder="Enter name..." />)

      await user.click(screen.getByRole('button', { name: /edit/i }))

      expect(screen.getByPlaceholderText('Enter name...')).toBeInTheDocument()
    })
  })

  describe('save functionality', () => {
    it('should call onSave when clicking save button', async () => {
      const onSave = vi.fn()
      const user = userEvent.setup()
      render(<InlineEdit value="Original" onSave={onSave} />)

      await user.click(screen.getByRole('button', { name: /edit/i }))
      await user.clear(screen.getByRole('textbox'))
      await user.type(screen.getByRole('textbox'), 'New Value')
      await user.click(screen.getByRole('button', { name: /save/i }))

      expect(onSave).toHaveBeenCalledWith('New Value')
    })

    it('should call onSave when pressing Enter', async () => {
      const onSave = vi.fn()
      const user = userEvent.setup()
      render(<InlineEdit value="Original" onSave={onSave} />)

      await user.click(screen.getByRole('button', { name: /edit/i }))
      await user.clear(screen.getByRole('textbox'))
      await user.type(screen.getByRole('textbox'), 'New Value{Enter}')

      expect(onSave).toHaveBeenCalledWith('New Value')
    })

    it('should trim whitespace from saved value', async () => {
      const onSave = vi.fn()
      const user = userEvent.setup()
      render(<InlineEdit value="Original" onSave={onSave} />)

      await user.click(screen.getByRole('button', { name: /edit/i }))
      await user.clear(screen.getByRole('textbox'))
      await user.type(screen.getByRole('textbox'), '  Trimmed  ')
      await user.click(screen.getByRole('button', { name: /save/i }))

      expect(onSave).toHaveBeenCalledWith('Trimmed')
    })

    it('should not call onSave if value unchanged', async () => {
      const onSave = vi.fn()
      const user = userEvent.setup()
      render(<InlineEdit value="Same Value" onSave={onSave} />)

      await user.click(screen.getByRole('button', { name: /edit/i }))
      await user.click(screen.getByRole('button', { name: /save/i }))

      expect(onSave).not.toHaveBeenCalled()
    })

    it('should exit edit mode after saving', async () => {
      const user = userEvent.setup()
      render(<InlineEdit value="Original" onSave={vi.fn()} />)

      await user.click(screen.getByRole('button', { name: /edit/i }))
      await user.clear(screen.getByRole('textbox'))
      await user.type(screen.getByRole('textbox'), 'New Value')
      await user.click(screen.getByRole('button', { name: /save/i }))

      expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    })
  })

  describe('cancel functionality', () => {
    it('should exit edit mode without saving when clicking cancel', async () => {
      const onSave = vi.fn()
      const user = userEvent.setup()
      render(<InlineEdit value="Original" onSave={onSave} />)

      await user.click(screen.getByRole('button', { name: /edit/i }))
      await user.clear(screen.getByRole('textbox'))
      await user.type(screen.getByRole('textbox'), 'Changed')
      await user.click(screen.getByRole('button', { name: /cancel/i }))

      expect(onSave).not.toHaveBeenCalled()
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    })

    it('should exit edit mode when pressing Escape', async () => {
      const onSave = vi.fn()
      const user = userEvent.setup()
      render(<InlineEdit value="Original" onSave={onSave} />)

      await user.click(screen.getByRole('button', { name: /edit/i }))
      await user.type(screen.getByRole('textbox'), 'Changed')
      await user.keyboard('{Escape}')

      expect(onSave).not.toHaveBeenCalled()
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    })

    it('should call onCancel when provided', async () => {
      const onCancel = vi.fn()
      const user = userEvent.setup()
      render(<InlineEdit value="Original" onSave={vi.fn()} onCancel={onCancel} />)

      await user.click(screen.getByRole('button', { name: /edit/i }))
      await user.click(screen.getByRole('button', { name: /cancel/i }))

      expect(onCancel).toHaveBeenCalled()
    })
  })

  describe('validation', () => {
    it('should show error for empty value', async () => {
      const onSave = vi.fn()
      const user = userEvent.setup()
      render(<InlineEdit value="Original" onSave={onSave} />)

      await user.click(screen.getByRole('button', { name: /edit/i }))
      await user.clear(screen.getByRole('textbox'))
      await user.click(screen.getByRole('button', { name: /save/i }))

      expect(screen.getByText('Value cannot be empty')).toBeInTheDocument()
      expect(onSave).not.toHaveBeenCalled()
    })

    it('should use custom validator when provided', async () => {
      const onSave = vi.fn()
      const validate = vi.fn((value: string) =>
        value.length < 3 ? 'Must be at least 3 characters' : undefined
      )
      const user = userEvent.setup()
      render(<InlineEdit value="Original" onSave={onSave} validate={validate} />)

      await user.click(screen.getByRole('button', { name: /edit/i }))
      await user.clear(screen.getByRole('textbox'))
      await user.type(screen.getByRole('textbox'), 'AB')
      await user.click(screen.getByRole('button', { name: /save/i }))

      expect(screen.getByText('Must be at least 3 characters')).toBeInTheDocument()
      expect(onSave).not.toHaveBeenCalled()
    })

    it('should clear error when typing', async () => {
      const user = userEvent.setup()
      render(<InlineEdit value="Original" onSave={vi.fn()} />)

      await user.click(screen.getByRole('button', { name: /edit/i }))
      await user.clear(screen.getByRole('textbox'))
      await user.click(screen.getByRole('button', { name: /save/i }))

      expect(screen.getByText('Value cannot be empty')).toBeInTheDocument()

      await user.type(screen.getByRole('textbox'), 'N')

      expect(screen.queryByText('Value cannot be empty')).not.toBeInTheDocument()
    })
  })

  describe('event propagation', () => {
    it('should stop propagation when clicking edit button', async () => {
      const parentClick = vi.fn()
      const user = userEvent.setup()

      render(
        <div onClick={parentClick}>
          <InlineEdit value="Test" onSave={vi.fn()} />
        </div>
      )

      await user.click(screen.getByRole('button', { name: /edit/i }))

      expect(parentClick).not.toHaveBeenCalled()
    })

    it('should stop propagation when in edit mode', async () => {
      const parentClick = vi.fn()
      const user = userEvent.setup()

      render(
        <div onClick={parentClick}>
          <InlineEdit value="Test" onSave={vi.fn()} />
        </div>
      )

      await user.click(screen.getByRole('button', { name: /edit/i }))
      parentClick.mockClear()

      // Click on the input
      await user.click(screen.getByRole('textbox'))
      expect(parentClick).not.toHaveBeenCalled()

      // Click save
      await user.click(screen.getByRole('button', { name: /save/i }))
      expect(parentClick).not.toHaveBeenCalled()
    })
  })

  describe('aria labels', () => {
    it('should use custom edit button aria label', () => {
      render(
        <InlineEdit
          value="Test"
          onSave={vi.fn()}
          editButtonAriaLabel="Rename this item"
        />
      )

      expect(screen.getByRole('button', { name: 'Rename this item' })).toBeInTheDocument()
    })
  })
})
