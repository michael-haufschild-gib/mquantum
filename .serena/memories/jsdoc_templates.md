# JSDoc Documentation Templates

Load this memory when writing new exported components, hooks, or utility functions.

## Coverage Requirements

- **Exported Components**: 100% JSDoc required
- **Exported Hooks**: 100% JSDoc required
- **Public APIs**: 100% JSDoc required
- **Utility Functions**: 80%+ recommended
- **Internal/Private**: Optional, encouraged for complex logic

## Component Template

```tsx
/**
 * Brief one-line description.
 *
 * Detailed description:
 * - What the component does
 * - Key features or behaviors
 * - Performance characteristics (if relevant)
 *
 * @param props - Component props
 * @param props.propName - Description of each prop
 *
 * @returns Description of rendered output
 *
 * @example
 * ```tsx
 * <MyComponent propName="value" onEvent={() => console.log('event')} />
 * ```
 *
 * @remarks
 * - Edge cases and dependencies
 * - Performance considerations
 *
 * @see {@link RelatedComponent}
 */
export function MyComponent({ propName, onEvent }: MyComponentProps) {
  // Implementation
}
```

## Hook Template

```tsx
/**
 * Brief one-line description.
 *
 * Details:
 * - Problem solved
 * - Side effects (API calls, subscriptions, timers)
 * - State management approach
 *
 * @param config - Hook configuration
 * @param config.option - Description
 *
 * @returns { data, loading, error } - Return value description
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { data, loading } = useMyHook({ option: 'value' })
 *   if (loading) return <Spinner />
 *   return <div>{data}</div>
 * }
 * ```
 *
 * @remarks
 * - Cleanup is handled automatically
 * - Requires XProvider in component tree
 *
 * @throws {Error} When used outside of provider context
 */
export function useMyHook(config: HookConfig) {
  // Implementation
}
```

## Utility Function Template

```tsx
/**
 * Brief one-line description.
 *
 * Details:
 * - Algorithm or approach
 * - Edge cases handled
 * - Performance: O(n)
 *
 * @param input - Description
 * @param options - Optional configuration
 * @returns Description of return value
 *
 * @example
 * ```tsx
 * const result = myUtility('input', { option: true })
 * ```
 *
 * @throws {TypeError} When input is invalid
 */
export function myUtility(input: string, options?: Options): Result {
  // Implementation
}
```

## Best Practices

1. **Be specific**: "Renders a collapsible sidebar panel" not "handles data"
2. **Include examples**: Real usage, not trivial
3. **Document side effects**: API calls, subscriptions, timers
4. **Explain "why"**: If implementation is non-obvious
5. **Keep updated**: Update JSDoc when behavior changes
6. **Link related**: Use `@see` for connected components/docs
