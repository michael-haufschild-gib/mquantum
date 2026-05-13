/**
 * PauliSpinorControls Component
 *
 * Top-level control panel for the Pauli spinor equation mode.
 * Composes sub-components for spin state, magnetic field, potential,
 * grid/physics, and visualization settings.
 *
 * @module components/sections/Geometry/PauliSpinorControls
 */

import React, { useCallback } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { Section } from '@/components/sections/Section'
import { Slider } from '@/components/ui/Slider'
import { PAULI_FIELD_VIEW_TO_COLOR_ALGO } from '@/lib/colors/palette/types'
import type { PauliFieldView } from '@/lib/geometry/extended/types'
import { useAppearanceStore } from '@/stores/scene/appearanceStore'
import { useExtendedObjectStore } from '@/stores/scene/extendedObjectStore'
import { useGeometryStore } from '@/stores/scene/geometryStore'

import { MagneticFieldControls } from './MagneticFieldControls'
import { PauliGridControls } from './PauliGridControls'
import { PauliPotentialControls } from './PauliPotentialControls'
import { PauliVisualizationControls } from './PauliVisualizationControls'
import { SpinControls } from './SpinControls'

/**
 * Pauli spinor equation configuration panel.
 *
 * @returns React component for Pauli spinor controls
 */
export const PauliSpinorControls: React.FC = React.memo(() => {
  const dimension = useGeometryStore((s) => s.dimension)

  const pauli = useExtendedObjectStore(useShallow((s) => s.pauliSpinor))

  const actions = useExtendedObjectStore(
    useShallow((s) => ({
      // Spin
      setPauliInitialSpinDirection: s.setPauliInitialSpinDirection,
      setPauliInitialCondition: s.setPauliInitialCondition,
      setPauliPacketWidth: s.setPauliPacketWidth,
      // Magnetic field
      setPauliFieldType: s.setPauliFieldType,
      setPauliFieldStrength: s.setPauliFieldStrength,
      setPauliFieldDirection: s.setPauliFieldDirection,
      setPauliGradientStrength: s.setPauliGradientStrength,
      setPauliRotatingFrequency: s.setPauliRotatingFrequency,
      // Potential
      setPauliPotentialType: s.setPauliPotentialType,
      setPauliHarmonicOmega: s.setPauliHarmonicOmega,
      setPauliWellDepth: s.setPauliWellDepth,
      setPauliWellWidth: s.setPauliWellWidth,
      setPauliShowPotential: s.setPauliShowPotential,
      // Grid & physics
      setPauliGridSize: s.setPauliGridSize,
      setPauliSpacing: s.setPauliSpacing,
      setPauliDt: s.setPauliDt,
      setPauliStepsPerFrame: s.setPauliStepsPerFrame,
      setPauliHbar: s.setPauliHbar,
      setPauliMass: s.setPauliMass,
      // Visualization
      setPauliFieldView: s.setPauliFieldView,
      setPauliAutoScale: s.setPauliAutoScale,
      // Wavepacket
      setPauliPacketCenter: s.setPauliPacketCenter,
      setPauliPacketMomentum: s.setPauliPacketMomentum,
      // Slice positions
      setPauliSlicePosition: s.setPauliSlicePosition,
      // Lifecycle
      setPauliConfig: s.setPauliConfig,
    }))
  )

  /** Sync fieldView toggle with color algorithm so the renderer encodes matching channels. */
  const handleFieldViewChange = useCallback(
    (view: PauliFieldView) => {
      actions.setPauliFieldView(view)
      const algo = PAULI_FIELD_VIEW_TO_COLOR_ALGO[view]
      if (algo) {
        useAppearanceStore.getState().setColorAlgorithm(algo)
      }
    },
    [actions]
  )

  const latticeDim = pauli.latticeDim ?? dimension

  return (
    <div className="space-y-1" data-testid="pauli-spinor-controls">
      {/* Visualization Mode */}
      <Section title="Visualization" defaultOpen={true}>
        <PauliVisualizationControls
          fieldView={pauli.fieldView}
          onFieldViewChange={handleFieldViewChange}
        />
      </Section>

      {/* Spin State */}
      <Section title="Spin State" defaultOpen={true}>
        <SpinControls
          initialSpinDirection={pauli.initialSpinDirection}
          initialCondition={pauli.initialCondition}
          packetWidth={pauli.packetWidth}
          onSpinDirectionChange={actions.setPauliInitialSpinDirection}
          onInitialConditionChange={actions.setPauliInitialCondition}
          onPacketWidthChange={actions.setPauliPacketWidth}
        />
      </Section>

      {/* Wavepacket Position & Momentum */}
      <Section title="Wavepacket" defaultOpen={false}>
        <div className="space-y-3">
          <p className="text-xs text-text-tertiary uppercase tracking-widest font-bold">Center</p>
          {Array.from({ length: latticeDim }, (_, d) => (
            <Slider
              key={`center-${d}`}
              label={`x${d}`}
              tooltip="Initial center position of the spinor wavepacket along this axis."
              min={-5}
              max={5}
              step={0.1}
              value={pauli.packetCenter[d] ?? 0}
              onChange={(v) => actions.setPauliPacketCenter(d, v)}
              showValue
            />
          ))}
          <p className="text-xs text-text-tertiary uppercase tracking-widest font-bold mt-2">
            Momentum
          </p>
          {Array.from({ length: latticeDim }, (_, d) => (
            <Slider
              key={`momentum-${d}`}
              label={`p${d}`}
              tooltip="Initial momentum of the wavepacket along this axis. Determines propagation direction and speed."
              min={-10}
              max={10}
              step={0.1}
              value={pauli.packetMomentum[d] ?? 0}
              onChange={(v) => actions.setPauliPacketMomentum(d, v)}
              showValue
            />
          ))}
        </div>
      </Section>

      {/* Slice Positions (4D+) */}
      {latticeDim > 3 && (
        <Section title="Slice Positions" defaultOpen={false}>
          <div className="space-y-3">
            {Array.from({ length: latticeDim - 3 }, (_, i) => {
              // pauli.slicePositions is 0-indexed for extra dims to match the
              // writer in PauliComputePassBuffers: positions[0] drives dim 3,
              // positions[1] drives dim 4, etc. Previous code keyed the
              // sliders by the full dim index `d = i + 3`, so user drags never
              // reached the shader (the writer was reading different slots).
              const d = i + 3
              return (
                <Slider
                  key={`slice-${d}`}
                  label={`Dim ${d}`}
                  tooltip="Cross-section position for this extra dimension. Explore different slices of the higher-dimensional spinor field."
                  min={-1}
                  max={1}
                  step={0.01}
                  value={pauli.slicePositions[i] ?? 0}
                  onChange={(v) => actions.setPauliSlicePosition(i, v)}
                  showValue
                />
              )
            })}
          </div>
        </Section>
      )}

      {/* Magnetic Field */}
      <Section title="Magnetic Field" defaultOpen={true}>
        <MagneticFieldControls
          fieldType={pauli.fieldType}
          fieldStrength={pauli.fieldStrength}
          fieldDirection={pauli.fieldDirection}
          gradientStrength={pauli.gradientStrength}
          rotatingFrequency={pauli.rotatingFrequency}
          onFieldTypeChange={actions.setPauliFieldType}
          onFieldStrengthChange={actions.setPauliFieldStrength}
          onFieldDirectionChange={actions.setPauliFieldDirection}
          onGradientStrengthChange={actions.setPauliGradientStrength}
          onRotatingFrequencyChange={actions.setPauliRotatingFrequency}
        />
      </Section>

      {/* Scalar Potential */}
      <Section title="Potential V(x)" defaultOpen={false}>
        <PauliPotentialControls
          potentialType={pauli.potentialType}
          harmonicOmega={pauli.harmonicOmega}
          wellDepth={pauli.wellDepth}
          wellWidth={pauli.wellWidth}
          showPotential={pauli.showPotential}
          onPotentialTypeChange={actions.setPauliPotentialType}
          onHarmonicOmegaChange={actions.setPauliHarmonicOmega}
          onWellDepthChange={actions.setPauliWellDepth}
          onWellWidthChange={actions.setPauliWellWidth}
          onShowPotentialChange={actions.setPauliShowPotential}
        />
      </Section>

      {/* Grid & Physics */}
      <Section title="Grid & Physics" defaultOpen={false}>
        <PauliGridControls
          latticeDim={latticeDim}
          gridSize={pauli.gridSize}
          spacing={pauli.spacing}
          dt={pauli.dt}
          stepsPerFrame={pauli.stepsPerFrame}
          hbar={pauli.hbar}
          mass={pauli.mass}
          onGridSizeChange={actions.setPauliGridSize}
          onSpacingChange={actions.setPauliSpacing}
          onDtChange={actions.setPauliDt}
          onStepsPerFrameChange={actions.setPauliStepsPerFrame}
          onHbarChange={actions.setPauliHbar}
          onMassChange={actions.setPauliMass}
        />
      </Section>

      {/* Lattice info + reset */}
      <div className="px-4 py-2 space-y-2">
        <p className="text-xs text-text-tertiary">
          {latticeDim}D Pauli, {pauli.gridSize.slice(0, latticeDim).join('\u00D7')} sites
          {' \u00B7 '}2-component spinor
        </p>
      </div>
    </div>
  )
})

PauliSpinorControls.displayName = 'PauliSpinorControls'
