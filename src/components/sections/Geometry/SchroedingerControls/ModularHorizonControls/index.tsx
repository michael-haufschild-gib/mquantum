import { ControlGroup } from '@/components/ui/ControlGroup'
import { Slider } from '@/components/ui/Slider'
import { Switch } from '@/components/ui/Switch'
import type { HorizonWeights } from '@/lib/geometry/extended/modularHorizon'
import { frequencies, populations } from '@/lib/physics/modularHorizon'
import { useExtendedObjectStore } from '@/stores/scene/extendedObjectStore'
import { useGeometryStore } from '@/stores/scene/geometryStore'

/** Controls for the three-mode superposition and angular field display. */
export function ModularHorizonControls() {
  const bulk = useGeometryStore((s) => s.dimension === 3)
  const c = useExtendedObjectStore((s) => s.schroedinger.modularHorizon)
  const edit = useExtendedObjectStore((s) => s.setModularHorizonConfig)
  const p = populations(c.weights)
  return (
    <ControlGroup data-testid="horizon-state" title="Modular horizon">
      <p className="text-xs text-text-secondary">
        {bulk
          ? 'Color shows the gravitational master field across the AdS₄ exterior. The view spans radii 1.02 to 4 in AdS units. The horizon is at 1.'
          : 'The Poincaré disk shows the angular modes. Their superposition matches the exterior field at radius 2.'}
      </p>
      {bulk && (
        <Switch
          data-testid="horizon-cutaway"
          tooltip="Remove one longitudinal half to expose the radial interference pattern."
          label="Cut away half the exterior"
          checked={c.cutaway}
          onCheckedChange={(cutaway) => edit({ cutaway })}
        />
      )}
      {c.weights.map((w, i) => (
        <Slider
          key={i}
          data-testid={`horizon-weight-${i}`}
          tooltip="Relative population before normalization across the three modes."
          label={`ν ${frequencies[i]!.toFixed(5)} · ${(100 * p[i]!).toFixed(1)}% population`}
          value={w}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => {
            const weights: HorizonWeights = [...c.weights]
            weights[i] = v
            edit({ weights })
          }}
        />
      ))}
      <Switch
        data-testid="horizon-raw"
        tooltip="Include the shared exponential decay of the gravitational intensity."
        label="Raw ringdown intensity"
        checked={c.raw}
        onCheckedChange={(raw) => edit({ raw })}
      />
      <Switch
        data-testid="horizon-tiles"
        tooltip={
          bulk
            ? 'Trace modular domains at the detector radius.'
            : 'Trace the edges of equivalent modular domains on the disk.'
        }
        label="Modular tessellation"
        checked={c.tessellation}
        onCheckedChange={(tessellation) => edit({ tessellation })}
      />
    </ControlGroup>
  )
}
