/**
 * PerformanceMonitor index component tests.
 *
 * Verifies: collapsed view renders by default, tap-to-expand sets store state,
 * expanded view shows ExpandedContent when perfMonitorExpanded is true.
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { PerformanceMonitor } from '@/components/canvas/PerformanceMonitor'
import { useUIStore } from '@/stores/uiStore'

// Mock LazyMotion/m.div — render children as plain divs
vi.mock('motion/react', () => {
  const MotionDiv = React.forwardRef<
    HTMLDivElement,
    React.HTMLAttributes<HTMLDivElement> & {
      drag?: boolean
      dragMomentum?: boolean
      onTap?: () => void
      initial?: unknown
      animate?: unknown
      exit?: unknown
      transition?: unknown
    }
  >(
    (
      {
        children,
        drag: _d,
        dragMomentum: _dm,
        onTap,
        onDragStart: _ods,
        onDragEnd: _ode,
        style,
        initial: _i,
        animate: _a,
        exit: _e,
        transition: _t,
        ...rest
      },
      ref
    ) => (
      <div ref={ref} style={style as React.CSSProperties} onClick={onTap} {...rest}>
        {children}
      </div>
    )
  )
  MotionDiv.displayName = 'MotionDiv'

  return {
    LazyMotion: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    domMax: {},
    m: { div: MotionDiv },
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    useMotionValue: (initial: number) => {
      let val = initial
      return {
        get: () => val,
        set: (v: number) => {
          val = v
        },
      }
    },
  }
})

vi.mock('@/hooks/usePanelCollision', () => ({ usePanelCollision: vi.fn() }))

// Mock child components to isolate this unit
vi.mock('@/components/canvas/PerformanceMonitor/CollapsedView', () => ({
  CollapsedView: () => <div data-testid="collapsed-view">CollapsedView</div>,
}))
vi.mock('@/components/canvas/PerformanceMonitor/ExpandedContent', () => ({
  ExpandedContent: ({ onCollapse }: { onCollapse: () => void; didDrag: boolean }) => (
    <div data-testid="expanded-content" onClick={onCollapse}>
      ExpandedContent
    </div>
  ),
}))

const initialUIState = useUIStore.getState()

describe('PerformanceMonitor', () => {
  beforeEach(() => {
    useUIStore.setState(initialUIState, true)
  })

  it('shows collapsed view when perfMonitorExpanded is false', () => {
    useUIStore.setState({ perfMonitorExpanded: false })
    render(<PerformanceMonitor />)
    expect(screen.getByTestId('collapsed-view')).toBeInTheDocument()
    expect(screen.queryByTestId('expanded-content')).not.toBeInTheDocument()
  })

  it('shows expanded content when perfMonitorExpanded is true', () => {
    useUIStore.setState({ perfMonitorExpanded: true })
    render(<PerformanceMonitor />)
    expect(screen.getByTestId('expanded-content')).toBeInTheDocument()
    expect(screen.queryByTestId('collapsed-view')).not.toBeInTheDocument()
  })

  it('tapping collapsed monitor sets perfMonitorExpanded to true', async () => {
    const user = userEvent.setup()
    useUIStore.setState({ perfMonitorExpanded: false })
    render(<PerformanceMonitor />)

    // The outermost m.div has onTap mapped to onClick — click the wrapper above the collapsed-view
    const collapsedView = screen.getByTestId('collapsed-view')
    // eslint-disable-next-line testing-library/no-node-access, project-rules/no-dom-node-access -- need parent wrapper that has the onTap/onClick handler; no testid available
    const wrapper = collapsedView.closest('div')!.parentElement!
    await user.click(wrapper)
    expect(useUIStore.getState().perfMonitorExpanded).toBe(true)
  })
})
