# Progressive Refinement System - Original WebGL Implementation

## Overview
The original mdimension WebGL project implements a sophisticated progressive refinement system that gradually improves render quality after user interaction stops. This system manages multi-stage quality progression from low (25%) to final (100%) quality.

## Architecture

### Core State Management
- **Store**: `usePerformanceStore` (Zustand) in `/src/stores/performanceStore.ts`
- **Key state fields**:
  - `progressiveRefinementEnabled`: Boolean toggle (default: true)
  - `refinementStage`: 'low' | 'medium' | 'high' | 'final'
  - `refinementProgress`: 0-100 (smooth animation progress)
  - `qualityMultiplier`: 0.25 | 0.5 | 0.75 | 1.0
  - `isInteracting`: Boolean (camera/canvas movement)
  - `sceneTransitioning`: Boolean (scene/style preset loading)

### Refinement Stage Configuration
```
REFINEMENT_STAGES = ['low', 'medium', 'high', 'final']

REFINEMENT_STAGE_TIMING (ms):
- low: 0 (instant)
- medium: 100ms
- high: 300ms
- final: 500ms

REFINEMENT_STAGE_QUALITY (multipliers):
- low: 0.25
- medium: 0.5
- high: 0.75
- final: 1.0
```

## Orchestration Logic

### 1. Hook-Based Control

#### `useProgressiveRefinement()` Hook
**File**: `/src/hooks/useProgressiveRefinement.ts`
- Central orchestrator for refinement state machine
- Listens to: interaction state, skybox loading, scene transitions, export state
- Returns: current stage, quality multiplier, progress, isComplete

**Key mechanism**: 
- When interaction/loading/transition STOPS, schedules stage transitions via setTimeout
- Each stage reached at its configured delay (low=0ms, medium=100ms, high=300ms, final=500ms)
- Progress bar animated via RAF from 0-100% over 500ms
- All timers cleared when interaction/loading resuming

#### `useInteractionState()` Hook
**File**: `/src/hooks/useInteractionState.ts`
- Detects camera movement (position/rotation thresholds)
- Detects pointer events (drag, wheel, pointerup/pointerdown)
- Detects canvas resize (sidebar toggle, window resize, fullscreen)
- Debounce: 150ms (INTERACTION_RESTORE_DELAY constant)
- On interaction start: calls `setIsInteracting(true)` + `resetRefinement()` (resets to low quality)
- On interaction end: sets timer to call `setIsInteracting(false)` after debounce

#### Integration Component
**File**: `/src/rendering/controllers/PerformanceManager.tsx`
- Simple container component that calls both hooks
- Placed inside Canvas to access Three.js context
- Returns null (no visual rendering)

### 2. Reset Triggers

#### A. Interaction Detected
- **Source**: `useInteractionState()` hook, `startInteraction()` callback
- **Action**: 
  ```
  setIsInteracting(true)
  resetRefinement() // Sets stage='low', progress=0, quality=0.25
  ```
- **Debounce**: 150ms after last interaction

#### B. Scene Transitioning
- **Source**: `usePresetManagerStore.loadScene()` and `loadStyle()`
- **Timing**: Set at START of preset load
  ```
  setSceneTransitioning(true)  // Line 171, 377 in presetManagerStore.ts
  // ... async state updates ...
  requestAnimationFrame(() => {
    setSceneTransitioning(false)  // Reset after 1 frame
  })
  ```
- **Effect**: Hook detects sceneTransitioning=true, resets refinement to low quality
- **Geometry change** (dimension, object type switch):
  - `geometryStore.setDimension()` and `setObjectType()` also call setSceneTransitioning(true)
  - Also calls `setCameraTeleported(true)` for temporal reprojection

#### C. Skybox Loading
- **Source**: `useEnvironmentStore` hook sets `skyboxLoading: boolean`
- **Effect**: Hook watches skyboxLoading, resets refinement while true
- **Component**: SkyboxLoader emits loading state during KTX2 texture fetch

#### D. Export State
- **Source**: `useExportStore.isExporting`
- **Effect**: If exporting, hook clears all timers (doesn't interfere with VideoExportController)

#### E. Progressive Refinement Disabled
- **Action**: When user disables toggle via UI
  ```
  setProgressiveRefinementEnabled(false)
  // Automatically sets: stage='final', progress=100, quality=1.0
  ```

### 3. Timing & Animation Loop

#### Stage Transition Sequence
```
T=0ms:    User stops interacting → isInteracting becomes false
T=0ms:    Hook detects state change, calls startRefinement()
T=0ms:    Set refinementStage='low', progress=0
T=0ms:    Schedule setTimeout(medium, 100ms)
T=0ms:    Start RAF-based progress bar (0→100% over 500ms)
T=100ms:  setTimeout fires → setRefinementStage('medium')
T=300ms:  setTimeout fires → setRefinementStage('high')
T=500ms:  setTimeout fires → setRefinementStage('final')
T=500ms:  RAF completes, progress=100
```

#### Progress Bar Animation
- Separate RAF loop from stage transitions
- Calculates: `progress = Math.min(100, (elapsed / 500ms) * 100)`
- Runs every frame, stops when progress reaches 100

### 4. Quality Multiplier Application

#### Computed Value
```typescript
setRefinementStage(stage) {
  // stage → index * 25 + 25 = progress
  // Sync stage with quality multiplier
  qualityMultiplier = REFINEMENT_STAGE_QUALITY[stage]  // 0.25, 0.5, 0.75, 1.0
}
```

#### Usage in Rendering
- Per-feature quality computation functions in performanceStore.ts
- Examples for fractal rendering:
  ```
  getEffectiveSSRQuality(targetQuality, qualityMultiplier)
  getEffectiveShadowQuality(targetQuality, qualityMultiplier)
  getEffectiveSampleQuality(targetQuality, qualityMultiplier)
  ```
- Interpolates from lowest quality (multiplier=0.25) to user's target (multiplier=1.0)

## UI Components

### RefinementIndicator
**File**: `/src/components/canvas/RefinementIndicator.tsx`
- Displays progress bar + stage label
- Portal-rendered to document.body (layer index 100)
- Shows during refinement (progress < 100)
- Auto-hides 1000ms after completion (fadeOut animation)
- Hides immediately during interaction

### ProgressiveRefinementControls
**File**: `/src/components/sections/Performance/ProgressiveRefinementControls.tsx`
- Toggle switch for enable/disable
- Shows stage dots (low, medium, high, final)
- Real-time progress bar
- Shows quality percentage (25%, 50%, 75%, 100%)

## Key Implementation Details

### Cleanup & Cancelation
- All timers stored in `stageTimersRef.current[]` array
- `clearTimers()` clears all timeouts + cancels RAF
- Called on: interaction start, hook disable, unmount, export start

### Debounce Pattern
- `useInteractionState` debounces interaction stop by 150ms
- After 150ms of no mouse/camera movement, calls `setIsInteracting(false)`
- Hook's useEffect dependency on `isInteracting` then triggers refinement start

### Export Handling
- `VideoExportController` saves original refinement enabled state
- During export, it disables progressive refinement (full quality always)
- Restores original enabled state after export completes
- This prevents refinement from interfering with video frame capture

### Shader Compilation Handling
- **Not** integrated into refinement system directly
- Separate state: `compilingShaders` Set + `isShaderCompiling` boolean
- Shows overlay when compiling but doesn't trigger refinement reset
- Used by `trackShaderCompilation()` + `deferredExecute()` utilities

### Camera Teleport Detection
- Separate from regular interaction
- Per-frame squared distance check (position and rotation)
- If large sudden movement detected, sets `cameraTeleported=true` for 1 frame
- Used by temporal reprojection system (not refinement)

## Reset vs Progressive Behavior

### "Reset Refinement" (stopRefinement)
- Called when interaction STARTS or refinement is disabled
- Immediate state: stage='low', progress=0, quality=0.25
- No staged progression

### "Start Refinement" (startRefinement)
- Called when interaction STOPS
- Begins staged progression: low (0ms) → medium (100ms) → high (300ms) → final (500ms)
- Progress bar animates 0→100% over 500ms

## Edge Cases & Safeguards

1. **Rapid scene switches**: `scheduleSceneLoadComplete()` uses pending RAF ID to cancel stale callbacks
2. **Quick interactions**: Debounce prevents thrashing between interact/not-interact states
3. **Export mode**: Completely disables refinement to avoid quality reduction during capture
4. **Disabled state**: Automatically sets to final quality (1.0) so features work at highest quality
5. **Unmount cleanup**: useEffect cleanup clears all timers to prevent memory leaks

## Constants Summary

| Constant | Value | Purpose |
|----------|-------|---------|
| INTERACTION_RESTORE_DELAY | 150ms | Debounce for stopping interaction |
| REFINEMENT_STAGE_TIMING.low | 0ms | Instant |
| REFINEMENT_STAGE_TIMING.medium | 100ms | First refinement milestone |
| REFINEMENT_STAGE_TIMING.high | 300ms | Second refinement milestone |
| REFINEMENT_STAGE_TIMING.final | 500ms | Complete refinement |
| REFINEMENT_STAGE_QUALITY.low | 0.25 | 25% quality |
| REFINEMENT_STAGE_QUALITY.medium | 0.5 | 50% quality |
| REFINEMENT_STAGE_QUALITY.high | 0.75 | 75% quality |
| REFINEMENT_STAGE_QUALITY.final | 1.0 | 100% quality |

## Test Files
- `/src/tests/hooks/useInteractionState.test.tsx`: Interaction detection tests
- `/src/tests/components/canvas/RefinementIndicator.test.tsx`: UI indicator tests
- `/src/tests/stores/performanceStore.test.ts`: Store action tests
