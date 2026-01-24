import React, { useState } from 'react'
import { Section } from '@/components/sections/Section'
import { Knob } from '@/components/ui/Knob'
import { Envelope } from '@/components/ui/Envelope'

export interface TestSectionProps {
  defaultOpen?: boolean
}

export const TestSection: React.FC<TestSectionProps> = ({ defaultOpen = false }) => {
  const [attack, setAttack] = useState(0.5)
  const [decay, setDecay] = useState(0.5)

  return (
    <Section title="Test" defaultOpen={defaultOpen}>
      <div className="space-y-6">
        {/* Envelope Visualization */}
        <div className="h-32 bg-panel-bg rounded border border-panel-border p-2">
          <Envelope
            mode="ADSR"
            attack={attack}
            decay={decay}
            sustain={0.5}
            release={0.5}
            height="100%"
          />
        </div>

        {/* Knobs */}
        <div className="flex justify-around items-center">
          <Knob
            label="Attack"
            value={attack}
            min={0.01}
            max={2}
            step={0.01}
            onChange={setAttack}
            size={60}
          />
          <Knob
            label="Decay"
            value={decay}
            min={0}
            max={2}
            step={0.01}
            onChange={setDecay}
            size={60}
          />
        </div>
      </div>
    </Section>
  )
}
