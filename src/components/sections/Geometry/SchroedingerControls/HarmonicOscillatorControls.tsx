/**
 * HarmonicOscillatorControls Component
 *
 * Controls for n-dimensional harmonic oscillator superposition states.
 * Includes preset selection, seed, quantum parameters, and slice controls.
 */

import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { Slider } from '@/components/ui/Slider'
import { Section } from '@/components/sections/Section'
import { SCHROEDINGER_NAMED_PRESETS } from '@/lib/geometry/extended/schroedinger/presets'
import type { SchroedingerPresetName } from '@/lib/geometry/extended/types'
import React from 'react'
import type { HarmonicOscillatorControlsProps } from './types'

/**
 * Preset options for Select component
 */
const presetOptions = [
  ...Object.entries(SCHROEDINGER_NAMED_PRESETS).map(([key, preset]) => ({
    value: key,
    label: preset.name,
  })),
  { value: 'custom', label: 'Custom Configuration' },
]

/**
 * HarmonicOscillatorControls component
 *
 * Provides controls for harmonic oscillator quantum states:
 * - Preset selection
 * - Seed randomization
 * - Quantum parameters (term count, max n, frequency spread)
 * - Field scale
 * - Slice parameters for 4D+
 */
export const HarmonicOscillatorControls: React.FC<HarmonicOscillatorControlsProps> = React.memo(
  ({ config, dimension, actions }) => {
    const {
      setPresetName,
      setSeed,
      randomizeSeed,
      setTermCount,
      setMaxQuantumNumber,
      setFrequencySpread,
      setFieldScale,
      setSchroedingerParameterValue,
      resetSchroedingerParameters,
    } = actions

    return (
      <>
        {/* Quantum State Controls */}
        <div className="space-y-2">
          <Select
            label="Quantum Preset"
            options={presetOptions}
            value={config.presetName}
            onChange={(v) => setPresetName(v as SchroedingerPresetName)}
            data-testid="schroedinger-preset-select"
          />
          <p className="text-xs text-text-tertiary pt-1">
            {SCHROEDINGER_NAMED_PRESETS[config.presetName]?.description}
          </p>
        </div>

        {/* Seed Control */}
        <div className="space-y-2 pt-2 border-t border-border-subtle">
          <div className="flex items-center justify-between">
            <label className="text-xs text-[var(--text-secondary)]">Seed: {config.seed}</label>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => randomizeSeed()}
              data-testid="schroedinger-randomize-seed"
            >
              Randomize
            </Button>
          </div>
          <Slider
            label="Seed"
            min={0}
            max={999999}
            step={1}
            value={config.seed}
            onChange={setSeed}
            showValue={false}
            data-testid="schroedinger-seed-slider"
          />
        </div>

        {/* Quantum Parameters */}
        <div className="space-y-2 pt-2 border-t border-border-subtle">
          <Slider
            label="Superposition Terms"
            min={1}
            max={8}
            step={1}
            value={config.termCount}
            onChange={setTermCount}
            showValue
            data-testid="schroedinger-term-count"
          />

          <Slider
            label="Max Quantum Number (n)"
            min={2}
            max={6}
            step={1}
            value={config.maxQuantumNumber}
            onChange={setMaxQuantumNumber}
            showValue
            data-testid="schroedinger-max-quantum"
          />

          <Slider
            label="Frequency Spread"
            min={0}
            max={0.5}
            step={0.0001}
            value={config.frequencySpread}
            onChange={setFrequencySpread}
            showValue
            data-testid="schroedinger-freq-spread"
          />
        </div>

        {/* Geometric Parameters */}
        <div className="space-y-2 pt-2 border-t border-border-subtle">
          <Slider
            label="Field Scale"
            min={0.5}
            max={2.0}
            step={0.1}
            value={config.fieldScale}
            onChange={setFieldScale}
            showValue
            data-testid="schroedinger-field-scale"
          />
        </div>

        {/* Slice Parameters - shown for 4D+ */}
        {dimension >= 4 && (
          <Section
            title={`Cross Section (${dimension - 3} dim${dimension > 4 ? 's' : ''})`}
            defaultOpen={true}
            onReset={() => resetSchroedingerParameters()}
          >
            {Array.from({ length: dimension - 3 }, (_, i) => (
              <Slider
                key={`slice-dim-${i + 3}`}
                label={`Dim ${i + 3}`}
                min={-2.0}
                max={2.0}
                step={0.1}
                value={config.parameterValues[i] ?? 0}
                onChange={(v) => setSchroedingerParameterValue(i, v)}
                showValue
                data-testid={`schroedinger-slice-dim-${i + 3}`}
              />
            ))}
            <p className="text-xs text-text-tertiary">
              Explore different {dimension}D cross-sections
            </p>
          </Section>
        )}
      </>
    )
  }
)

HarmonicOscillatorControls.displayName = 'HarmonicOscillatorControls'
