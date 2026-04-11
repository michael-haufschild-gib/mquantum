/**
 * FreeScalarFieldControls Component
 *
 * Controls for configuring the free Klein-Gordon scalar field lattice simulation.
 * Supports N-dimensional lattices (1-11D) driven by the global dimension selector.
 * Provides lattice setup, initial condition selection, slice position controls
 * for extra dimensions (d>3), and field view controls.
 */

import React, { useCallback, useMemo } from 'react'

import { Button } from '@/components/ui/Button'
import { ControlGroup } from '@/components/ui/ControlGroup'
import { NumberInput } from '@/components/ui/NumberInput'
import { Select } from '@/components/ui/Select'
import { Slider } from '@/components/ui/Slider'
import { Switch } from '@/components/ui/Switch'
import { ToggleGroup } from '@/components/ui/ToggleGroup'
import { ALL_GRID_SIZE_OPTIONS, AXIS_LABELS } from '@/constants/dimension'
import type { FreeScalarFieldView, FreeScalarInitialCondition } from '@/lib/geometry/extended/types'
import { MAX_TOTAL_SITES } from '@/stores/slices/geometry/setters/sliceSetterUtils'

import { CosmologyControls } from './CosmologyControls'
import { PreheatingControls } from './PreheatingControls'
import type { FreeScalarFieldControlsProps } from './types'

/**
 * FreeScalarFieldControls component
 *
 * Provides controls for Klein-Gordon scalar field simulation:
 * - Lattice dimension info (driven by global dimension selector)
 * - Grid size, mass parameter, time step, steps per frame
 * - Initial condition selection with mode-specific parameters
 * - Slice position controls for extra dimensions (d > 3)
 * - Field view selection (phi, pi, energy density)
 * - Memory budget display
 *
 * @param props - Component props
 * @param props.config - Full Schroedinger config containing freeScalar sub-config
 * @param props.dimension - Current global dimension (drives latticeDim)
 * @param props.actions - Store action callbacks
 * @returns React component
 */
export const FreeScalarFieldControls: React.FC<FreeScalarFieldControlsProps> = React.memo(
  ({ config, dimension: _dimension, actions }) => {
    const fs = config.freeScalar

    const {
      setGridSize,
      setSpacing,
      setMass,
      setDt,
      setStepsPerFrame,
      setInitialCondition,
      setFieldView,
      setPacketCenter,
      setPacketWidth,
      setPacketAmplitude,
      setModeK,
      setVacuumSeed,
      setSlicePosition,
      setSelfInteractionEnabled,
      setSelfInteractionLambda,
      setSelfInteractionVev,
    } = actions

    const isVacuum = fs.initialCondition === 'vacuumNoise'
    const latticeDim = fs.latticeDim

    // Initial condition options
    const initConditionOptions = useMemo(() => {
      const opts = [
        { value: 'vacuumNoise', label: 'Exact Vacuum' },
        { value: 'singleMode', label: 'Single Mode' },
        { value: 'gaussianPacket', label: 'Gaussian Packet' },
      ]
      if (fs.selfInteractionEnabled) {
        opts.push({ value: 'kinkProfile', label: 'Kink (tanh)' })
      }
      return opts
    }, [fs.selfInteractionEnabled])

    // Field view options
    const fieldViewOptions = useMemo(() => {
      const opts = [
        { value: 'phi', label: 'φ' },
        { value: 'pi', label: 'π' },
        { value: 'energyDensity', label: 'ε' },
      ]
      if (fs.selfInteractionEnabled) {
        opts.push({ value: 'wallDensity', label: 'V(φ)' })
      }
      return opts
    }, [fs.selfInteractionEnabled])

    // Power-of-2 grid size handler (from Select)
    const handlePow2GridSize = useCallback(
      (v: string) => {
        const s = Number(v)
        const gs = Array.from({ length: latticeDim }, (_, d) => (d < latticeDim ? s : 1))
        setGridSize(gs)
      },
      [latticeDim, setGridSize]
    )

    const handleInitCondition = useCallback(
      (v: string) => {
        setInitialCondition(v as FreeScalarInitialCondition)
      },
      [setInitialCondition]
    )

    const handleFieldView = useCallback(
      (v: string) => {
        setFieldView(v as FreeScalarFieldView)
      },
      [setFieldView]
    )

    // Mode K handler for a specific dimension
    const handleModeK = useCallback(
      (dimIdx: number, v: number) => {
        const newK = [...fs.modeK]
        newK[dimIdx] = Math.round(v)
        setModeK(newK)
      },
      [fs.modeK, setModeK]
    )

    // Spacing handler — uniform spacing for all active dimensions
    const handleSpacing = useCallback(
      (v: number) => {
        const s = Array.from({ length: latticeDim }, () => v)
        setSpacing(s)
      },
      [latticeDim, setSpacing]
    )

    // Packet center handler for a specific dimension
    const handlePacketCenter = useCallback(
      (dimIdx: number, v: number) => {
        const newCenter = [...fs.packetCenter]
        newCenter[dimIdx] = v
        setPacketCenter(newCenter)
      },
      [fs.packetCenter, setPacketCenter]
    )

    // Vacuum seed randomize
    const handleRandomizeSeed = useCallback(() => {
      setVacuumSeed(Math.floor(Math.random() * 2147483647))
    }, [setVacuumSeed])

    const activeGridSize = fs.gridSize[0] ?? 16

    // Compute memory estimate
    const totalSites = useMemo(() => {
      let sites = 1
      for (let d = 0; d < latticeDim; d++) {
        sites *= fs.gridSize[d] ?? 1
      }
      return sites
    }, [fs.gridSize, latticeDim])

    const memoryKB = Math.round((totalSites * 2 * 4) / 1024)

    // Max grid size for current dimension (budget cap)
    const maxGridPerDim = useMemo(() => {
      const raw = Math.round(Math.pow(MAX_TOTAL_SITES, 1 / latticeDim))
      // Round down to nearest power-of-2 to match store logic and dropdown options
      const pow2 = 2 ** Math.floor(Math.log2(Math.max(2, raw)))
      return Math.max(2, Math.min(128, pow2))
    }, [latticeDim])

    // Filter power-of-2 options by budget
    const filteredPow2Options = useMemo(
      () => ALL_GRID_SIZE_OPTIONS.filter((opt) => Number(opt.value) <= maxGridPerDim),
      [maxGridPerDim]
    )

    return (
      <div className="space-y-1">
        <ControlGroup
          title="Lattice"
          collapsible
          defaultOpen
          data-testid="control-group-fsf-lattice"
        >
          <div className="text-xs text-text-secondary">
            Lattice: {latticeDim}D (set via dimension selector)
          </div>
          {latticeDim === 1 && (
            <div className="text-xs text-text-secondary/70 italic">
              1D field rendered as glowing tube with Gaussian falloff
            </div>
          )}
          {latticeDim === 2 && (
            <div className="text-xs text-text-secondary/70 italic">
              2D field rendered as glowing sheet with Gaussian falloff
            </div>
          )}
          <Select
            label="Grid Size"
            tooltip="Number of lattice sites per dimension. Total sites = N^d; larger grids resolve shorter wavelengths but cost more memory."
            options={filteredPow2Options}
            value={String(activeGridSize)}
            onChange={handlePow2GridSize}
            data-testid="grid-size-select"
          />
          <Slider
            label="Spacing (a)"
            tooltip="Lattice spacing in natural units. Smaller spacing resolves higher momenta but requires smaller dt for stability (CFL condition)."
            min={0.01}
            max={1.0}
            step={0.01}
            value={fs.spacing[0] ?? 0.1}
            onChange={handleSpacing}
            showValue
            data-testid="spacing-slider"
          />
          <Slider
            label="Mass (m)"
            tooltip="Klein-Gordon mass parameter. At m=0, the field is massless (like photons). Higher mass shortens the Compton wavelength and increases the energy gap."
            min={0.0}
            max={10.0}
            step={0.1}
            value={fs.mass}
            onChange={setMass}
            showValue
            data-testid="mass-slider"
          />
          <Slider
            label="Time Step (dt)"
            tooltip="Discrete time step for the leapfrog integrator. Must satisfy dt < a for CFL stability on the lattice."
            min={0.001}
            max={0.1}
            step={0.001}
            value={fs.dt}
            onChange={setDt}
            showValue
            data-testid="dt-slider"
          />
          <Slider
            label="Steps / Frame"
            tooltip="Number of leapfrog integration steps computed per rendered frame. More steps per frame speeds up the simulation."
            min={1}
            max={16}
            step={1}
            value={fs.stepsPerFrame}
            onChange={setStepsPerFrame}
            showValue
            data-testid="steps-per-frame-slider"
          />
          <div className="text-xs text-text-tertiary">
            {totalSites.toLocaleString()} sites ({maxGridPerDim}^{latticeDim} max) · {memoryKB} KB
          </div>
        </ControlGroup>

        {latticeDim > 3 && (
          <ControlGroup
            title="Slice Positions"
            collapsible
            defaultOpen={false}
            data-testid="control-group-fsf-slices"
          >
            {Array.from({ length: latticeDim - 3 }, (_, i) => {
              const dimIdx = i + 3
              const halfExtent =
                ((fs.gridSize[dimIdx] ?? 4) * (fs.spacing[dimIdx] ?? fs.spacing[0] ?? 0.1)) / 2
              return (
                <Slider
                  key={`slice-${dimIdx}`}
                  label={`${AXIS_LABELS[dimIdx] ?? `d${dimIdx}`} slice`}
                  tooltip="Position along this extra dimension at which the field is sliced for 3D visualization."
                  min={-halfExtent}
                  max={halfExtent}
                  step={halfExtent / 20}
                  value={fs.slicePositions[i] ?? 0}
                  onChange={(v) => setSlicePosition(i, v)}
                  showValue
                />
              )
            })}
          </ControlGroup>
        )}

        <ControlGroup
          title="Self-Interaction"
          collapsible
          defaultOpen={false}
          data-testid="control-group-fsf-self-interaction"
          rightElement={
            <Switch
              checked={fs.selfInteractionEnabled}
              onCheckedChange={setSelfInteractionEnabled}
            />
          }
        >
          {fs.selfInteractionEnabled && (
            <>
              <Slider
                label="λ"
                tooltip="Self-interaction coupling constant. Controls the strength of the quartic potential V(φ) = λ(φ² − v²)². Larger λ gives steeper potential walls."
                min={0.01}
                max={10.0}
                step={0.01}
                value={fs.selfInteractionLambda}
                onChange={setSelfInteractionLambda}
                showValue
              />
              <Slider
                label="v (VEV)"
                tooltip="Vacuum expectation value — the field's ground state value. The potential has minima at φ = ±v, enabling domain wall (kink) solutions."
                min={0.1}
                max={5.0}
                step={0.01}
                value={fs.selfInteractionVev}
                onChange={setSelfInteractionVev}
                showValue
              />
              <div className="text-xs text-text-tertiary">V(φ) = λ(φ² − v²)², minima at φ = ±v</div>
            </>
          )}
        </ControlGroup>

        <ControlGroup
          title="Initial Condition"
          collapsible
          defaultOpen
          data-testid="control-group-fsf-initial"
        >
          <Select
            label="Initial Condition"
            tooltip="Starting field configuration: vacuum fluctuations, a plane-wave mode, or a localized Gaussian wave packet."
            options={initConditionOptions}
            value={fs.initialCondition}
            onChange={handleInitCondition}
            data-testid="init-condition-select"
          />

          {isVacuum && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <NumberInput
                  label="Seed"
                  tooltip="Random seed for generating vacuum fluctuations. Different seeds produce different quantum noise realizations."
                  value={fs.vacuumSeed}
                  onChange={setVacuumSeed}
                  min={0}
                  max={2147483647}
                  step={1}
                  data-testid="vacuum-seed-input"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleRandomizeSeed}
                  data-testid="randomize-seed-button"
                >
                  Randomize
                </Button>
              </div>
            </div>
          )}

          {!isVacuum && (
            <Slider
              label="Amplitude"
              tooltip="Peak field amplitude of the initial excitation. Larger values store more energy in the field configuration."
              min={0.1}
              max={5.0}
              step={0.1}
              value={fs.packetAmplitude}
              onChange={setPacketAmplitude}
              showValue
              data-testid="amplitude-slider"
            />
          )}

          {fs.initialCondition === 'singleMode' && (
            <div className="space-y-2">
              {Array.from({ length: latticeDim }, (_, d) => (
                <Slider
                  key={`modeK-${d}`}
                  label={`k_${AXIS_LABELS[d] ?? d}`}
                  tooltip="Integer lattice momentum quantum number along this axis. Frequency is ω² = Σ(2sin(kπ/N)/a)² + m²."
                  min={-8}
                  max={8}
                  step={1}
                  value={fs.modeK[d] ?? 0}
                  onChange={(v) => handleModeK(d, v)}
                  showValue
                />
              ))}
            </div>
          )}

          {fs.initialCondition === 'gaussianPacket' && (
            <div className="space-y-2">
              <Slider
                label="Packet Width (σ)"
                tooltip="Gaussian envelope width in lattice units. Narrower packets have broader momentum spread (Heisenberg uncertainty)."
                min={0.05}
                max={2.0}
                step={0.05}
                value={fs.packetWidth}
                onChange={setPacketWidth}
                showValue
              />
              {Array.from({ length: latticeDim }, (_, d) => (
                <Slider
                  key={`center-${d}`}
                  label={`Center ${AXIS_LABELS[d] ?? d}`}
                  tooltip="Initial center position of the Gaussian wave packet along this axis."
                  min={-5.0}
                  max={5.0}
                  step={0.1}
                  value={fs.packetCenter[d] ?? 0}
                  onChange={(v) => handlePacketCenter(d, v)}
                  showValue
                />
              ))}
              {Array.from({ length: latticeDim }, (_, d) => (
                <Slider
                  key={`modeK-${d}`}
                  label={`k_${AXIS_LABELS[d] ?? d}`}
                  tooltip="Central momentum of the wave packet along this axis. Determines the packet's group velocity."
                  min={-8}
                  max={8}
                  step={1}
                  value={fs.modeK[d] ?? 0}
                  onChange={(v) => handleModeK(d, v)}
                  showValue
                />
              ))}
            </div>
          )}
        </ControlGroup>

        <CosmologyControls
          cosmology={fs.cosmology}
          latticeDim={latticeDim}
          gridSize={fs.gridSize}
          spacing={fs.spacing}
          selfInteractionEnabled={fs.selfInteractionEnabled}
          actions={actions}
        />

        <PreheatingControls preheating={fs.preheating} mass={fs.mass} actions={actions} />

        <ControlGroup
          title="Field View"
          collapsible
          defaultOpen
          data-testid="control-group-fsf-field-view"
        >
          <ToggleGroup
            options={fieldViewOptions}
            value={fs.fieldView}
            onChange={handleFieldView}
            ariaLabel="Field view"
            tooltip={
              fs.cosmology.enabled
                ? 'Displayed field quantity: δφ (scalar field perturbation), π (conjugate momentum), or ε (proper energy density per comoving observer).'
                : 'Displayed field quantity: φ (field value), π (conjugate momentum ∂φ/∂t), or ε (energy density).'
            }
            data-testid="field-view-selector"
          />
          {fs.cosmology.enabled && (
            <div className="text-xs text-text-tertiary italic">
              Cosmology active: displaying canonical δφ, π, and proper ε.
            </div>
          )}
        </ControlGroup>
      </div>
    )
  }
)

FreeScalarFieldControls.displayName = 'FreeScalarFieldControls'
