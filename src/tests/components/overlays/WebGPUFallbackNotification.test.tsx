/**
 * WebGPUFallbackNotification component tests.
 *
 * Verifies: renders when showFallbackNotification is true, displays correct
 * reason messages for each unavailableReason variant, dismiss button calls
 * store action, hidden when showFallbackNotification is false.
 */
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { WebGPUFallbackNotification } from '@/components/overlays/WebGPUFallbackNotification'
import { useRendererStore } from '@/stores/runtime/rendererStore'

describe('WebGPUFallbackNotification', () => {
  beforeEach(() => {
    useRendererStore.setState(useRendererStore.getInitialState())
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders nothing when showFallbackNotification is false', () => {
    useRendererStore.setState({ showFallbackNotification: false })
    render(<WebGPUFallbackNotification />)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('renders alert with dismiss button when showFallbackNotification is true', () => {
    useRendererStore.setState({ showFallbackNotification: true })
    render(<WebGPUFallbackNotification />)

    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByText('WebGPU unavailable')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeInTheDocument()
  })

  it('shows "not in browser" reason message', () => {
    useRendererStore.setState({
      showFallbackNotification: true,
      webgpuCapabilities: { unavailableReason: 'not_in_browser' } as never,
    })
    render(<WebGPUFallbackNotification />)

    expect(screen.getByText('Your browser does not support WebGPU.')).toBeInTheDocument()
  })

  it('shows "no adapter" reason message', () => {
    useRendererStore.setState({
      showFallbackNotification: true,
      webgpuCapabilities: { unavailableReason: 'no_adapter' } as never,
    })
    render(<WebGPUFallbackNotification />)

    expect(screen.getByText('No compatible GPU adapter found.')).toBeInTheDocument()
  })

  it('shows "device lost" reason message', () => {
    useRendererStore.setState({
      showFallbackNotification: true,
      webgpuCapabilities: { unavailableReason: 'device_lost' } as never,
    })
    render(<WebGPUFallbackNotification />)

    expect(screen.getByText('The GPU device was lost and could not recover.')).toBeInTheDocument()
  })

  it('shows "initialization error" reason message', () => {
    useRendererStore.setState({
      showFallbackNotification: true,
      webgpuCapabilities: { unavailableReason: 'initialization_error' } as never,
    })
    render(<WebGPUFallbackNotification />)

    expect(screen.getByText('WebGPU failed to initialize.')).toBeInTheDocument()
  })

  it('shows generic message when no reason provided', () => {
    useRendererStore.setState({
      showFallbackNotification: true,
      webgpuCapabilities: null as never,
    })
    render(<WebGPUFallbackNotification />)

    expect(screen.getByText('WebGPU is not available on your device.')).toBeInTheDocument()
  })

  it('dismiss button calls dismissFallbackNotification', async () => {
    useRendererStore.setState({ showFallbackNotification: true })
    vi.useRealTimers() // Need real timers for user event
    const user = userEvent.setup()

    render(<WebGPUFallbackNotification />)
    await user.click(screen.getByRole('button', { name: 'Dismiss' }))

    expect(useRendererStore.getState().showFallbackNotification).toBe(false)
  })

  it('auto-dismisses after 8 seconds', () => {
    useRendererStore.setState({ showFallbackNotification: true })
    render(<WebGPUFallbackNotification />)

    expect(screen.getByRole('alert')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(8000)
    })

    expect(useRendererStore.getState().showFallbackNotification).toBe(false)
  })
})
