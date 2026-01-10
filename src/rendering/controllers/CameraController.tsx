import { useCameraMovement } from '@/hooks/useCameraMovement'
import { FRAME_PRIORITY } from '@/rendering/core/framePriorities'
import { useCameraStore } from '@/stores/cameraStore'
import { useLightingStore } from '@/stores/lightingStore'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { OrbitControls as OrbitControlsImpl } from 'three-stdlib'

/**
 * Props for the CameraController component.
 */
export interface CameraControllerProps {
  /** Enable damping for smooth camera movement (default: true) */
  enableDamping?: boolean
  /** Damping factor for smooth camera movement (default: 0.05) */
  dampingFactor?: number
  /** Minimum zoom distance (default: 2) */
  minDistance?: number
  /** Maximum zoom distance (default: 20) */
  maxDistance?: number
  /** Enable auto-rotation (default: false) */
  autoRotate?: boolean
  /** Auto-rotation speed (default: 1.0) */
  autoRotateSpeed?: number
  /** Enable panning (default: true) */
  enablePan?: boolean
  /** Enable zooming (default: true) */
  enableZoom?: boolean
  /** Rotation speed (default: 0.5) */
  rotateSpeed?: number
  /** Callback to reset camera to initial position */
  onReset?: () => void
}

/**
 * Camera controller component with OrbitControls and advanced features.
 *
 * This component provides smooth camera manipulation for the 3D scene with:
 * - Orbit controls for rotating around the scene
 * - Zoom limits to prevent too close/far views
 * - Optional auto-rotation mode
 * - Damping for smooth, natural movement
 * - Configurable pan, zoom, and rotation
 *
 * The component integrates with @react-three/fiber's camera system and
 * provides a consistent interface for camera manipulation across the application.
 *
 * @param props - CameraController configuration
 * @param props.enableDamping
 * @param props.dampingFactor
 * @param props.minDistance
 * @param props.maxDistance
 * @param props.autoRotate
 * @param props.autoRotateSpeed
 * @param props.enablePan
 * @param props.enableZoom
 * @param props.rotateSpeed
 * @param props.onReset
 * @returns OrbitControls integration for the scene
 *
 * @example
 * ```tsx
 * // Basic usage with defaults
 * <Canvas>
 *   <CameraController />
 *   <Scene />
 * </Canvas>
 * ```
 *
 * @example
 * ```tsx
 * // Advanced usage with auto-rotation
 * <Canvas>
 *   <CameraController
 *     autoRotate
 *     autoRotateSpeed={2.0}
 *     minDistance={3}
 *     maxDistance={15}
 *     dampingFactor={0.1}
 *   />
 *   <Scene />
 * </Canvas>
 * ```
 *
 * @remarks
 * - Damping is enabled by default for smooth camera movement
 * - Auto-rotation can be toggled dynamically
 * - Zoom limits prevent camera from getting too close or far
 * - Touch controls are automatically supported on mobile devices
 * - Controls are updated every frame when damping is enabled
 */
export function CameraController({
  enableDamping = true,
  dampingFactor = 0.05,
  minDistance = 2,
  maxDistance = 30,
  autoRotate = false,
  autoRotateSpeed = 1.0,
  enablePan = true,
  enableZoom = true,
  rotateSpeed = 0.5,
  onReset,
}: CameraControllerProps) {
  const { camera, gl } = useThree()
  const controlsRef = useRef<OrbitControlsImpl | null>(null)
  const registerControls = useCameraStore((state) => state.registerControls)

  // Check if a light is being dragged (disable controls during drag)
  const isDraggingLight = useLightingStore((state) => state.isDraggingLight)

  // Enable WASD camera movement with OrbitControls target sync
  useCameraMovement({ enabled: true, controlsRef })

  // Initialize controls ONLY when camera or gl changes (rare)
  useEffect(() => {
    const controls = new OrbitControlsImpl(camera, gl.domElement)
    controlsRef.current = controls
    registerControls(controls)

    return () => {
      controls.dispose() // Properly dispose controls
      registerControls(null)
      controlsRef.current = null
    }
  }, [camera, gl, registerControls])

  // Update control properties when props change (without recreating controls)
  useEffect(() => {
    const controls = controlsRef.current
    if (!controls) return

    controls.enableDamping = enableDamping
    controls.dampingFactor = dampingFactor
    controls.minDistance = minDistance
    controls.maxDistance = maxDistance
    controls.autoRotate = autoRotate
    controls.autoRotateSpeed = autoRotateSpeed
    controls.enablePan = enablePan
    controls.enableZoom = enableZoom
    controls.rotateSpeed = rotateSpeed
  }, [
    enableDamping,
    dampingFactor,
    minDistance,
    maxDistance,
    autoRotate,
    autoRotateSpeed,
    enablePan,
    enableZoom,
    rotateSpeed,
  ])

  // Disable controls when dragging a light gizmo
  useEffect(() => {
    const controls = controlsRef.current
    if (!controls) return

    // Disable all controls during light drag to prevent camera movement
    controls.enabled = !isDraggingLight
  }, [isDraggingLight])

  // Update controls every frame (required for damping and auto-rotate)
  // Skip update() when neither damping nor auto-rotate is enabled
  useFrame(() => {
    const controls = controlsRef.current
    if (controls && (controls.enableDamping || controls.autoRotate)) {
      controls.update()
    }

  }, FRAME_PRIORITY.CAMERA)

  // Reset camera when onReset callback is provided and changes
  // NOTE: onReset is treated as a trigger - when parent provides a new function
  // reference (e.g., via a reset counter change), the camera resets.
  // Using a ref to track whether we've initialized to avoid resetting on mount.
  const hasInitializedRef = useRef(false)
  useEffect(() => {
    if (!controlsRef.current) return

    // Skip initial mount to avoid unwanted reset
    if (!hasInitializedRef.current) {
      hasInitializedRef.current = true
      return
    }

    // Only reset if onReset is provided and has changed
    if (onReset) {
      controlsRef.current.reset()
    }
  }, [onReset])

  return null
}