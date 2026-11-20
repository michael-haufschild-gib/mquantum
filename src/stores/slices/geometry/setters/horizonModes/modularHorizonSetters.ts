import {
  type HorizonPreset,
  horizonPreset,
  type ModularHorizonConfig,
  validHorizon,
} from '@/lib/geometry/extended/modularHorizon'
import { useAnimationStore } from '@/stores/scene/animationStore'

import type { SetterContext } from '../sliceSetterUtils'

/** Apply a launch state or edit its field and detector parameters. */
export function createModularHorizonSetters(ctx: SetterContext) {
  function edit(partial: Partial<ModularHorizonConfig>) {
    ctx.setWithVersion((state) => ({
      schroedinger: {
        ...state.schroedinger,
        modularHorizon: validHorizon({ ...state.schroedinger.modularHorizon, ...partial }),
      },
    }))
  }
  return {
    setModularHorizonConfig(partial: Partial<ModularHorizonConfig>) {
      if (partial.weights && !partial.weights.some((w) => w > 0)) return
      const preset =
        partial.preset ??
        (partial.weights || partial.raw !== undefined
          ? 'custom'
          : ctx.get().schroedinger.modularHorizon.preset)
      edit({ ...partial, preset })
    },
    setModularHorizonPreset(name: HorizonPreset) {
      if (name === 'custom') return
      edit(horizonPreset(name))
      useAnimationStore.setState({ accumulatedTime: 0 })
    },
  }
}
/** Geometry slice actions for launch presets and custom edits. */
export type ModularHorizonSetters = ReturnType<typeof createModularHorizonSetters>
