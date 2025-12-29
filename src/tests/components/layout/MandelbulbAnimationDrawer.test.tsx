/**
 * Tests for MandelbulbAnimationDrawer component
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MandelbulbAnimationDrawer } from '@/components/layout/TimelineControls/MandelbulbAnimationDrawer';
import { useExtendedObjectStore } from '@/stores/extendedObjectStore';
import { useGeometryStore } from '@/stores/geometryStore';

describe('MandelbulbAnimationDrawer', () => {
  beforeEach(() => {
    // Reset stores before each test
    useExtendedObjectStore.getState().reset();
    useGeometryStore.getState().reset();
    useGeometryStore.getState().setDimension(3);
    useGeometryStore.getState().setObjectType('mandelbulb');
  });

  it('should render Power Animation controls', () => {
    render(<MandelbulbAnimationDrawer />);
    expect(screen.getByText('Power Animation')).toBeInTheDocument();
  });

  it('should render Phase Shifts controls', () => {
    render(<MandelbulbAnimationDrawer />);
    expect(screen.getByText('Phase Shifts')).toBeInTheDocument();
  });

  it('should have correct test ids', () => {
    render(<MandelbulbAnimationDrawer />);
    expect(screen.getByTestId('mandelbulb-animation-drawer')).toBeInTheDocument();
    expect(screen.getByTestId('animation-panel-powerAnimation')).toBeInTheDocument();
    expect(screen.getByTestId('animation-panel-phaseShifts')).toBeInTheDocument();
  });

  it('should not show Slice Animation for 3D', () => {
    useGeometryStore.getState().setDimension(3);
    render(<MandelbulbAnimationDrawer />);
    expect(screen.queryByText('Slice Animation')).not.toBeInTheDocument();
  });

  it('should show Slice Animation for 4D', () => {
    useGeometryStore.getState().setDimension(4);
    render(<MandelbulbAnimationDrawer />);
    expect(screen.getByText('Slice Animation')).toBeInTheDocument();
    expect(screen.getByTestId('animation-panel-sliceAnimation')).toBeInTheDocument();
  });

  it('should render toggle buttons for each animation system', () => {
    render(<MandelbulbAnimationDrawer />);

    // Each system has a toggle button with "OFF" initially
    const offButtons = screen.getAllByText('OFF');
    expect(offButtons.length).toBeGreaterThanOrEqual(2); // power, phase
  });

  it('should toggle Power Animation', () => {
    render(<MandelbulbAnimationDrawer />);

    const toggleBtn = screen.getByRole('button', { name: /toggle power animation/i });
    expect(toggleBtn).toBeInTheDocument();

    // Initially off
    expect(useExtendedObjectStore.getState().mandelbulb.powerAnimationEnabled).toBe(false);

    // Click to enable
    fireEvent.click(toggleBtn);
    expect(useExtendedObjectStore.getState().mandelbulb.powerAnimationEnabled).toBe(true);
  });

  it('should toggle Phase Shifts', () => {
    render(<MandelbulbAnimationDrawer />);

    const toggleBtn = screen.getByRole('button', { name: /toggle phase shifts/i });
    expect(toggleBtn).toBeInTheDocument();

    // Initially off
    expect(useExtendedObjectStore.getState().mandelbulb.phaseShiftEnabled).toBe(false);

    // Click to enable
    fireEvent.click(toggleBtn);
    expect(useExtendedObjectStore.getState().mandelbulb.phaseShiftEnabled).toBe(true);
  });

  it('should toggle Slice Animation for 4D', () => {
    useGeometryStore.getState().setDimension(4);
    render(<MandelbulbAnimationDrawer />);

    const toggleBtn = screen.getByRole('button', { name: /toggle slice animation/i });
    expect(toggleBtn).toBeInTheDocument();

    // Initially off
    expect(useExtendedObjectStore.getState().mandelbulb.sliceAnimationEnabled).toBe(false);

    // Click to enable
    fireEvent.click(toggleBtn);
    expect(useExtendedObjectStore.getState().mandelbulb.sliceAnimationEnabled).toBe(true);
  });

  it('should render min/max/speed sliders for Power Animation', () => {
    render(<MandelbulbAnimationDrawer />);

    // Power Animation has Min, Max, Speed
    expect(screen.getByText('Min')).toBeInTheDocument();
    expect(screen.getByText('Max')).toBeInTheDocument();

    // Multiple Speed labels (power and phase have speed)
    const speedLabels = screen.getAllByText('Speed');
    expect(speedLabels.length).toBeGreaterThanOrEqual(2);
  });

  it('should render amplitude sliders', () => {
    render(<MandelbulbAnimationDrawer />);

    // Phase Shifts and potentially others have Amplitude
    const amplitudeLabels = screen.getAllByText('Amplitude');
    expect(amplitudeLabels.length).toBeGreaterThanOrEqual(1);
  });

  it('should render all 3 systems for 4D+ dimension', () => {
    useGeometryStore.getState().setDimension(4);
    render(<MandelbulbAnimationDrawer />);

    expect(screen.getByText('Power Animation')).toBeInTheDocument();
    expect(screen.getByText('Phase Shifts')).toBeInTheDocument();
    expect(screen.getByText('Slice Animation')).toBeInTheDocument();
  });

  it('should have disabled state styling when animation is off', () => {
    render(<MandelbulbAnimationDrawer />);

    // Power animation is off, its parameter container should have opacity-50
    const powerPanel = screen.getByTestId('animation-panel-powerAnimation');
    const paramContainer = powerPanel.querySelector('.opacity-50');
    expect(paramContainer).toBeInTheDocument();
  });
});
