/**
 * ExpandedContent tests.
 *
 * Verifies: header and FPS area render, tabs render for active tab,
 * collapse callback fires on header click, tab switching updates store.
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ExpandedContent } from '@/components/canvas/PerformanceMonitor/ExpandedContent'
import { usePerformanceMetricsStore } from '@/stores/performanceMetricsStore'
import { useUIStore } from '@/stores/uiStore'

const initialUIState = useUIStore.getState()
const initialMetricsState = usePerformanceMetricsStore.getState()

describe('ExpandedContent', () => {
  beforeEach(() => {
    useUIStore.setState(initialUIState, true)
    usePerformanceMetricsStore.setState(initialMetricsState, true)
  })

  it('renders "System Monitor" header', () => {
    render(<ExpandedContent onCollapse={vi.fn()} didDrag={false} />)
    expect(screen.getByText('System Monitor')).toBeInTheDocument()
  })

  it('renders FPS value from metrics store', () => {
    usePerformanceMetricsStore.setState({ fps: 60, frameTime: 16.7 })
    render(<ExpandedContent onCollapse={vi.fn()} didDrag={false} />)
    expect(screen.getByText('60')).toBeInTheDocument()
    expect(screen.getByText('FPS')).toBeInTheDocument()
  })

  it('renders frame time', () => {
    usePerformanceMetricsStore.setState({ fps: 30, frameTime: 33.3 })
    render(<ExpandedContent onCollapse={vi.fn()} didDrag={false} />)
    expect(screen.getByText('33.3')).toBeInTheDocument()
  })

  it('calls onCollapse when header is clicked and not dragging', async () => {
    const user = userEvent.setup()
    const onCollapse = vi.fn()
    render(<ExpandedContent onCollapse={onCollapse} didDrag={false} />)

    await user.click(screen.getByText('System Monitor'))
    expect(onCollapse).toHaveBeenCalledOnce()
  })

  it('does not call onCollapse when didDrag is true', async () => {
    const user = userEvent.setup()
    const onCollapse = vi.fn()
    render(<ExpandedContent onCollapse={onCollapse} didDrag={true} />)

    await user.click(screen.getByText('System Monitor'))
    expect(onCollapse).not.toHaveBeenCalled()
  })

  it('renders tabs: Stats, Passes, System, Shader, Buffers', () => {
    render(<ExpandedContent onCollapse={vi.fn()} didDrag={false} />)
    expect(screen.getByText('Stats')).toBeInTheDocument()
    expect(screen.getByText('Passes')).toBeInTheDocument()
    expect(screen.getByText('System')).toBeInTheDocument()
    expect(screen.getByText('Shader')).toBeInTheDocument()
    expect(screen.getByText('Buffers')).toBeInTheDocument()
  })

  it('clicking a tab updates perfMonitorTab in store', async () => {
    const user = userEvent.setup()
    useUIStore.setState({ perfMonitorTab: 'perf' })
    render(<ExpandedContent onCollapse={vi.fn()} didDrag={false} />)

    await user.click(screen.getByText('Passes'))
    expect(useUIStore.getState().perfMonitorTab).toBe('passes')
  })
})
