/**
 * Tests for ResourceStateMachine
 *
 * Verifies resource state tracking and transition validation.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { ResourceState, ResourceStateMachine } from '@/rendering/graph/ResourceStateMachine'

describe('ResourceStateMachine', () => {
  let stateMachine: ResourceStateMachine

  beforeEach(() => {
    stateMachine = new ResourceStateMachine({ keepHistory: true })
  })

  afterEach(() => {
    stateMachine.dispose()
  })

  describe('registration', () => {
    it('should register new resources in Created state', () => {
      stateMachine.register('colorBuffer')

      expect(stateMachine.isRegistered('colorBuffer')).toBe(true)
      expect(stateMachine.getState('colorBuffer')).toBe(ResourceState.Created)
    })

    it('should throw when registering duplicate resource', () => {
      stateMachine.register('colorBuffer')

      expect(() => stateMachine.register('colorBuffer')).toThrow('already registered')
    })

    it('should unregister resources', () => {
      stateMachine.register('colorBuffer')
      stateMachine.unregister('colorBuffer')

      expect(stateMachine.isRegistered('colorBuffer')).toBe(false)
    })

    it('should handle unregister of non-existent resource', () => {
      // Should not throw
      expect(() => stateMachine.unregister('nonExistent')).not.toThrow()
    })

    it('should return undefined for unregistered resource state', () => {
      expect(stateMachine.getState('nonExistent')).toBeUndefined()
    })
  })

  describe('transitions', () => {
    beforeEach(() => {
      stateMachine.register('colorBuffer')
    })

    it('should transition from Created to WriteTarget', () => {
      stateMachine.transition('colorBuffer', ResourceState.WriteTarget, 'scenePass')

      expect(stateMachine.getState('colorBuffer')).toBe(ResourceState.WriteTarget)
    })

    it('should transition from WriteTarget to ShaderRead', () => {
      stateMachine.transition('colorBuffer', ResourceState.WriteTarget, 'scenePass')
      stateMachine.transition('colorBuffer', ResourceState.ShaderRead, 'scenePass')

      expect(stateMachine.getState('colorBuffer')).toBe(ResourceState.ShaderRead)
    })

    it('should allow WriteTarget to WriteTarget transition', () => {
      stateMachine.transition('colorBuffer', ResourceState.WriteTarget, 'pass1')
      stateMachine.transition('colorBuffer', ResourceState.WriteTarget, 'pass2')

      expect(stateMachine.getState('colorBuffer')).toBe(ResourceState.WriteTarget)
    })

    it('should allow ShaderRead to WriteTarget transition', () => {
      stateMachine.transition('colorBuffer', ResourceState.WriteTarget, 'pass1')
      stateMachine.transition('colorBuffer', ResourceState.ShaderRead, 'pass1')
      stateMachine.transition('colorBuffer', ResourceState.WriteTarget, 'pass2')

      expect(stateMachine.getState('colorBuffer')).toBe(ResourceState.WriteTarget)
    })

    it('should allow ShaderRead to ShaderRead transition', () => {
      stateMachine.transition('colorBuffer', ResourceState.WriteTarget, 'pass1')
      stateMachine.transition('colorBuffer', ResourceState.ShaderRead, 'pass1')
      stateMachine.transition('colorBuffer', ResourceState.ShaderRead, 'pass2')

      expect(stateMachine.getState('colorBuffer')).toBe(ResourceState.ShaderRead)
    })

    it('should throw for invalid transition Created to ShaderRead', () => {
      expect(() =>
        stateMachine.transition('colorBuffer', ResourceState.ShaderRead, 'scenePass')
      ).toThrow('Invalid transition')
    })

    it('should transition to Disposed from any state', () => {
      stateMachine.transition('colorBuffer', ResourceState.Disposed, 'cleanup')

      expect(stateMachine.getState('colorBuffer')).toBe(ResourceState.Disposed)
    })

    it('should throw when transitioning from Disposed', () => {
      stateMachine.transition('colorBuffer', ResourceState.Disposed, 'cleanup')

      expect(() => stateMachine.transition('colorBuffer', ResourceState.Created, 'reset')).toThrow(
        'has been disposed'
      )
    })

    it('should throw for unregistered resource', () => {
      expect(() =>
        stateMachine.transition('nonExistent', ResourceState.WriteTarget, 'scenePass')
      ).toThrow('not registered')
    })
  })

  describe('validateTransition', () => {
    beforeEach(() => {
      stateMachine.register('colorBuffer')
    })

    it('should return valid for allowed transitions', () => {
      const result = stateMachine.validateTransition('colorBuffer', ResourceState.WriteTarget)

      expect(result.valid).toBe(true)
      expect(result.error).toBeUndefined()
    })

    it('should return invalid for disallowed transitions', () => {
      const result = stateMachine.validateTransition('colorBuffer', ResourceState.ShaderRead)

      expect(result.valid).toBe(false)
      expect(result.error).toContain('Invalid transition')
    })

    it('should return invalid for unregistered resource', () => {
      const result = stateMachine.validateTransition('nonExistent', ResourceState.WriteTarget)

      expect(result.valid).toBe(false)
      expect(result.error).toContain('not registered')
    })

    it('should return invalid for disposed resource', () => {
      stateMachine.transition('colorBuffer', ResourceState.Disposed, 'cleanup')

      const result = stateMachine.validateTransition('colorBuffer', ResourceState.WriteTarget)

      expect(result.valid).toBe(false)
      expect(result.error).toContain('disposed')
    })
  })

  describe('canRead / canWrite', () => {
    beforeEach(() => {
      stateMachine.register('colorBuffer')
    })

    it('should not allow read from Created state', () => {
      expect(stateMachine.canRead('colorBuffer')).toBe(false)
    })

    it('should not allow read from WriteTarget state', () => {
      stateMachine.transition('colorBuffer', ResourceState.WriteTarget, 'scenePass')

      expect(stateMachine.canRead('colorBuffer')).toBe(false)
    })

    it('should allow read from ShaderRead state', () => {
      stateMachine.transition('colorBuffer', ResourceState.WriteTarget, 'scenePass')
      stateMachine.transition('colorBuffer', ResourceState.ShaderRead, 'scenePass')

      expect(stateMachine.canRead('colorBuffer')).toBe(true)
    })

    it('should not allow read from Disposed state', () => {
      stateMachine.transition('colorBuffer', ResourceState.Disposed, 'cleanup')

      expect(stateMachine.canRead('colorBuffer')).toBe(false)
    })

    it('should return false for unregistered resource read', () => {
      expect(stateMachine.canRead('nonExistent')).toBe(false)
    })

    it('should allow write from Created state', () => {
      expect(stateMachine.canWrite('colorBuffer')).toBe(true)
    })

    it('should allow write from WriteTarget state', () => {
      stateMachine.transition('colorBuffer', ResourceState.WriteTarget, 'scenePass')

      expect(stateMachine.canWrite('colorBuffer')).toBe(true)
    })

    it('should allow write from ShaderRead state', () => {
      stateMachine.transition('colorBuffer', ResourceState.WriteTarget, 'scenePass')
      stateMachine.transition('colorBuffer', ResourceState.ShaderRead, 'scenePass')

      expect(stateMachine.canWrite('colorBuffer')).toBe(true)
    })

    it('should not allow write from Disposed state', () => {
      stateMachine.transition('colorBuffer', ResourceState.Disposed, 'cleanup')

      expect(stateMachine.canWrite('colorBuffer')).toBe(false)
    })

    it('should return false for unregistered resource write', () => {
      expect(stateMachine.canWrite('nonExistent')).toBe(false)
    })
  })

  describe('beginFrame', () => {
    it('should reset non-disposed resources to Created state', () => {
      stateMachine.register('colorBuffer')
      stateMachine.transition('colorBuffer', ResourceState.WriteTarget, 'scenePass')
      stateMachine.transition('colorBuffer', ResourceState.ShaderRead, 'scenePass')

      stateMachine.beginFrame()

      expect(stateMachine.getState('colorBuffer')).toBe(ResourceState.Created)
    })

    it('should not reset disposed resources', () => {
      stateMachine.register('colorBuffer')
      stateMachine.transition('colorBuffer', ResourceState.Disposed, 'cleanup')

      stateMachine.beginFrame()

      expect(stateMachine.getState('colorBuffer')).toBe(ResourceState.Disposed)
    })

    it('should increment frame number', () => {
      expect(stateMachine.getFrameNumber()).toBe(0)

      stateMachine.beginFrame()
      expect(stateMachine.getFrameNumber()).toBe(1)

      stateMachine.beginFrame()
      expect(stateMachine.getFrameNumber()).toBe(2)
    })

    it('should track frame reset in history', () => {
      stateMachine.register('colorBuffer')
      stateMachine.transition('colorBuffer', ResourceState.WriteTarget, 'scenePass')

      stateMachine.beginFrame()

      const info = stateMachine.getStateInfo('colorBuffer')
      expect(info?.lastModifiedBy).toBe('frame_reset')
    })
  })

  describe('getResourcesInState', () => {
    it('should return resources in specified state', () => {
      stateMachine.register('buffer1')
      stateMachine.register('buffer2')
      stateMachine.register('buffer3')

      stateMachine.transition('buffer1', ResourceState.WriteTarget, 'pass')
      stateMachine.transition('buffer2', ResourceState.WriteTarget, 'pass')

      const created = stateMachine.getResourcesInState(ResourceState.Created)
      const writing = stateMachine.getResourcesInState(ResourceState.WriteTarget)

      expect(created).toContain('buffer3')
      expect(created).not.toContain('buffer1')
      expect(created).not.toContain('buffer2')

      expect(writing).toContain('buffer1')
      expect(writing).toContain('buffer2')
      expect(writing.length).toBe(2)
    })

    it('should return empty array for no matches', () => {
      stateMachine.register('buffer1')

      const reading = stateMachine.getResourcesInState(ResourceState.ShaderRead)

      expect(reading).toEqual([])
    })
  })

  describe('getAllResourceIds', () => {
    it('should return all registered resource IDs', () => {
      stateMachine.register('buffer1')
      stateMachine.register('buffer2')
      stateMachine.register('buffer3')

      const ids = stateMachine.getAllResourceIds()

      expect(ids).toContain('buffer1')
      expect(ids).toContain('buffer2')
      expect(ids).toContain('buffer3')
      expect(ids.length).toBe(3)
    })

    it('should return empty array when no resources registered', () => {
      expect(stateMachine.getAllResourceIds()).toEqual([])
    })
  })

  describe('validateReadAfterWrite', () => {
    beforeEach(() => {
      stateMachine.register('colorBuffer')
    })

    it('should be invalid for Created state', () => {
      const result = stateMachine.validateReadAfterWrite('colorBuffer', 'compositePass')

      expect(result.valid).toBe(false)
      expect(result.error).toContain('not been written to')
    })

    it('should be invalid for WriteTarget state', () => {
      stateMachine.transition('colorBuffer', ResourceState.WriteTarget, 'scenePass')

      const result = stateMachine.validateReadAfterWrite('colorBuffer', 'compositePass')

      expect(result.valid).toBe(false)
      expect(result.error).toContain('still being written')
    })

    it('should be valid for ShaderRead state', () => {
      stateMachine.transition('colorBuffer', ResourceState.WriteTarget, 'scenePass')
      stateMachine.transition('colorBuffer', ResourceState.ShaderRead, 'scenePass')

      const result = stateMachine.validateReadAfterWrite('colorBuffer', 'compositePass')

      expect(result.valid).toBe(true)
    })

    it('should be invalid for Disposed state', () => {
      stateMachine.transition('colorBuffer', ResourceState.Disposed, 'cleanup')

      const result = stateMachine.validateReadAfterWrite('colorBuffer', 'compositePass')

      expect(result.valid).toBe(false)
      expect(result.error).toContain('disposed')
    })

    it('should be invalid for unregistered resource', () => {
      const result = stateMachine.validateReadAfterWrite('nonExistent', 'compositePass')

      expect(result.valid).toBe(false)
      expect(result.error).toContain('not registered')
    })
  })

  describe('history tracking', () => {
    it('should track state transitions', () => {
      stateMachine.register('colorBuffer')
      stateMachine.transition('colorBuffer', ResourceState.WriteTarget, 'scenePass')
      stateMachine.transition('colorBuffer', ResourceState.ShaderRead, 'scenePass')

      const info = stateMachine.getStateInfo('colorBuffer')

      expect(info?.history.length).toBe(2)
      expect(info?.history[0]).toEqual({
        fromState: ResourceState.Created,
        toState: ResourceState.WriteTarget,
        passId: 'scenePass',
        frame: 0,
      })
      expect(info?.history[1]).toEqual({
        fromState: ResourceState.WriteTarget,
        toState: ResourceState.ShaderRead,
        passId: 'scenePass',
        frame: 0,
      })
    })

    it('should not track history when disabled', () => {
      const noHistoryMachine = new ResourceStateMachine({ keepHistory: false })
      noHistoryMachine.register('colorBuffer')
      noHistoryMachine.transition('colorBuffer', ResourceState.WriteTarget, 'scenePass')

      const info = noHistoryMachine.getStateInfo('colorBuffer')

      expect(info?.history.length).toBe(0)
      noHistoryMachine.dispose()
    })

    it('should trim history when exceeding max size', () => {
      const smallHistoryMachine = new ResourceStateMachine({
        keepHistory: true,
        maxHistorySize: 3,
      })
      smallHistoryMachine.register('colorBuffer')

      // Create more than 3 transitions
      smallHistoryMachine.transition('colorBuffer', ResourceState.WriteTarget, 'pass1')
      smallHistoryMachine.transition('colorBuffer', ResourceState.ShaderRead, 'pass1')
      smallHistoryMachine.transition('colorBuffer', ResourceState.WriteTarget, 'pass2')
      smallHistoryMachine.transition('colorBuffer', ResourceState.ShaderRead, 'pass2')

      const info = smallHistoryMachine.getStateInfo('colorBuffer')

      expect(info?.history.length).toBe(3)
      // First transition should have been removed
      expect(info?.history[0]!.passId).toBe('pass1')
      expect(info?.history[0]!.toState).toBe(ResourceState.ShaderRead)

      smallHistoryMachine.dispose()
    })
  })

  describe('getStateInfo', () => {
    it('should return full state info', () => {
      stateMachine.register('colorBuffer')
      stateMachine.transition('colorBuffer', ResourceState.WriteTarget, 'scenePass')

      const info = stateMachine.getStateInfo('colorBuffer')

      expect(info).toBeDefined()
      expect(info?.state).toBe(ResourceState.WriteTarget)
      expect(info?.lastModifiedBy).toBe('scenePass')
      expect(info?.lastModifiedFrame).toBe(0)
    })

    it('should return undefined for unregistered resource', () => {
      expect(stateMachine.getStateInfo('nonExistent')).toBeUndefined()
    })
  })

  describe('reset', () => {
    it('should clear all resources', () => {
      stateMachine.register('buffer1')
      stateMachine.register('buffer2')

      stateMachine.reset()

      expect(stateMachine.getAllResourceIds()).toEqual([])
      expect(stateMachine.getFrameNumber()).toBe(0)
    })
  })

  describe('dispose', () => {
    it('should transition all resources to Disposed', () => {
      stateMachine.register('buffer1')
      stateMachine.register('buffer2')
      stateMachine.transition('buffer1', ResourceState.WriteTarget, 'pass')

      stateMachine.dispose()

      // After dispose, resources are cleared
      expect(stateMachine.getAllResourceIds()).toEqual([])
    })
  })

  describe('getDebugSnapshot', () => {
    it('should return snapshot of all resource states', () => {
      stateMachine.register('buffer1')
      stateMachine.register('buffer2')
      stateMachine.transition('buffer1', ResourceState.WriteTarget, 'scenePass')

      const snapshot = stateMachine.getDebugSnapshot()

      expect(snapshot).toEqual({
        buffer1: { state: ResourceState.WriteTarget, lastModifiedBy: 'scenePass' },
        buffer2: { state: ResourceState.Created, lastModifiedBy: null },
      })
    })
  })

  describe('typical render pass workflow', () => {
    it('should support typical frame workflow', () => {
      // Setup resources
      stateMachine.register('colorBuffer')
      stateMachine.register('depthBuffer')
      stateMachine.register('normalBuffer')

      // Frame 1
      stateMachine.beginFrame()

      // Scene pass writes to all buffers
      stateMachine.transition('colorBuffer', ResourceState.WriteTarget, 'scenePass')
      stateMachine.transition('depthBuffer', ResourceState.WriteTarget, 'scenePass')
      stateMachine.transition('normalBuffer', ResourceState.WriteTarget, 'scenePass')

      // After scene pass, transition to readable
      stateMachine.transition('colorBuffer', ResourceState.ShaderRead, 'scenePass')
      stateMachine.transition('depthBuffer', ResourceState.ShaderRead, 'scenePass')
      stateMachine.transition('normalBuffer', ResourceState.ShaderRead, 'scenePass')

      // Post-processing pass reads color and depth
      expect(stateMachine.canRead('colorBuffer')).toBe(true)
      expect(stateMachine.canRead('depthBuffer')).toBe(true)

      // Frame 2 - resources reset
      stateMachine.beginFrame()

      expect(stateMachine.getState('colorBuffer')).toBe(ResourceState.Created)
      expect(stateMachine.getState('depthBuffer')).toBe(ResourceState.Created)
      expect(stateMachine.canRead('colorBuffer')).toBe(false) // Need to write first
    })
  })
})
