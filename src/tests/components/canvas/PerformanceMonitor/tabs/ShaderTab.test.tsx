/**
 * ShaderTab tests.
 *
 * Verifies: empty state when no shaders, shader keys render as selector buttons,
 * active shader info shows vertex/fragment sizes and features,
 * module toggle switch updates shaderOverrides in store.
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import { ShaderTabContent } from '@/components/canvas/PerformanceMonitor/tabs/ShaderTab'
import { useGeometryStore } from '@/stores/geometryStore'
import { usePerformanceStore } from '@/stores/performanceStore'

const initialPerf = usePerformanceStore.getState()
const initialGeom = useGeometryStore.getState()

const mockShaderInfo = {
  name: 'object',
  vertexShaderLength: 4096,
  fragmentShaderLength: 8192,
  activeModules: ['lighting', 'pbr'],
  features: ['bloom', 'ssao'],
}

describe('ShaderTabContent', () => {
  beforeEach(() => {
    usePerformanceStore.setState(initialPerf, true)
    useGeometryStore.setState(initialGeom, true)
  })

  it('shows empty state when no shader debug infos', () => {
    usePerformanceStore.setState({ shaderDebugInfos: {}, shaderOverrides: [] })
    render(<ShaderTabContent />)
    expect(screen.getByText('No shader data available')).toBeInTheDocument()
  })

  it('renders shader key button for each shader', () => {
    usePerformanceStore.setState({
      shaderDebugInfos: {
        object: mockShaderInfo,
        skybox: { ...mockShaderInfo, name: 'skybox', features: [] },
      },
      shaderOverrides: [],
    })
    render(<ShaderTabContent />)
    // formatShaderName transforms 'object' -> 'Object' etc.
    expect(screen.getAllByRole('button').length).toBeGreaterThanOrEqual(2)
  })

  it('shows vertex shader size', () => {
    usePerformanceStore.setState({
      shaderDebugInfos: { object: mockShaderInfo },
      shaderOverrides: [],
    })
    render(<ShaderTabContent />)
    // 4096 bytes = "4.0 KB"
    expect(screen.getByText('4.0 KB')).toBeInTheDocument()
  })

  it('shows fragment shader size', () => {
    usePerformanceStore.setState({
      shaderDebugInfos: { object: mockShaderInfo },
      shaderOverrides: [],
    })
    render(<ShaderTabContent />)
    expect(screen.getByText('8.0 KB')).toBeInTheDocument()
  })

  it('shows feature badges for active shader', () => {
    usePerformanceStore.setState({
      shaderDebugInfos: { object: mockShaderInfo },
      shaderOverrides: [],
    })
    render(<ShaderTabContent />)
    expect(screen.getByText('bloom')).toBeInTheDocument()
    expect(screen.getByText('ssao')).toBeInTheDocument()
  })

  it('renders active module names', () => {
    usePerformanceStore.setState({
      shaderDebugInfos: { object: mockShaderInfo },
      shaderOverrides: [],
    })
    render(<ShaderTabContent />)
    expect(screen.getByText('lighting')).toBeInTheDocument()
    expect(screen.getByText('pbr')).toBeInTheDocument()
  })

  it('toggling a module switch adds it to shaderOverrides', async () => {
    const user = userEvent.setup()
    usePerformanceStore.setState({
      shaderDebugInfos: { object: mockShaderInfo },
      shaderOverrides: [],
    })
    render(<ShaderTabContent />)

    // Find the switch for 'lighting' module and toggle it
    const switches = screen.getAllByRole('switch')
    await user.click(switches[0]!)
    expect(usePerformanceStore.getState().shaderOverrides).toContain('lighting')
  })

  it('clicking a shader key button selects that shader', async () => {
    const user = userEvent.setup()
    usePerformanceStore.setState({
      shaderDebugInfos: {
        object: { ...mockShaderInfo, name: 'object', features: ['bloom'] },
        skybox: { ...mockShaderInfo, name: 'skybox', features: ['cubemap'] },
      },
      shaderOverrides: [],
    })
    render(<ShaderTabContent />)

    // Click skybox button (not selected by default)
    const buttons = screen.getAllByRole('button')
    const skyboxBtn = buttons.find((b) => b.textContent?.toLowerCase().includes('skybox'))
    expect(skyboxBtn).toBeInTheDocument()
    await user.click(skyboxBtn!)
    // skybox features should now be visible
    expect(screen.getByText('cubemap')).toBeInTheDocument()
  })
})
