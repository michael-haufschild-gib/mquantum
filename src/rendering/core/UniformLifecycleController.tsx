import { useFrame } from '@react-three/fiber'
import { UniformManager } from '@/rendering/uniforms/UniformManager'
import { FRAME_PRIORITY } from './framePriorities'

/**
 * Controller to drive the UniformManager lifecycle.
 *
 * Calls UniformManager.update() every frame with the current state (camera, time, etc.).
 * This ensures all registered uniform sources (Lighting, Temporal, Color, Quality)
 * are up-to-date before renderers attempt to apply them.
 *
 * Must be placed inside the Canvas/Scene.
 * @returns Null - this component only provides side effects
 */
export function UniformLifecycleController() {
  useFrame((state, delta) => {
    UniformManager.update({
      camera: state.camera,
      scene: state.scene,
      gl: state.gl,
      size: state.size,
      time: state.clock.elapsedTime,
      delta: delta,
    })
  }, FRAME_PRIORITY.UNIFORM_MANAGER_UPDATE)

  return null
}
