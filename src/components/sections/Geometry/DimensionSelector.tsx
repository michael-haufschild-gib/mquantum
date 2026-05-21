/**
 * Dimension Selector Component
 * Allows users to select the number of dimensions (3D, 4D, 5D, 6D)
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { ToggleGroup } from '@/components/ui/ToggleGroup'
import { MAX_DIMENSION, MIN_DIMENSION } from '@/constants/dimension'
import { getQuantumTypeEntry, resolveQuantumTypeKey } from '@/lib/geometry/registry'
import { useExtendedObjectStore } from '@/stores/scene/extendedObjectStore'
import { type GeometryState, useGeometryStore } from '@/stores/scene/geometryStore'

/** Props for the dimension (2-11D) selector control. */
export interface DimensionSelectorProps {
  className?: string
  disabled?: boolean
}

/** Base dimension values (MIN_DIMENSION to MAX_DIMENSION). */
const DIMENSION_VALUES: number[] = (() => {
  const vals = []
  for (let d = MIN_DIMENSION; d <= MAX_DIMENSION; d++) vals.push(d)
  return vals
})()

export const DimensionSelector: React.FC<DimensionSelectorProps> = React.memo(
  ({ className = '', disabled = false }) => {
    // Consolidate store subscriptions with useShallow to reduce re-renders
    const geometrySelector = useShallow((state: GeometryState) => ({
      dimension: state.dimension,
      objectType: state.objectType,
      setDimension: state.setDimension,
    }))
    const { dimension, objectType, setDimension } = useGeometryStore(geometrySelector)
    const quantumMode = useExtendedObjectStore((s) => s.schroedinger.quantumMode)

    // Compute per-option disabled state from the active quantum type's dimension range
    const dimensionOptions = useMemo(() => {
      const qtKey = resolveQuantumTypeKey(objectType, quantumMode)
      const entry = qtKey ? getQuantumTypeEntry(qtKey) : undefined
      const minDim = entry?.dimensions.min ?? MIN_DIMENSION
      const maxDim = entry?.dimensions.max ?? MAX_DIMENSION
      return DIMENSION_VALUES.map((d) => ({
        value: String(d),
        label: `${d}D`,
        disabled: d < minDim || d > maxDim,
      }))
    }, [objectType, quantumMode])

    const scrollContainerRef = useRef<HTMLDivElement>(null)
    const [canScrollLeft, setCanScrollLeft] = useState(false)
    const [canScrollRight, setCanScrollRight] = useState(false)

    // Optimized Scroll Checking using ResizeObserver to avoid forced reflows
    useEffect(() => {
      const container = scrollContainerRef.current
      if (!container) return

      const checkScroll = () => {
        if (!container) return
        const { scrollLeft, scrollWidth, clientWidth } = container
        setCanScrollLeft(scrollLeft > 0)
        setCanScrollRight(Math.ceil(scrollLeft + clientWidth) < scrollWidth)
      }

      const resizeObserver = new ResizeObserver(() => {
        requestAnimationFrame(checkScroll)
      })

      resizeObserver.observe(container)

      // Initial check
      requestAnimationFrame(checkScroll)

      // Throttled scroll handler
      let rafId: number | null = null
      const handleScroll = () => {
        if (rafId) return
        rafId = requestAnimationFrame(() => {
          checkScroll()
          rafId = null
        })
      }

      container.addEventListener('scroll', handleScroll, { passive: true })

      return () => {
        resizeObserver.disconnect()
        container.removeEventListener('scroll', handleScroll)
        if (rafId) cancelAnimationFrame(rafId)
      }
    }, []) // Run once on mount

    // Re-check when dimension changes (content size might change if styling changes)
    useEffect(() => {
      let rafId: number | null = null

      if (scrollContainerRef.current) {
        rafId = requestAnimationFrame(() => {
          if (scrollContainerRef.current) {
            const { scrollLeft, scrollWidth, clientWidth } = scrollContainerRef.current
            setCanScrollLeft(scrollLeft > 0)
            setCanScrollRight(Math.ceil(scrollLeft + clientWidth) < scrollWidth)
          }
        })
      }

      return () => {
        if (rafId !== null) {
          cancelAnimationFrame(rafId)
        }
      }
    }, [dimension])

    const scrollLeft = useCallback((e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (scrollContainerRef.current) {
        const scrollAmount = 150
        scrollContainerRef.current.scrollBy({
          left: -scrollAmount,
          behavior: 'smooth',
        })
      }
    }, [])

    const scrollRight = useCallback((e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (scrollContainerRef.current) {
        const scrollAmount = 150
        scrollContainerRef.current.scrollBy({
          left: scrollAmount,
          behavior: 'smooth',
        })
      }
    }, [])

    const handleChange = useCallback(
      (value: string) => {
        const newDimension = parseInt(value, 10)
        if (!isNaN(newDimension)) {
          setDimension(newDimension)
        }
      },
      [setDimension]
    )

    const handlePreventDefault = (e: React.PointerEvent | React.MouseEvent) => {
      e.stopPropagation()
      e.preventDefault()
    }

    return (
      <div className={`${className}`}>
        <div className="relative group">
          {canScrollLeft && (
            <div
              className="absolute start-0 top-0 bottom-0 z-20 flex items-center"
              onPointerDown={handlePreventDefault}
              onMouseDown={handlePreventDefault}
              title="Stops the dimension list from scrolling on edge press"
            >
              <Button
                variant="ghost"
                size="icon"
                onClick={scrollLeft}
                className="h-full rounded-l-lg rounded-r-none border-none bg-gradient-to-r from-panel-bg via-panel-bg/90 to-transparent hover:bg-gradient-to-r px-1 w-auto"
                ariaLabel="Scroll left"
                tooltip="Scroll the dimension list left"
              >
                <Icon name="chevron-left" />
              </Button>
            </div>
          )}

          <div ref={scrollContainerRef} className="overflow-x-auto scrollbar-none">
            <ToggleGroup
              options={dimensionOptions}
              value={String(dimension)}
              onChange={handleChange}
              disabled={disabled}
              fullWidth
              ariaLabel="Select dimension"
              tooltip="Number of spatial dimensions for the quantum system. Higher dimensions show richer structure but require more computation."
              className="min-w-full w-max flex-nowrap"
              data-testid="dimension-selector"
            />
          </div>

          {canScrollRight && (
            <div
              className="absolute end-0 top-0 bottom-0 z-20 flex items-center"
              onPointerDown={handlePreventDefault}
              onMouseDown={handlePreventDefault}
              title="Stops the dimension list from scrolling on edge press"
            >
              <Button
                variant="ghost"
                size="icon"
                onClick={scrollRight}
                className="h-full rounded-r-lg rounded-l-none border-none bg-gradient-to-l from-panel-bg via-panel-bg/90 to-transparent hover:bg-gradient-to-l px-1 w-auto"
                ariaLabel="Scroll right"
                tooltip="Scroll the dimension list right"
              >
                <Icon name="chevron-right" />
              </Button>
            </div>
          )}
        </div>
      </div>
    )
  }
)

DimensionSelector.displayName = 'DimensionSelector'
