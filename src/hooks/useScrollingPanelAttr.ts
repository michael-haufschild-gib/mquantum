import { type RefObject, useEffect } from 'react'

/**
 * Mirror an active-scroll signal onto the nearest enclosing `.glass-panel`
 * ancestor as `data-scrolling="true"`, then clear it after the user stops.
 *
 * Why: `.glass-panel` carries `backdrop-filter: blur(...)`, which forces the
 * compositor to re-blur the WebGPU canvas pixels behind the panel every
 * frame. While the user is actively scrolling the panel content, the
 * extra repaint pressure compounds with the canvas's own 60fps work and
 * drops fps. CSS in `src/index.css` reads this attribute and disables
 * the backdrop-filter for the duration of the scroll.
 *
 * Listener is registered passive so it never blocks the scroll itself.
 * Clear is rAF-deferred plus a short trailing timer so single-tick
 * scrolls don't cause flicker.
 *
 * @param scrollRef - element whose `scroll` events drive the signal.
 *   We walk to its closest `.glass-panel` ancestor and toggle the attr there.
 * @param idleTimeoutMs - how long after the last scroll event to clear the
 *   attribute. Default 120ms — enough to coalesce momentum scrolls.
 */
export function useScrollingPanelAttr(
  scrollRef: RefObject<HTMLElement | null>,
  idleTimeoutMs = 120
): void {
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    const target = el.closest<HTMLElement>('.glass-panel')
    if (!target) return

    let clearTimer: ReturnType<typeof setTimeout> | null = null
    let rafId: number | null = null

    const setScrolling = (): void => {
      if (target.dataset['scrolling'] !== 'true') {
        target.dataset['scrolling'] = 'true'
      }
      if (clearTimer !== null) clearTimeout(clearTimer)
      clearTimer = setTimeout(() => {
        if (rafId !== null) cancelAnimationFrame(rafId)
        rafId = requestAnimationFrame(() => {
          delete target.dataset['scrolling']
          rafId = null
        })
      }, idleTimeoutMs)
    }

    el.addEventListener('scroll', setScrolling, { passive: true })

    return () => {
      el.removeEventListener('scroll', setScrolling)
      if (clearTimer !== null) clearTimeout(clearTimer)
      if (rafId !== null) cancelAnimationFrame(rafId)
      delete target.dataset['scrolling']
    }
  }, [scrollRef, idleTimeoutMs])
}
