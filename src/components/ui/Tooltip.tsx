import { AnimatePresence, m } from 'motion/react'
import React, {
  cloneElement,
  type FocusEvent,
  isValidElement,
  type KeyboardEvent,
  type MouseEvent,
  type ReactElement,
  type Ref,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'

import {
  computeTooltipCoords,
  TOOLTIP_VIEWPORT_MARGIN,
  type TooltipPoint,
  type TooltipSide,
} from '@/components/ui/tooltipPositioning'
import { Z_INDEX } from '@/constants/zIndex'

/** Props for the portal-rendered {@link Tooltip} component. */
export interface TooltipProps {
  content: string | React.ReactNode
  children: React.ReactNode
  position?: TooltipSide
  delay?: number
  className?: string
}

type TriggerElementProps = React.HTMLAttributes<HTMLElement> & {
  className?: string
  ref?: Ref<HTMLElement>
}
type TriggerElement = ReactElement<TriggerElementProps>

const PAGE_RESUME_TOOLTIP_SUPPRESSION_MS = 750

function assignRef(ref: Ref<HTMLElement> | undefined, value: HTMLElement | null) {
  if (!ref) return
  if (typeof ref === 'function') {
    ref(value)
    return
  }
  ;(ref as React.MutableRefObject<HTMLElement | null>).current = value
}

function chainEvent<E>(first: ((event: E) => void) | undefined, second: (event: E) => void) {
  return (event: E) => {
    first?.(event)
    second(event)
  }
}

function isPageHidden(): boolean {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden'
}

function isFocusVisible(element: HTMLElement): boolean {
  try {
    return element.matches(':focus-visible')
  } catch {
    return false
  }
}

function showManualPopover(portal: HTMLElement): void {
  if (typeof portal.showPopover !== 'function') return

  try {
    if (isManualPopoverOpen(portal) !== false) hideManualPopoverBestEffort(portal)
    portal.showPopover()
  } catch {
    portal.removeAttribute('popover')
  }
}

function hideManualPopover(portal: HTMLElement): void {
  if (typeof portal.hidePopover !== 'function') return

  if (isManualPopoverOpen(portal) === false) return
  hideManualPopoverBestEffort(portal)
}

function hideManualPopoverBestEffort(portal: HTMLElement): void {
  try {
    portal.hidePopover()
  } catch {
    // Popover state can already be closed after light-dismiss or document blur.
  }
}

function isManualPopoverOpen(portal: HTMLElement): boolean | null {
  try {
    return portal.matches(':popover-open')
  } catch {
    return null
  }
}

interface TooltipHandlers {
  hide: () => void
  hideOnEscape: (event: KeyboardEvent<HTMLElement>) => void
  movePointer: (event: MouseEvent<HTMLElement>) => void
  showFocus: (event: FocusEvent<HTMLElement>) => void
  showPointer: (event: MouseEvent<HTMLElement>) => void
}

interface TooltipController {
  coords: TooltipPoint
  handlers: TooltipHandlers
  isVisible: boolean
  portalRef: React.RefObject<HTMLDivElement | null>
  tooltipId: string
  tooltipRef: React.RefObject<HTMLDivElement | null>
  triggerRef: React.RefObject<HTMLElement | null>
}

function useTooltipController(position: TooltipSide, delay: number): TooltipController {
  const tooltipId = useId()
  const [isVisible, setIsVisible] = useState(false)
  const [coords, setCoords] = useState({ x: 0, y: 0 })
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const triggerRef = useRef<HTMLElement | null>(null)
  const portalRef = useRef<HTMLDivElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const pointerRef = useRef<TooltipPoint | null>(null)
  const suppressTooltipUntilRef = useRef(0)

  const updateCoords = useCallback(() => {
    if (!triggerRef.current || !tooltipRef.current) return
    setCoords(
      computeTooltipCoords(
        triggerRef.current.getBoundingClientRect(),
        tooltipRef.current.getBoundingClientRect(),
        position,
        pointerRef.current
      )
    )
  }, [position])

  const hide = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    pointerRef.current = null
    setIsVisible(false)
  }, [])

  const show = useCallback(
    (point: TooltipPoint | null) => {
      if (isPageHidden() || Date.now() < suppressTooltipUntilRef.current) return
      pointerRef.current = point
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      timeoutRef.current = setTimeout(() => {
        timeoutRef.current = null
        if (!isPageHidden()) setIsVisible(true)
      }, delay)
    },
    [delay]
  )

  useTooltipPortalVisibility({ isVisible, portalRef, updateCoords })
  useTooltipViewportListeners(isVisible, updateCoords)
  useTooltipTimeoutCleanup(timeoutRef)
  usePageResumeTooltipSuppression(suppressTooltipUntilRef, hide)

  const handlers: TooltipHandlers = {
    hide,
    hideOnEscape: (event) => {
      if (event.key === 'Escape') hide()
    },
    movePointer: (event) => {
      pointerRef.current = { x: event.clientX, y: event.clientY }
      if (isVisible) updateCoords()
    },
    showFocus: (event) => {
      if (isFocusVisible(event.currentTarget)) show(null)
    },
    showPointer: (event) => show({ x: event.clientX, y: event.clientY }),
  }

  return {
    coords,
    handlers,
    isVisible,
    portalRef,
    tooltipId,
    tooltipRef,
    triggerRef,
  }
}

function useTooltipViewportListeners(isVisible: boolean, updateCoords: () => void) {
  useEffect(() => {
    if (!isVisible || typeof window === 'undefined') return undefined
    window.addEventListener('resize', updateCoords)
    window.addEventListener('scroll', updateCoords, true)
    return () => {
      window.removeEventListener('resize', updateCoords)
      window.removeEventListener('scroll', updateCoords, true)
    }
  }, [isVisible, updateCoords])
}

function useTooltipPortalVisibility({
  isVisible,
  portalRef,
  updateCoords,
}: {
  isVisible: boolean
  portalRef: React.RefObject<HTMLDivElement | null>
  updateCoords: () => void
}) {
  useEffect(() => {
    const portal = portalRef.current
    if (!portal) return
    if (!isVisible) {
      hideManualPopover(portal)
      return
    }
    showManualPopover(portal)
    updateCoords()
  }, [isVisible, portalRef, updateCoords])

  useEffect(
    () => () => {
      const portal = portalRef.current
      if (portal) hideManualPopover(portal)
    },
    [portalRef]
  )
}

function useTooltipTimeoutCleanup(
  timeoutRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>
) {
  useEffect(
    () => () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    },
    [timeoutRef]
  )
}

function usePageResumeTooltipSuppression(
  suppressTooltipUntilRef: React.MutableRefObject<number>,
  hide: () => void
) {
  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return undefined
    const suppressPageResumeTooltips = () => {
      suppressTooltipUntilRef.current = Date.now() + PAGE_RESUME_TOOLTIP_SUPPRESSION_MS
    }
    const hideOnInactivePage = () => {
      suppressPageResumeTooltips()
      hide()
    }
    const hideOnHiddenDocument = () => {
      if (document.visibilityState === 'hidden') {
        hideOnInactivePage()
        return
      }
      suppressPageResumeTooltips()
    }
    window.addEventListener('blur', hideOnInactivePage)
    window.addEventListener('focus', suppressPageResumeTooltips)
    window.addEventListener('pagehide', hideOnInactivePage)
    document.addEventListener('visibilitychange', hideOnHiddenDocument)
    return () => {
      window.removeEventListener('blur', hideOnInactivePage)
      window.removeEventListener('focus', suppressPageResumeTooltips)
      window.removeEventListener('pagehide', hideOnInactivePage)
      document.removeEventListener('visibilitychange', hideOnHiddenDocument)
    }
  }, [hide, suppressTooltipUntilRef])
}

export const Tooltip: React.FC<TooltipProps> = React.memo(
  ({ content, children, position = 'top', delay = 300, className = '' }) => {
    const controller = useTooltipController(position, delay)
    const portal = <TooltipPortal content={content} controller={controller} position={position} />

    if (isValidElement<TriggerElementProps>(children)) {
      return (
        <ClonedTooltipTrigger
          child={children as TriggerElement}
          className={className}
          controller={controller}
        >
          {portal}
        </ClonedTooltipTrigger>
      )
    }

    return (
      <FallbackTooltipTrigger className={className} controller={controller}>
        {children}
        {portal}
      </FallbackTooltipTrigger>
    )
  }
)

function TooltipPortal({
  content,
  controller,
  position,
}: {
  content: React.ReactNode
  controller: TooltipController
  position: TooltipSide
}) {
  if (typeof document === 'undefined') return null
  return createPortal(
    <div
      ref={controller.portalRef}
      data-tooltip-portal
      popover="manual"
      className="fixed inset-0 m-0 h-[100dvh] w-screen overflow-visible border-0 bg-transparent p-0 text-inherit pointer-events-none"
      style={{ zIndex: Z_INDEX.TOOLTIP }}
    >
      <AnimatePresence>
        {controller.isVisible && (
          <m.div
            ref={controller.tooltipRef}
            initial={{ opacity: 0, scale: 0.9, y: position === 'top' ? 4 : -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            className="fixed px-3 py-1.5 text-xs font-medium text-text-primary surface-panel-strong border border-border-default rounded-lg shadow-lg pointer-events-none max-w-xs break-words tracking-wide"
            style={{
              left: `${coordsNumber(controller.coords.x)}px`,
              top: `${coordsNumber(controller.coords.y)}px`,
              right: 'auto',
              bottom: 'auto',
              margin: 0,
              zIndex: Z_INDEX.TOOLTIP,
              textShadow: '0 1px 2px var(--bg-overlay)',
            }}
            id={controller.tooltipId}
            role="tooltip"
          >
            {content}
          </m.div>
        )}
      </AnimatePresence>
    </div>,
    document.body
  )
}

function coordsNumber(value: number): number {
  return Number.isFinite(value) ? value : TOOLTIP_VIEWPORT_MARGIN
}

function ClonedTooltipTrigger({
  child,
  children,
  className,
  controller,
}: {
  child: TriggerElement
  children: React.ReactNode
  className: string
  controller: TooltipController
}) {
  const childRef = child.props.ref
  const describedBy = [
    child.props['aria-describedby'],
    controller.isVisible ? controller.tooltipId : undefined,
  ]
    .filter(Boolean)
    .join(' ')
  const mergedClassName = [child.props.className, className].filter(Boolean).join(' ')
  const trigger = cloneElement(child, {
    className: mergedClassName === '' ? child.props.className : mergedClassName,
    'aria-describedby': describedBy || undefined,
    ref: (node: HTMLElement | null) => {
      controller.triggerRef.current = node
      assignRef(childRef, node)
    },
    onBlur: chainEvent<FocusEvent<HTMLElement>>(child.props.onBlur, controller.handlers.hide),
    onClick: chainEvent<MouseEvent<HTMLElement>>(child.props.onClick, controller.handlers.hide),
    onFocus: chainEvent<FocusEvent<HTMLElement>>(
      child.props.onFocus,
      controller.handlers.showFocus
    ),
    onKeyDown: chainEvent<KeyboardEvent<HTMLElement>>(
      child.props.onKeyDown,
      controller.handlers.hideOnEscape
    ),
    onMouseEnter: chainEvent<MouseEvent<HTMLElement>>(
      child.props.onMouseEnter,
      controller.handlers.showPointer
    ),
    onMouseLeave: chainEvent<MouseEvent<HTMLElement>>(
      child.props.onMouseLeave,
      controller.handlers.hide
    ),
    onMouseMove: chainEvent<MouseEvent<HTMLElement>>(
      child.props.onMouseMove,
      controller.handlers.movePointer
    ),
  })
  return (
    <>
      {trigger}
      {children}
    </>
  )
}

function FallbackTooltipTrigger({
  children,
  className,
  controller,
}: {
  children: React.ReactNode
  className: string
  controller: TooltipController
}) {
  return (
    <span
      className={`relative inline-block ${className}`}
      aria-describedby={controller.isVisible ? controller.tooltipId : undefined}
      onBlur={controller.handlers.hide}
      onClick={controller.handlers.hide}
      onFocus={controller.handlers.showFocus}
      onKeyDown={controller.handlers.hideOnEscape}
      onMouseEnter={controller.handlers.showPointer}
      onMouseLeave={controller.handlers.hide}
      onMouseMove={controller.handlers.movePointer}
      ref={controller.triggerRef}
    >
      {children}
    </span>
  )
}

Tooltip.displayName = 'Tooltip'
