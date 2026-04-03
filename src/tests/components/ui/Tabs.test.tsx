import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Tab, Tabs } from '@/components/ui/Tabs'

// Mock SVG imports
vi.mock('@/assets/icons/chevron-left2.svg?react', () => ({
  default: () => <svg data-testid="chevron-left" />,
}))
vi.mock('@/assets/icons/chevron-right2.svg?react', () => ({
  default: () => <svg data-testid="chevron-right" />,
}))

// Mock soundManager
vi.mock('@/lib/audio/SoundManager', () => ({
  soundManager: {
    playHover: vi.fn(),
    playClick: vi.fn(),
  },
}))

describe('Tabs', () => {
  const mockTabs: Tab[] = [
    { id: 'tab1', label: 'Tab 1', content: <div>Content 1</div> },
    { id: 'tab2', label: 'Tab 2', content: <div>Content 2</div> },
    { id: 'tab3', label: 'Tab 3', content: <div>Content 3</div> },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('basic rendering', () => {
    it('renders all tab buttons', () => {
      render(<Tabs tabs={mockTabs} value="tab1" onChange={() => {}} />)

      expect(screen.getByRole('tab', { name: 'Tab 1' })).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: 'Tab 2' })).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: 'Tab 3' })).toBeInTheDocument()
    })

    it('shows active tab content', () => {
      render(<Tabs tabs={mockTabs} value="tab2" onChange={() => {}} />)

      // Active tab content should be visible
      const panel = screen.getByRole('tabpanel')
      expect(panel).toHaveTextContent('Content 2')
    })

    it('marks active tab as selected', () => {
      render(<Tabs tabs={mockTabs} value="tab2" onChange={() => {}} />)

      const tab1 = screen.getByRole('tab', { name: 'Tab 1' })
      const tab2 = screen.getByRole('tab', { name: 'Tab 2' })
      const tab3 = screen.getByRole('tab', { name: 'Tab 3' })

      expect(tab1).toHaveAttribute('aria-selected', 'false')
      expect(tab2).toHaveAttribute('aria-selected', 'true')
      expect(tab3).toHaveAttribute('aria-selected', 'false')
    })
  })

  describe('tab switching', () => {
    it('calls onChange when a tab is clicked', async () => {
      const user = userEvent.setup()
      const handleChange = vi.fn()

      render(<Tabs tabs={mockTabs} value="tab1" onChange={handleChange} />)

      await user.click(screen.getByRole('tab', { name: 'Tab 2' }))

      expect(handleChange).toHaveBeenCalledWith('tab2')
    })

    it('does not call onChange when active tab is clicked', async () => {
      const user = userEvent.setup()
      const handleChange = vi.fn()

      render(<Tabs tabs={mockTabs} value="tab1" onChange={handleChange} />)

      await user.click(screen.getByRole('tab', { name: 'Tab 1' }))

      expect(handleChange).not.toHaveBeenCalled()
    })

    it('does not call onChange when a disabled tab is clicked', async () => {
      const user = userEvent.setup()
      const handleChange = vi.fn()
      const tabsWithDisabled: Tab[] = [
        { id: 'tab1', label: 'Tab 1', content: <div>Content 1</div> },
        { id: 'tab2', label: 'Tab 2', content: <div>Content 2</div>, disabled: true },
        { id: 'tab3', label: 'Tab 3', content: <div>Content 3</div> },
      ]

      render(<Tabs tabs={tabsWithDisabled} value="tab1" onChange={handleChange} />)

      const disabledTab = screen.getByRole('tab', { name: 'Tab 2' })
      expect(disabledTab).toBeDisabled()
      expect(disabledTab).toHaveAttribute('aria-disabled', 'true')

      await user.click(disabledTab)

      expect(handleChange).not.toHaveBeenCalled()
    })
  })

  describe('keyboard navigation', () => {
    it('navigates with ArrowRight key', async () => {
      const user = userEvent.setup()
      const handleChange = vi.fn()

      render(<Tabs tabs={mockTabs} value="tab1" onChange={handleChange} />)

      const tab1 = screen.getByRole('tab', { name: 'Tab 1' })
      tab1.focus()

      await user.keyboard('{ArrowRight}')

      expect(handleChange).toHaveBeenCalledWith('tab2')
    })

    it('navigates with ArrowLeft key', async () => {
      const user = userEvent.setup()
      const handleChange = vi.fn()

      render(<Tabs tabs={mockTabs} value="tab2" onChange={handleChange} />)

      const tab2 = screen.getByRole('tab', { name: 'Tab 2' })
      tab2.focus()

      await user.keyboard('{ArrowLeft}')

      expect(handleChange).toHaveBeenCalledWith('tab1')
    })

    it('wraps around with ArrowRight from last tab', async () => {
      const user = userEvent.setup()
      const handleChange = vi.fn()

      render(<Tabs tabs={mockTabs} value="tab3" onChange={handleChange} />)

      const tab3 = screen.getByRole('tab', { name: 'Tab 3' })
      tab3.focus()

      await user.keyboard('{ArrowRight}')

      expect(handleChange).toHaveBeenCalledWith('tab1')
    })

    it('navigates to first tab with Home key', async () => {
      const user = userEvent.setup()
      const handleChange = vi.fn()

      render(<Tabs tabs={mockTabs} value="tab3" onChange={handleChange} />)

      const tab3 = screen.getByRole('tab', { name: 'Tab 3' })
      tab3.focus()

      await user.keyboard('{Home}')

      expect(handleChange).toHaveBeenCalledWith('tab1')
    })

    it('navigates to last tab with End key', async () => {
      const user = userEvent.setup()
      const handleChange = vi.fn()

      render(<Tabs tabs={mockTabs} value="tab1" onChange={handleChange} />)

      const tab1 = screen.getByRole('tab', { name: 'Tab 1' })
      tab1.focus()

      await user.keyboard('{End}')

      expect(handleChange).toHaveBeenCalledWith('tab3')
    })

    it('skips disabled tabs when navigating with ArrowRight', async () => {
      const user = userEvent.setup()
      const handleChange = vi.fn()
      const tabsWithDisabled: Tab[] = [
        { id: 'tab1', label: 'Tab 1', content: <div>Content 1</div> },
        { id: 'tab2', label: 'Tab 2', content: <div>Content 2</div>, disabled: true },
        { id: 'tab3', label: 'Tab 3', content: <div>Content 3</div> },
      ]

      render(<Tabs tabs={tabsWithDisabled} value="tab1" onChange={handleChange} />)

      const tab1 = screen.getByRole('tab', { name: 'Tab 1' })
      tab1.focus()

      await user.keyboard('{ArrowRight}')

      expect(handleChange).toHaveBeenCalledWith('tab3')
    })
  })

  describe('scroll indicators', () => {
    it('renders all tabs when there are many', () => {
      const manyTabs: Tab[] = Array.from({ length: 10 }, (_, i) => ({
        id: `tab${i}`,
        label: `Tab ${i + 1}`,
        content: <div>Content {i + 1}</div>,
      }))

      render(<Tabs tabs={manyTabs} value="tab0" onChange={() => {}} />)

      // All tabs should be rendered and accessible
      expect(screen.getAllByRole('tab')).toHaveLength(10)
      expect(screen.getByRole('tab', { name: 'Tab 1' })).toHaveAttribute('aria-selected', 'true')
      expect(screen.getByRole('tab', { name: 'Tab 10' })).toHaveAttribute('aria-selected', 'false')
    })

    it('tablist is present for many tabs', () => {
      const manyTabs: Tab[] = Array.from({ length: 10 }, (_, i) => ({
        id: `tab${i}`,
        label: `Tab ${i + 1}`,
        content: <div>Content {i + 1}</div>,
      }))

      render(<Tabs tabs={manyTabs} value="tab5" onChange={() => {}} />)

      const tablist = screen.getByRole('tablist')
      expect(tablist).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: 'Tab 6' })).toHaveAttribute('aria-selected', 'true')
    })
  })

  describe('accessibility', () => {
    it('has proper ARIA attributes', () => {
      render(<Tabs tabs={mockTabs} value="tab1" onChange={() => {}} data-testid="test-tabs" />)

      const tablist = screen.getByRole('tablist')
      expect(tablist).toBeInTheDocument()

      const activeTab = screen.getByRole('tab', { name: 'Tab 1' })
      expect(activeTab).toHaveAttribute('tabIndex', '0')

      const inactiveTab = screen.getByRole('tab', { name: 'Tab 2' })
      expect(inactiveTab).toHaveAttribute('tabIndex', '-1')
    })

    it('links tabs to their panels via aria-controls', () => {
      render(<Tabs tabs={mockTabs} value="tab1" onChange={() => {}} />)

      const tab1 = screen.getByRole('tab', { name: 'Tab 1' })
      const ariaControls = tab1.getAttribute('aria-controls')!
      expect(ariaControls).toContain('panel-tab1')

      const panel = screen.getByRole('tabpanel')
      const labelledBy = panel.getAttribute('aria-labelledby')!
      expect(labelledBy).toContain('tab-tab1')

      // Verify the ARIA link is bidirectional (tab → panel → tab)
      expect(panel.id).toBe(ariaControls)
      expect(tab1.id).toBe(labelledBy)
    })
  })
})
