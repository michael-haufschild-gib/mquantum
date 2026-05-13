import { logger } from '@/lib/logger'

/** Resolve a render-graph resource alias chain to its concrete source ID. */
export function resolveResourceAlias(
  resourceAliases: ReadonlyMap<string, string>,
  resourceId: string
): string {
  let current = resourceId
  let depth = 0
  const maxDepth = 16

  while (resourceAliases.has(current)) {
    if (depth >= maxDepth) {
      logger.warn(`WebGPURenderGraph: Alias chain too long at '${current}' (possible cycle)`)
      return current
    }
    depth++
    current = resourceAliases.get(current)!
  }

  return current
}
