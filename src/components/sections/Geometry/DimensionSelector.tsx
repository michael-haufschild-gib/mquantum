/**
 * Dimension Selector Component
 * Allows users to select the number of dimensions (3D, 4D, 5D, 6D)
 */

import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { ToggleGroup } from '@/components/ui/ToggleGroup'
import {
  MAX_DIMENSION,
  MIN_DIMENSION,
  useGeometryStore,
  type GeometryState,
} from '@/stores/geometryStore'
import React, { useEffect, useRef, useState, useCallback } from 'react'
import { useShallow } from 'zustand/react/shallow'

/**
 *
 */
export interface DimensionSelectorProps {
  className?: string
  disabled?: boolean
}

/**
 * Pre-computed dimension options (MIN_DIMENSION to MAX_DIMENSION are constants)
 * Created once at module load - no need to regenerate on every render
 */
const DIMENSION_OPTIONS = (() => {
  const options = []
  for (let d = MIN_DIMENSION; d <= MAX_DIMENSION; d++) {
    options.push({
      value: String(d),
      label: `${d}D`,
    })
  }
  return options
})()

export const DimensionSelector: React.FC<DimensionSelectorProps> = React.memo(
  ({ className = '', disabled = false }) => {
    // Consolidate store subscriptions with useShallow to reduce re-renders
    const geometrySelector = useShallow((state: GeometryState) => ({
      dimension: state.dimension,
      setDimension: state.setDimension,
    }))
    const { dimension, setDimension } = useGeometryStore(geometrySelector)
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

    const handlePreventDefault = useCallback((e: React.PointerEvent | React.MouseEvent) => {
      e.stopPropagation()
      e.preventDefault()
    }, [])

    return (
      <div className={`${className}`}>
        <div className="relative group">
          {canScrollLeft && (
            <div
              className="absolute left-0 top-0 bottom-0 z-20 flex items-center"
              onPointerDown={handlePreventDefault}
              onMouseDown={handlePreventDefault}
            >
              <Button
                variant="ghost"
                size="icon"
                onClick={scrollLeft}
                className="h-full rounded-l-lg rounded-r-none border-none bg-gradient-to-r from-panel-bg via-panel-bg/90 to-transparent hover:bg-gradient-to-r px-1 w-auto"
                ariaLabel="Scroll left"
              >
                <Icon name="chevron-left" />
              </Button>
            </div>
          )}

          <div ref={scrollContainerRef} className="overflow-x-auto [&::-webkit-scrollbar]:hidden">
            <ToggleGroup
              options={DIMENSION_OPTIONS}
              value={String(dimension)}
              onChange={handleChange}
              disabled={disabled}
              ariaLabel="Select dimension"
              className="min-w-full w-max flex-nowrap"
              data-testid="dimension-selector"
            />
          </div>

          {canScrollRight && (
            <div
              className="absolute right-0 top-0 bottom-0 z-20 flex items-center"
              onPointerDown={handlePreventDefault}
              onMouseDown={handlePreventDefault}
            >
              <Button
                variant="ghost"
                size="icon"
                onClick={scrollRight}
                className="h-full rounded-r-lg rounded-l-none border-none bg-gradient-to-l from-panel-bg via-panel-bg/90 to-transparent hover:bg-gradient-to-l px-1 w-auto"
                ariaLabel="Scroll right"
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
