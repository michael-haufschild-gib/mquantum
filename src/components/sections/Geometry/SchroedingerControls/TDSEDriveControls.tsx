/**
 * TDSEDriveControls — time-dependent drive sub-panel for the 'driven' potential.
 *
 * Extracted from TDSEPotentialControls to keep file sizes under the max-lines limit.
 *
 * @module components/sections/Geometry/SchroedingerControls/TDSEDriveControls
 */

import React from 'react'

import { Select } from '@/components/ui/Select'
import { Slider } from '@/components/ui/Slider'
import { Switch } from '@/components/ui/Switch'
import type { TdseConfig, TdseDriveWaveform } from '@/lib/geometry/extended/types'

import { DRIVE_WAVEFORM_OPTIONS } from './tdseControlsConstants'
import type { TdseActions } from './types'

/** Props for TDSEDriveControls. */
interface TDSEDriveControlsProps {
  td: TdseConfig
  actions: TdseActions
}

/**
 * Drive-parameter controls (waveform, frequency, amplitude) shown only when
 * the 'driven' potential type is active.
 *
 * @param props - Component props
 * @returns React element
 */
export const TDSEDriveControls: React.FC<TDSEDriveControlsProps> = React.memo(({ td, actions }) => {
  return (
    <div className="border-t border-border-subtle pt-3 space-y-3">
      <Switch
        label="Drive"
        tooltip="Enable a time-dependent oscillating force on the potential barrier."
        checked={td.driveEnabled}
        onCheckedChange={actions.setDriveEnabled}
        data-testid="tdse-drive-enabled"
      />
      {td.driveEnabled && (
        <>
          <Select
            label="Waveform"
            tooltip="Shape of the driving oscillation: sinusoidal, square, or sawtooth."
            options={DRIVE_WAVEFORM_OPTIONS}
            value={td.driveWaveform}
            onChange={(v) => actions.setDriveWaveform(v as TdseDriveWaveform)}
            data-testid="tdse-drive-waveform"
          />
          <Slider
            label="Frequency"
            tooltip="Angular frequency of the driving force. Resonances occur at natural transition frequencies."
            min={0.01}
            max={10}
            step={0.01}
            value={td.driveFrequency}
            onChange={actions.setDriveFrequency}
            showValue
            data-testid="tdse-drive-frequency"
          />
          <Slider
            label="Amplitude"
            tooltip="Peak strength of the driving perturbation in energy units."
            min={0}
            max={50}
            step={0.1}
            value={td.driveAmplitude}
            onChange={actions.setDriveAmplitude}
            showValue
            data-testid="tdse-drive-amplitude"
          />
        </>
      )}
    </div>
  )
})

TDSEDriveControls.displayName = 'TDSEDriveControls'
