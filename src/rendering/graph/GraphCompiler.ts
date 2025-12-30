/**
 * Graph Compiler
 *
 * Compiles a render graph into an executable form by:
 * 1. Building dependency graph from resource access declarations
 * 2. Performing topological sort to determine execution order
 * 3. Detecting cycles (invalid graphs)
 * 4. Identifying read-while-write hazards that need ping-pong buffers
 * 5. Analyzing resource lifetimes for optimal allocation
 *
 * @module rendering/graph/GraphCompiler
 */

import { ResourceState, ResourceStateMachine } from './ResourceStateMachine'
import type { CompiledGraph, CompileOptions, RenderPass, RenderResourceConfig } from './types'

// =============================================================================
// Types
// =============================================================================

/**
 * Internal node for dependency graph.
 */
interface DependencyNode {
  pass: RenderPass
  dependencies: Set<string> // Pass IDs this depends on
  dependents: Set<string> // Pass IDs that depend on this
}

/**
 * Resource usage tracking.
 */
interface ResourceUsage {
  /** Passes that write to this resource */
  writers: string[]
  /** Passes that read from this resource */
  readers: string[]
  /** Passes with readwrite access */
  readwriters: string[]
}

// =============================================================================
// GraphCompiler Class
// =============================================================================

/**
 * Compiles render graph into execution order.
 *
 * @example
 * ```typescript
 * const compiler = new GraphCompiler();
 *
 * // Add passes
 * compiler.addPass(scenePass);
 * compiler.addPass(bloomPass);
 * compiler.addPass(compositePass);
 *
 * // Add resources
 * compiler.addResource(sceneColorConfig);
 * compiler.addResource(bloomConfig);
 *
 * // Compile
 * const result = compiler.compile();
 * if (result.warnings.length > 0) {
 *   console.warn('Compilation warnings:', result.warnings);
 * }
 *
 * // Execute in order
 * for (const pass of result.passes) {
 *   pass.execute(context);
 * }
 * ```
 */
export class GraphCompiler {
  private passes = new Map<string, RenderPass>()
  private resources = new Map<string, RenderResourceConfig>()

  // ==========================================================================
  // Registration
  // ==========================================================================

  /**
   * Add a pass to the graph.
   *
   * @param pass - The render pass to add
   * @throws Error if pass with same ID already exists
   */
  addPass(pass: RenderPass): void {
    if (this.passes.has(pass.id)) {
      throw new Error(`GraphCompiler: Pass '${pass.id}' already exists`)
    }
    this.passes.set(pass.id, pass)
  }

  /**
   * Remove a pass from the graph.
   *
   * @param passId - ID of pass to remove
   */
  removePass(passId: string): void {
    this.passes.delete(passId)
  }

  /**
   * Add a resource configuration.
   *
   * @param config - Resource configuration
   */
  addResource(config: RenderResourceConfig): void {
    this.resources.set(config.id, config)
  }

  /**
   * Remove a resource configuration.
   *
   * @param resourceId - ID of resource to remove
   */
  removeResource(resourceId: string): void {
    this.resources.delete(resourceId)
  }

  /**
   * Clear all passes and resources.
   */
  clear(): void {
    this.passes.clear()
    this.resources.clear()
  }

  // ==========================================================================
  // Compilation
  // ==========================================================================

  /**
   * Compile the graph into execution order.
   *
   * @param _options - Compilation options (reserved for future use)
   * @returns Compiled graph with execution order and metadata
   * @throws Error if graph contains cycles
   */
  compile(_options: CompileOptions = {}): CompiledGraph {
    const warnings: string[] = []

    // Validate resources
    this.validateResources(warnings)

    // Build resource usage map
    const resourceUsage = this.buildResourceUsage()

    // Build dependency graph first (needed for hazard detection)
    const nodes = this.buildDependencyGraph(resourceUsage)

    // Topological sort
    const sortedPasses = this.topologicalSort(nodes)

    // Detect read-while-write hazards (needs sorted order)
    const pingPongResources = this.detectPingPongResources(resourceUsage, sortedPasses, warnings)

    // Validate read-before-write hazards (static analysis)
    this.validateReadBeforeWrite(resourceUsage, sortedPasses, warnings)

    // Enhanced validation using ResourceStateMachine simulation
    // This catches issues that static analysis might miss
    this.simulateExecutionWithStateMachine(sortedPasses, warnings)

    // Determine resource allocation order
    const resourceOrder = this.computeResourceOrder(sortedPasses)

    // Validate unused resources
    this.validateUnusedResources(resourceUsage, warnings)

    return {
      passes: sortedPasses,
      resourceOrder,
      pingPongResources,
      warnings,
    }
  }

  // ==========================================================================
  // Validation
  // ==========================================================================

  /**
   * Validate resource configurations.
   * @param warnings
   */
  private validateResources(warnings: string[]): void {
    for (const pass of this.passes.values()) {
      // Check inputs reference valid resources
      for (const input of pass.config.inputs) {
        if (!this.resources.has(input.resourceId)) {
          warnings.push(`Pass '${pass.id}' reads from undefined resource '${input.resourceId}'`)
        }
      }

      // Check outputs reference valid resources
      for (const output of pass.config.outputs) {
        if (!this.resources.has(output.resourceId)) {
          warnings.push(`Pass '${pass.id}' writes to undefined resource '${output.resourceId}'`)
        }
      }
    }
  }

  /**
   * Warn about unused resources.
   * @param resourceUsage
   * @param warnings
   */
  private validateUnusedResources(
    resourceUsage: Map<string, ResourceUsage>,
    warnings: string[]
  ): void {
    for (const resourceId of this.resources.keys()) {
      const usage = resourceUsage.get(resourceId)
      if (!usage || (usage.writers.length === 0 && usage.readwriters.length === 0)) {
        if (usage?.readers.length === 0) {
          warnings.push(`Resource '${resourceId}' is never used`)
        } else if (!usage) {
          warnings.push(`Resource '${resourceId}' is never used`)
        }
      }
    }
  }

  // ==========================================================================
  // Resource Usage Analysis
  // ==========================================================================

  /**
   * Build map of resource usage across all passes.
   * @returns Map of resource ID to usage information
   */
  private buildResourceUsage(): Map<string, ResourceUsage> {
    const usage = new Map<string, ResourceUsage>()

    // Initialize all resources
    for (const resourceId of this.resources.keys()) {
      usage.set(resourceId, { writers: [], readers: [], readwriters: [] })
    }

    // Collect usage from passes
    for (const pass of this.passes.values()) {
      // Process inputs
      for (const input of pass.config.inputs) {
        const resourceUsage = usage.get(input.resourceId)
        if (resourceUsage) {
          if (input.access === 'readwrite') {
            resourceUsage.readwriters.push(pass.id)
          } else {
            resourceUsage.readers.push(pass.id)
          }
        }
      }

      // Process outputs
      for (const output of pass.config.outputs) {
        const resourceUsage = usage.get(output.resourceId)
        if (resourceUsage) {
          if (output.access === 'readwrite') {
            resourceUsage.readwriters.push(pass.id)
          } else {
            resourceUsage.writers.push(pass.id)
          }
        }
      }
    }

    return usage
  }

  /**
   * Validate that resources are not read before being written.
   *
   * This detects cases where a pass tries to read a resource that
   * hasn't been written to yet in the execution order.
   * @param resourceUsage
   * @param sortedPasses
   * @param warnings
   */
  private validateReadBeforeWrite(
    resourceUsage: Map<string, ResourceUsage>,
    sortedPasses: RenderPass[],
    warnings: string[]
  ): void {
    // Build pass index map for quick lookup
    const passOrder = new Map<string, number>()
    sortedPasses.forEach((pass, index) => passOrder.set(pass.id, index))

    for (const [resourceId, usage] of resourceUsage) {
      // Skip if no readers
      if (usage.readers.length === 0) continue

      // Find first writer index
      let firstWriterIndex = Infinity
      for (const writerId of usage.writers) {
        const index = passOrder.get(writerId)
        if (index !== undefined && index < firstWriterIndex) {
          firstWriterIndex = index
        }
      }

      // Also consider readwriters as writers
      for (const readwriterId of usage.readwriters) {
        const index = passOrder.get(readwriterId)
        if (index !== undefined && index < firstWriterIndex) {
          firstWriterIndex = index
        }
      }

      // Check if any reader comes before first writer
      if (firstWriterIndex === Infinity) {
        // No writers at all - resource is read but never written
        const readers = usage.readers.join(', ')
        warnings.push(
          `Resource '${resourceId}' is read by [${readers}] but never written to. ` +
            `This may cause undefined behavior (reading garbage data).`
        )
      } else {
        // Check each reader
        for (const readerId of usage.readers) {
          const readerIndex = passOrder.get(readerId)
          if (readerIndex !== undefined && readerIndex < firstWriterIndex) {
            const writerIds = [...usage.writers, ...usage.readwriters]
            warnings.push(
              `Pass '${readerId}' reads resource '${resourceId}' before it is written ` +
                `by any of [${writerIds.join(', ')}]. This may cause undefined behavior.`
            )
          }
        }
      }
    }
  }

  /**
   * Simulate execution using ResourceStateMachine for enhanced validation.
   *
   * This method creates a temporary state machine, registers all resources,
   * then simulates pass execution to validate state transitions. This catches
   * issues that static analysis might miss, such as:
   * - Invalid state transitions
   * - Read-before-write hazards with precise pass identification
   * - Resources left in invalid states
   *
   * @param sortedPasses - Passes in execution order
   * @param warnings - Array to collect warnings
   */
  private simulateExecutionWithStateMachine(sortedPasses: RenderPass[], warnings: string[]): void {
    const stateMachine = new ResourceStateMachine({ keepHistory: false })

    // Register all resources
    for (const resourceId of this.resources.keys()) {
      stateMachine.register(resourceId)
    }

    // Simulate execution
    for (const pass of sortedPasses) {
      // First, validate and transition outputs to WriteTarget
      for (const output of pass.config.outputs) {
        const resourceId = output.resourceId
        if (!stateMachine.isRegistered(resourceId)) continue

        const validation = stateMachine.validateTransition(resourceId, ResourceState.WriteTarget)
        if (!validation.valid) {
          warnings.push(
            `Pass '${pass.id}' output validation failed for '${resourceId}': ${validation.error}`
          )
        } else {
          stateMachine.transition(resourceId, ResourceState.WriteTarget, pass.id)
        }
      }

      // Then transition outputs to ShaderRead (after writing completes)
      for (const output of pass.config.outputs) {
        const resourceId = output.resourceId
        if (!stateMachine.isRegistered(resourceId)) continue

        const currentState = stateMachine.getState(resourceId)
        if (currentState === ResourceState.WriteTarget) {
          stateMachine.transition(resourceId, ResourceState.ShaderRead, pass.id)
        }
      }

      // Validate inputs are readable
      for (const input of pass.config.inputs) {
        const resourceId = input.resourceId
        if (!stateMachine.isRegistered(resourceId)) continue

        // For readwrite access, we need to check both read and write
        if (input.access === 'readwrite') {
          // Readwrite access is valid from ShaderRead or WriteTarget state
          const currentState = stateMachine.getState(resourceId)
          if (currentState === ResourceState.Created) {
            const validation = stateMachine.validateReadAfterWrite(resourceId, pass.id)
            if (!validation.valid) {
              warnings.push(validation.error!)
            }
          }
        } else {
          // Read-only access requires ShaderRead state
          const validation = stateMachine.validateReadAfterWrite(resourceId, pass.id)
          if (!validation.valid) {
            warnings.push(validation.error!)
          }
        }
      }

      // Handle readwrite inputs - transition to WriteTarget then back to ShaderRead
      for (const input of pass.config.inputs) {
        const resourceId = input.resourceId
        if (!stateMachine.isRegistered(resourceId)) continue

        if (input.access === 'readwrite') {
          const currentState = stateMachine.getState(resourceId)
          if (currentState === ResourceState.ShaderRead) {
            stateMachine.transition(resourceId, ResourceState.WriteTarget, pass.id)
            stateMachine.transition(resourceId, ResourceState.ShaderRead, pass.id)
          }
        }
      }
    }

    // Cleanup
    stateMachine.dispose()
  }

  /**
   * Detect resources that need ping-pong buffers.
   *
   * A resource needs ping-pong when:
   * - A single pass has readwrite access (reads and writes same resource)
   * - Multiple passes access the resource where execution order could cause hazards
   * - Temporal feedback patterns (output feeds back as input)
   *
   * Note: Ping-pong detection is automatic and correct behavior for temporal
   * accumulation patterns. We don't generate warnings for successfully detected
   * patterns since they're handled correctly by the system.
   * @param resourceUsage - Map of resource usage
   * @param sortedPasses - Sorted pass list
   * @returns Set of resource IDs that need ping-pong
   * @param _warnings
   */
  private detectPingPongResources(
    resourceUsage: Map<string, ResourceUsage>,
    sortedPasses: RenderPass[],
    _warnings: string[]
  ): Set<string> {
    const pingPong = new Set<string>()

    // Build pass index map for quick lookup
    const passOrder = new Map<string, number>()
    sortedPasses.forEach((pass, index) => passOrder.set(pass.id, index))

    for (const [resourceId, usage] of resourceUsage) {
      // Case 1: Any readwrite access needs ping-pong
      // (pass reads and writes to same resource in one execute call)
      // This is expected for temporal accumulation - no warning needed
      if (usage.readwriters.length > 0) {
        pingPong.add(resourceId)
        continue
      }

      // Case 2: Multiple writers to the same resource
      // This is a write conflict that may need ping-pong depending on semantics
      // Still no warning - the system handles it automatically
      if (usage.writers.length > 1) {
        pingPong.add(resourceId)
        continue
      }

      // Case 3: Check for read-while-write patterns
      // If a resource is written and read, check if any reader needs
      // to see a previous frame's data (temporal feedback)
      if (usage.writers.length > 0 && usage.readers.length > 0) {
        // Find if any reader depends on output from current frame vs previous
        // For now, we detect if the same pass both reads and writes to a resource
        // through separate input/output declarations
        const writerSet = new Set(usage.writers)
        for (const readerId of usage.readers) {
          if (writerSet.has(readerId)) {
            // Same pass reads and writes - needs ping-pong
            // This is expected behavior for temporal effects - no warning needed
            pingPong.add(resourceId)
            break
          }
        }
      }
    }

    return pingPong
  }

  // ==========================================================================
  // Dependency Graph
  // ==========================================================================

  /**
   * Build dependency graph from resource access patterns.
   *
   * A pass P1 depends on P2 if:
   * - P1 reads a resource that P2 writes
   * @param resourceUsage - Map of resource usage
   * @returns Dependency graph as a map of pass ID to node
   */
  private buildDependencyGraph(
    resourceUsage: Map<string, ResourceUsage>
  ): Map<string, DependencyNode> {
    const nodes = new Map<string, DependencyNode>()

    // Initialize nodes for all passes
    for (const pass of this.passes.values()) {
      nodes.set(pass.id, {
        pass,
        dependencies: new Set(),
        dependents: new Set(),
      })
    }

    // Build dependencies based on resource access
    for (const [_resourceId, usage] of resourceUsage) {
      // Every reader depends on every writer
      for (const writerId of usage.writers) {
        for (const readerId of usage.readers) {
          if (writerId !== readerId) {
            const readerNode = nodes.get(readerId)
            const writerNode = nodes.get(writerId)

            if (readerNode && writerNode) {
              readerNode.dependencies.add(writerId)
              writerNode.dependents.add(readerId)
            }
          }
        }
      }

      // Readwrite passes depend on previous readwrite passes
      for (let i = 1; i < usage.readwriters.length; i++) {
        const prevId = usage.readwriters[i - 1]!
        const currId = usage.readwriters[i]!

        const currNode = nodes.get(currId)
        const prevNode = nodes.get(prevId)

        if (currNode && prevNode) {
          currNode.dependencies.add(prevId)
          prevNode.dependents.add(currId)
        }
      }
    }

    return nodes
  }

  // ==========================================================================
  // Topological Sort
  // ==========================================================================

  /**
   * Perform topological sort using Kahn's algorithm.
   *
   * @param nodes - Dependency graph nodes
   * @returns Sorted list of render passes
   * @throws Error if graph contains cycles
   */
  private topologicalSort(nodes: Map<string, DependencyNode>): RenderPass[] {
    const result: RenderPass[] = []
    const inDegree = new Map<string, number>()
    const queue: string[] = []

    // Calculate in-degrees
    for (const [id, node] of nodes) {
      inDegree.set(id, node.dependencies.size)

      if (node.dependencies.size === 0) {
        queue.push(id)
      }
    }

    // Sort queue by priority for deterministic ordering
    queue.sort((a, b) => {
      const passA = this.passes.get(a)
      const passB = this.passes.get(b)
      const priorityA = passA?.config.priority ?? 0
      const priorityB = passB?.config.priority ?? 0
      return priorityA - priorityB
    })

    // Process queue
    while (queue.length > 0) {
      const passId = queue.shift()!
      const node = nodes.get(passId)

      if (node) {
        result.push(node.pass)

        // Decrease in-degree of dependents
        for (const dependentId of node.dependents) {
          const degree = (inDegree.get(dependentId) ?? 1) - 1
          inDegree.set(dependentId, degree)

          if (degree === 0) {
            // Insert maintaining priority order
            const dependentPass = this.passes.get(dependentId)
            const priority = dependentPass?.config.priority ?? 0

            let insertIdx = queue.length
            for (let i = 0; i < queue.length; i++) {
              const queuePass = this.passes.get(queue[i]!)
              const queuePriority = queuePass?.config.priority ?? 0
              if (priority < queuePriority) {
                insertIdx = i
                break
              }
            }
            queue.splice(insertIdx, 0, dependentId)
          }
        }
      }
    }

    // Check for cycles
    if (result.length !== this.passes.size) {
      const remaining = Array.from(this.passes.keys()).filter(
        (id) => !result.some((p) => p.id === id)
      )

      throw new Error(
        `GraphCompiler: Cycle detected in render graph. ` +
          `Passes involved: ${remaining.join(', ')}`
      )
    }

    return result
  }

  // ==========================================================================
  // Resource Order
  // ==========================================================================

  /**
   * Compute optimal resource allocation order.
   *
   * Resources are ordered by first use in the pass sequence.
   * @param passes - Sorted pass list
   * @returns Ordered list of resource IDs
   */
  private computeResourceOrder(passes: RenderPass[]): string[] {
    const order: string[] = []
    const seen = new Set<string>()

    for (const pass of passes) {
      // Add output resources first (they need to exist before the pass runs)
      for (const output of pass.config.outputs) {
        if (!seen.has(output.resourceId)) {
          seen.add(output.resourceId)
          order.push(output.resourceId)
        }
      }

      // Then input resources
      for (const input of pass.config.inputs) {
        if (!seen.has(input.resourceId)) {
          seen.add(input.resourceId)
          order.push(input.resourceId)
        }
      }
    }

    return order
  }

  // ==========================================================================
  // Debugging
  // ==========================================================================

  /**
   * Get a visual representation of the graph for debugging.
   * @returns Debug information string
   */
  getDebugInfo(): string {
    const lines: string[] = ['Render Graph:']

    lines.push('\nPasses:')
    for (const pass of this.passes.values()) {
      const inputs = pass.config.inputs.map((i) => `${i.resourceId}(${i.access})`).join(', ')
      const outputs = pass.config.outputs.map((o) => `${o.resourceId}(${o.access})`).join(', ')
      lines.push(`  ${pass.id}: [${inputs}] -> [${outputs}]`)
    }

    lines.push('\nResources:')
    for (const [id, config] of this.resources) {
      lines.push(`  ${id}: ${config.type} (${config.size.mode})`)
    }

    return lines.join('\n')
  }
}
