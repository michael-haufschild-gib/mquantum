/**
 * RotationAnimationDrawer Component
 *
 * Drawer for selecting and configuring the N-dimensional rotation planes.
 * Self-contained: subscribes to its own store slices.
 */

import React, { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { Slider } from '@/components/ui/Slider'
import { ToggleButton } from '@/components/ui/ToggleButton'
import { getRotationPlanes } from '@/lib/math'
import { type AnimationState, useAnimationStore } from '@/stores/animationStore'
import { MAX_ANIMATION_BIAS, MIN_ANIMATION_BIAS } from '@/stores/defaults/visualDefaults'
import { useGeometryStore } from '@/stores/geometryStore'
import { useUIStore } from '@/stores/uiStore'

import { AnimationDrawerContainer } from './AnimationDrawerContainer'
import { DrawerSection } from './DrawerSection'

/** Props for the rotation drawer. */
export interface RotationAnimationDrawerProps {
  onClose?: () => void
}

export const RotationAnimationDrawer: React.FC<RotationAnimationDrawerProps> = React.memo(
  ({ onClose }) => {
    const dimension = useGeometryStore((state) => state.dimension)

    const { animatingPlanes, togglePlane, animateAll, randomizePlanes, clearAllPlanes } =
      useAnimationStore(
        useShallow((state: AnimationState) => ({
          animatingPlanes: state.animatingPlanes,
          togglePlane: state.togglePlane,
          animateAll: state.animateAll,
          randomizePlanes: state.randomizePlanes,
          clearAllPlanes: state.clearAllPlanes,
        }))
      )

    const { animationBias, setAnimationBias } = useUIStore(
      useShallow((state) => ({
        animationBias: state.animationBias,
        setAnimationBias: state.setAnimationBias,
      }))
    )

    const planes = useMemo(() => getRotationPlanes(dimension), [dimension])

    return (
      <AnimationDrawerContainer onClose={onClose} fullWidth data-testid="rotation-animation-drawer">
        {/* Single column: planes + speed bias below with divider */}
        <DrawerSection
          title="Rotation Planes"
          className="col-span-full"
          headerActions={
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => animateAll(dimension)}
                className="text-xs uppercase font-bold text-accent hover:text-accent-glow px-2 py-1"
              >
                Select All
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={clearAllPlanes}
                className="text-xs uppercase font-bold px-2 py-1"
              >
                Deselect All
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => randomizePlanes(dimension)}
                ariaLabel="Randomize rotation planes"
                className="w-7 h-7 p-0 rounded-lg flex items-center justify-center text-text-secondary hover:text-accent"
              >
                <Icon name="dice" size={14} />
              </Button>
            </>
          }
        >
          {/* Rotation Planes */}
          <div className="flex flex-wrap gap-2  max-h-[200px] overflow-y-auto scrollbar-thin scrollbar-thumb-panel-border">
            {planes.map((plane) => {
              const isActive = animatingPlanes.has(plane.name)
              return (
                <ToggleButton
                  key={plane.name}
                  pressed={isActive}
                  onToggle={() => togglePlane(plane.name)}
                  ariaLabel={`Toggle ${plane.name} rotation`}
                  tooltip={`Toggle ${plane.name} rotation`}
                  className="flex-1 min-w-[60px] px-3 py-2 text-xs font-mono text-center uppercase tracking-wider"
                >
                  {plane.name}
                </ToggleButton>
              )
            })}
          </div>

          <div className="pt-3">
            <Slider
              label="PLANE SPEED BIAS"
              tooltip="Varies rotation speed per plane. At 0 all planes rotate uniformly; at 1 each plane gets a unique speed spread via the golden ratio."
              min={MIN_ANIMATION_BIAS}
              max={MAX_ANIMATION_BIAS}
              step={0.05}
              value={animationBias}
              onChange={setAnimationBias}
              showValue
            />
          </div>
        </DrawerSection>
      </AnimationDrawerContainer>
    )
  }
)

RotationAnimationDrawer.displayName = 'RotationAnimationDrawer'
