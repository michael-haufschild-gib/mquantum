Important: This is a test of your autonomous capabilities and your UI/UX design and frontend coding abilities.

You cannot break anything. The project in this local folder is backed up and can be restored. You can create, modify, and delete files as necessary to complete the tasks assigned to you. You have full autonomy to make decisions and take actions to achieve the desired outcomes.

Your task:
This project has a very rudimentary theming system for its UI. All it does is change some text colors, while all backgrounds are fixed to be a dark mode in the same colors.

Design and implement a truly advanced best-of-class theming system that caters to all type of user, user abilities and user taste.

Workflow:
- Review the UI and components and theming solution in detail.
- Review what industry leaders in web and app design are considering best practices for a best-of-class theming solution.
- Design such a best-of-class theming solution for this app.
- Implement and integrate.
- Test and fix until no more bugs, race conditions, side effects can be found.

Important Reminder: This is a test of your autonomous capabilities and your ability to design and implemented exceptional modern web and mobile UI. You are expected to take initiative and make decisions independently. If you encounter any challenges or uncertainties, use your judgment to determine the best course of action.

The quality and completeness of the project in this folder when you return the prompt to the user will be the only criteria for success. If you deliver unfinished or less than exceptional looking work, this test and you are a failure. Be exceptional. Do not just complete the task. Ace it. There is no time or token limit. Do it right instead of fast. Be exceptional.







BUT: simply deactivating temporal reprojection is not a solution. changing the fundamental approach of the feature is also not a solution.


MANDATORY QUALITY GATE
both these tests must pass for success:
1. deactivate the object rendering for debugging. if you then take the color of the pixel in the center of the scene, it will not be black if everything is working.
2. with the object rendering active, check the debug texture of the temporal debug buffer. check the color value of the pixel in the center and the value of the pixel in position 1,1. both pixels will have different colors if everything works.

Plan and implement this optimization:
When any of these post-processing effects is set to a setting where they have no visible impact, they get completely disabled and do not use any CPU or GPU computation resources (the slider that should disable the effect fully when set to 0 in brackets):
- Grain (Grain)
- Vignette (Vignette)
- Tone Mapping (Exposure)
- Bloom (Intensity)
- Bokeh (Blur intensity)
- SSR (Intensity)
- Refraction (Strength)

after this refactor, remove the now obsolete on/off toggle switches for
- Bloom
- SSR
- Refraction
- Tone Mapping
- Bokeh





Review this bug report:
No object type is rendered correctly. It appears that the object is kind of appearing but just tinting the whole scene. Maybe we are zoomed in to the extreme, or the whole render graph is doing something very wrong in its position, vertex, face, rotation, scale, perspective or scale calculations.

these two tests need to pass to even a tiny chance that everything is rendered correctly:
scripts/playwright/object-types-rendering.spec.ts
scripts/playwright/polytope-rendering.spec.ts

notes:
- except for the black hole, scene will show green tint as all object types have a green material color in the start. except the black hole which at its center is obviously black.


  1. The "Tunable Handoff" (Recommended Fix)
  Fix the mathematical errors in the current approach to make the transitions seamless.

   * Implementation:
       * Fix Aspect Ratio: In the shader, correct the distance calculation by multiplying the UV x-coordinate by the screen aspect ratio (vUv.x * uAspectRatio). This turns the ellipsoid mask back into a sphere.
       * Align Radii: Change the innerRadius logic. Instead of multiplying by an arbitrary 2.5, pass the exact "end" radius of the internal raymarcher (e.g., 5.0) to the SSL shader.
       * Gradient Mix: Introduce a smooth smoothstep transition at the boundary instead of a hard cut-off to blend the internal raymarched lensing with the external screen-space lensing.
   * Pros:
       * Lowest Risk: Minimal code changes; purely correcting existing logic.
       * High Performance: Keeps the expensive raymarching constrained to the center and cheap screen-space hacks for the periphery.
   * Cons:
       * Imperfection: It is still a screen-space effect. Objects passing behind the black hole might still have minor visual discontinuities where the two effects meet.

  1. Depth-Aware 3D Distortion (High Quality Post-FX)
  Upgrade the SSL shader to calculate distortion in View Space rather than UV Space.

   * Implementation:
       * reconstruct the World Position of every pixel using the Depth Buffer.
       * Calculate the distance from the Black Hole's actual 3D center to that pixel's 3D position.
       * Apply the distortion vector based on 3D proximity, then project back to screen UVs.
       * Use the depth buffer to strictly mask out pixels that are in front of the black hole (to avoid distorting the black hole with its own background).
   * Pros:
       * Geometrically Correct: The "ellipsoid" issue vanishes completely because math happens in 3D.
       * Robust: Handles camera movement and FOV changes perfectly.
   * Cons:
       * Complexity: Requires accurate depth reconstruction and inverse projection matrices in the shader.
       * Performance: Slightly heavier on the GPU than simple 2D UV distortion.

  1. Vertex Shader Displacement (The "Object-Level" Approach)
  Move the lensing effect out of Post-Processing entirely and into the materials of the surrounding objects (Walls, Skybox).

   * Implementation:
       * Add a "Gravitational Lensing" chunk to the vertex shaders of the wall and skybox materials.
       * Distort the gl_Position or varying UVs of the geometry itself based on proximity to the black hole uniform.
   * Pros:
       * Perfect Occlusion: Solves all "masking" issues naturally. The black hole (an object) simply sits in front of the distorted walls. No need to "handoff" between effects.
       * Artifact-Free: No screen-edge smearing or resolution-dependent artifacts.
   * Cons:
       * Invasive: Requires modifying the shader code for every object type in the scene that needs to be lensed.
       * Tessellation Dependent: If the walls are simple cubes with few vertices, the distortion will look jagged unless highly subdivided.

Do a full in-depth code review of the new feature(s). Is the implementation 100% complete. Is the integration 100% complete (you tend to forget to integrate features). Were any bugs, race conditions, performance issues or side effects introduced? Is legacy code removed? Is all code and all patterns in line with our current tech stack's abilities and constraints? Is everything fully functional and integrated and ready to be used in production?


  Implementation Options

  Option A: CAS in ToScreenPass (Simplest)

  Render (scaled) → AA (scaled) → ToScreenPass+CAS (upscale + sharpen)

  Just add CAS to the ToScreenPass fragment shader. One uniform for sharpness (0-1).

  Option B: FSR 1.0 Upscaler (Better Quality)

  Render (scaled) → AA (scaled) → EASU (smart upscale) → RCAS (sharpen) → Screen

  Requires two new passes but gives best results. AMD provides the shader code under MIT license.

  Option C: Full Pipeline

  Render (scaled) → EASU upscale → FXAA (full res) → RCAS sharpen → Screen

  Best quality but most passes.

  ---
  Recommendation: Start with Option A (CAS in ToScreenPass). It's:
  - Single shader change
  - ~0.1ms cost
  - Significant quality improvement
  - Easy to add sharpness slider

  Want me to implement CAS in ToScreenPass with a sharpness control?


 1. Ray Bending Optimization (lensing.glsl.ts)
  Impact: High (Runs every raymarch step)
  Est. Improvement: ~15-20% reduced shader overhead

   * Current Issue: The bendRay function contains expensive operations: a complex "proximity factor" calculation with multiple smoothstep/mix calls, unconditional pow for N-D scaling, and unconditional Kerr frame
     dragging math (cross products).
   * Suggestion:
       * Simplify Proximity Logic: Collapse the multi-stage fade (mix + smoothstep + linear max) into a single smoothstep(far, near, r) interpolated by one mix.
       * Special Case Falloff: Check if (abs(uDistanceFalloff - 2.0) < 0.01) to skip the expensive pow(r, 2.0 - beta) calculation for the standard Newtonian/Schwarzschild case.
       * Optimize Frame Dragging: Wrap the entire Kerr effect block in if (abs(uSpin) > 0.001). Inside, replace normalize(cross(...)) with raw vector math + inversesqrt to save ALU cycles.

  2. Volumetric Disk Optimization (disk-volumetric.glsl.ts)
  Impact: High (Runs every step inside the disk)
  Est. Improvement: ~25-30% faster disk rendering

   * Current Issue:
       * Uses pow(x, 2.5) for flare shape.
       * Computes atan(z, x) unconditionally, which is expensive, even if noise/rotation features are effectively off.
       * Samples noise for "dust lanes" even if uNoiseAmount is near zero.
   * Suggestion:
       * Fast Math: Replace pow(x, 2.5) with x * x * sqrt(x).
       * Conditional Atan: Wrap the atan calculation. Only compute angle if uNoiseAmount > 0.01 (for texture) or uKeplerianDifferential > 0.001 (for rotation speed). If both are low, use angle = 0.0.
       * Optimization: Pre-multiply h*h and thickness*thickness before the exp call for density.

  3. Main Raymarch Loop (main.glsl.ts)
  Impact: Medium (Cumulative step cost)
  Est. Improvement: ~5-10%

   * Current Issue: adaptiveStepSizeWithMask calculates a shellMask using smoothstep, but the comments confirm this mask is unused for emission (OPT-BH-23).
   * Suggestion: Remove the out float outShellMask parameter and the internal smoothstep logic entirely. Only calculate the step modification.

  4. Post-Processing Lensing (gravitationalLensing.glsl.ts)
  Impact: Low (Screen-space pass)
  Est. Improvement: < 1ms, but reduces fill rate pressure

   * Current Issue: einsteinRingBoost uses exp() per pixel for a very subtle ring effect.
   * Suggestion: Replace exp() with a simple linear falloff or 1.0 / (1.0 + x*x) approximation. Also, check if (uFalloff == 1.0) (3D case) to avoid pow() in the deflection formula.

  Summary of Est. Performance Gains

  ┌────────────────┬─────────────────────────┬─────────────┐
  │ Optimization   │ Target                  │ Est. Gain   │
  ├────────────────┼─────────────────────────┼─────────────┤
  │ Ray Bending    │ lensing.glsl.ts         │ +15% FPS    │
  │ Disk Density   │ disk-volumetric.glsl.ts │ +10% FPS    │
  │ Step Logic     │ main.glsl.ts            │ +5% FPS     │
  │ Total Combined │                         │ ~30-40% FPS │
  └────────────────┴─────────────────────────┴─────────────┘


  Note: "Double FPS" might require `uStepAdaptG` (gravity step adaptation) tuning alongside these code changes, as taking fewer steps is the only way to get massive gains beyond ALU optimization.
