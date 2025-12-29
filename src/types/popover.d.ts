/**
 * Type declarations for the native HTML Popover API and Dialog element.
 * These extend the built-in DOM types to include modern browser APIs.
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/API/Popover_API
 * @see https://developer.mozilla.org/en-US/docs/Web/API/HTMLDialogElement
 */

/**
 * Event fired when a popover's visibility state changes.
 * Extends the standard Event interface with state information.
 */
interface ToggleEvent extends Event {
  /** The new state of the popover after the toggle */
  readonly newState: 'open' | 'closed';
  /** The previous state of the popover before the toggle */
  readonly oldState: 'open' | 'closed';
}

declare global {
  interface HTMLElement {
    /**
     * Shows the popover element by adding it to the top layer.
     * For `popover="auto"`, this also closes any other auto popovers.
     * @throws {DOMException} If the element is not a valid popover or is already showing.
     */
    showPopover(): void;

    /**
     * Hides the popover element by removing it from the top layer.
     * @throws {DOMException} If the element is not a valid popover.
     */
    hidePopover(): void;

    /**
     * Toggles the popover between showing and hidden states.
     * @param force - If provided, forces the popover to show (true) or hide (false).
     * @returns The new visibility state: true if now showing, false if now hidden.
     * @throws {DOMException} If the element is not a valid popover.
     */
    togglePopover(force?: boolean): boolean;
  }

  interface GlobalEventHandlersEventMap {
    toggle: ToggleEvent;
  }
}

declare module 'react' {
  interface HTMLAttributes<T> {
    /**
     * Turns an element into a popover element.
     * - `auto`: Light-dismiss (click outside, Escape key), only one visible at a time.
     * - `manual`: No auto-dismiss, must explicitly show/hide, multiple can be visible.
     */
    popover?: 'auto' | 'manual';

    /**
     * Specifies the ID of the popover element this button/input controls.
     * The target element must have the `popover` attribute.
     */
    popovertarget?: string;

    /**
     * Specifies the action to perform on the target popover.
     * - `toggle` (default): Toggles visibility
     * - `show`: Shows the popover
     * - `hide`: Hides the popover
     */
    popovertargetaction?: 'toggle' | 'show' | 'hide';
  }
}

export {};
