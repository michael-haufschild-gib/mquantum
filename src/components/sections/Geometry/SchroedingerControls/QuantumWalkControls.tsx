/**
 * QuantumWalkControls Component
 *
 * Controls for discrete-time quantum walk on N-D lattice.
 * Includes coin type selection, grid size, steps per frame, and field view.
 *
 * @module components/sections/Geometry/SchroedingerControls/QuantumWalkControls
 */

import React, { useCallback, useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { Select } from '@/components/ui/Select'
import { Slider } from '@/components/ui/Slider'
import { ToggleGroup } from '@/components/ui/ToggleGroup'
import type { QuantumWalkCoinType, QuantumWalkFieldView } from '@/lib/geometry/extended/quantumWalk'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'
import { useGeometryStore } from '@/stores/geometryStore'

const COIN_TYPE_OPTIONS = [
  { value: 'grover', label: 'Grover' },
  { value: 'hadamard', label: 'Hadamard' },
  { value: 'dft', label: 'DFT' },
]

const FIELD_VIEW_OPTIONS = [
  { value: 'probability', label: 'P(x)' },
  { value: 'phase', label: 'Phase' },
  { value: 'coinState', label: 'Coin' },
]

const GRID_SIZE_OPTIONS = [
  { value: '16', label: '16' },
  { value: '32', label: '32' },
  { value: '64', label: '64' },
  { value: '128', label: '128' },
]

/**
 * Controls for quantum walk mode.
 *
 * @returns Quantum walk configuration UI
 */
export const QuantumWalkControls: React.FC = React.memo(() => {
  const dimension = useGeometryStore((s) => s.dimension)
  const { qw, setConfig } = useExtendedObjectStore(
    useShallow((s) => ({
      qw: s.schroedinger.quantumWalk,
      setConfig: s.setSchroedingerConfig,
    }))
  )

  const updateQW = useCallback(
    (patch: Record<string, unknown>) => {
      setConfig({ quantumWalk: { ...qw, ...patch } })
    },
    [qw, setConfig]
  )

  const handleGridSize = useCallback(
    (v: string) => {
      const size = Number(v)
      const gridSize = Array.from({ length: dimension }, () => size)
      const initialPosition = gridSize.map((s) => Math.floor(s / 2))
      updateQW({ gridSize, latticeDim: dimension, initialPosition, steps: 0, needsReset: true })
    },
    [dimension, updateQW]
  )

  const activeGridSize = qw.gridSize[0] ?? 64

  const maxGridPerDim = useMemo(() => {
    const maxTotal = 262144
    const raw = Math.floor(Math.pow(maxTotal, 1 / dimension))
    return Math.min(128, 2 ** Math.floor(Math.log2(Math.max(2, raw))))
  }, [dimension])

  const filteredGridOptions = useMemo(
    () => GRID_SIZE_OPTIONS.filter((o) => Number(o.value) <= maxGridPerDim),
    [maxGridPerDim]
  )

  return (
    <div className="space-y-4" data-testid="quantum-walk-controls">
      {/* Coin Type */}
      <ToggleGroup
        options={COIN_TYPE_OPTIONS}
        value={qw.coinType}
        onChange={(v) =>
          updateQW({ coinType: v as QuantumWalkCoinType, steps: 0, needsReset: true })
        }
        ariaLabel="Coin operator type"
        tooltip="Coin operator applied at each step. Grover creates localization, Hadamard gives asymmetric spreading, DFT gives uniform phase distribution."
        data-testid="qw-coin-type"
      />

      {/* Coin Bias — only for Hadamard */}
      {qw.coinType === 'hadamard' && (
        <Slider
          label="Coin Bias"
          tooltip="Bias angle θ for H(θ) = [[cos θ, sin θ],[sin θ, -cos θ]]. 0.5 = standard Hadamard. Lower values bias leftward, higher rightward."
          min={0.01}
          max={0.99}
          step={0.01}
          value={qw.coinBias}
          onChange={(v) => updateQW({ coinBias: v, steps: 0, needsReset: true })}
          showValue
          data-testid="qw-coin-bias"
        />
      )}

      {/* Grid Size */}
      <Select
        label="Grid Size"
        tooltip="Per-dimension lattice size. Larger grids show more walk evolution but use more memory."
        options={filteredGridOptions}
        value={String(activeGridSize)}
        onChange={handleGridSize}
        data-testid="qw-grid-size"
      />

      {/* Steps Per Frame */}
      <Slider
        label="Steps / Frame"
        tooltip="Number of quantum walk steps computed per animation frame. Higher values evolve faster."
        min={1}
        max={16}
        step={1}
        value={qw.stepsPerFrame}
        onChange={(v) => updateQW({ stepsPerFrame: v })}
        showValue
        data-testid="qw-steps-per-frame"
      />

      {/* Field View */}
      <ToggleGroup
        options={FIELD_VIEW_OPTIONS}
        value={qw.fieldView}
        onChange={(v) => updateQW({ fieldView: v as QuantumWalkFieldView })}
        ariaLabel="Field view"
        tooltip="Displayed quantity: P(x) shows position probability, Phase shows complex phase, Coin shows the internal coin state."
        data-testid="qw-field-view"
      />

      {/* Info */}
      <div className="text-xs text-text-tertiary">
        {dimension}D lattice, {activeGridSize}^{dimension} ={' '}
        {Math.pow(activeGridSize, dimension).toLocaleString()} sites
      </div>
    </div>
  )
})

QuantumWalkControls.displayName = 'QuantumWalkControls'
