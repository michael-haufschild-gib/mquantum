/**
 * ShaderCompilationOverlay component tests.
 *
 * Verifies: visible when isShaderCompiling is true, shows compilation message,
 * hidden when not compiling, minimum display time prevents flash.
 */
import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ShaderCompilationOverlay } from '@/components/overlays/ShaderCompilationOverlay'
import { usePerformanceStore } from '@/stores/runtime/performanceStore'

describe('ShaderCompilationOverlay', () => {
  beforeEach(() => {
    usePerformanceStore.setState(usePerformanceStore.getInitialState())
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('is not visible when isShaderCompiling is false', () => {
    usePerformanceStore.setState({ isShaderCompiling: false })
    render(<ShaderCompilationOverlay />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('becomes visible when isShaderCompiling transitions to true', () => {
    usePerformanceStore.setState({
      isShaderCompiling: true,
      shaderCompilationMessage: 'Building HO 3D shader...',
    })
    render(<ShaderCompilationOverlay />)

    // Visibility is set via setTimeout(0) — advance timers
    act(() => {
      vi.advanceTimersByTime(1)
    })

    expect(screen.getByTestId('shader-compilation-overlay')).toBeInTheDocument()
    expect(screen.getByText('Building HO 3D shader...')).toBeInTheDocument()
    expect(screen.getByText('This may take a moment')).toBeInTheDocument()
  })

  it('shows default message when no compilation message set', () => {
    usePerformanceStore.setState({
      isShaderCompiling: true,
      shaderCompilationMessage: '',
    })
    render(<ShaderCompilationOverlay />)

    act(() => {
      vi.advanceTimersByTime(1)
    })

    expect(screen.getByText('Compiling shader...')).toBeInTheDocument()
  })

  it('stays visible for minimum display time after compilation ends', () => {
    // Start compiling
    usePerformanceStore.setState({
      isShaderCompiling: true,
      shaderCompilationMessage: 'test',
    })
    const { rerender } = render(<ShaderCompilationOverlay />)

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(screen.getByTestId('shader-compilation-overlay')).toBeInTheDocument()

    // End compiling after 100ms (less than MIN_DISPLAY_TIME_MS=600)
    act(() => {
      vi.advanceTimersByTime(100)
    })
    act(() => {
      usePerformanceStore.setState({ isShaderCompiling: false })
    })
    rerender(<ShaderCompilationOverlay />)

    // Should still be visible (minimum display time not elapsed)
    expect(screen.getByTestId('shader-compilation-overlay')).toBeInTheDocument()

    // After remaining minimum time, should eventually hide
    act(() => {
      vi.advanceTimersByTime(600)
    })
    expect(screen.queryByTestId('shader-compilation-overlay')).not.toBeInTheDocument()
  })

  it('updates message while compiling', () => {
    usePerformanceStore.setState({
      isShaderCompiling: true,
      shaderCompilationMessage: 'Phase 1...',
    })
    const { rerender } = render(<ShaderCompilationOverlay />)

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(screen.getByText('Phase 1...')).toBeInTheDocument()

    // Update message
    act(() => {
      usePerformanceStore.setState({ shaderCompilationMessage: 'Phase 2...' })
    })
    rerender(<ShaderCompilationOverlay />)

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(screen.getByText('Phase 2...')).toBeInTheDocument()
  })

  it('does not restart the minimum display timer when the message changes', () => {
    usePerformanceStore.setState({
      isShaderCompiling: true,
      shaderCompilationMessage: 'Phase 1...',
    })
    const { rerender } = render(<ShaderCompilationOverlay />)

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(screen.getByTestId('shader-compilation-overlay')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(500)
      usePerformanceStore.setState({ shaderCompilationMessage: 'Phase 2...' })
    })
    rerender(<ShaderCompilationOverlay />)

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(screen.getByText('Phase 2...')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(150)
      usePerformanceStore.setState({ isShaderCompiling: false })
    })
    rerender(<ShaderCompilationOverlay />)

    act(() => {
      vi.advanceTimersByTime(0)
    })
    expect(screen.queryByTestId('shader-compilation-overlay')).not.toBeInTheDocument()
  })

  it('has accessible role=status and aria-live', () => {
    usePerformanceStore.setState({ isShaderCompiling: true })
    render(<ShaderCompilationOverlay />)

    act(() => {
      vi.advanceTimersByTime(1)
    })

    const statuses = screen.getAllByRole('status')
    const status = statuses[0]
    expect(status).toHaveAttribute('aria-live', 'polite')
    expect(status).toHaveAttribute('aria-label', 'Shader compilation in progress')
  })
})
