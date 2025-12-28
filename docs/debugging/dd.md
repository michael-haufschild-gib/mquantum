Important: This is a test of your autonomous capabilities and your UI/UX design and frontend coding abilities.

You cannot break anything. The project in this local folder is backed up and can be restored. You can create, modify, and delete files as necessary to complete the tasks assigned to you. You have full autonomy to make decisions and take actions to achieve the desired outcomes.

Your task:
This project has a rich and very well design ui. But it needs a final polish. No new features or big changes, just aligning and polishing and giving everything the professional finishing touch.

Workflow:
- Review the UI and components in detail. Understand how information and interaction elements are organized, structured and presenting hierarchy visually.
- Identify inconsistencies where the same functionality is presented or working in different ways.
- Identify inconsistencies in the overall design, layout and animation style.
- Identify inconsistencies in the application of sound design (e.g. one popup has an open sound, one doesn't. or some buttons have hover sounds, some don't).
- Identify lack of best-practices applied.
- Find issues where hierarchy is visually not well expressed. There are a lot of controls and the ui can get overwhelming when hierarchy, grouping, categories are not clearly skimmable.
- Identify poor UI and visual bugs.
- Identify "cheap" or "amateurish" looking UI.
- Identify poor user interaction paths and design.
Workflow:
- Inspect the code and understand how the video export functionality works and what functionality the UI provides.
- Identify lack of responsiveness for mobile browser support.
- Identify overloaded UI / cognitive overload.
- Identify usage of raw html elements instead of existing custom ui components from our library.
- Identify usage of hardcoded styles not using our theming solution.
- Identify repeating html/design patterns that could be turned into custom UI components for better code readability and UI consistency.
- Design a comprehensive plan for fixing all issues and turns the UI into a "million bucks".
- Implement
- Write Playwright tests that confirm the functionality of all features.
- Test and fix until green

Important Reminder: This is a test of your autonomous capabilities and your ability to design and implemented exceptional modern web and mobile UI. You are expected to take initiative and make decisions independently. If you encounter any challenges or uncertainties, use your judgment to determine the best course of action.

The quality and completeness of the project in this folder when you return the prompt to the user will be the only criteria for success. If you deliver unfinished or less than exceptional looking work, this test and you are a failure. Be exceptional. Do not just complete the task. Ace it. There is no time or token limit. Do it right instead of fast. Be exceptional.




Compared current implementation against `docs/plans/refactor-rendering-architecture.md` across phases 0–6. check for:
- bugs
- unfinished implementations
- code not in line with our tech stack and versions (React 19, WebGL2, Zustand 5, GSLS3)
- dead code
- ui components not "wired" to their actual parameters in the render graph
- logic flaws
- broken math
- broken transformations, projections, rotation
- disfunctional post processing effects
- broken sdf raymarching, broken volume raymarching
- broken temporal reprojection (both: temporal depth and temporal cloud)
- broken normal/depth/temporal depth buffers


Your task is to fix the temporal reprojection for the schroedinger object type.

symptoms: looking at the temporal buffer texture image it does not show the object shape. on top of that, the scene itself shows a glitchy backgdrop to the object - showing that there is something applied that turns the backdrop black and glitchy.

your task: fix this

your workflow:
1. add debug code for experiments and information gathering and output it to the browser console.
2. use playwright or/and google chrome dev tools to open the dev server at port 3000, go to the page, and read the console (the website always loads schroedinger automatically)
3. inspect the debug messages, formulate a hypothesis, write more debug code and repeat or start to fix

success criteria:
1. deactivate the object rendering for debugging. if you then take the color of the pixel in the center of the scene, it will not be black if everything is working.
2. with the object rendering active, check the debug texture of the temporal debug buffer. check the color value of the pixel in the center and the value of the pixel in position 1,1. both pixels will have different colors if everything works.

work autonomously. you have complete freedom. this project folder is backed up and only for you to find the solution to this severe problem nobody could fix so far. you can edit everything. you can add new files. do whatever it takes to fix this bug.

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
